// src/app/providers/AuthProvider.tsx
//
// React context exposing the current auth identity to the shell (Phase 3). Reads
// from an injectable AuthSource (defaults to anonymous) via useSyncExternalStore,
// so it stays correct under concurrent rendering and is trivial to drive in
// tests. This gates UI only — server-side checks remain the real authorization
// boundary (see authSnapshot.ts).

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import {
  type AuthSnapshot,
  type AuthSource,
  anonymousAuthSource,
} from '../../platform/auth/authSnapshot';

const AuthContext = createContext<AuthSnapshot | null>(null);

export interface AuthProviderProps {
  readonly children: ReactNode;
  /** Identity source; defaults to anonymous (standalone shell / tests). */
  readonly source?: AuthSource;
}

export function AuthProvider({ children, source = anonymousAuthSource }: AuthProviderProps) {
  const snapshot = useSyncExternalStore(
    source.subscribe,
    source.get,
    () => source.get(),
  );
  return <AuthContext value={snapshot}>{children}</AuthContext>;
}

/** Current auth snapshot. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthSnapshot {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return value;
}
