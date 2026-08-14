// src/platform/auth/firebaseAuthSource.ts
//
// Firebase-backed AuthSource for the shell (#331): the typed counterpart of
// initAuth/signInWithGoogle/signOutUser in js/auth/firebase.js. Implements the
// existing AuthSource port (useSyncExternalStore-friendly: stable snapshots,
// LOADING until the first listener event) and carries the legacy rules
// verbatim:
//
//  - Domain enforcement inside the auth listener: only a verified
//    @g.bracu.ac.bd account signed in with Google stays signed in — anyone
//    else (unless the token carries the admin claim) is signed out on the
//    spot and a 'rejected' event fires (the header toasts the legacy copy).
//  - isAdmin comes from the token's `admin` claim — UI convenience only;
//    Firestore rules stay the authorization boundary.
//  - signIn(): Google popup with prompt=select_account; a user-closed popup
//    is silently ignored; other failures fire a 'sign-in-failed' event.
//
// The Firebase surface is injected (defaulting to the lazy client), so the
// enforcement matrix is unit-testable with a fake — and the SDK chunk loads
// only when a subscriber appears on a cloud-capable shell. One Tap (GIS
// signInWithCredential) is deferred; the explicit button is the legacy
// fallback path already.

import { UNIVERSITIES, universityForEmail, type UniversityId } from '../../core/university.ts';
import { ANONYMOUS, LOADING, type AuthSnapshot, type AuthSource } from './authSnapshot.ts';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import { createLogger } from '../observability/logger.ts';

const logger = createLogger({ base: { module: 'platform.auth' } });

/** The slice of a Firebase user this source reads (structural, fake-friendly). */
export interface FirebaseUserLike {
  readonly uid: string;
  readonly email?: string | null;
  readonly emailVerified?: boolean;
  getIdTokenResult(forceRefresh?: boolean): Promise<{ claims: Record<string, unknown> }>;
  /** The current ID token JWT (the real Firebase User exposes this). */
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** The auth surface the source needs (implemented by the real SDK or a fake). */
export interface AuthBackend {
  onAuthStateChanged(next: (user: FirebaseUserLike | null) => void): () => void;
  signInWithGooglePopup(): Promise<void>;
  signOut(): Promise<void>;
}

export type AuthEvent =
  | { readonly type: 'rejected'; readonly message: string }
  | { readonly type: 'sign-in-failed'; readonly message: string };

export interface FirebaseAuthSourceOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK client. */
  readonly loadBackend?: () => Promise<AuthBackend>;
}

export interface FirebaseAuthSource extends AuthSource {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Register for rejection/failure events; returns an unsubscribe fn. */
  onEvent(listener: (event: AuthEvent) => void): () => void;
}

/**
 * Built from the registry rather than written out, so adding a campus updates
 * what a rejected student is told instead of leaving them staring at a list
 * that no longer includes them.
 */
