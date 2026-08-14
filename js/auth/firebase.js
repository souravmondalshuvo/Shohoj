// ── js/auth/firebase.js ───────────────────────────────────────────────────────
// Firebase Authentication + Firestore cloud sync for Shohoj
// Features: Google Sign-In, Sign-Out, cloud save/load, migration modal,
//           real-time sync, offline detection, sync persistence, data deletion

import {
  addDoc,
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  GoogleAuthProvider,
  googleClientId,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  provider,
  qLimit,
  query,
  serverTimestamp,
  setDoc,
  signInWithCredential,
  signInWithPopup,
  signOut,
  startAfter,
  where,
} from './firebase-init.js';
import { installAdminAccessHooks } from './admin-service.js';
import { installAssistantAuthHooks } from './assistant-service.js';
import { firstDisplayName, isSafeAvatarUrl } from './auth-service.js';
import { getCurrentUserIdToken, getPapersWorkerUrl } from './paper-service.js';
import { installReviewIdentityHooks } from './review-service.js';
import { getDataFingerprint, parseStoredState } from './user-sync-service.js';

// ── State ─────────────────────────────────────────────────────────────────────
export let currentUser    = null;
let _authReady           = false;
// Whether the local-vs-cloud decision for this sign-in has been made.
// shohoj:auth-changed fires as soon as the user object exists, which is BEFORE
// loadFromCloud() and the migration modal — so anything that writes
// users/{uid} on a user action in that window (the Assistant's flush, see
// assistant-service.js) could overwrite the cloud copy before the conflict is
// even detected. Signed out there is nothing to reconcile.
let _cloudReconciled     = true;
let _unsubscribeSnapshot  = null;
const STORAGE_KEY         = 'shohoj_cgpa_v1';
const LAST_SYNC_KEY       = 'shohoj_last_sync';
const SESSION_START_KEY   = 'shohoj_session_start';
const SESSION_MAX_MS      = 30 * 24 * 60 * 60 * 1000; // 30 days
const CLOUD_SAVE_DEBOUNCE_MS = 700;
let _cloudSaveTimer       = null;
let _queuedCloudSnap      = null;
let _queuedCloudResolvers = [];
let _activeCloudSave      = Promise.resolve(false);

// ── Local-write guard ─────────────────────────────────────────────────────────
// When THIS tab writes to Firestore, the onSnapshot listener will fire with
// that same data. We must ignore it or it triggers a false "other device" reload.
// _localWriteAt records the timestamp of our last Firestore write.
// Any snapshot arriving within LOCAL_WRITE_GRACE_MS of that write is ignored.
let _localWriteAt = 0;
const LOCAL_WRITE_GRACE_MS = 5000; // 5 seconds is more than enough

// ── Firestore ref ─────────────────────────────────────────────────────────────
function userDocRef(uid) {
  return doc(db, 'users', uid);
}

function clearCloudAppliedFlag() {
  try { sessionStorage.removeItem('shohoj_cloud_applied'); } catch(e) {}
}

function notifyAuthStateReady() {
  _authReady = true;
  try {
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', {
      detail: { signedIn: !!currentUser },
    }));
  } catch (_e) {}
}

function drainQueuedCloudResolvers() {
  return _queuedCloudResolvers.splice(0);
}

function clearQueuedCloudSave(result = false) {
  if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = null;
  _queuedCloudSnap = null;
  drainQueuedCloudResolvers().forEach(resolve => resolve(result));
}

async function persistCloudState(stateSnap) {
  if (!currentUser) return false;
  if (!navigator.onLine) { setSyncIndicator('offline'); return false; }
  setSyncIndicator('syncing');
  try {
    // Record that THIS tab is about to write so the snapshot listener can ignore it
    _localWriteAt = Date.now();
    await setDoc(userDocRef(currentUser.uid), {
      data:      JSON.stringify(stateSnap),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const now = Date.now();
    try { localStorage.setItem(LAST_SYNC_KEY, String(now)); } catch(e) {}
    setSyncIndicator('synced');
    updateLastSyncLabel(now);
    return true;
  } catch (e) {
    _localWriteAt = 0; // reset guard on failure
    console.error('[Shohoj] Cloud save failed:', e);
    setSyncIndicator('error');
    showToast('⚠ Cloud save failed — data saved locally', true);
    return false;
  }
}

// ── Save to cloud ─────────────────────────────────────────────────────────────
export function saveToCloud(stateSnap, options = {}) {
  if (!currentUser) return Promise.resolve(false);

  const { immediate = false } = options;

  // If we just applied cloud data (page reloaded after applyCloudData), the very
  // first debounced saveToCloud call is just echoing cloud data back — skip it.
  // Uses a separate flag so it doesn't interfere with the migration modal check.
  // immediate=true calls (explicit uploads during sign-in) are never skipped.
  if (!immediate) {
    try {
      const skipEcho = sessionStorage.getItem('shohoj_skip_first_save');
      if (skipEcho) {
        sessionStorage.removeItem('shohoj_skip_first_save');
        console.log('[Shohoj] Skipping first save-back after cloud apply');
        return Promise.resolve(true);
      }
    } catch(e) {}
  }

  if (immediate) {
    const queuedResolvers = drainQueuedCloudResolvers();
    if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
    _cloudSaveTimer = null;
    _queuedCloudSnap = null;
    _activeCloudSave = _activeCloudSave.then(() => persistCloudState(stateSnap));
    return _activeCloudSave.then(result => {
      queuedResolvers.forEach(resolve => resolve(result));
      return result;
    });
  }

  _queuedCloudSnap = stateSnap;
  if (!navigator.onLine) {
    setSyncIndicator('offline');
  } else {
    setSyncIndicator('syncing');
  }

  return new Promise(resolve => {
    _queuedCloudResolvers.push(resolve);
    if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
    _cloudSaveTimer = setTimeout(() => {
      const snap = _queuedCloudSnap;
      const resolvers = drainQueuedCloudResolvers();
      _queuedCloudSnap = null;
      _cloudSaveTimer = null;
      _activeCloudSave = _activeCloudSave.then(() => persistCloudState(snap));
      _activeCloudSave.then(result => {
        resolvers.forEach(done => done(result));
      });
    }, CLOUD_SAVE_DEBOUNCE_MS);
  });
}

// ── Load from cloud ───────────────────────────────────────────────────────────
async function loadFromCloud() {
  if (!currentUser) return null;
  try {
    const snap = await getDoc(userDocRef(currentUser.uid));
    if (!snap.exists()) return null;
    const raw = snap.data().data;
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[Shohoj] Cloud load failed:', e);
    return null;
  }
}

// ── Real-time listener ────────────────────────────────────────────────────────
function startRealtimeSync(uid) {
  // Reached only once the local-vs-cloud decision is settled, on every branch.
  _cloudReconciled = true;
  if (_unsubscribeSnapshot) { _unsubscribeSnapshot(); _unsubscribeSnapshot = null; }

  // Skip the very first snapshot — it's always the current state we just loaded,
  // not an update from another device.
  let isFirstSnapshot = true;

  _unsubscribeSnapshot = onSnapshot(userDocRef(uid), snap => {
    // Always skip the first snapshot on subscription — it's the current state
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      return;
    }

    // Skip snapshots that arrived within the grace window after THIS tab wrote.
    // This prevents our own saves from triggering a false "other device" reload.
    if (Date.now() - _localWriteAt < LOCAL_WRITE_GRACE_MS) {
      console.log('[Shohoj] Ignoring own-write snapshot');
      return;
    }

    // We have unsynced local changes queued (debounced save not yet flushed),
    // so local is ahead of cloud. Reloading now would clobber the user's
    // in-progress edit (e.g. a transcript import) with the stale cloud copy.
    // Let our pending write win instead.
    if (_cloudSaveTimer || _queuedCloudSnap) {
      console.log('[Shohoj] Pending local save — ignoring snapshot to avoid clobber');
      return;
    }

    if (!snap.exists()) return;
    const raw = snap.data()?.data;
    if (!raw) return;

    try {
      const localRaw = localStorage.getItem(STORAGE_KEY) || '';

      // Compare only the actual data content, ignoring Firestore metadata
      const localFingerprint = getDataFingerprint(localRaw);
      const cloudFingerprint = getDataFingerprint(raw);

      if (localFingerprint === cloudFingerprint) {
        // Data is identical — no action needed
        return;
      }

      // Genuine update from another device — apply and reload
      console.log('[Shohoj] Real update from another device — reloading');
      sessionStorage.setItem('shohoj_cloud_applied', '1');
      localStorage.setItem(STORAGE_KEY, raw);
      showToast('📡 Data updated from another device — reloading…');
      setTimeout(() => window.location.reload(), 1500);
    } catch(e) {
      console.error('[Shohoj] Real-time sync error during comparison:', e);
    }
  }, err => { console.error('[Shohoj] Real-time sync error:', err); });
}

function stopRealtimeSync() {
  if (_unsubscribeSnapshot) { _unsubscribeSnapshot(); _unsubscribeSnapshot = null; }
}

// ── Account data deletion ─────────────────────────────────────────────────────
export async function deleteCloudDataSilent() {
  if (!currentUser) return true;
  try {
    stopRealtimeSync();
    await deleteDoc(userDocRef(currentUser.uid));
    try { localStorage.removeItem(LAST_SYNC_KEY); } catch(e) {}
    return true;
  } catch (e) {
    console.error('[Shohoj] Silent delete failed:', e);
    if (currentUser?.uid) startRealtimeSync(currentUser.uid);
    return false;
  }
}

export async function deleteCloudData() {
  if (!currentUser) return;
  const confirmed = await showConfirmModal({
    icon:          '🗑️',
    title:         'Delete cloud data?',
    body:          'This will permanently delete all your Shohoj data from the cloud. Your local data on this device will remain untouched.',
    confirmLabel:  'Delete cloud data',
    confirmDanger: true,
  });
  if (!confirmed) return;
  try {
    stopRealtimeSync();
    await deleteDoc(userDocRef(currentUser.uid));
    startRealtimeSync(currentUser.uid);
    showToast('Cloud data deleted successfully', false, true);
    setSyncIndicator('synced');
    try { localStorage.removeItem(LAST_SYNC_KEY); } catch(e) {}
  } catch (e) {
    console.error('[Shohoj] Delete failed:', e);
    showToast('⚠ Failed to delete cloud data — please try again', true);
  }
}

// ── Sync status persistence ───────────────────────────────────────────────────
function restoreSyncLabel() {
  try {
    const ts = localStorage.getItem(LAST_SYNC_KEY);
    if (ts) updateLastSyncLabel(parseInt(ts));
  } catch(e) {}
}

function updateLastSyncLabel(timestamp) {
  const el = document.getElementById('lastSyncLabel');
  if (!el || !timestamp) return;
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  let text;
  if (diff < 60)         text = 'Synced just now';
  else if (diff < 3600)  text = `Synced ${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) text = `Synced ${Math.floor(diff / 3600)}h ago`;
  else                   text = `Synced ${Math.floor(diff / 86400)}d ago`;
  el.textContent   = text;
  el.style.display = '';
}

// ── Offline detection ─────────────────────────────────────────────────────────
function initOfflineDetection() {
  const handleOnline = () => {
    setSyncIndicator('synced');
    hideOfflineBanner();
    if (currentUser && typeof window._shohoj_recalc === 'function') window._shohoj_recalc();
  };
  const handleOffline = () => { setSyncIndicator('offline'); showOfflineBanner(); };
  window.addEventListener('online',  handleOnline);
  window.addEventListener('offline', handleOffline);
  if (!navigator.onLine) handleOffline();
}

function showOfflineBanner() {
  let b = document.getElementById('offlineBanner');
  if (b) { b.style.display = ''; return; }
  b = document.createElement('div');
  b.id = 'offlineBanner';
  b.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9997;background:rgba(240,165,0,0.95);color:#0b0f0d;text-align:center;font-size:13px;font-weight:600;padding:10px;backdrop-filter:blur(8px);`;
  b.textContent = '📡 You\'re offline — changes are saved locally and will sync when you reconnect';
  document.body.appendChild(b);
}

function hideOfflineBanner() {
  const b = document.getElementById('offlineBanner');
  if (b) b.style.display = 'none';
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function _modalTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  return {
    isDark,
    bg:     isDark ? '#0d1f12' : '#f0faf3',
    text:   isDark ? '#e8f0ea' : '#0d2914',
    text2:  isDark ? '#8aab90' : '#3a6b47',
    border: isDark ? 'rgba(46,204,113,0.20)' : 'rgba(46,204,113,0.28)',
  };
}

function _injectModalKeyframes() {
  if (document.getElementById('shohojModalKeyframes')) return;
  const s = document.createElement('style');
  s.id = 'shohojModalKeyframes';
  s.textContent = `
    @keyframes modalFadeIn {
      from { opacity:0; transform:scale(0.97) translateY(8px); }
      to   { opacity:1; transform:scale(1)    translateY(0);   }
    }
    .shohoj-modal-btn {
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
    }
    .shohoj-modal-btn:hover {
      filter: brightness(1.12);
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
    .shohoj-modal-btn:active {
      filter: brightness(0.95);
      box-shadow: none;
    }
  `;
  document.head.appendChild(s);
}

function _clearModalOpen() {
  document.body.classList.remove('modal-open');
  document.querySelectorAll('.magnetic').forEach(el => {
    el.style.transform = 'translate(0,0)';
  });
}

function _closeModal(overlay, resolve, value) {
  _clearModalOpen();
  overlay.style.opacity    = '0';
  overlay.style.transition = 'opacity 0.15s';
  setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); }, 150);
  resolve(value);
}

