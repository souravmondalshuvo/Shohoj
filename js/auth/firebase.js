// ── js/auth/firebase.js ───────────────────────────────────────────────────────
// Firebase Authentication + Firestore cloud sync for Shohoj
// Handles: Google Sign-In, Sign-Out, save/load state, migration modal

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Config (injected via index.html, not stored here) ────────────────────────
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

// ── Exported auth state ───────────────────────────────────────────────────────
export let currentUser = null;

// ── Firestore helpers ─────────────────────────────────────────────────────────
function userDocRef(uid) {
  return doc(db, 'users', uid);
}

export async function saveToCloud(stateSnap) {
  if (!currentUser) return;
  try {
    await setDoc(userDocRef(currentUser.uid), {
      data:      JSON.stringify(stateSnap),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setSyncIndicator('synced');
  } catch (e) {
    console.error('[Shohoj] Cloud save failed:', e);
    setSyncIndicator('error');
    showToast('⚠ Cloud save failed — your data is still saved locally', true);
  }
}

export async function loadFromCloud() {
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

// ── Sync indicator ────────────────────────────────────────────────────────────
// Small dot next to the auth button showing sync status
function setSyncIndicator(status) {
  let dot = document.getElementById('syncDot');
  if (!dot) return;
  // status: 'syncing' | 'synced' | 'error'
  const colors = {
    syncing: '#F0A500',
    synced:  '#2ECC71',
    error:   '#e74c3c',
  };
  dot.style.background = colors[status] || colors.synced;
  dot.title = {
    syncing: 'Syncing to cloud…',
    synced:  'Data synced to cloud',
    error:   'Cloud sync failed — data saved locally',
  }[status] || '';
}

// ── Migration modal ───────────────────────────────────────────────────────────
function showMigrationModal(localSems, cloudSems) {
  return new Promise(resolve => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const bg     = isDark ? '#0f1f14' : '#ffffff';
    const text   = isDark ? '#e8f0ea' : '#0d2914';
    const text2  = isDark ? '#a8c4ad' : '#2d5a3d';
    const border = isDark ? 'rgba(46,204,113,0.25)' : 'rgba(46,204,113,0.3)';

    const modal = document.createElement('div');
    modal.id = 'migrationModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;
    `;

    const localLabel  = localSems === 0  ? 'No local data'  : `${localSems} semester${localSems !== 1 ? 's' : ''}`;
    const cloudLabel  = cloudSems === 0  ? 'No cloud data'  : `${cloudSems} semester${cloudSems !== 1 ? 's' : ''}`;

    modal.innerHTML = `
      <div style="
        background:${bg};border:1px solid ${border};border-radius:16px;
        padding:28px 32px;max-width:440px;width:90%;
        box-shadow:0 24px 80px rgba(0,0,0,0.6);
      ">
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
          <button id="keepLocalBtn" style="
            flex:1;padding:11px;border-radius:10px;
            background:#2ECC71;color:#0b0f0d;
            border:none;font-size:13px;font-weight:700;cursor:pointer;
          ">Keep this device's data</button>
          <button id="keepCloudBtn" style="
            flex:1;padding:11px;border-radius:10px;
            background:rgba(86,180,233,0.15);color:#56B4E9;
            border:1px solid rgba(86,180,233,0.3);
            font-size:13px;font-weight:700;cursor:pointer;
          ">Keep cloud data</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('keepLocalBtn').onclick = () => {
      document.body.removeChild(modal);
      resolve('local');
    };
    document.getElementById('keepCloudBtn').onclick = () => {
      document.body.removeChild(modal);
      resolve('cloud');
    };
  });
}

// ── Sign in ───────────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  setAuthBtnLoading(true);
  try {
    const result = await signInWithPopup(auth, provider);
    const email  = result.user.email || '';

    // Only allow BRACU student emails for now
    if (!email.endsWith('@g.bracu.ac.bd')) {
      await signOut(auth);
      setAuthBtnLoading(false);
      showToast(`⚠ Only @g.bracu.ac.bd emails are supported right now`, true);
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
    await signOut(auth);
    showToast('Signed out successfully');
  } catch (e) {
    console.error('[Shohoj] Sign-out failed:', e);
  }
}

// ── Auth state listener ───────────────────────────────────────────────────────
export function initAuth() {
  // Show loading state on the button while Firebase initializes
  setAuthBtnLoading(true);

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    setAuthBtnLoading(false);

    if (user) {
      updateAuthUI(user);

      const cloudData = await loadFromCloud();
      const STORAGE_KEY = 'shohoj_cgpa_v1';
      let localRaw = null;
      try { localRaw = localStorage.getItem(STORAGE_KEY); } catch(e) {}

      const hasLocal = !!localRaw;
      const hasCloud = !!cloudData;

      if (!hasLocal && !hasCloud) {
        // Situation 4 — both empty, nothing to do
        setSyncIndicator('synced');
        return;
      }

      if (!hasLocal && hasCloud) {
        // Situation 2 — no local, load from cloud silently
        applyCloudData(cloudData);
        return;
      }

      if (hasLocal && !hasCloud) {
        // Situation 1 — local data exists, cloud empty, upload it
        const localParsed = JSON.parse(localRaw);
        setSyncIndicator('syncing');
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Data uploaded to your cloud account ✓');
        return;
      }

      // Situation 3 — both have data
      // ── INFINITE LOOP FIX: skip modal if we just applied cloud data ────────
      const justApplied = sessionStorage.getItem('shohoj_cloud_applied');
      if (justApplied) {
        sessionStorage.removeItem('shohoj_cloud_applied');
        setSyncIndicator('synced');
        return;
      }

      const localParsed = JSON.parse(localRaw);
      const localSems   = localParsed?.semesters?.length || 0;
      const cloudSems   = cloudData?.semesters?.length   || 0;

      const choice = await showMigrationModal(localSems, cloudSems);

      if (choice === 'local') {
        setSyncIndicator('syncing');
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Local data saved to cloud ✓');
        setSyncIndicator('synced');
      } else {
        applyCloudData(cloudData);
      }

    } else {
      currentUser = null;
      updateAuthUI(null);
    }
  });
}