function supportedCampusList(): string {
  const names = Object.values(UNIVERSITIES).map((p) => p.shortName);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

export const REJECTED_MESSAGE =
  `⚠ Sign in with a verified ${supportedCampusList()} Google account`;
export const SIGN_IN_FAILED_MESSAGE = '⚠ Sign-in failed — please try again';

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<AuthBackend> {
  const { loadFirebaseClient } = await import('../firebase/firebaseClient.ts');
  const { auth } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } =
    await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return {
    onAuthStateChanged: (next) => onAuthStateChanged(auth, next),
    signInWithGooglePopup: async () => {
      await signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
  };
}

interface TokenVerdict {
  readonly allowed: boolean;
  readonly isAdmin: boolean;
  /**
   * The campus the email resolves to, or null when no registered campus claims
   * the domain. An admin is admitted on the claim alone, so an admin on an
   * unrecognised address is `allowed` with a null campus — admitted, but not
   * assigned to a campus we cannot actually derive.
   */
  readonly university: UniversityId | null;
}

/**
 * The sign-in enforcement, as a pure decision over the token claims.
 *
 * Same three conditions as before — a registered campus domain, a verified
 * address, and Google as the provider — with the single hardcoded BRACU domain
 * replaced by a registry lookup. An unrecognised domain is rejected, which is
 * the behaviour the app already had for everyone who wasn't at BRACU.
 */
export function evaluateCampusAccess(
  user: Pick<FirebaseUserLike, 'email' | 'emailVerified'>,
  claims: Record<string, unknown> | null,
): TokenVerdict {
  const isAdmin = claims?.admin === true;
  const profile = universityForEmail(user.email ?? '');
  const isVerifiedEmail = user.emailVerified === true || claims?.email_verified === true;
  const firebaseClaims = claims?.firebase as { sign_in_provider?: unknown } | undefined;
  const isGoogleProvider = firebaseClaims?.sign_in_provider === 'google.com';
  return {
    allowed: (profile !== null && isVerifiedEmail && isGoogleProvider) || isAdmin,
    isAdmin,
    university: profile?.id ?? null,
  };
}

/** Create the Firebase-backed source. The SDK loads on the first subscribe. */
export function createFirebaseAuthSource(options: FirebaseAuthSourceOptions): FirebaseAuthSource {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));

  let snapshot: AuthSnapshot = LOADING;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: AuthEvent) => void>();
  let backend: AuthBackend | null = null;
  let starting: Promise<AuthBackend | null> | null = null;
  // The current allowed user, retained so getIdToken can mint a fresh token for
  // signed-in writes (the worker review relay). Cleared on sign-out/rejection.
  let currentUser: FirebaseUserLike | null = null;

  const setSnapshot = (next: AuthSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const emit = (event: AuthEvent) => {
    for (const listener of eventListeners) listener(event);
  };

  const handleUser = async (user: FirebaseUserLike | null) => {
    if (user === null) {
      currentUser = null;
      setSnapshot(ANONYMOUS);
      return;
    }
    // Legacy: a failed token read yields null claims and falls through to the
    // enforcement check (which then rejects unless the email checks pass).
    const token = await user.getIdTokenResult(true).catch(() => null);
    const verdict = evaluateCampusAccess(user, token?.claims ?? null);
    if (!verdict.allowed) {
      currentUser = null;
      if (backend) await backend.signOut().catch(() => {});
      emit({ type: 'rejected', message: REJECTED_MESSAGE });
      setSnapshot(ANONYMOUS);
      return;
    }
    currentUser = user;
    setSnapshot({
      status: 'authenticated',
      uid: user.uid,
      email: user.email ?? null,
      isAdmin: verdict.isAdmin,
      university: verdict.university,
    });
  };

  const start = () => {
    if (starting) return starting;
    starting = loadBackend()
      .then((loaded) => {
        backend = loaded;
        backend.onAuthStateChanged((user) => {
          void handleUser(user);
        });
        return backend;
      })
      .catch((err) => {
        logger.warn('platform.auth.backend_load_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setSnapshot(ANONYMOUS); // SDK unavailable → behave like signed-out
        return null;
      });
    return starting;
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      void start();
      return () => {
        listeners.delete(listener);
      };
    },
    async getIdToken() {
      // Legacy getCurrentUserIdToken parity: no user → null; a token read error
      // (network, revoked session) degrades to null rather than throwing.
      if (!currentUser) return null;
      return currentUser.getIdToken().catch(() => null);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    async signIn() {
      const loaded = await start();
      if (!loaded) {
        emit({ type: 'sign-in-failed', message: SIGN_IN_FAILED_MESSAGE });
        return;
      }
      try {
        await loaded.signInWithGooglePopup();
      } catch (err) {
        // Legacy parity: a user-closed popup is not an error.
        const code = (err as { code?: string } | null)?.code;
        if (code === 'auth/popup-closed-by-user') return;
        logger.warn('platform.auth.sign_in_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        emit({ type: 'sign-in-failed', message: SIGN_IN_FAILED_MESSAGE });
      }
    },
    async signOut() {
      currentUser = null;
      if (!backend) return;
      await backend.signOut().catch(() => {});
    },
  };
}
