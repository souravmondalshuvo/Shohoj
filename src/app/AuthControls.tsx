// src/app/AuthControls.tsx
//
// Sign-in/out header controls, extracted verbatim from RootLayout so the
// standalone public pages (#383) can reuse the exact shell behavior: rejection
// and sign-in-failure events surface as the legacy toast copy, and offline
// builds (null source) render no auth UI at all.

import { useEffect } from 'react';

import { useAuth } from './providers/AuthProvider';
import type { FirebaseAuthSource } from '../platform/auth/firebaseAuthSource';
import { useNotifications } from '../state/NotificationProvider';

/** Sign-in/out controls (cloud shells only). `source` is null when offline. */
export function AuthControls({ source }: { readonly source: FirebaseAuthSource | null }) {
  const auth = useAuth();
  const { notify } = useNotifications();

  // Rejection / sign-in-failure events → the legacy toast copy (sticky error).
  useEffect(() => {
    if (!source) return;
    return source.onEvent((event) => {
      notify({ kind: 'error', message: event.message });
    });
  }, [source, notify]);

  if (!source) return null;

  if (auth.status === 'loading') {
    return (
      <span className="shell-auth shell-auth-loading" role="status">
        Checking sign-in…
      </span>
    );
  }
  if (auth.status === 'authenticated') {
    return (
      <span className="shell-auth">
        <span className="shell-auth-email" title={auth.email ?? undefined}>
          {auth.email ?? 'Signed in'}
        </span>
        <button type="button" className="shell-auth-btn" onClick={() => void source.signOut()}>
          Sign out
        </button>
      </span>
    );
  }
  return (
    <span className="shell-auth">
      <button type="button" className="shell-auth-btn" onClick={() => void source.signIn()}>
        Sign in
      </button>
    </span>
  );
}
