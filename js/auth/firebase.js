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
let _unsubscribeSnapshot  = null; // real-time listener cleanup
const STORAGE_KEY         = 'shohoj_cgpa_v1';
const LAST_SYNC_KEY       = 'shohoj_last_sync';

// ── Firestore ref ─────────────────────────────────────────────────────────────
function userDocRef(uid) {
  return doc(db, 'users', uid);
}

// ── Save to cloud ─────────────────────────────────────────────────────────────
export async function saveToCloud(stateSnap) {
  if (!currentUser) return;
  if (!navigator.onLine) {
    setSyncIndicator('offline');
    return;
  }
  setSyncIndicator('syncing');
  try {
    await setDoc(userDocRef(currentUser.uid), {
      data:      JSON.stringify(stateSnap),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const now = Date.now();
    try { localStorage.setItem(LAST_SYNC_KEY, String(now)); } catch(e) {}
    setSyncIndicator('synced');
    updateLastSyncLabel(now);
  } catch (e) {
    console.error('[Shohoj] Cloud save failed:', e);
    setSyncIndicator('error');
    showToast('⚠ Cloud save failed — data saved locally', true);
  }
}

// ── Load from cloud (one-time) ────────────────────────────────────────────────
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

// ── Feature 3: Real-time listener ────────────────────────────────────────────
// Replaces the one-time getDoc after initial migration is resolved.
// If data changes on another device/tab, this updates localStorage and reloads.
function startRealtimeSync(uid) {
  // Clean up any existing listener first
  if (_unsubscribeSnapshot) {
    _unsubscribeSnapshot();
    _unsubscribeSnapshot = null;
  }

  let isFirstSnapshot = true;

  _unsubscribeSnapshot = onSnapshot(userDocRef(uid), snap => {
    // Skip the first emission — that's the initial load we already handled
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      return;
    }
    if (!snap.exists()) return;

    const raw = snap.data()?.data;
    if (!raw) return;

    // Data changed on another device — update localStorage and reload cleanly
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== raw) {
        sessionStorage.setItem('shohoj_cloud_applied', '1');
        localStorage.setItem(STORAGE_KEY, raw);
        showToast('📡 Data updated from another device — reloading…');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch(e) {}
  }, err => {
    console.error('[Shohoj] Real-time sync error:', err);
  });
}

function stopRealtimeSync() {
  if (_unsubscribeSnapshot) {
    _unsubscribeSnapshot();
    _unsubscribeSnapshot = null;
  }
}

// ── Feature 4: Account data deletion ─────────────────────────────────────────
export async function deleteCloudData() {
  if (!currentUser) return;
  const confirmed = confirm(
    'This will permanently delete all your data from Shohoj\'s cloud.\n\n' +
    'Your local data on this device will remain untouched.\n\n' +
    'Are you sure?'
  );
  if (!confirmed) return;

  try {
    stopRealtimeSync();
    await deleteDoc(userDocRef(currentUser.uid));
    showToast('Cloud data deleted successfully');
    setSyncIndicator('synced');
    try { localStorage.removeItem(LAST_SYNC_KEY); } catch(e) {}
  } catch (e) {
    console.error('[Shohoj] Delete failed:', e);
    showToast('⚠ Failed to delete cloud data — please try again', true);
  }
}

// ── Feature 5: Sync status persistence ───────────────────────────────────────
// Read last sync time from localStorage so UI shows it even before Firebase boots
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
  if (diff < 60)        text = 'Synced just now';
  else if (diff < 3600) text = `Synced ${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400)text = `Synced ${Math.floor(diff / 3600)}h ago`;
  else                  text = `Synced ${Math.floor(diff / 86400)}d ago`;
  el.textContent = text;
  el.style.display = '';
}

// ── Feature 6: Offline detection ─────────────────────────────────────────────
function initOfflineDetection() {
  function handleOnline() {
    setSyncIndicator('synced');
    hideOfflineBanner();
    // Trigger a save in case saves were missed while offline
    if (currentUser && typeof window._shohoj_recalc === 'function') {
      window._shohoj_recalc();
    }
  }
  function handleOffline() {
    setSyncIndicator('offline');
    showOfflineBanner();
  }
  window.addEventListener('online',  handleOnline);
  window.addEventListener('offline', handleOffline);
  // Set initial state
  if (!navigator.onLine) handleOffline();
}

function showOfflineBanner() {
  let banner = document.getElementById('offlineBanner');
  if (banner) { banner.style.display = ''; return; }
  banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9997;
    background:rgba(240,165,0,0.95);color:#0b0f0d;
    text-align:center;font-size:13px;font-weight:600;
    padding:10px;backdrop-filter:blur(8px);
  `;
  banner.textContent = '📡 You\'re offline — changes are saved locally and will sync when you reconnect';
  document.body.appendChild(banner);
}

function hideOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (banner) banner.style.display = 'none';
}

// ── Migration modal ───────────────────────────────────────────────────────────
function showMigrationModal(localSems, cloudSems) {
  return new Promise(resolve => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const bg     = isDark ? '#0f1f14' : '#ffffff';
    const text   = isDark ? '#e8f0ea' : '#0d2914';
    const text2  = isDark ? '#a8c4ad' : '#2d5a3d';
    const border = isDark ? 'rgba(46,204,113,0.25)' : 'rgba(46,204,113,0.3)';

    const localLabel = localSems === 0 ? 'No local data'  : `${localSems} semester${localSems !== 1 ? 's' : ''}`;
    const cloudLabel = cloudSems === 0 ? 'No cloud data'  : `${cloudSems} semester${cloudSems !== 1 ? 's' : ''}`;

    const modal = document.createElement('div');
    modal.id = 'migrationModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:${bg};border:1px solid ${border};border-radius:16px;
        padding:28px 32px;max-width:440px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,0.6);">
        <div style="font-size:22px;margin-bottom:8px">⚠️</div>
        <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:${text};margin-bottom:6px">
          We found data in two places
        </div>
        <div style="font-size:13px;color:${text2};margin-bottom:20px;line-height:1.6">
          You have saved data on this device and in your cloud account. Which one do you want to keep?
        </div>
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
        <div style="font-size:11px;color:${text2};margin-bottom:16px;text-align:center">
          The other will be discarded. This cannot be undone.
        </div>
        <div style="display:flex;gap:10px">
          <button id="keepLocalBtn" style="flex:1;padding:11px;border-radius:10px;background:#2ECC71;color:#0b0f0d;border:none;font-size:13px;font-weight:700;cursor:pointer;">
            Keep this device's data
          </button>
          <button id="keepCloudBtn" style="flex:1;padding:11px;border-radius:10px;background:rgba(86,180,233,0.15);color:#56B4E9;border:1px solid rgba(86,180,233,0.3);font-size:13px;font-weight:700;cursor:pointer;">
            Keep cloud data
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('keepLocalBtn').onclick = () => { document.body.removeChild(modal); resolve('local'); };
    document.getElementById('keepCloudBtn').onclick = () => { document.body.removeChild(modal); resolve('cloud'); };
  });
}