function _closeBtn(text2, isDark) {
  return `<button class="shohoj-modal-btn" id="_mClose" style="
    position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;
    background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};
    border:1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'};
    color:${text2};font-size:18px;line-height:1;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
  ">×</button>`;
}

// ── Sign-in modal ─────────────────────────────────────────────────────────────
function showSignInModal() {
  return new Promise(resolve => {
    _injectModalKeyframes();
    const { isDark, bg, text, text2, border } = _modalTheme();

    const overlay = document.createElement('div');
    overlay.id = 'signInModal';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.72);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;
      animation:modalFadeIn 0.2s ease;
    `;
    overlay.innerHTML = `
      <div style="
        background:${bg};border:1px solid ${border};border-radius:20px;
        padding:32px 28px 28px;max-width:360px;width:90%;
        box-shadow:0 32px 80px rgba(0,0,0,0.55),0 0 0 1px rgba(46,204,113,0.06);
        position:relative;text-align:center;
      ">
        ${_closeBtn(text2, isDark)}

        <div style="
          width:52px;height:52px;background:#2ECC71;border-radius:14px;
          display:inline-flex;align-items:center;justify-content:center;
          font-family:'Syne',sans-serif;font-weight:800;font-size:22px;
          color:#0b0f0d;margin-bottom:18px;
          box-shadow:0 8px 24px rgba(46,204,113,0.35);
        ">স</div>

        <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:${text};margin-bottom:8px;letter-spacing:-0.5px;">
          Sign in to Shohoj
        </div>
        <div style="font-size:13px;color:${text2};line-height:1.6;margin-bottom:24px;max-width:280px;margin-left:auto;margin-right:auto;">
          Use your BRACU G-Suite account to sync your data across all your devices.
        </div>

        <button id="_siGoogle" class="shohoj-modal-btn" style="
          width:100%;padding:13px 20px;border-radius:12px;
          background:${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'};
          border:1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'};
          color:${text};font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;
          cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
          margin-bottom:14px;
        ">
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div style="font-size:11px;color:${text2};opacity:0.7;line-height:1.5;">
          Only <strong>BRACU G-Suite</strong> (@g.bracu.ac.bd) accounts are supported
        </div>
      </div>
    `;

    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    const close = v => _closeModal(overlay, resolve, v);

    overlay.querySelector('#_mClose').onclick = () => close(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

    overlay.querySelector('#_siGoogle').addEventListener('click', () => {
      _clearModalOpen();
      overlay.style.opacity    = '0';
      overlay.style.transition = 'opacity 0.12s';
      setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); }, 120);
      resolve(true);
    });
  });
}

// ── Generic confirm modal ─────────────────────────────────────────────────────
function showConfirmModal({ icon, title, body, confirmLabel, confirmDanger }) {
  return new Promise(resolve => {
    _injectModalKeyframes();
    const { isDark, bg, text, text2, border } = _modalTheme();
    const confirmStyle = confirmDanger
      ? 'background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.35);color:#e74c3c;'
      : 'background:#2ECC71;border:none;color:#0b0f0d;';

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.72);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;
      animation:modalFadeIn 0.2s ease;
    `;
    overlay.innerHTML = `
      <div style="background:${bg};border:1px solid ${border};border-radius:20px;padding:28px;max-width:360px;width:90%;box-shadow:0 32px 80px rgba(0,0,0,0.55);text-align:center;">
        <div style="font-size:28px;margin-bottom:12px;">${icon}</div>
        <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:${text};margin-bottom:8px;letter-spacing:-0.5px;">${title}</div>
        <div style="font-size:13px;color:${text2};line-height:1.6;margin-bottom:22px;">${body}</div>
        <div style="display:flex;gap:10px;">
          <button id="_cfCancel" class="shohoj-modal-btn" style="flex:1;padding:12px;border-radius:10px;background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'};color:${text2};font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
          <button id="_cfOk" class="shohoj-modal-btn" style="flex:1;padding:12px;border-radius:10px;${confirmStyle}font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    const close = v => _closeModal(overlay, resolve, v);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    overlay.querySelector('#_cfCancel').onclick = () => close(false);
    overlay.querySelector('#_cfOk').onclick     = () => close(true);
  });
}

// ── Migration modal ───────────────────────────────────────────────────────────
function showMigrationModal(localSems, cloudSems) {
  return new Promise(resolve => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const bg     = isDark ? '#0f1f14' : '#f0faf3';
    const text   = isDark ? '#e8f0ea' : '#0d2914';
    const text2  = isDark ? '#a8c4ad' : '#2d5a3d';
    const border = isDark ? 'rgba(46,204,113,0.25)' : 'rgba(46,204,113,0.3)';
    const localLabel = localSems === 0 ? 'No local data' : `${localSems} semester${localSems !== 1 ? 's' : ''}`;
    const cloudLabel = cloudSems === 0 ? 'No cloud data' : `${cloudSems} semester${cloudSems !== 1 ? 's' : ''}`;

    const modal = document.createElement('div');
    modal.id = 'migrationModal';
    modal.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;`;
    modal.innerHTML = `
      <div style="background:${bg};border:1px solid ${border};border-radius:16px;padding:28px 32px;max-width:440px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,0.6);">
        <div style="font-size:22px;margin-bottom:8px">⚠️</div>
        <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:${text};margin-bottom:6px">We found data in two places</div>
        <div style="font-size:13px;color:${text2};margin-bottom:20px;line-height:1.6">You have saved data on this device and in your cloud account. Which one do you want to keep?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
          <div style="background:rgba(46,204,113,0.07);border:1px solid rgba(46,204,113,0.2);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#2ECC71;margin-bottom:6px">This device</div>
            <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:${text}">${localLabel}</div>
          </div>
          <div style="background:rgba(86,180,233,0.07);border:1px solid rgba(86,180,233,0.2);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#56B4E9;margin-bottom:6px">Cloud account</div>
            <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:${text}">${cloudLabel}</div>
          </div>
        </div>
        <div style="font-size:11px;color:${text2};margin-bottom:16px;text-align:center">The other will be discarded. This cannot be undone.</div>
        <div style="display:flex;gap:10px">
          <button id="keepLocalBtn" style="flex:1;padding:11px;border-radius:10px;background:#2ECC71;color:#0b0f0d;border:none;font-size:13px;font-weight:700;cursor:pointer;">Keep this device's data</button>
          <button id="keepCloudBtn" style="flex:1;padding:11px;border-radius:10px;background:rgba(86,180,233,0.15);color:#56B4E9;border:1px solid rgba(86,180,233,0.3);font-size:13px;font-weight:700;cursor:pointer;">Keep cloud data</button>
        </div>
      </div>`;
    document.body.classList.add('modal-open');
    document.body.appendChild(modal);
    const close = (val) => {
      _clearModalOpen();
      document.body.removeChild(modal);
      resolve(val);
    };
    document.getElementById('keepLocalBtn').onclick = () => close('local');
    document.getElementById('keepCloudBtn').onclick = () => close('cloud');
  });
}

