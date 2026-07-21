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
