// src/app/providers/AuthProvider.tsx
//
// React context exposing the current auth identity to the shell (Phase 3). Reads
// from an injectable AuthSource (defaults to anonymous) via useSyncExternalStore,
// so it stays correct under concurrent rendering and is trivial to drive in
// tests. This gates UI only — server-side checks remain the real authorization
// boundary (see authSnapshot.ts).
//
// Besides the snapshot, the context carries the source's getIdToken so signed-in
// writes (the worker review relay, papers upload) can authorize without reaching
// into Firebase directly. It is a function, not a snapshot field, because tokens
// expire — each call mints/returns a fresh one.

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import {
  type AuthSnapshot,
  type AuthSource,
  anonymousAuthSource,
} from '../../platform/auth/authSnapshot';
import { getUniversity, universityForEmail, type UniversityProfile } from '../../core/university';

interface AuthContextValue {
  readonly snapshot: AuthSnapshot;
  readonly getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  readonly children: ReactNode;
  /** Identity source; defaults to anonymous (standalone shell / tests). */
  readonly source?: AuthSource;
}

export function AuthProvider({ children, source = anonymousAuthSource }: AuthProviderProps) {
  const snapshot = useSyncExternalStore(source.subscribe, source.get, () => source.get());
  // getIdToken is bound to the source; re-memo only when the source swaps.
  const value = useMemo<AuthContextValue>(
    () => ({ snapshot, getIdToken: () => source.getIdToken() }),
    [snapshot, source],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return value;
}

/** Current auth snapshot. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthSnapshot {
  return useAuthContext().snapshot;
}

/** The current ID token getter (null when signed out). Throws outside <AuthProvider>. */
export function useIdToken(): () => Promise<string | null> {
  return useAuthContext().getIdToken;
}

/**
 * The signed-in student's university profile, or `null` when no campus is
 * resolved — signed out, still loading, or an admin on a non-campus address.
 *
 * This is the seam that makes the app multi-tenant. `AuthSnapshot.university`
 * is decided once, from the verified email domain, at the auth boundary; every
 * consumer reads the profile from here rather than re-deriving it, so there is
 * exactly one answer to "which campus is this" per render.
 *
 * Callers must handle `null` rather than substituting a default campus. Falling
 * back to BRACU is how an NSU student silently gets BRACU's grading scale — the
 * failure this hook exists to prevent. Where a scale is genuinely required
 * before one is known, render nothing and wait: `status === 'loading'` is a
 * beat, and a blank beat is cheaper than a wrong CGPA.
 */
export function useUniversity(): UniversityProfile | null {
  const { university, email } = useAuthContext().snapshot;
  return useMemo(() => {
    // The email wins, exactly as normalizeAuthSnapshot decides it: a verified
    // domain is evidence, whereas the `university` field is whatever the
    // source put there. Deriving here as well means the answer does not depend
    // on which AuthSource produced the snapshot — an injected source (the e2e
    // seam, a test fake) never goes through the normalizer, and would
    // otherwise present a signed-in student with no campus at all.
    const fromEmail = universityForEmail(email);
    return fromEmail ?? getUniversity(university);
  }, [university, email]);
}