// ── Apply cloud data — sets flag to prevent infinite modal loop ───────────────
function applyCloudData(cloudData) {
  try {
    sessionStorage.setItem('shohoj_cloud_applied', '1');
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify(cloudData));
  } catch(e) {}
  window.location.reload();
}

// ── Auth button loading state ─────────────────────────────────────────────────
function setAuthBtnLoading(loading) {
  const btn   = document.getElementById('authBtn');
  const label = document.getElementById('authLabel');
  if (!btn || !label) return;
  if (loading) {
    btn.disabled        = true;
    btn.style.opacity   = '0.6';
    label.textContent   = '…';
  } else {
    btn.disabled        = false;
    btn.style.opacity   = '';
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
      if (label) {
        label.textContent  = user.displayName?.split(' ')[0] || 'Account';
        label.style.display = '';
      }
    }
    btn.style.borderColor = 'rgba(46,204,113,0.5)';
    btn.style.opacity     = '';
    btn.disabled          = false;

    // Show sync dot
    let dot = document.getElementById('syncDot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'syncDot';
      dot.style.cssText = `
        width:7px;height:7px;border-radius:50%;
        background:#2ECC71;display:inline-block;
        flex-shrink:0;margin-left:2px;
        box-shadow:0 0 6px rgba(46,204,113,0.6);
      `;
      btn.appendChild(dot);
    }
    dot.style.display = 'inline-block';
    setSyncIndicator('synced');

  } else {
    btn.title   = 'Sign in with Google to sync your data across devices';
    btn.onclick = signInWithGoogle;
    if (avatar) avatar.style.display = 'none';
    if (label)  { label.textContent = 'Sign in'; label.style.display = ''; }
    btn.style.borderColor = '';
    btn.style.opacity     = '';
    btn.disabled          = false;

    // Hide sync dot
    const dot = document.getElementById('syncDot');
    if (dot) dot.style.display = 'none';
  }
}

// ── Toast notification ────────────────────────────────────────────────────────
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
  `;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity    = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => { if (t.parentNode) document.body.removeChild(t); }, 300);
  }, 3500);
}