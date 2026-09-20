import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckToken } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
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
  GoogleAuthProvider,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  qLimit,
  query,
  serverTimestamp,
  setDoc,
  signInWithCredential,
  signInWithPopup,
  signOut,
  startAfter,
  where,
};

export const firebaseConfig = window._shohoj_firebase_config;

// Google OAuth Web client ID for the One Tap prompt. Optional — empty when the
// GOOGLE_OAUTH_CLIENT_ID secret/placeholder was left blank, in which case One
// Tap is disabled and the explicit sign-in button/banner remain the only path.
const _rawGoogleClientId = window._shohoj_google_client_id;
export const googleClientId =
  (typeof _rawGoogleClientId === 'string'
    && _rawGoogleClientId
    && !_rawGoogleClientId.startsWith('__'))
    ? _rawGoogleClientId
    : null;

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
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });

    // initializeAppCheck returns as soon as the provider is wired up. The part
    // that can actually fail — exchanging a reCAPTCHA token for an App Check
    // token — happens later, over the network, so the catch below never sees
    // it. For months that meant a hard 403 ("App attestation failed", #709)
    // surfaced only as an uncaught console error nobody was looking for, while
    // the docs described App Check as working.
    //
    // Asking for a token costs nothing extra: auto-refresh already fetches one,
    // and getToken joins that in-flight request rather than issuing a second.
    // We only want to observe it.
    getAppCheckToken(appCheck).catch((err) => {
      console.warn(
        '[Shohoj] App Check attestation failed — App Check is providing no protection '
          + '(this does not break auth or sync while enforcement is off):',
        err?.code || err?.message || err,
      );
    });
  } catch (err) {
    console.warn('[Shohoj] App Check init failed:', err?.message || err);
  }
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