// ── Sign in ───────────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  setAuthBtnLoading(true);
  try {
    const result = await signInWithPopup(auth, provider);
    const email  = result.user.email || '';
    if (!email.endsWith('@g.bracu.ac.bd')) {
      await signOut(auth);
      setAuthBtnLoading(false);
      showToast('⚠ Only @g.bracu.ac.bd emails are supported right now', true);
      return;
    }
    // onAuthStateChanged handles everything after this
  } catch (e) {
    setAuthBtnLoading(false);
    if (e.code !== 'auth/popup-closed-by-user') {
      console.error('[Shohoj] Sign-in failed:', e);
      showToast('⚠ Sign-in failed — please try again', true);
    }
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────
export async function signOutUser() {
  try {
    stopRealtimeSync();
    await signOut(auth);
    showToast('Signed out successfully');
  } catch (e) {
    console.error('[Shohoj] Sign-out failed:', e);
  }
}

// ── Init auth ─────────────────────────────────────────────────────────────────
export function initAuth() {
  // Restore last sync label immediately from localStorage (Feature 5)
  restoreSyncLabel();
  // Start offline detection (Feature 6)
  initOfflineDetection();
  // Show loading state while Firebase boots
  setAuthBtnLoading(true);

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    setAuthBtnLoading(false);

    if (user) {
      updateAuthUI(user);

      const cloudData = await loadFromCloud();
      let localRaw = null;
      try { localRaw = localStorage.getItem(STORAGE_KEY); } catch(e) {}

      const hasLocal = !!localRaw;
      const hasCloud = !!cloudData;

      if (!hasLocal && !hasCloud) {
        // Situation 4 — both empty
        setSyncIndicator('synced');
        startRealtimeSync(user.uid);
        showNudgeBanner(false);
        return;
      }

      if (!hasLocal && hasCloud) {
        // Situation 2 — load from cloud silently
        applyCloudData(cloudData);
        return;
      }

      if (hasLocal && !hasCloud) {
        // Situation 1 — upload local to cloud
        const localParsed = JSON.parse(localRaw);
        setSyncIndicator('syncing');
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Data uploaded to your cloud account ✓');
        startRealtimeSync(user.uid);
        showNudgeBanner(false);
        return;
      }

      // Situation 3 — both have data
      const justApplied = sessionStorage.getItem('shohoj_cloud_applied');
      if (justApplied) {
        sessionStorage.removeItem('shohoj_cloud_applied');
        setSyncIndicator('synced');
        startRealtimeSync(user.uid);
        showNudgeBanner(false);
        return;
      }

      const localParsed = JSON.parse(localRaw);
      const localSems   = localParsed?.semesters?.length || 0;
      const cloudSems   = cloudData?.semesters?.length   || 0;
      const choice      = await showMigrationModal(localSems, cloudSems);

      if (choice === 'local') {
        setSyncIndicator('syncing');
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Local data saved to cloud ✓');
        setSyncIndicator('synced');
      } else {
        applyCloudData(cloudData);
        return;
      }

      startRealtimeSync(user.uid);
      showNudgeBanner(false);

    } else {
      currentUser = null;
      stopRealtimeSync();
      updateAuthUI(null);
      // Show nudge only if user has local data worth backing up
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const hasSemesters = parsed?.semesters?.length > 0;
        showNudgeBanner(hasSemesters);
      } catch(e) {
        showNudgeBanner(false);
      }
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

// ── Feature 1: Nudge banner ───────────────────────────────────────────────────
function showNudgeBanner(show) {
  let banner = document.getElementById('authNudgeBanner');

  if (!show) {
    if (banner) banner.style.display = 'none';
    return;
  }

  if (banner) { banner.style.display = ''; return; }

  // Create it and insert after the calc footer
  banner = document.createElement('div');
  banner.id = 'authNudgeBanner';
  banner.style.cssText = `
    margin:0 2rem 1.5rem;
    padding:12px 16px;
    border-radius:12px;
    background:rgba(86,180,233,0.07);
    border:1px solid rgba(86,180,233,0.25);
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    flex-wrap:wrap;
    font-size:13px;
    color:var(--text2);
  `;
  banner.innerHTML = `
    <span>☁ Sign in with your BRACU email to back up your data and access it from any device.</span>
    <button onclick="window._shohoj_signIn()" style="
      padding:7px 16px;border-radius:8px;
      background:#56B4E9;color:#0b0f0d;
      border:none;font-size:12px;font-weight:700;
      cursor:pointer;white-space:nowrap;flex-shrink:0;
    ">Sign in with Google</button>
  `;

  // Insert before the simulator box, after the calc footer
  const calcFooter = document.querySelector('.calc-footer');
  if (calcFooter && calcFooter.parentNode) {
    calcFooter.parentNode.insertBefore(banner, calcFooter.nextSibling);
  }
}

// Expose signIn for the nudge banner button
window._shohoj_signIn = signInWithGoogle;

// ── Auth button loading state ─────────────────────────────────────────────────
function setAuthBtnLoading(loading) {
  const btn   = document.getElementById('authBtn');
  const label = document.getElementById('authLabel');
  if (!btn || !label) return;
  btn.disabled      = loading;
  btn.style.opacity = loading ? '0.6' : '';
  if (loading) label.textContent = '…';
}

// ── Sync indicator ────────────────────────────────────────────────────────────
function setSyncIndicator(status) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  const colors = { syncing: '#F0A500', synced: '#2ECC71', error: '#e74c3c', offline: '#e74c3c' };
  const titles = {
    syncing: 'Syncing to cloud…',
    synced:  'Data synced to cloud',
    error:   'Cloud sync failed — data saved locally',
    offline: 'Offline — changes saved locally',
  };
  dot.style.background = colors[status] || '#2ECC71';
  dot.title            = titles[status] || '';
  if (status === 'syncing') {
    dot.style.animation = 'pulse 1s infinite';
  } else {
    dot.style.animation = '';
  }
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const btn    = document.getElementById('authBtn');
  const avatar = document.getElementById('authAvatar');
  const label  = document.getElementById('authLabel');
  if (!btn) return;

  if (user) {
    btn.title   = `Signed in as ${user.email}\nClick to sign out`;
    btn.onclick = () => {
      if (confirm(`Sign out of ${user.email}?`)) signOutUser();
    };
    if (avatar && user.photoURL) {
      avatar.src           = user.photoURL;
      avatar.style.display = 'block';
      if (label) label.style.display = 'none';
    } else {
      if (avatar) avatar.style.display = 'none';
      if (label) { label.textContent = user.displayName?.split(' ')[0] || 'Account'; label.style.display = ''; }
    }
    btn.style.borderColor = 'rgba(46,204,113,0.5)';
    btn.style.opacity     = '';
    btn.disabled          = false;

    // Sync dot
    let dot = document.getElementById('syncDot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'syncDot';
      dot.style.cssText = `
        width:7px;height:7px;border-radius:50%;background:#2ECC71;
        display:inline-block;flex-shrink:0;margin-left:2px;
        box-shadow:0 0 6px rgba(46,204,113,0.6);transition:background 0.3s;
      `;
      btn.appendChild(dot);
    }
    dot.style.display = 'inline-block';

    // Last sync label
    let syncLabel = document.getElementById('lastSyncLabel');
    if (!syncLabel) {
      syncLabel = document.createElement('div');
      syncLabel.id = 'lastSyncLabel';
      syncLabel.style.cssText = `
        font-size:10px;color:var(--text3);
        text-align:right;margin-top:2px;display:none;
      `;
      btn.parentNode?.insertBefore(syncLabel, btn.nextSibling);
    }
    restoreSyncLabel();

    // Delete data option — append to sign-out confirm flow
    btn.onclick = () => {
      const choice = confirm(`Signed in as ${user.email}\n\nClick OK to sign out.`);
      if (choice) signOutUser();
    };
    btn.ondblclick = () => {
      deleteCloudData();
    };
    btn.title = `Signed in as ${user.email}\nClick to sign out · Double-click to delete cloud data`;

  } else {
    btn.title   = 'Sign in with Google to sync your data across devices';
    btn.onclick = signInWithGoogle;
    if (avatar) avatar.style.display = 'none';
    if (label)  { label.textContent = 'Sign in'; label.style.display = ''; }
    btn.style.borderColor = '';
    btn.style.opacity     = '';
    btn.disabled          = false;
    const dot = document.getElementById('syncDot');
    if (dot) dot.style.display = 'none';
    const syncLabel = document.getElementById('lastSyncLabel');
    if (syncLabel) syncLabel.style.display = 'none';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${isError ? '#e74c3c' : '#2ECC71'};
    color:${isError ? '#fff' : '#0b0f0d'};
    padding:10px 20px;border-radius:100px;
    font-size:13px;font-weight:600;
    box-shadow:0 4px 20px ${isError ? 'rgba(231,76,60,0.4)' : 'rgba(46,204,113,0.4)'};
    z-index:99998;pointer-events:none;
    animation:toastIn 0.3s ease;
    white-space:nowrap;
  `;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity    = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => { if (t.parentNode) document.body.removeChild(t); }, 300);
  }, 3500);
}