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

import { isUniversityId, universityForEmail, type UniversityId } from '../../core/university.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthSnapshot {
  readonly status: AuthStatus;
  readonly uid: string | null;
  readonly email: string | null;
  readonly isAdmin: boolean;
  /**
   * The campus this user belongs to, resolved from their email domain.
   *
   * Null for a signed-out user, and also null for an admin whose address is not
   * on any registered campus — the admin claim admits them, but it does not
   * invent a campus for them, so the UI must ask rather than assume.
   */
  readonly university: UniversityId | null;
}

export const ANONYMOUS: AuthSnapshot = {
  status: 'anonymous',
  uid: null,
  email: null,
  isAdmin: false,
  university: null,
};

export const LOADING: AuthSnapshot = {
  status: 'loading',
  uid: null,
  email: null,
  isAdmin: false,
  university: null,
};

/** Loose shape of the legacy identity globals (all optional / untrusted). */
export interface RawIdentity {
  readonly authReady?: unknown;
  readonly uid?: unknown;
  readonly email?: unknown;
  readonly isAdmin?: unknown;
  readonly university?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalize an untrusted identity reading into a typed snapshot. Until auth is
 * ready the status is `loading`; a present uid means `authenticated`, otherwise
 * `anonymous`. `isAdmin` is only ever true for an authenticated user — a client
 * convenience for hiding controls, never a security decision.
 *
 * The campus is derived from the email rather than trusted from the reading:
 * these globals are untrusted input, and a caller that could name its own
 * campus could read another campus's data through a UI that believed it. An
 * explicitly supplied `university` is honoured only when it is a registered id
 * AND the email does not already resolve to a different one.
 */
export function normalizeAuthSnapshot(raw: RawIdentity): AuthSnapshot {
  if (raw.authReady !== true) return LOADING;
  const uid = asString(raw.uid);
  if (uid === null) return ANONYMOUS;
  const email = asString(raw.email);
  const fromEmail = universityForEmail(email)?.id ?? null;
  return {
    status: 'authenticated',
    uid,
    email,
    isAdmin: raw.isAdmin === true,
    university: fromEmail ?? (isUniversityId(raw.university) ? raw.university : null),
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
