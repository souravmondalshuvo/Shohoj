// src/firebase/firebase-entry.js
//
// Standalone Firebase auth boot — Vite only. This is a byte-for-byte mirror of
// the inline <script type="module"> in index.html, lifted out so the Vite build
// can emit it as its OWN entry chunk (a separate module-graph root with no
// static import edge from the main app chunk).
//
// Why: js/auth/firebase-init.js statically imports the Firebase SDK from
// https://www.gstatic.com/... If that load is blocked/fails and firebase lives
// in the main chunk, the whole chunk (calculator included) fails to evaluate.
// As its own root, a firebase failure stays isolated and the CGPA calculator
// keeps working — the same isolation build3.py gets by inlining firebase as a
// separate module (FIREBASE_JS_FILES). See docs/REACT_VITE_MIGRATION.md Step 4.
//
// vite/firebase-isolation.js strips the inline script from the HTML at build/dev
// time and points the page at this entry instead, so index.html on disk stays
// unchanged and the build3.py bundle is unaffected.

import { initAuth, saveToCloud, currentUser } from '../../js/auth/firebase.js';

// Boot Firebase auth on every page load
initAuth();

// Patch saveState to also sync to cloud when logged in
window._shohoj_onSave = async function (snap) {
  if (currentUser) {
    await saveToCloud(snap);
  }
};
