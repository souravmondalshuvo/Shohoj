// e2e-shell/profile.spec.js
//
// #397 / #196: the account hub on the React Router shell's /profile route,
// migrated from the legacy profileTab.js. Auth-gated, so the authenticated
// cases inject an auth source through the RootLayout e2e seam
// (window.__shohojAuthSource) — no real Firebase session needed. The saved-
// routine summary reads the Routine route's persisted picks.

import { expect, test } from '@playwright/test';

// Stand in for a signed-in student. Only the AuthProvider reads this (get /
// subscribe / getIdToken); the header sign-in/out controls are untouched.
function signIn(page, email = 'student@g.bracu.ac.bd') {
  return page.addInitScript((e) => {
    // Stable snapshot reference — useSyncExternalStore compares get() by identity,
    // so returning a fresh object each call would loop / bail out.
    const snapshot = { status: 'authenticated', uid: 'u_test', email: e };
    window.__shohojAuthSource = {
      get: () => snapshot,
      subscribe: () => () => {},
      getIdToken: async () => 'test-token',
    };
  }, email);
}

function seedRoutine(page, picks) {
  return page.addInitScript((p) => {
    localStorage.setItem('shohoj_routine_picks_v1', JSON.stringify({ picks: p }));
  }, picks);
}

test('signed-out students see the sign-in prompt, not the hub', async ({ page }) => {
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-page')).toBeVisible();
  await expect(page.getByTestId('profile-signedout')).toBeVisible();
  await expect(page.getByTestId('profile-account')).toHaveCount(0);
});

test('signed-in students see the account header with their email', async ({ page }) => {
  await signIn(page, 'nabila@g.bracu.ac.bd');
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-account')).toBeVisible();
  await expect(page.getByTestId('profile-email')).toHaveText('nabila@g.bracu.ac.bd');
  await expect(page.getByTestId('profile-signedout')).toHaveCount(0);
});

test('the routine card is empty with no saved routine', async ({ page }) => {
  await signIn(page);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-routine-empty')).toBeVisible();
});

test('the routine card summarizes the saved picks', async ({ page }) => {
  await signIn(page);
  // Two courses added, one with a section picked, one still unresolved (null).
  await seedRoutine(page, { CSE110: 1, MAT110: null });
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  const summary = page.getByTestId('profile-routine-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('2 courses added');
  await expect(summary).toContainText('1 section picked');
});

test('no horizontal overflow at 360px in the signed-in hub', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await signIn(page, 'a-really-long-student-email-address@g.bracu.ac.bd');
  await seedRoutine(page, { CSE110: 1 });
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-account')).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows, 'profile route overflows at 360px').toBe(false);
});
