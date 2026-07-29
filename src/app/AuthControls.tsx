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

// The person glyph legacy prefixes to its signed-out pill (index.html:167).
// Decorative — the button's text label carries the accessible name.
function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
        fill="currentColor"
      />
    </svg>
  );
}

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
        <PersonIcon />
        Sign in
      </button>
    </span>
  );
}