// ── Sign in ───────────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  if (!auth) {
    showToast('⚠ Sign-in is not configured on this build', true, true);
    return;
  }
  const proceed = await showSignInModal();
  if (!proceed) return;
  setAuthBtnLoading(true);
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    setAuthBtnLoading(false);
    if (e.code !== 'auth/popup-closed-by-user') {
      console.error('[Shohoj] Sign-in failed:', e);
      showToast('⚠ Sign-in failed — please try again', true, true);
    }
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────
export async function signOutUser() {
  if (!auth) return;
  try {
    try { localStorage.removeItem(SESSION_START_KEY); } catch(e) {}
    clearCloudAppliedFlag();
    clearQueuedCloudSave(false);
    stopRealtimeSync();
    await signOut(auth);
    showToast('Signed out successfully', false, true);
  } catch (e) {
    console.error('[Shohoj] Sign-out failed:', e);
  }
}

// ── Google One Tap ────────────────────────────────────────────────────────────
// Surfaces Google's One Tap prompt to signed-out visitors so first-time users
// can sign in without hunting for the button. Restricted to BRACU G-Suite via
// the `hd` hint; the credential is exchanged for a Firebase session, after which
// the existing onAuthStateChanged domain guard + sync flow take over unchanged.
// Fully disabled (no-op) when no client ID is configured. Closing the prompt
// triggers Google's own cooldown, so it won't nag on every reload.
let _oneTapReady    = null;   // Promise — resolves true once GIS is initialized
let _oneTapPrompted = false;  // already auto-prompted this page-load

