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
//
// It also holds an admin's campus choice (#798). An admin moderates every
// campus, and one on an address no campus claims would otherwise resolve to
// none — no grading scale, so half the shell reads "we don't know your campus".
// The choice lives here, next to the snapshot, because useUniversity is the one
// place the shell answers "which campus is this", and it has to answer the same
// way on every route.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  type AuthSnapshot,
  type AuthSource,
  anonymousAuthSource,
} from '../../platform/auth/authSnapshot';
import {
  getUniversity,
  isUniversityId,
  universityForEmail,
  type UniversityId,
  type UniversityProfile,
} from '../../core/university';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';

/**
 * Where an admin's campus choice is kept. Per device, not per account: it is a
 * viewing preference, and a student's session on the same browser ignores it
 * because useUniversity only reads it for an admin.
 */
export const ADMIN_CAMPUS_KEY = 'shohoj_admin_campus';

interface AuthContextValue {
  readonly snapshot: AuthSnapshot;
  readonly getIdToken: () => Promise<string | null>;
  readonly adminCampus: UniversityId | null;
  readonly setAdminCampus: (id: UniversityId) => void;
}

function readAdminCampus(): UniversityId | null {
  const stored = createBrowserStore().getItem(ADMIN_CAMPUS_KEY);
  // A campus removed from the registry since it was chosen reads as no choice.
  return isUniversityId(stored) ? stored : null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  readonly children: ReactNode;
  /** Identity source; defaults to anonymous (standalone shell / tests). */
  readonly source?: AuthSource;
}

export function AuthProvider({ children, source = anonymousAuthSource }: AuthProviderProps) {
  const snapshot = useSyncExternalStore(source.subscribe, source.get, () => source.get());
  const [adminCampus, setAdminCampusState] = useState<UniversityId | null>(readAdminCampus);
  const setAdminCampus = useCallback((id: UniversityId) => {
    createBrowserStore().setItem(ADMIN_CAMPUS_KEY, id);
    setAdminCampusState(id);
  }, []);
  // getIdToken is bound to the source; re-memo only when the source swaps.
  const value = useMemo<AuthContextValue>(
    () => ({ snapshot, getIdToken: () => source.getIdToken(), adminCampus, setAdminCampus }),
    [snapshot, source, adminCampus, setAdminCampus],
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
 * An admin's chosen campus and its setter. The choice is honoured only while
 * the snapshot says admin — see useUniversity.
 */
export function useAdminCampus(): readonly [UniversityId | null, (id: UniversityId) => void] {
  const { adminCampus, setAdminCampus } = useAuthContext();
  return [adminCampus, setAdminCampus];
}

/**
 * The signed-in student's university profile, or `null` when no campus is
 * resolved — signed out, still loading, or an admin on a non-campus address
 * who has not picked one in the switcher yet.
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
  const { snapshot, adminCampus } = useAuthContext();
  const { university, email } = snapshot;
  // Only a signed-in admin's choice counts. The claim is what lets an admin
  // past every campus check in firestore.rules and the Worker, so letting them
  // view any campus here grants nothing the server does not already allow —
  // and a student who plants the storage key changes nothing at all.
  const viewAs = snapshot.status === 'authenticated' && snapshot.isAdmin ? adminCampus : null;
  return useMemo(() => {
    if (viewAs !== null) return getUniversity(viewAs);
    // The email wins, exactly as normalizeAuthSnapshot decides it: a verified
    // domain is evidence, whereas the `university` field is whatever the
    // source put there. Deriving here as well means the answer does not depend
    // on which AuthSource produced the snapshot — an injected source (the e2e
    // seam, a test fake) never goes through the normalizer, and would
    // otherwise present a signed-in student with no campus at all.
    const fromEmail = universityForEmail(email);
    return fromEmail ?? getUniversity(university);
  }, [university, email, viewAs]);
}
