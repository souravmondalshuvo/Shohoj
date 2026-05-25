import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  qLimit,
  query,
  serverTimestamp,
  setDoc,
  signInWithPopup,
  signOut,
  startAfter,
  where,
};

export const firebaseConfig = window._shohoj_firebase_config;

export const firebaseAvailable = !!(
  firebaseConfig
  && typeof firebaseConfig === 'object'
  && firebaseConfig.apiKey
  && firebaseConfig.projectId
  && !String(firebaseConfig.apiKey).startsWith('__')
  && !String(firebaseConfig.projectId).startsWith('__')
);

if (!firebaseAvailable) {
  console.error('[Shohoj] Firebase config missing or incomplete — auth will not work.');
}

export const app = firebaseAvailable ? initializeApp(firebaseConfig) : null;

const appCheckSiteKey = window._shohoj_recaptcha_v3_site_key;
if (app && appCheckSiteKey && appCheckSiteKey !== '__RECAPTCHA_V3_SITE_KEY__') {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('[Shohoj] App Check init failed:', err?.message || err);
  }
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
