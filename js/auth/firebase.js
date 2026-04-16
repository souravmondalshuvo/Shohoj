// ── js/auth/firebase.js ───────────────────────────────────────────────────────
// Firebase Authentication + Firestore cloud sync for Shohoj
// Features: Google Sign-In, Sign-Out, cloud save/load, migration modal,
//           real-time sync, offline detection, sync persistence, data deletion

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Config ────────────────────────────────────────────────────────────────────
const firebaseConfig = window._shohoj_firebase_config;
if (!firebaseConfig) {
  console.error('[Shohoj] Firebase config missing — auth will not work.');
}

// ── Init ──────────────────────────────────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// ── State ─────────────────────────────────────────────────────────────────────
export let currentUser    = null;
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

function parseStoredState(raw, source = 'storage') {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Shohoj] Ignoring invalid ${source} state:`, e);
    return null;
  }
}

// ── Canonical data fingerprint ────────────────────────────────────────────────
// Only compare the fields that actually represent user data — ignore metadata
// fields like updatedAt that Firestore injects and that will always differ.
function getDataFingerprint(raw) {
  if (!raw) return '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Strip server-side metadata before comparing
    const { updatedAt, _serverTimestamp, ...dataOnly } = parsed;
    return JSON.stringify(dataOnly);
  } catch (e) {
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}

function clearCloudAppliedFlag() {
  try { sessionStorage.removeItem('shohoj_cloud_applied'); } catch(e) {}
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
          Only <strong>@g.bracu.ac.bd</strong> accounts are supported
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

// ── Sign-out modal ────────────────────────────────────────────────────────────
function showSignOutModal(email) {
  return new Promise(resolve => {
    _injectModalKeyframes();
    const { isDark, bg, text, text2, border } = _modalTheme();

    const overlay = document.createElement('div');
    overlay.id = 'signOutModal';
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
        padding:28px;max-width:360px;width:90%;
        box-shadow:0 32px 80px rgba(0,0,0,0.55);
        position:relative;text-align:center;
      ">
        ${_closeBtn(text2, isDark)}

        <div style="font-size:30px;margin-bottom:14px;">👋</div>
        <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:${text};margin-bottom:8px;letter-spacing:-0.5px;">
          Sign out?
        </div>
        <div style="font-size:13px;color:${text2};line-height:1.6;margin-bottom:8px;">
          You're signed in as
        </div>
        <div style="
          font-size:13px;font-weight:700;color:${text};
          background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.18);
          border-radius:8px;padding:6px 14px;display:inline-block;
          margin-bottom:20px;word-break:break-all;
        ">${email}</div>

        <div style="display:flex;gap:10px;margin-bottom:14px;">
          <button id="_soCancel" class="shohoj-modal-btn" style="
            flex:1;padding:12px;border-radius:10px;
            background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
            border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'};
            color:${text2};font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
            cursor:pointer;
          ">Cancel</button>
          <button id="_soConfirm" class="shohoj-modal-btn" style="
            flex:1;padding:12px;border-radius:10px;
            background:rgba(231,76,60,0.12);
            border:1px solid rgba(231,76,60,0.35);
            color:#e74c3c;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;
            cursor:pointer;
          ">Sign out</button>
        </div>

        <span id="_soDelete" style="
          color:${text2};font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;
          cursor:pointer;opacity:0.55;
          text-decoration:underline;text-underline-offset:2px;
          display:inline-block;
        " onmouseenter="document.body.classList.add('cursor-hover')"
          onmouseleave="document.body.classList.remove('cursor-hover')">Delete my cloud data</span>
      </div>
    `;

    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    const close = v => _closeModal(overlay, resolve, v);

    overlay.querySelector('#_mClose').onclick   = () => close(false);
    overlay.querySelector('#_soCancel').onclick  = () => close(false);
    overlay.querySelector('#_soConfirm').onclick = () => close(true);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

    overlay.querySelector('#_soDelete').addEventListener('click', () => {
      _clearModalOpen();
      overlay.style.opacity    = '0';
      overlay.style.transition = 'opacity 0.12s';
      setTimeout(async () => {
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve(false);
        await deleteCloudData();
      }, 120);
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

// ── Init auth ─────────────────────────────────────────────────────────────────
export function initAuth() {
  restoreSyncLabel();
  initOfflineDetection();
  setAuthBtnLoading(true);

  onAuthStateChanged(auth, async user => {
    // ── Domain enforcement ─────────────────────────────────────────────────
    if (user && !user.email?.endsWith('@g.bracu.ac.bd')) {
      await signOut(auth);
      setAuthBtnLoading(false);
      showToast('⚠ Only @g.bracu.ac.bd accounts are supported', true, true);
      return;
    }

    currentUser = user;
    setAuthBtnLoading(false);

    if (user) {
      // ── 30-day session expiry ────────────────────────────────────────────
      let sessionStart = null;
      try { sessionStart = parseInt(localStorage.getItem(SESSION_START_KEY)); } catch(e) {}
      const now = Date.now();
      if (!sessionStart || isNaN(sessionStart)) {
        try { localStorage.setItem(SESSION_START_KEY, String(now)); } catch(e) {}
        const firstName = user.displayName?.split(' ')[0] || 'you';
        showToast(`Welcome to Shohoj, ${firstName} `, false, true);
      } else if (now - sessionStart > SESSION_MAX_MS) {
        try { localStorage.removeItem(SESSION_START_KEY); } catch(e) {}
        stopRealtimeSync();
        await signOut(auth);
        showToast('Your session expired — please sign in again', true, true);
        return;
      }

      updateAuthUI(user);
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
        // The realtime listener will ignore this write via the local-write guard.
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        showToast('Data uploaded to your cloud account ✓', false, true);
        startRealtimeSync(user.uid); showNudgeBanner(false); return;
      }

      // ── Both local and cloud data exist ───────────────────────────────
      const justApplied = sessionStorage.getItem('shohoj_cloud_applied');
      if (justApplied) {
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
      stopRealtimeSync();
      clearCloudAppliedFlag();
      clearQueuedCloudSave(false);
      _localWriteAt = 0;
      updateAuthUI(null);
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) {}
      const parsed = parseStoredState(raw, 'local');
      showNudgeBanner(parsed?.semesters?.length > 0);
    }
  });
}

// ── Apply cloud data ──────────────────────────────────────────────────────────
function applyCloudData(cloudData) {
  try {
    sessionStorage.setItem('shohoj_cloud_applied', '1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
  } catch(e) {}
  window.location.reload();
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
    <button onclick="window._shohoj_signIn()" style="
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 16px;border-radius:8px;
      background:rgba(255,255,255,0.07);
      border:1px solid rgba(255,255,255,0.14);
      color:#e8f0ea;font-family:'DM Sans',sans-serif;
      font-size:13px;font-weight:600;cursor:pointer;
      white-space:nowrap;flex-shrink:0;
      transition:background 0.2s,border-color 0.2s;
    "
    onmouseenter="this.style.background='rgba(255,255,255,0.13)';this.style.borderColor='rgba(255,255,255,0.25)'"
    onmouseleave="this.style.background='rgba(255,255,255,0.07)';this.style.borderColor='rgba(255,255,255,0.14)'">
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
window._shohoj_confirmModal = showConfirmModal;

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
function updateAuthUI(user) {
  const btn = document.getElementById('authBtn');
  if (!btn) return;

  if (user) {
    btn.className     = 'auth-btn-signed-in magnetic';
    btn.style.cssText = '';
    btn.disabled      = false;
    btn.title         = `Signed in as ${user.email}`;
    btn.onclick       = async () => { if (await showSignOutModal(user.email)) signOutUser(); };
    btn.ondblclick    = null;

    const firstName = user.displayName?.split(' ')[0] || 'Account';
    btn.innerHTML = `
      <div class="auth-avatar-wrap">
        ${user.photoURL
          ? `<img src="${user.photoURL}" alt="${firstName}" class="auth-avatar-img" referrerpolicy="no-referrer" />`
          : `<div class="auth-avatar-fallback">${firstName.charAt(0).toUpperCase()}</div>`
        }
        <span id="syncDot" class="auth-sync-dot"></span>
      </div>
      <span class="auth-name">${firstName}</span>
    `;
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
  const useTop = isAuth && window.innerWidth >= 768;
  t.style.cssText = `
    position:fixed;
    ${useTop
      ? 'top:64px;left:50%;transform:translateX(-50%);'
      : 'bottom:24px;left:50%;transform:translateX(-50%);'}
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