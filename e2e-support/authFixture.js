// e2e-support/authFixture.js
//
// Shared Playwright fixture: every shell spec runs as a signed-in student
// unless it says otherwise.
//
// The shell gates its routes behind sign-in — a student's campus decides the
// grading scale, so there is no correct app to render before we know who they
// are (see GatedMain in src/app/routes/RootLayout.tsx). That means a spec which
// simply opens a route now lands on the sign-in portal instead. Rather than
// teach 40-odd specs to sign in, the default `page` arrives already
// authenticated, and the handful of specs that care about the signed-out view
// import `anonymousTest`.
//
// This lives outside e2e-shell/ and e2e-visual/ because both use it, and
// because a file inside a testDir invites being mistaken for a spec.

import { test as base, expect } from '@playwright/test';

/** The default student: BRACU, verified, not an admin. */
export const BRACU_STUDENT = Object.freeze({
  status: 'authenticated',
  // `u_me` rather than something new: the shell specs have long seeded their
  // own repo fakes against this uid, and routes prefer the real auth snapshot
  // over their per-route identity seam (see FeedbackRoute). A different uid
  // here silently desyncs every seeded fixture from the signed-in user.
  uid: 'u_me',
  email: 'me@g.bracu.ac.bd',
  isAdmin: false,
  university: 'bracu',
});

/** An NSU student, for specs asserting campus-specific behaviour. */
export const NSU_STUDENT = Object.freeze({
  status: 'authenticated',
  uid: 'u_test_nsu',
  email: 'student@northsouth.edu',
  isAdmin: false,
  university: 'nsu',
});

/**
 * Install the auth seam the shell reads (`window.__shohojAuthSource`).
 *
 * The snapshot crosses into page scope once, as a single deserialized object,
 * so `get()` returns a stable reference. That matters: useSyncExternalStore
 * compares snapshots by identity, and a fresh object per call would re-render
 * forever.
 *
 * Exported so a spec can re-install it with a different student — the last
 * init script to run wins, since they all assign the same global.
 */
export function installAuth(page, snapshot = BRACU_STUDENT) {
  return page.addInitScript((snap) => {
    window.__shohojAuthSource = {
      get: () => snap,
      subscribe: () => () => {},
      getIdToken: async () => 'test-token',
    };
  }, snapshot);
}

/** The default: a signed-in BRACU student on every page. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await installAuth(page);
    await use(page);
  },
});

/**
 * The un-extended runner, for specs that need the signed-out shell — the
 * sign-in portal itself, and anything asserting what a visitor cannot reach.
 */
export const anonymousTest = base;

export { expect };
