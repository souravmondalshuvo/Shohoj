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

// Capture seat-alert sync() calls through the repo seam (no Firestore).
function captureSeatAlerts(page) {
  return page.addInitScript(() => {
    window.__seatAlertCalls = [];
    window.__shohojSeatAlertRepo = {
      sync: (uid, email, enabled, sections) => {
        window.__seatAlertCalls.push({ uid, email, enabled, sections });
        return Promise.resolve();
      },
    };
  });
}

function seedWatchOne(page) {
  return page.addInitScript(() => {
    localStorage.setItem(
      'shohoj_seat_watch_v1',
      JSON.stringify([{ sectionId: 1, courseCode: 'CSE110', sectionName: '01', addedAt: 1, hadSeat: true }]),
    );
  });
}

// Seed the local "my reviews" receipt for the signed-in uid (u_test) — the same
// `shohoj_my_reviews_v1` map the review submit flow writes.
function seedReviews(page, entries) {
  return page.addInitScript((rows) => {
    localStorage.setItem('shohoj_my_reviews_v1', JSON.stringify({ u_test: rows }));
  }, entries);
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

function seedWatches(page, entries) {
  return page.addInitScript((list) => {
    localStorage.setItem('shohoj_seat_watch_v1', JSON.stringify(list));
  }, entries);
}

test('the watchlist card is empty with no watched sections', async ({ page }) => {
  await signIn(page);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-watchlist-empty')).toBeVisible();
});

test('the watchlist card lists watched sections and removing one updates storage', async ({ page }) => {
  await signIn(page);
  await seedWatches(page, [
    { sectionId: 1, courseCode: 'CSE110', sectionName: '01', addedAt: 1, hadSeat: true },
    { sectionId: 2, courseCode: 'MAT110', sectionName: '02', addedAt: 2, hadSeat: false },
  ]);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });

  const list = page.getByTestId('profile-watchlist');
  await expect(list.locator('.profile-watch-item')).toHaveCount(2);
  await expect(list).toContainText('CSE110');

  await page.getByTestId('profile-unwatch-1').click();
  await expect(list.locator('.profile-watch-item')).toHaveCount(1);
  const stored = await page.evaluate(() => localStorage.getItem('shohoj_seat_watch_v1'));
  expect(stored).not.toContain('"sectionId":1');
  expect(stored).toContain('"sectionId":2');
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

test('email-alert toggle defaults on; turning it off persists and syncs disabled', async ({ page }) => {
  await captureSeatAlerts(page);
  await signIn(page, 'nabila@g.bracu.ac.bd');
  await seedWatchOne(page);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });

  const toggle = page.getByTestId('profile-alert-toggle');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('profile-alert-note')).toContainText('nabila@g.bracu.ac.bd');

  await toggle.uncheck();
  await expect(page.getByTestId('profile-alert-note')).toContainText('no emails');
  const stored = await page.evaluate(() => localStorage.getItem('shohoj_seat_alerts_enabled'));
  expect(stored).toBe('0');

  // The last sync reflects the disabled flag + the watched section.
  const calls = await page.evaluate(() => window.__seatAlertCalls);
  const last = calls[calls.length - 1];
  expect(last.enabled).toBe(false);
  expect(last.uid).toBe('u_test');
  expect(last.email).toBe('nabila@g.bracu.ac.bd');
  expect(last.sections).toEqual([{ id: 1, code: 'CSE110', name: '01' }]);
});

test('signing in retroactively arms alerts for already-watched sections', async ({ page }) => {
  await captureSeatAlerts(page);
  await signIn(page);
  await seedWatchOne(page);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-watchlist')).toBeVisible();
  // The mount sync pushed the watched section with the default (enabled) flag.
  await expect.poll(() => page.evaluate(() => window.__seatAlertCalls.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__seatAlertCalls[0]);
  expect(first.enabled).toBe(true);
  expect(first.sections).toEqual([{ id: 1, code: 'CSE110', name: '01' }]);
});

test('the reviews card is empty with no submitted reviews', async ({ page }) => {
  await signIn(page);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-reviews-card')).toBeVisible();
  await expect(page.getByTestId('profile-reviews-empty')).toBeVisible();
  await expect(page.getByTestId('profile-reviews')).toHaveCount(0);
});

test('the reviews card lists the student own submitted reviews', async ({ page }) => {
  await signIn(page);
  await seedReviews(page, [
    { id: 'r1', facultyInitials: 'MHK', courseCode: 'CSE110', semester: 'Fall 2024', at: 1 },
    { id: 'r2', facultyInitials: 'ANM', courseCode: 'MAT110', semester: '', at: 2 },
  ]);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('profile-reviews-empty')).toHaveCount(0);
  await expect(page.getByTestId('profile-reviews-count')).toContainText('2 written');

  const list = page.getByTestId('profile-reviews');
  await expect(list.locator('.profile-watch-item')).toHaveCount(2);
  await expect(list).toContainText('MHK');
  await expect(list).toContainText('CSE110 · Fall 2024');
  // A blank semester renders just the course code, no trailing separator.
  await expect(list).toContainText('ANM · MAT110');
});
