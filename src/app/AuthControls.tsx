// src/app/AuthControls.tsx
//
// Sign-in/out header controls, extracted verbatim from RootLayout so the
// standalone public pages (#383) can reuse the exact shell behavior: rejection
// and sign-in-failure events surface as the legacy toast copy, and offline
// builds (null source) render no auth UI at all.

import { useEffect, useState } from 'react';

import { useAuth } from './providers/AuthProvider';
import { useCloudSync } from './providers/CloudSyncProvider';
import { useConfirm } from './providers/ModalProvider';
import type { FirebaseAuthSource } from '../platform/auth/firebaseAuthSource';
import { createBrowserStore, createSessionStore } from '../services/storage/browserKeyValueStore';
import { clearPersonalData } from '../services/storage/personalData';
import { clearStoredHistory } from '../../js/core/assistantHistory.js';
import { useNotifications } from '../state/NotificationProvider';

// Signing out used to end the Firebase session and leave every semester, the
// routine and the review record in localStorage for whoever opened the browser
// next (#627). It now clears the device — which is what a student on a lab
// machine already believes it does — behind a dialog that says so first.
//
// The routine and the "your reviews" record have no cloud copy to come back
// from: the routine was never synced, and review authorship is deliberately
// non-reversible, so that list is the only trace. The copy says as much rather
// than let a student find out afterwards.
const SIGN_OUT_MESSAGE =
  'Your semesters and grades are saved to your account — signing in brings them back. ' +
  'Everything else Shohoj keeps here, including your routine and the record of reviews ' +
  'you have written, only exists on this device and will be gone.';

const SIGN_OUT_UNSYNCED =
  'Your account does not have your latest changes yet — Shohoj could not save them just now, ' +
  'so those would be lost too.';

// The person glyph legacy prefixes to its signed-out pill.
//
// Taken from what updateAuthUI RENDERS (js/auth/firebase.js:1425) rather than
// from the static markup in index.html:167 — 15px at 0.75 opacity, not 16px at
// 0.7. Legacy's button ships one set of attributes in the HTML and is repainted
// with another the moment the auth state resolves, and it is the repainted one
// a student actually sees.
//
// Decorative — the button's text label carries the accessible name.
function PersonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, opacity: 0.75 }}
      aria-hidden="true"
    >
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
  const confirm = useConfirm();
  const cloudSync = useCloudSync();

  // The backup check can sit on a Firebase call for several seconds, during
  // which the button would otherwise look dead and invite a second click. A
  // second confirm() replaces the first in ModalProvider, dropping its resolve
  // and leaving that flow suspended for the life of the page.
  const [signingOut, setSigningOut] = useState(false);

  const signOutAndClear = async (activeSource: FirebaseAuthSource) => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // No engine means no way to check, which reads as "not confirmed" — the
      // warning is the safe side of that guess.
      const backedUp = cloudSync !== null && (await cloudSync.isCloudCurrent());
      const confirmed = await confirm({
        title: 'Sign out and clear this device?',
        message: backedUp ? SIGN_OUT_MESSAGE : `${SIGN_OUT_MESSAGE} ${SIGN_OUT_UNSYNCED}`,
        confirmLabel: 'Sign out and clear',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!confirmed) return;

      await activeSource.signOut();
      clearPersonalData(createBrowserStore(), createSessionStore());
      // The Assistant transcript lives in IndexedDB, which removeItem cannot
      // reach. Legacy drops it from its own uid-change effect
      // (js/ui/assistantFab.js:480); the shell's drawer only clears it from its
      // "Clear chat" button, so without this the conversation — questions about
      // their own grades — outlives the sign-out.
      await clearStoredHistory().catch(() => false);
      // Reload rather than hand-resetting each route: the calculator, routine,
      // seats and profile views each hold their own copy in memory, and one
      // missed is the leak this fixes.
      if (typeof window !== 'undefined') window.location.reload();
    } finally {
      setSigningOut(false);
    }
  };

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
        {/* Label unchanged while busy: aria-busy carries the state without
            renaming the control mid-flow. */}
        <button
          type="button"
          className="shell-auth-btn"
          onClick={() => void signOutAndClear(source)}
          disabled={signingOut}
          aria-busy={signingOut}
        >
          Sign out
        </button>
      </span>
    );
  }
  // Legacy's own classes, not a copy of its markup. `.auth-btn-signed-out` is
  // what js/auth/firebase.js:1417 applies once the auth state settles, and
  // css/style.css:2606 is where that pill is actually defined: 6px/14px padding,
  // 6px gap, weight 600, no fixed height, plus the hover and :active states.
  //
  // The shell previously reproduced index.html's INLINE attributes instead —
  // 5px/14px/5px/8px, gap 7, weight 500, height 36px — which is the markup
  // legacy ships and then immediately overwrites. Measured against the live
  // page that came out 4px narrower and 5px taller, and it is why the nav
  // capture failed on a Linux runner where the text metrics stopped hiding it.
  // Sharing the class means there is one definition of this pill, not two that
  // have to be kept in step.
  return (
    <span className="shell-auth">
      <button
        type="button"
        className="auth-btn-signed-out magnetic"
        title="Sign in with your BRACU G-Suite account"
        onClick={() => void source.signIn()}
      >
        <PersonIcon />
        <span className="auth-signin-label">Sign in</span>
      </button>
    </span>
  );
}
