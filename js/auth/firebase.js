// ── js/auth/firebase.js ───────────────────────────────────────────────────────
// Firebase Authentication + Firestore cloud sync for Shohoj
// Handles: Google Sign-In, Sign-Out, save/load state, migration modal
//
// Config is read from window._shohoj_firebase_config (set in index.html <head>)
// so the API key never lives in a .js file and won't trigger GitHub secret scanning.

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

// Force account picker every time — don't silently reuse last account
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
  } catch (e) {
    console.error('[Shohoj] Cloud save failed:', e);
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

// ── Migration modal ───────────────────────────────────────────────────────────
// Shows when both localStorage AND Firestore have data on first login.
// Resolves with 'local' or 'cloud'.
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
            <div style="font-size:24px;font-weight:800;font-family:'Syne',sans-serif;color:${text}">${localSems}</div>
            <div style="font-size:11px;color:${text2};margin-top:2px">semesters</div>
          </div>
          <div style="background:rgba(86,180,233,0.07);border:1px solid rgba(86,180,233,0.2);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#56B4E9;margin-bottom:6px">Cloud account</div>
            <div style="font-size:24px;font-weight:800;font-family:'Syne',sans-serif;color:${text}">${cloudSems}</div>
            <div style="font-size:11px;color:${text2};margin-top:2px">semesters</div>
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
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged handles everything after this
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      console.error('[Shohoj] Sign-in failed:', e);
    }
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────
export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('[Shohoj] Sign-out failed:', e);
  }
}

// ── Auth state listener ───────────────────────────────────────────────────────
// Core sync logic — runs on every page load and after sign-in/out.
export function initAuth() {
  onAuthStateChanged(auth, async user => {
    currentUser = user;

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
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Data uploaded to your cloud account ✓');
        return;
      }

      // Situation 3 — both have data, ask user
      const localParsed = JSON.parse(localRaw);
      const localSems   = localParsed?.semesters?.length || 0;
      const cloudSems   = cloudData?.semesters?.length   || 0;

      const choice = await showMigrationModal(localSems, cloudSems);

      if (choice === 'local') {
        await saveToCloud(localParsed);
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        showToast('Local data saved to cloud ✓');
      } else {
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        applyCloudData(cloudData);
        showToast('Cloud data loaded ✓');
      }

    } else {
      currentUser = null;
      updateAuthUI(null);
    }
  });
}

// ── Apply cloud data to the app ───────────────────────────────────────────────
function applyCloudData(cloudData) {
  try {
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify(cloudData));
  } catch(e) {}
  window.location.reload();
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const btn    = document.getElementById('authBtn');
  const avatar = document.getElementById('authAvatar');
  if (!btn) return;

  if (user) {
    btn.title   = `Signed in as ${user.email}\nClick to sign out`;
    btn.onclick = () => {
      if (confirm(`Sign out of ${user.email}?`)) signOutUser();
    };
    if (avatar) {
      if (user.photoURL) {
        avatar.src           = user.photoURL;
        avatar.style.display = 'block';
        const label = btn.querySelector('#authLabel');
        if (label) label.style.display = 'none';
      } else {
        avatar.style.display = 'none';
        const label = btn.querySelector('#authLabel');
        if (label) label.textContent = user.displayName?.split(' ')[0] || 'Account';
      }
    }
    btn.style.borderColor = 'rgba(46,204,113,0.5)';
  } else {
    btn.title   = 'Sign in with Google to sync your data across devices';
    btn.onclick = signInWithGoogle;
    if (avatar) avatar.style.display = 'none';
    const label = btn.querySelector('#authLabel');
    if (label) { label.textContent = 'Sign in'; label.style.display = ''; }
    btn.style.borderColor = '';
  }
}

// ── Toast notification ────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#2ECC71;color:#0b0f0d;
    padding:10px 20px;border-radius:100px;
    font-size:13px;font-weight:600;
    box-shadow:0 4px 20px rgba(46,204,113,0.4);
    z-index:99998;pointer-events:none;
    animation:toastIn 0.3s ease;
  `;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity    = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => { if (t.parentNode) document.body.removeChild(t); }, 300);
  }, 3000);
}