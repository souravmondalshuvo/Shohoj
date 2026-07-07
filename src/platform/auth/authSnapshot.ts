// src/platform/auth/authSnapshot.ts
//
// Typed auth identity for the React shell (Phase 3). This is the *client-side*
// view of who is signed in — for gating UI only. It is NOT an authorization
// boundary: every privileged operation is re-verified server-side in the Worker
// (Phase 7/8), and Firestore rules enforce the real boundary. Hidden UI is never
// authorization.
//
// The snapshot is produced from an injectable AuthSource port. Real Firebase
// wiring arrives in Phase 7; until then the shell uses a window-globals bridge
// (the legacy app already exposes identity on window._shohoj_*) or, standalone,
// the anonymous source. The normalization is pure and unit-tested.

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthSnapshot {
  readonly status: AuthStatus;
  readonly uid: string | null;
  readonly email: string | null;
  readonly isAdmin: boolean;
}

export const ANONYMOUS: AuthSnapshot = {
  status: 'anonymous',
  uid: null,
  email: null,
  isAdmin: false,
};

export const LOADING: AuthSnapshot = {
  status: 'loading',
  uid: null,
  email: null,
  isAdmin: false,
};

/** Loose shape of the legacy identity globals (all optional / untrusted). */
export interface RawIdentity {
  readonly authReady?: unknown;
  readonly uid?: unknown;
  readonly email?: unknown;
  readonly isAdmin?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalize an untrusted identity reading into a typed snapshot. Until auth is
 * ready the status is `loading`; a present uid means `authenticated`, otherwise
 * `anonymous`. `isAdmin` is only ever true for an authenticated user — a client
 * convenience for hiding controls, never a security decision.
 */
export function normalizeAuthSnapshot(raw: RawIdentity): AuthSnapshot {
  if (raw.authReady !== true) return LOADING;
  const uid = asString(raw.uid);
  if (uid === null) return ANONYMOUS;
  return {
    status: 'authenticated',
    uid,
    email: asString(raw.email),
    isAdmin: raw.isAdmin === true,
  };
}

/** A source the AuthProvider subscribes to for snapshots. */
export interface AuthSource {
  get(): AuthSnapshot;
  /** Register for changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /**
   * The current Firebase ID token for authorizing signed-in writes (the worker
   * review relay, papers upload, …), or null when signed out / unavailable.
   * Never throws — mirrors legacy getCurrentUserIdToken's catch-to-null.
   */
  getIdToken(): Promise<string | null>;
}

/** Always-anonymous source (standalone shell / tests). */
export const anonymousAuthSource: AuthSource = {
  get: () => ANONYMOUS,
  subscribe: () => () => {},
  getIdToken: async () => null,
};