function _loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const existing = document.getElementById('gsiClient');
    if (existing) {
      existing.addEventListener('load',  () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'gsiClient';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload  = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function _onOneTapCredential(response) {
  const idToken = response?.credential;
  if (!idToken || !auth) return;
  try {
    // onAuthStateChanged enforces the BRACU domain + runs the sync flow.
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (e) {
    console.error('[Shohoj] One Tap sign-in failed:', e);
  }
}

function _initOneTap() {
  if (_oneTapReady) return _oneTapReady;
  if (!googleClientId || !auth) { _oneTapReady = Promise.resolve(false); return _oneTapReady; }
  _oneTapReady = _loadGisScript().then(() => {
    if (!window.google?.accounts?.id) return false;
    window.google.accounts.id.initialize({
      client_id:             googleClientId,
      callback:              _onOneTapCredential,
      auto_select:           false,            // never silently sign in
      cancel_on_tap_outside: true,
      context:               'signin',
      hd:                    'g.bracu.ac.bd',  // only surface BRACU accounts
      use_fedcm_for_prompt:  true,             // required path on modern Chrome
    });
    return true;
  }).catch(e => {
    console.warn('[Shohoj] One Tap unavailable:', e?.message || e);
    return false;
  });
  return _oneTapReady;
}

async function maybePromptOneTap() {
  if (!googleClientId || !auth) return;
  if (currentUser || _oneTapPrompted) return;
  _oneTapPrompted = true;
  const ok = await _initOneTap();
  if (!ok || currentUser || !window.google?.accounts?.id) return;
  try { window.google.accounts.id.prompt(); }
  catch (e) { console.warn('[Shohoj] One Tap prompt failed:', e?.message || e); }
}

function dismissOneTap() {
  if (!window.google?.accounts?.id) return;
  try { window.google.accounts.id.cancel(); } catch (_e) {}
}

// ── Init auth ─────────────────────────────────────────────────────────────────
export function initAuth() {
  restoreSyncLabel();
  initOfflineDetection();
  _authReady = false;
  setAuthBtnLoading(true);

  if (!auth || !db) {
    currentUser = null;
    _isAdminCached = false;
    notifyAuthStateReady();
    setAuthBtnLoading(false);
    updateAuthUI(null);
    showNudgeBanner(false);
    return;
  }

  onAuthStateChanged(auth, async user => {
    // ── Domain enforcement ─────────────────────────────────────────────────
    let tokenClaims = null;
    if (user) {
      const tokenResult = await user.getIdTokenResult(true).catch(() => null);
      tokenClaims = tokenResult?.claims || null;
      const isBracuEmail = user.email?.toLowerCase().endsWith('@g.bracu.ac.bd');
      const isVerifiedEmail = user.emailVerified === true || tokenClaims?.email_verified === true;
      const signInProvider = tokenClaims?.firebase?.sign_in_provider || '';
      const isGoogleProvider = signInProvider === 'google.com';
      const isAllowedBracuUser = isBracuEmail && isVerifiedEmail && isGoogleProvider;
      if (!isAllowedBracuUser && tokenClaims?.admin !== true) {
        await signOut(auth);
        setAuthBtnLoading(false);
        showToast('⚠ Only verified BRACU Google accounts are supported', true, true);
        return;
      }
    }

    _isAdminCached = tokenClaims?.admin === true;
    currentUser = user;
    notifyAuthStateReady();
    setAuthBtnLoading(false);

    if (user) {
      dismissOneTap();  // close any visible prompt now that we're signed in
      // ── 30-day session expiry ────────────────────────────────────────────
      let sessionStart = null;
      try { sessionStart = parseInt(localStorage.getItem(SESSION_START_KEY)); } catch(e) {}
      const now = Date.now();
      if (!sessionStart || isNaN(sessionStart)) {
        try { localStorage.setItem(SESSION_START_KEY, String(now)); } catch(e) {}
        const firstName = firstDisplayName(user.displayName);
        showToast(`Welcome to Shohoj, ${firstName} `, false, true);
      } else if (now - sessionStart > SESSION_MAX_MS) {
        try { localStorage.removeItem(SESSION_START_KEY); } catch(e) {}
        stopRealtimeSync();
        await signOut(auth);
        showToast('Your session expired — please sign in again', true, true);
        return;
      }

      updateAuthUI(user);
      showNudgeBanner(false);
      _cloudReconciled = false;
      const cloudData = await loadFromCloud();
      let localRaw = null;
      try { localRaw = localStorage.getItem(STORAGE_KEY); } catch(e) {}
      const localParsed = parseStoredState(localRaw, 'local');
      const hasLocal = !!localParsed;
      const hasCloud = !!cloudData;

      if (!hasLocal && !hasCloud) {
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        setSyncIndicator('synced'); startRealtimeSync(user.uid); showNudgeBanner(false); return;
      }
      if (!hasLocal && hasCloud) { applyCloudData(cloudData); return; }
      if (hasLocal && !hasCloud) {
        setSyncIndicator('syncing');
        await saveToCloud(localParsed, { immediate: true });
        // Don't remove localStorage — keep it as the source of truth for this tab.
        // The realtime listener will ignore this write via the local-write guard
        // (_localWriteAt), so we don't need shohoj_skip_first_save here — that flag
        // would silently drop the user's first edit after sign-in.
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        showToast('Data uploaded to your cloud account ✓', false, true);
        startRealtimeSync(user.uid); showNudgeBanner(false); return;
      }

      // ── Both local and cloud data exist ───────────────────────────────
      const justApplied = sessionStorage.getItem('shohoj_cloud_applied');
      if (justApplied) {
        sessionStorage.setItem('shohoj_skip_first_save', '1');
        setSyncIndicator('synced'); startRealtimeSync(user.uid); showNudgeBanner(false); return;
      }

      const localSems   = localParsed?.semesters?.length || 0;
      const cloudSems   = cloudData?.semesters?.length   || 0;

      if (localSems === 0) {
        applyCloudData(cloudData); return;
      }

      // Compare fingerprints — if they're the same data, skip migration modal
      const localFingerprint = getDataFingerprint(localRaw);
      const cloudFingerprint = getDataFingerprint(JSON.stringify(cloudData));
      if (localFingerprint === cloudFingerprint) {
        // Local already equals cloud, so nothing was applied and there is no
        // echo-back save to skip. Do NOT arm shohoj_skip_first_save here — that
        // flag would silently swallow the user's first real save after sign-in
        // (e.g. a transcript import), leaving the cloud stuck on the old data.
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        setSyncIndicator('synced'); startRealtimeSync(user.uid); showNudgeBanner(false); return;
      }

      const choice = await showMigrationModal(localSems, cloudSems);

      if (choice === 'local') {
        setSyncIndicator('syncing');
        await saveToCloud(localParsed, { immediate: true });
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        showToast('Local data saved to cloud ✓', false, true);
        setSyncIndicator('synced');
      } else {
        applyCloudData(cloudData); return;
      }
      startRealtimeSync(user.uid); showNudgeBanner(false);

    } else {
      currentUser = null;
      _cloudReconciled = true;
      notifyAuthStateReady();
      stopRealtimeSync();
      clearCloudAppliedFlag();
      clearQueuedCloudSave(false);
      _localWriteAt = 0;
      updateAuthUI(null);
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) {}
      const parsed = parseStoredState(raw, 'local');
      showNudgeBanner(parsed?.semesters?.length > 0);
      maybePromptOneTap();  // auto-surface One Tap for signed-out visitors
    }
  });
}

// ── Apply cloud data ──────────────────────────────────────────────────────────
// Applies cloud data directly into the running app without reloading the page.
// Writes to localStorage so the app's state restore logic can read it, then
// calls the live state functions to update the UI immediately.
function applyCloudData(cloudData) {
  // The other terminal branch of the reconciliation (cloud wins).
  _cloudReconciled = true;
  try {
    sessionStorage.setItem('shohoj_cloud_applied', '1');
    sessionStorage.setItem('shohoj_skip_first_save', '1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
  } catch(e) {}

  // Apply directly into the running app — no page reload needed.
  // window._shohoj_applyState is set by main.js and handles full state restoration.
  if (typeof window._shohoj_applyState === 'function') {
    window._shohoj_applyState(cloudData);
  } else {
    // Fallback: if the app isn't fully booted yet (e.g. very fast sign-in on
    // first load before main.js runs), a single reload is unavoidable.
    window.location.reload();
  }
}

// ── Nudge banner ──────────────────────────────────────────────────────────────
function showNudgeBanner(show) {
  let banner = document.getElementById('authNudgeBanner');
  if (!show) { if (banner) banner.style.display = 'none'; return; }
  if (banner) { banner.style.display = ''; return; }
  banner = document.createElement('div');
  banner.id = 'authNudgeBanner';
  banner.style.cssText = `
    margin: 1.2rem 2rem 1.2rem;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(86,180,233,0.07);
    border: 1px solid rgba(86,180,233,0.25);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 13px;
    color: var(--text2);
  `;
  banner.innerHTML = `
    <span>☁ Sign in with your BRACU G-Suite account to back up your data and access it from any device.</span>
    <button data-action="auth:signin" class="gauth-reauth-btn" style="
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 16px;border-radius:8px;
      background:rgba(255,255,255,0.07);
      border:1px solid rgba(255,255,255,0.14);
      color:#e8f0ea;font-family:'DM Sans',sans-serif;
      font-size:13px;font-weight:600;cursor:pointer;
      white-space:nowrap;flex-shrink:0;
      transition:background 0.2s,border-color 0.2s;
    ">
      <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  `;
  const calcFooter = document.querySelector('.calc-footer');
  if (calcFooter?.parentNode) calcFooter.parentNode.insertBefore(banner, calcFooter.nextSibling);
}

window._shohoj_signIn = signInWithGoogle;

// firebase.js executes before the bundled main module in dev mode, so the
// dispatcher's registerAction may not exist yet at top-level. Defer to
// DOMContentLoaded — by then all module scripts have run.
document.addEventListener('DOMContentLoaded', () => {
  window._shohoj_registerAction?.('auth:signin', () => signInWithGoogle());
});
window._shohoj_signOut = signOutUser;
window._shohoj_deleteCloudData = deleteCloudDataSilent;
window._shohoj_confirmModal = showConfirmModal;
window._shohoj_showToast = showToast;

// ── Seat-drop alert sync ──────────────────────────────────────────────────────
// Mirror the Seat Status watchlist to Firestore (seatAlertWatches/{uid}) so the
// cron Worker can email the signed-in student when a watched seat opens — even
// with Shohoj closed. No-op (resolves false) when signed out; the Seats tab then
// falls back to in-tab alerts only and prompts sign-in. The doc is fully
// overwritten each sync; `email` is pinned to the user's own address (enforced
// again by firestore.rules) so a watch can only ever notify its own owner.
window._shohoj_syncSeatAlerts = async function(sections, enabled) {
  if (!currentUser || !currentUser.email || !db) return false;
  try {
    const list = (Array.isArray(sections) ? sections : []).slice(0, 50)
      .map(s => ({ id: Number(s.id), code: String(s.code || ''), name: String(s.name || '') }))
      .filter(s => Number.isFinite(s.id));
    // The caller (Seats tab) owns the on/off preference and passes the resolved
    // flag; fall back to the old "armed when watching" rule if omitted.
    const armed = typeof enabled === 'boolean' ? enabled : list.length > 0;
    await setDoc(doc(db, 'seatAlertWatches', currentUser.uid), {
      email:     currentUser.email,
      enabled:   armed,
      sections:  list,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.error('[Shohoj] Seat-alert sync failed:', e);
    return false;
  }
};

// Lets the Seats tab tailor its copy: "you'll get emails" vs "sign in first".
window._shohoj_seatAlertIdentity = () =>
  (currentUser && currentUser.email)
    ? { signedIn: true, email: currentUser.email }
    : { signedIn: false, email: null };

// ── Faculty review hooks ──────────────────────────────────────────────────────
// Expose a thin Firestore bridge so the bundled code (js/core/reviews.js) can
// submit and fetch reviews without importing Firebase itself.

installReviewIdentityHooks({
  getCurrentUser: () => currentUser,
  isAuthReady: () => _authReady,
});

// ── Assistant hooks ───────────────────────────────────────────────────────────
// The Assistant launcher (js/ui/assistantFab.js) ships in the main bundle and
// talks to the Worker directly; it needs a token, and it needs any pending
// local edits flushed first, because the Worker answers from users/{uid}.

installAssistantAuthHooks({
  getCurrentUser: () => currentUser,
  isCloudSettled: () => _cloudReconciled,
  getIdToken: () => getCurrentUserIdToken(currentUser),
  saveSnapshot: snap => saveToCloud(snap, { immediate: true }),
  readLocalSnapshot: () => {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) {}
    return parseStoredState(raw);
  },
});

// Reviews are written through the Cloudflare Worker (`POST /reviews`) using a
// service-account identity. Firestore rules deny all client creates on
// `facultyReviews`, so the canonical sha256(uid|initials|course) ID can't be
// subverted by clients posting under arbitrary hex suffixes.
// Privacy-preserving local "receipt" of reviews this browser submitted, keyed by
// uid. Public review docs store no uid (authorship is only the non-reversible
// sha256(uid|initials|course) doc id), so this local list is the only way the
// Profile tab can show a student "your reviews" without a de-anonymizing query.
// Best-effort: localStorage may be unavailable, and reviews written on another
// device won't appear here.
const MY_REVIEWS_KEY = 'shohoj_my_reviews_v1';
function _recordMyReview(uid, entry) {
  if (!uid) return;
  try {
    const all = JSON.parse(localStorage.getItem(MY_REVIEWS_KEY) || '{}');
    const list = Array.isArray(all[uid]) ? all[uid] : [];
    const key = `${entry.facultyInitials}|${entry.courseCode}`;
    const next = list.filter(r => `${r.facultyInitials}|${r.courseCode}` !== key);
    next.push(entry);
    all[uid] = next;
    localStorage.setItem(MY_REVIEWS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable — non-fatal */ }
}

window._shohoj_submitReview = async function(payload) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  const base = getPapersWorkerUrl();
  if (!base) return { ok: false, error: 'Review service not configured' };
  const token = await getCurrentUserIdToken(currentUser);
  if (!token) return { ok: false, error: 'Could not get auth token' };
  try {
    const res = await fetch(`${base}/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facultyInitials: payload?.facultyInitials,
        courseCode:      payload?.courseCode,
        semester:        payload?.semester || '',
        text:            payload?.text     || '',
        ratings:         payload?.ratings,
      }),
    });
    if (res.status === 409) {
      return {
        ok: false,
        code: 'already-exists',
        error: 'You have already submitted a review for this faculty-course pair. Reviews cannot be edited from the client.',
      };
    }
    if (!res.ok) {
      let msg = 'Submission failed';
      try { msg = (await res.json()).error || msg; } catch {}
      return { ok: false, error: msg };
    }
    const data = await res.json().catch(() => ({}));
    _recordMyReview(currentUser.uid, {
      id:              data.id || null,
      facultyInitials: payload?.facultyInitials || '',
      courseCode:      payload?.courseCode || '',
      semester:        payload?.semester || '',
      at:              Date.now(),
    });
    return { ok: true, id: data.id || null };
  } catch (e) {
    console.error('[Shohoj] submitReview failed:', e);
    return { ok: false, error: e.message || 'Submission failed' };
  }
};

window._shohoj_fetchReviewById = async function(id) {
  if (!currentUser || !id) return null;
  try {
    const ref = doc(db, 'facultyReviews', id);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[Shohoj] fetchReviewById failed:', e);
    return null;
  }
};

window._shohoj_reportReview = async function({ id, reviewId, reason, reporterUid }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!id || typeof id !== 'string') return { ok: false, error: 'Invalid report id' };
  if (reporterUid !== currentUser.uid) return { ok: false, error: 'Invalid reporter' };
  try {
    const ref = doc(db, 'reviewReports', id);
    await setDoc(ref, {
      reviewId: String(reviewId || '').slice(0, 128),
      reason:   String(reason || '').slice(0, 300),
      reporterUid: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] reportReview failed:', e);
    if (e.code === 'permission-denied') {
      return { ok: false, error: 'Report could not be submitted. The review may have already been removed or you may have reported it already.' };
    }
    return { ok: false, error: e.message || 'Report failed' };
  }
};

// Fetch reviews scoped to a faculty, optionally a course, with paging.
// `after` is the last review doc from the previous page (pass through).
window._shohoj_fetchReviews = async function({ facultyInitials, courseCode, pageSize = 50, after = null }) {
  if (!currentUser || !facultyInitials) return { reviews: [], nextCursor: null };
  try {
    const col = collection(db, 'facultyReviews');
    const constraints = [where('facultyInitials', '==', facultyInitials)];
    if (courseCode) constraints.push(where('courseCode', '==', courseCode));
    constraints.push(orderBy('createdAt', 'desc'));
    if (after && after._cursor) constraints.push(startAfter(after._cursor));
    constraints.push(qLimit(Math.min(pageSize, 200)));
    const q = query(col, ...constraints);
    const snap = await getDocs(q);
    const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.docs.length === pageSize && last ? { _cursor: last } : null;
    return { reviews, nextCursor };
  } catch (e) {
    console.warn('[Shohoj] fetchReviews failed:', e);
    return { reviews: [], nextCursor: null };
  }
};

window._shohoj_fetchReviewsByCourse = async function(courseCode, { pageSize = 200, after = null } = {}) {
  if (!currentUser || !courseCode) return { reviews: [], nextCursor: null };
  try {
    const col = collection(db, 'facultyReviews');
    const constraints = [
      where('courseCode', '==', String(courseCode).toUpperCase()),
      orderBy('createdAt', 'desc'),
    ];
    if (after && after._cursor) constraints.push(startAfter(after._cursor));
    constraints.push(qLimit(Math.min(pageSize, 200)));
    const q = query(col, ...constraints);
    const snap = await getDocs(q);
    const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.docs.length === pageSize && last ? { _cursor: last } : null;
    return { reviews, nextCursor };
  } catch (e) {
    console.warn('[Shohoj] fetchReviewsByCourse failed:', e);
    return { reviews: [], nextCursor: null };
  }
};

window._shohoj_fetchRecentReviews = async function(n = 50) {
  if (!currentUser) return [];
  try {
    const col = collection(db, 'facultyReviews');
    const q = query(col, orderBy('createdAt', 'desc'), qLimit(Math.min(n, 1000)));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchRecentReviews failed:', e);
    return [];
  }
};

window._shohoj_fetchFacultyProfiles = async function(initialsArr) {
  if (!currentUser || !Array.isArray(initialsArr) || !initialsArr.length) return [];
  try {
    const normalized = [...new Set(initialsArr.map(i => String(i).toUpperCase().trim()).filter(Boolean))];
    const results = [];
    for (let i = 0; i < normalized.length; i += 30) {
      const chunk = normalized.slice(i, i + 30);
      const col = collection(db, 'facultyProfiles');
      const q = query(col, where(documentId(), 'in', chunk));
      const snap = await getDocs(q);
      snap.docs.forEach(d => results.push({ initials: d.id, ...d.data() }));
    }
    return results;
  } catch (e) {
    console.warn('[Shohoj] fetchFacultyProfiles failed:', e);
    return [];
  }
};

// ── Auth button loading state ─────────────────────────────────────────────────
function setAuthBtnLoading(loading) {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  btn.disabled      = loading;
  btn.style.opacity = loading ? '0.55' : '';
  if (loading) {
    const label = btn.querySelector('.auth-name, .auth-signin-label');
    if (label) label.textContent = '…';
  }
}

// ── Sync indicator ────────────────────────────────────────────────────────────
function setSyncIndicator(status) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  const colors  = { syncing:'#F0A500', synced:'#2ECC71', error:'#e74c3c', offline:'#e74c3c' };
  const shadows = { syncing:'rgba(240,165,0,0.6)', synced:'rgba(46,204,113,0.6)', error:'rgba(231,76,60,0.6)', offline:'rgba(231,76,60,0.6)' };
  const titles  = { syncing:'Syncing to cloud…', synced:'Data synced to cloud', error:'Cloud sync failed — data saved locally', offline:'Offline — changes saved locally' };
  dot.style.background = colors[status]  || '#2ECC71';
  dot.style.boxShadow  = `0 0 0 2px var(--bg), 0 0 6px ${shadows[status] || shadows.synced}`;
  dot.title            = titles[status]  || '';
  dot.style.animation  = status === 'syncing' ? 'pulse 1s infinite' : '';
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function _toggleAdminNavBtn() {
  const btn = document.getElementById('adminNavBtn');
  if (!btn) return;
  btn.classList.toggle('is-admin', _isAdminUser());
}

// ── Account dropdown menu ─────────────────────────────────────────────────────
// The signed-in account pill opens this lightweight menu (Profile / Seat
// watchlist / Admin / Sign out) instead of navigating straight to the Profile
// page, so the common actions — especially sign-out — are one click away
// without a full page navigation. The menu is appended to <body> and positioned
// `fixed` against the pill's bounding rect so the nav's backdrop-filter/overflow
// can't clip it and it stays glued to the pill on scroll/resize. Identity fields
// (displayName / email / photoURL) come from Google's identity data and are
// outside our trust boundary, so they're written via textContent / guarded src,
// never innerHTML. Icons are emoji set via textContent, matching the calc tabs.
let _accountMenuEl      = null;
let _accountMenuCleanup = null;

function _closeAccountMenu() {
  if (_accountMenuCleanup) { _accountMenuCleanup(); _accountMenuCleanup = null; }
  if (_accountMenuEl) { _accountMenuEl.remove(); _accountMenuEl = null; }
  const btn = document.getElementById('authBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function _positionAccountMenu(btn, menu) {
  const r = btn.getBoundingClientRect();
  const margin = 8;
  const width = menu.offsetWidth;
  let left = Math.round(r.right - width);              // anchor menu's right edge to pill's
  const maxLeft = window.innerWidth - width - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin)  left = margin;
  menu.style.top  = `${Math.round(r.bottom + 6)}px`;
  menu.style.left = `${left}px`;
}

function _accountMenuKeyNav(e, menu) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement);
  let next;
  if (e.key === 'ArrowDown')    next = idx < 0 ? 0 : (idx + 1) % items.length;
  else if (e.key === 'ArrowUp') next = idx <= 0 ? items.length - 1 : idx - 1;
  else if (e.key === 'Home')    next = 0;
  else                          next = items.length - 1;
  items[next].focus();
}

function _buildAccountMenu(user) {
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Account menu');

  // Identity header — avatar + name + email.
  const header = document.createElement('div');
  header.className = 'account-menu-header';
  const av = document.createElement('div');
  av.className = 'account-menu-avatar';
  if (isSafeAvatarUrl(user.photoURL)) {
    const img = document.createElement('img');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.src = user.photoURL;
    img.alt = '';
    av.appendChild(img);
  } else {
    av.classList.add('is-fallback');
    av.textContent = (user.displayName || user.email || '?').charAt(0).toUpperCase();
  }
  const idBlock = document.createElement('div');
  idBlock.className = 'account-menu-id';
  const nameEl = document.createElement('div');
  nameEl.className = 'account-menu-name';
  nameEl.textContent = user.displayName || 'Signed in';
  const emailEl = document.createElement('div');
  emailEl.className = 'account-menu-email';
  emailEl.textContent = user.email || '';
  idBlock.appendChild(nameEl);
  idBlock.appendChild(emailEl);
  header.appendChild(av);
  header.appendChild(idBlock);
  menu.appendChild(header);

  const addItem = (emoji, label, onActivate, opts = {}) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'account-menu-item' + (opts.danger ? ' is-danger' : '');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const ic = document.createElement('span');
    ic.className = 'account-menu-icon';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = emoji;
    const lb = document.createElement('span');
    lb.className = 'account-menu-label';
    lb.textContent = label;
    item.appendChild(ic);
    item.appendChild(lb);
    item.addEventListener('click', () => { _closeAccountMenu(); onActivate(); });
    menu.appendChild(item);
    return item;
  };
  const addSep = () => {
    const sep = document.createElement('div');
    sep.className = 'account-menu-sep';
    menu.appendChild(sep);
  };

  addItem('👤', 'View profile', () => { window.location.href = 'profile/'; });
  addItem('🪑', 'Seat watchlist', () => {
    if (typeof window.switchCalcTab === 'function') {
      window.switchCalcTab('seats');
      document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.location.href = './#calculator/seats';
    }
  });
  if (_isAdminUser()) {
    addItem('🛡️', 'Admin dashboard', () => { window.location.href = 'admin/'; });
  }
  addSep();
  addItem('🚪', 'Sign out', () => { signOutUser(); }, { danger: true });

  return menu;
}

function _toggleAccountMenu(user) {
  if (_accountMenuEl) { _closeAccountMenu(); return; }
  const btn = document.getElementById('authBtn');
  if (!btn) return;

  const menu = _buildAccountMenu(user);
  document.body.appendChild(menu);
  _accountMenuEl = menu;
  btn.setAttribute('aria-expanded', 'true');
  _positionAccountMenu(btn, menu);
  menu.querySelector('[role="menuitem"]')?.focus();

  const onDocClick = (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) _closeAccountMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { _closeAccountMenu(); btn.focus(); return; }
    _accountMenuKeyNav(e, menu);
  };
  const reposition = () => { if (_accountMenuEl) _positionAccountMenu(btn, _accountMenuEl); };
  // Defer the outside-click listener so the click that opened the menu doesn't
  // immediately close it.
  setTimeout(() => document.addEventListener('click', onDocClick), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  _accountMenuCleanup = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  };
}

function updateAuthUI(user) {
  _toggleAdminNavBtn();
  _closeAccountMenu();   // drop any open menu before repainting the pill
  const btn = document.getElementById('authBtn');
  if (!btn) return;

  if (user) {
    btn.className     = 'auth-btn-signed-in magnetic';
    btn.style.cssText = '';
    btn.disabled      = false;
    btn.title         = 'Account menu';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    // The pill opens the account menu (Profile / Seat watchlist / Admin / Sign
    // out) rather than navigating straight to the Profile page, so sign-out and
    // the other actions are reachable in one click. See _buildAccountMenu.
    btn.onclick       = (e) => { e.preventDefault(); e.stopPropagation(); _toggleAccountMenu(user); };
    btn.ondblclick    = null;

    const firstName = user.displayName?.split(' ')[0] || 'Account';

    // Build the signed-in pill via DOM APIs so that user.displayName /
    // user.photoURL / user.email (which come from Google's identity data
    // and are outside our trust boundary) never flow through innerHTML.
    btn.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'auth-avatar-wrap';
    if (isSafeAvatarUrl(user.photoURL)) {
      const img = document.createElement('img');
      img.className = 'auth-avatar-img';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = user.photoURL;
      img.alt = firstName;
      wrap.appendChild(img);
    } else {
      const fb = document.createElement('div');
      fb.className = 'auth-avatar-fallback';
      fb.textContent = firstName.charAt(0).toUpperCase();
      wrap.appendChild(fb);
    }
    const dot = document.createElement('span');
    dot.id = 'syncDot';
    dot.className = 'auth-sync-dot';
    wrap.appendChild(dot);
    btn.appendChild(wrap);

    const nameEl = document.createElement('span');
    nameEl.className = 'auth-name';
    nameEl.textContent = firstName;
    btn.appendChild(nameEl);

    setSyncIndicator('synced');
    restoreSyncLabel();

    let syncLabel = document.getElementById('lastSyncLabel');
    if (!syncLabel) {
      syncLabel           = document.createElement('div');
      syncLabel.id        = 'lastSyncLabel';
      syncLabel.className = 'auth-last-sync';
      btn.parentNode?.insertBefore(syncLabel, btn.nextSibling);
    }
    syncLabel.style.display = '';

  } else {
    btn.className     = 'auth-btn-signed-out magnetic';
    btn.style.cssText = '';
    btn.disabled      = false;
    btn.title         = 'Sign in with your BRACU G-Suite account';
    btn.removeAttribute('aria-haspopup');
    btn.removeAttribute('aria-expanded');
    btn.onclick       = signInWithGoogle;
    btn.ondblclick    = null;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;opacity:0.75">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="currentColor"/>
      </svg>
      <span class="auth-signin-label">Sign in</span>
    `;
    const syncLabel = document.getElementById('lastSyncLabel');
    if (syncLabel) syncLabel.style.display = 'none';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, isError = false, isAuth = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;
    top:64px;left:50%;transform:translateX(-50%);
    background:${isError ? '#e74c3c' : '#2ECC71'};
    color:${isError ? '#fff' : '#0b0f0d'};
    padding:10px 20px;
    border-radius:100px;
    font-size:13px;
    font-weight:600;
    box-shadow:0 4px 20px ${isError ? 'rgba(231,76,60,0.4)' : 'rgba(46,204,113,0.4)'};
    z-index:99998;
    pointer-events:none;
    animation:toastIn 0.3s ease;
    white-space:nowrap;
    max-width:calc(100vw - 40px);
  `;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transition = 'opacity 0.3s';
    setTimeout(() => { if (t.parentNode) document.body.removeChild(t); }, 300);
  }, 3500);
}

// ── App feedback hooks ────────────────────────────────────────────────────────
window._shohoj_submitFeedback = async function({ type, text, context, anonymous, uid: submitterUid }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  const validTypes = ['bug', 'feature', 'general'];
  if (!validTypes.includes(type)) return { ok: false, error: 'Invalid type' };
  const trimmed = String(text || '').trim().slice(0, 500);
  if (trimmed.length < 3) return { ok: false, error: 'Feedback too short' };
  try {
    const data = {
      type,
      text: trimmed,
      context: (context && typeof context === 'object') ? context : {},
      anonymous: !!anonymous,
      createdAt: serverTimestamp(),
    };
    if (!anonymous && submitterUid === currentUser.uid) {
      data.uid = currentUser.uid;
    }
    await addDoc(collection(db, 'appFeedback'), data);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] submitFeedback failed:', e);
    return { ok: false, error: e.message || 'Submission failed' };
  }
};

window._shohoj_fetchAllFeedback = async function() {
  if (!currentUser) return [];
  try {
    const q = query(
      collection(db, 'appFeedback'),
      orderBy('createdAt', 'desc'),
      qLimit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchAllFeedback failed:', e);
    return [];
  }
};

window._shohoj_fetchAllUpvotes = async function() {
  if (!currentUser) return [];
  try {
    const q = query(
      collection(db, 'appFeedbackUpvotes'),
      where('uid', '==', currentUser.uid),
      qLimit(500),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchAllUpvotes failed:', e);
    return [];
  }
};

window._shohoj_toggleUpvote = async function(feedbackId, currentlyUpvoted) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  const voteId = `${feedbackId}_${currentUser.uid}`;
  try {
    if (currentlyUpvoted) {
      await deleteDoc(doc(db, 'appFeedbackUpvotes', voteId));
    } else {
      await setDoc(doc(db, 'appFeedbackUpvotes', voteId), {
        feedbackId,
        uid: currentUser.uid,
        createdAt: serverTimestamp(),
      });
    }
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] toggleUpvote failed:', e);
    return { ok: false, error: e.message || 'Failed' };
  }
};

// ── Study group finder hooks (Phase 2 community) ──────────────────────────────
// Direct client writes gated by firestore.rules (studyGroups / studyGroupMembers
// / studyGroupReports). No Worker — the group doc carries no file or hash, and
// each member doc pins the joiner's own verified email so a join can't publish
// someone else's address.
window._shohoj_createStudyGroup = async function({ courseCode, title, description, mode, schedule, contactLink, capacity }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  try {
    const data = {
      courseCode: String(courseCode || '').toUpperCase().trim(),
      title: String(title || '').trim().slice(0, 80),
      mode: String(mode || '').toLowerCase(),
      contactLink: String(contactLink || '').trim().slice(0, 300),
      capacity: Math.round(Number(capacity) || 0),
      creatorUid: currentUser.uid,
      createdAt: serverTimestamp(),
    };
    const desc = String(description || '').trim();
    if (desc) data.description = desc.slice(0, 500);
    const sched = String(schedule || '').trim();
    if (sched) data.schedule = sched.slice(0, 120);
    const ref = await addDoc(collection(db, 'studyGroups'), data);
    return { ok: true, id: ref.id };
  } catch (e) {
    console.error('[Shohoj] createStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Create failed' };
  }
};

window._shohoj_fetchStudyGroups = async function() {
  if (!currentUser) return [];
  try {
    // The board is capped at 200 recent groups; course/mode filtering is done
    // client-side (substring match) in groupsTab, so no server-side course
    // filter (or its composite index) is needed.
    const q = query(collection(db, 'studyGroups'), orderBy('createdAt', 'desc'), qLimit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchStudyGroups failed:', e);
    return [];
  }
};

window._shohoj_fetchMyGroupMemberships = async function() {
  if (!currentUser) return [];
  try {
    const q = query(
      collection(db, 'studyGroupMembers'),
      where('uid', '==', currentUser.uid),
      qLimit(500),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchMyGroupMemberships failed:', e);
    return [];
  }
};

window._shohoj_fetchGroupMembers = async function(groupId) {
  if (!currentUser || !groupId) return [];
  try {
    const q = query(
      collection(db, 'studyGroupMembers'),
      where('groupId', '==', String(groupId)),
      orderBy('joinedAt', 'asc'),
      qLimit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Non-members are denied the roster by rules — surface as a locked roster.
    console.warn('[Shohoj] fetchGroupMembers failed:', e?.message || e);
    return [];
  }
};

window._shohoj_joinStudyGroup = async function(groupId) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    const memberId = `${groupId}_${currentUser.uid}`;
    await setDoc(doc(db, 'studyGroupMembers', memberId), {
      groupId: String(groupId),
      uid: currentUser.uid,
      email: currentUser.email,
      joinedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] joinStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Join failed' };
  }
};

window._shohoj_leaveStudyGroup = async function(groupId) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    await deleteDoc(doc(db, 'studyGroupMembers', `${groupId}_${currentUser.uid}`));
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] leaveStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Leave failed' };
  }
};

window._shohoj_deleteStudyGroup = async function(groupId) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    await deleteDoc(doc(db, 'studyGroups', String(groupId)));
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deleteStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_reportStudyGroup = async function({ groupId, reason }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    const reportId = `${currentUser.uid}_${groupId}`;
    await setDoc(doc(db, 'studyGroupReports', reportId), {
      groupId: String(groupId),
      reason: String(reason || '').slice(0, 300),
      reporterUid: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] reportStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Report failed' };
  }
};

// Admin moderation for study groups.
window._shohoj_fetchStudyGroupReports = async function() {
  if (!_isAdminUser()) return [];
  try {
    const q = query(collection(db, 'studyGroupReports'), orderBy('createdAt', 'desc'), qLimit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchStudyGroupReports failed:', e);
    return [];
  }
};

window._shohoj_deleteStudyGroupReport = async function(reportId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  try {
    await deleteDoc(doc(db, 'studyGroupReports', reportId));
    _writeAdminLog('delete_study_group_report', 'studyGroupReport', reportId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deleteStudyGroupReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_adminDeleteStudyGroup = async function(groupId, meta) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    await deleteDoc(doc(db, 'studyGroups', String(groupId)));
    _writeAdminLog('delete_study_group', 'studyGroup', groupId, (meta && typeof meta === 'object') ? meta : null);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] adminDeleteStudyGroup failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_deleteStudyGroupByReport = async function(reportId, groupId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  if (!groupId) return { ok: false, error: 'Missing group id' };
  try {
    const groupRef = doc(db, 'studyGroups', String(groupId));
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) {
      const reportRes = await window._shohoj_deleteStudyGroupReport(reportId);
      if (!reportRes?.ok) return reportRes;
      return { ok: true, missingGroup: true };
    }
    const delRes = await window._shohoj_adminDeleteStudyGroup(groupId, { reportId });
    if (!delRes?.ok) return delRes;
    const reportRes = await window._shohoj_deleteStudyGroupReport(reportId);
    if (!reportRes?.ok) {
      return { ok: false, error: reportRes.error || 'Group deleted, but report dismissal failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deleteStudyGroupByReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

// ── Past papers & notes library (Phase 2) ──────────────────────────────────
window._shohoj_fetchPapersByCourse = async function(courseCode, { pageSize = 50 } = {}) {
  if (!currentUser || !courseCode) return [];
  try {
    const col = collection(db, 'papers');
    const q = query(
      col,
      where('courseCode', '==', String(courseCode).toUpperCase()),
      where('approved', '==', true),
      orderBy('createdAt', 'desc'),
      qLimit(pageSize),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Re-throw so the UI can show a load-error state instead of an empty
    // library: a missing composite index (courseCode + approved + createdAt)
    // is otherwise indistinguishable from "no papers".
    console.warn('[Shohoj] fetchPapersByCourse failed:', e);
    throw e;
  }
};

window._shohoj_fetchRecentPapers = async function(n = 30) {
  if (!currentUser) return [];
  try {
    const col = collection(db, 'papers');
    const q = query(col, where('approved', '==', true), orderBy('createdAt', 'desc'), qLimit(n));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Re-throw so the UI can show a load-error state instead of an empty
    // library: a missing composite index (approved + createdAt) is otherwise
    // indistinguishable from "no papers".
    console.warn('[Shohoj] fetchRecentPapers failed:', e);
    throw e;
  }
};

window._shohoj_fetchMyPapers = async function() {
  if (!currentUser) return [];
  try {
    const col = collection(db, 'papers');
    const q = query(
      col,
      where('uploaderUid', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      qLimit(100),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchMyPapers failed:', e);
    return [];
  }
};

// ── R2-backed paper storage (via Cloudflare Worker proxy) ─────────────────
// Download is keyed on the Firestore paper id, not the raw storage path. The
// worker re-fetches the paper doc using the caller's own ID token, so
// Firestore rules enforce that the requester is allowed to read it
// (approved == true OR uploaderUid == self OR admin). This closes the
// path-guessing bypass where an attacker who guessed a storagePath could
// download an unapproved file directly.
// Map a file's leading magic bytes to a renderable MIME type. Pre-migration R2
// objects can be served without a usable Content-Type (application/octet-stream
// or empty), so `res.blob()` yields a typeless blob and the preview <iframe>
// renders blank. Sniffing lets us re-tag the blob with a type the browser will
// render inline. Returns null when the signature isn't a supported preview type.
function _sniffPreviewMime(bytes) {
  const b = bytes;
  if (b.length < 4) return null;
  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  // GIF: "GIF"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  // WEBP: "RIFF"…"WEBP"
  if (b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// When the server hands back a generic/empty Content-Type, re-wrap the blob
// with a sniffed type so the preview renders inline instead of blank.
async function _retypeGenericBlob(blob) {
  const t = (blob.type || '').toLowerCase();
  if (t === 'application/pdf' || t.startsWith('image/')) return blob;
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const sniffed = _sniffPreviewMime(head);
    if (sniffed) return new Blob([blob], { type: sniffed });
  } catch { /* sniff failed — fall through to original blob */ }
  return blob;
}

window._shohoj_paperDownloadUrl = async function(paperId) {
  if (!currentUser || !paperId) return null;
  const base = getPapersWorkerUrl();
  if (!base) {
    console.warn('[Shohoj] papers worker URL not configured');
    return null;
  }
  const token = await getCurrentUserIdToken(currentUser);
  if (!token) return null;
  try {
    const res = await fetch(`${base}/download?paperId=${encodeURIComponent(paperId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[Shohoj] paperDownloadUrl: worker returned', res.status);
      return null;
    }
    const blob = await _retypeGenericBlob(await res.blob());
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return url;
  } catch (e) {
    console.warn('[Shohoj] paperDownloadUrl failed:', e);
    return null;
  }
};

window._shohoj_uploadPaper = async function({ file, courseCode, type, title, semester, facultyInitials }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!file || !courseCode || !type || !title) return { ok: false, error: 'Missing fields' };
  const base = getPapersWorkerUrl();
  if (!base) return { ok: false, error: 'Upload service not configured. Contact admin.' };
  try {
    const safeCourse = String(courseCode).toUpperCase();
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const token = await getCurrentUserIdToken(currentUser);
    if (!token) return { ok: false, error: 'Could not get auth token' };

    // Extra metadata is passed as URL params so the Worker can validate the
    // upload, write the authoritative Firestore paper doc, and include the
    // fields in the admin notification email.
    const params = new URLSearchParams({
      courseCode: safeCourse,
      filename,
      title: String(title || '').slice(0, 120),
      type: String(type || ''),
    });
    if (semester)        params.set('semester', String(semester).slice(0, 40));
    if (facultyInitials) params.set('facultyInitials', String(facultyInitials).toUpperCase().slice(0, 20));

    const uploadRes = await fetch(
      `${base}/upload?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      },
    );
    if (!uploadRes.ok) {
      let msg = 'Upload failed';
      try { msg = (await uploadRes.json()).error || msg; } catch {}
      return { ok: false, error: msg };
    }
    const uploadPayload = await uploadRes.json().catch(() => ({}));
    if (!uploadPayload?.id) return { ok: false, error: 'Upload metadata was not saved' };
    return { ok: true, id: uploadPayload.id };
  } catch (e) {
    console.error('[Shohoj] uploadPaper failed:', e);
    return { ok: false, error: e.message || 'Upload failed' };
  }
};

// Cached admin flag — refreshed from the ID token on every auth-state change
// (see onAuthStateChanged below) so isAdmin checks stay synchronous.
let _isAdminCached = false;

function _isAdminUser() {
  return !!currentUser && _isAdminCached === true;
}

installAdminAccessHooks({ isAdminUser: _isAdminUser });

window._shohoj_fetchUnapprovedPapers = async function() {
  if (!_isAdminUser()) return [];
  try {
    const col = collection(db, 'papers');
    const q = query(col, where('approved', '==', false), orderBy('createdAt', 'desc'), qLimit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchUnapprovedPapers failed:', e);
    return [];
  }
};

window._shohoj_fetchPaperReports = async function() {
  if (!_isAdminUser()) return [];
  try {
    const col = collection(db, 'paperReports');
    const q = query(col, orderBy('createdAt', 'desc'), qLimit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchPaperReports failed:', e);
    return [];
  }
};

// Append-only audit trail of admin moderation actions. Writes are best-effort
// and never block the calling action — if rules reject the log, the moderation
// action still happened and we just emit a console warning.
async function _writeAdminLog(action, targetType, targetId, meta) {
  if (!_isAdminUser() || !currentUser) return;
  if (!targetId) return;
  try {
    const payload = {
      action,
      adminUid: currentUser.uid,
      targetType,
      targetId: String(targetId),
      createdAt: serverTimestamp(),
    };
    if (meta && typeof meta === 'object') payload.meta = meta;
    await addDoc(collection(db, 'adminLogs'), payload);
  } catch (e) {
    console.warn('[Shohoj] adminLog write failed:', e?.message || e);
  }
}

window._shohoj_approvePaper = async function(paperId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!paperId) return { ok: false, error: 'Missing paper id' };
  try {
    await setDoc(doc(db, 'papers', paperId), { approved: true }, { merge: true });
    _writeAdminLog('approve_paper', 'paper', paperId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] approvePaper failed:', e);
    return { ok: false, error: e.message || 'Approve failed' };
  }
};

window._shohoj_deletePaper = async function(paperId, storagePath) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!paperId) return { ok: false, error: 'Missing paper id' };
  try {
    if (storagePath) {
      const base = getPapersWorkerUrl();
      const token = await getCurrentUserIdToken(currentUser);
      if (!base) return { ok: false, error: 'Delete service not configured' };
      if (!token) return { ok: false, error: 'Could not get auth token' };
      try {
        const res = await fetch(`${base}/file?path=${encodeURIComponent(storagePath)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let msg = `R2 delete failed (${res.status})`;
          try { msg = (await res.json()).error || msg; } catch {}
          if (res.status === 404) {
            console.warn('[Shohoj] deletePaper: R2 file already missing:', storagePath);
          } else {
            throw new Error(msg);
          }
        }
      } catch (e) {
        console.warn('[Shohoj] deletePaper: R2 delete failed:', e);
        return { ok: false, error: e.message || 'File delete failed' };
      }
    }
    await deleteDoc(doc(db, 'papers', paperId));
    _writeAdminLog('delete_paper', 'paper', paperId, storagePath ? { storagePath } : null);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deletePaper failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_deletePaperByReport = async function(reportId, paperId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  if (!paperId) return { ok: false, error: 'Missing paper id' };
  try {
    const paperRef = doc(db, 'papers', paperId);
    const paperSnap = await getDoc(paperRef);
    if (!paperSnap.exists()) {
      const reportRes = await window._shohoj_deletePaperReport(reportId);
      if (!reportRes?.ok) return reportRes;
      return { ok: true, missingPaper: true };
    }

    const storagePath = paperSnap.data()?.storagePath || '';
    const deleteRes = await window._shohoj_deletePaper(paperId, storagePath);
    if (!deleteRes?.ok) return deleteRes;

    const reportRes = await window._shohoj_deletePaperReport(reportId);
    if (!reportRes?.ok) {
      return { ok: false, error: reportRes.error || 'Paper deleted, but report dismissal failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deletePaperByReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_deletePaperReport = async function(reportId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  try {
    await deleteDoc(doc(db, 'paperReports', reportId));
    _writeAdminLog('delete_paper_report', 'paperReport', reportId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deletePaperReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_fetchReviewReports = async function() {
  if (!_isAdminUser()) return [];
  try {
    const col = collection(db, 'reviewReports');
    const q = query(col, orderBy('createdAt', 'desc'), qLimit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchReviewReports failed:', e);
    return [];
  }
};

window._shohoj_fetchAdminStats = async function() {
  if (!_isAdminUser()) return null;
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sinceTs = new Date(since);

  const _toMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'object' && ts.toMillis) return ts.toMillis();
    return Number(ts) || 0;
  };

  // Pull recent (last 30d) + a larger sample for top-N aggregation.
  const [reviewsRecent, papersRecent, feedbackRecent,
         reviewsAll, papersAll, feedbackAll,
         paperReports, reviewReports, pendingPapers] = await Promise.all([
    getDocs(query(collection(db, 'facultyReviews'),
                  where('createdAt', '>=', sinceTs), orderBy('createdAt', 'desc'),
                  qLimit(1000))).then(s => s.docs.map(d => d.data())).catch(() => []),
    getDocs(query(collection(db, 'papers'),
                  where('createdAt', '>=', sinceTs), orderBy('createdAt', 'desc'),
                  qLimit(1000))).then(s => s.docs.map(d => d.data())).catch(() => []),
    getDocs(query(collection(db, 'appFeedback'),
                  where('createdAt', '>=', sinceTs), orderBy('createdAt', 'desc'),
                  qLimit(1000))).then(s => s.docs.map(d => d.data())).catch(() => []),
    getDocs(query(collection(db, 'facultyReviews'),
                  orderBy('createdAt', 'desc'), qLimit(1000)))
      .then(s => s.docs.map(d => d.data())).catch(() => []),
    getDocs(query(collection(db, 'papers'),
                  orderBy('createdAt', 'desc'), qLimit(1000)))
      .then(s => s.docs.map(d => d.data())).catch(() => []),
    getDocs(query(collection(db, 'appFeedback'),
                  orderBy('createdAt', 'desc'), qLimit(1000)))
      .then(s => s.docs.map(d => d.data())).catch(() => []),
    window._shohoj_fetchPaperReports(),
    window._shohoj_fetchReviewReports(),
    window._shohoj_fetchUnapprovedPapers(),
  ]);

  // Build 30-day daily buckets (UTC date key). Pre-fill with zeros.
  const buckets = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, reviews: 0, papers: 0, feedback: 0 };
  }
  const _bump = (rows, kind) => {
    rows.forEach(r => {
      const ms = _toMs(r.createdAt);
      if (!ms) return;
      const key = new Date(ms).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key][kind]++;
    });
  };
  _bump(reviewsRecent,  'reviews');
  _bump(papersRecent,   'papers');
  _bump(feedbackRecent, 'feedback');

  // Filter seeded reviews from analytics so the chart reflects real activity.
  const reviewsRecentReal = reviewsRecent.filter(r => r.seeded !== true);
  const reviewsAllReal    = reviewsAll.filter(r => r.seeded !== true);

  // Re-bucket reviews using the real-only set (papers + feedback already real).
  Object.values(buckets).forEach(b => { b.reviews = 0; });
  _bump(reviewsRecentReal, 'reviews');

  // Top faculty (by review count) and top courses (by paper count).
  const facultyMap = new Map();
  reviewsAllReal.forEach(r => {
    const k = r.facultyInitials || '?';
    facultyMap.set(k, (facultyMap.get(k) || 0) + 1);
  });
  const topFaculty = [...facultyMap.entries()]
    .map(([initials, count]) => ({ initials, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  const courseMap = new Map();
  papersAll.forEach(p => {
    const k = p.courseCode || '?';
    courseMap.set(k, (courseMap.get(k) || 0) + 1);
  });
  const topCourses = [...courseMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // Type breakdowns.
  const paperTypes = {};
  papersAll.forEach(p => {
    const t = p.type || 'other';
    paperTypes[t] = (paperTypes[t] || 0) + 1;
  });
  const feedbackTypes = {};
  feedbackAll.forEach(f => {
    const t = f.type || 'general';
    feedbackTypes[t] = (feedbackTypes[t] || 0) + 1;
  });

  const approvedPapers = papersAll.filter(p => p.approved === true).length;

  return {
    counts: {
      reviews:        reviewsAllReal.length,
      papers:         approvedPapers,
      pendingPapers:  pendingPapers.length,
      feedback:       feedbackAll.length,
      paperReports:   paperReports.length,
      reviewReports:  reviewReports.length,
    },
    activity: Object.values(buckets),
    topFaculty,
    topCourses,
    paperTypes,
    feedbackTypes,
  };
};

window._shohoj_deleteReviewReport = async function(reportId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  try {
    await deleteDoc(doc(db, 'reviewReports', reportId));
    _writeAdminLog('delete_review_report', 'reviewReport', reportId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deleteReviewReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_deleteReviewByReport = async function(reportId, reviewId) {
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  if (!reportId) return { ok: false, error: 'Missing report id' };
  if (!reviewId) return { ok: false, error: 'Missing review id' };
  try {
    const reviewRef = doc(db, 'facultyReviews', reviewId);
    const reviewSnap = await getDoc(reviewRef);
    if (!reviewSnap.exists()) {
      const reportRes = await window._shohoj_deleteReviewReport(reportId);
      if (!reportRes?.ok) return reportRes;
      return { ok: true, missingReview: true };
    }

    await deleteDoc(reviewRef);
    _writeAdminLog('delete_review', 'review', reviewId, { reportId });

    const reportRes = await window._shohoj_deleteReviewReport(reportId);
    if (!reportRes?.ok) {
      return { ok: false, error: reportRes.error || 'Review deleted, but report dismissal failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] deleteReviewByReport failed:', e);
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

window._shohoj_reportPaper = async function({ paperId, reason }) {
  if (!currentUser) return { ok: false, error: 'Not signed in' };
  if (!paperId) return { ok: false, error: 'Missing paper id' };
  try {
    const reportId = `${currentUser.uid}_${paperId}`;
    await setDoc(doc(db, 'paperReports', reportId), {
      paperId: String(paperId),
      reason: String(reason || '').slice(0, 300),
      reporterUid: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] reportPaper failed:', e);
    return { ok: false, error: e.message || 'Report failed' };
  }
};

window._shohoj_adminDeleteFeedback = async function(feedbackId) {
  if (!currentUser) return { ok: false };
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  try {
    await deleteDoc(doc(db, 'appFeedback', feedbackId));
    _writeAdminLog('delete_feedback', 'feedback', feedbackId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] adminDeleteFeedback failed:', e);
    return { ok: false, error: e.message || 'Failed' };
  }
};

// Lost & found moderation (#371). Every post in the board's collection,
// newest first — the dashboard shows all statuses (open/resolved) since
// moderation may need to reach either.
window._shohoj_fetchAllLostFound = async function() {
  if (!currentUser) return [];
  try {
    const q = query(
      collection(db, 'lostFoundPosts'),
      orderBy('createdAt', 'desc'),
      qLimit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Shohoj] fetchAllLostFound failed:', e);
    return [];
  }
};

window._shohoj_adminDeleteLostFound = async function(postId) {
  if (!currentUser) return { ok: false };
  if (!_isAdminUser()) return { ok: false, error: 'Unauthorized' };
  try {
    // The post and its (client-unreadable) contact doc share the id; rules
    // allow admin delete on both. Deleting a missing contact is a no-op.
    await deleteDoc(doc(db, 'lostFoundPosts', postId));
    await deleteDoc(doc(db, 'lostFoundContacts', postId));
    _writeAdminLog('delete_lostfound', 'lostFoundPosts', postId);
    return { ok: true };
  } catch (e) {
    console.error('[Shohoj] adminDeleteLostFound failed:', e);
    return { ok: false, error: e.message || 'Failed' };
  }
};
