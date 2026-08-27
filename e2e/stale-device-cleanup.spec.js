// e2e/stale-device-cleanup.spec.js
//
// #627 follow-up: the wipe added in #628 runs at sign-out, so it could not help
// the devices the OLD sign-out had already abandoned — including the one in the
// bug report, which still showed a full transcript under a "Sign in with Google"
// banner after the fix shipped. Those devices clean themselves on the next load.
//
// The risk is the opposite mistake, so both cases are here: the abandoned device
// is cleared, and a student who simply uses Shohoj signed out keeps everything.
// Firebase is unreachable in this suite, which is the honest shape of the test —
// auth resolves to signed-out, which is exactly when the cleanup runs.

import { expect, test } from '@playwright/test';

const GRADES = JSON.stringify({
  currentDept: 'CSE',
  semesterCounter: 1,
  semesters: [{ id: 0, name: 'Fall 2024', courses: [] }],
});

// The footprint the pre-#627 sign-out left: last-sync behind, session start gone.
const ABANDONED = {
  shohoj_cgpa_v1: GRADES,
  shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
  shohoj_last_sync: '1756200000000',
  shohoj_theme: 'light',
};

// A visitor who never signed in: same data, no sync marker.
const NEVER_SIGNED_IN = {
  shohoj_cgpa_v1: GRADES,
  shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
  shohoj_theme: 'light',
};

async function bootWith(page, seeded) {
  await page.route('https://**/*', (route) => route.abort());
  // Seeded once: addInitScript re-runs on navigation, and the cleanup reloads.
  // Re-seeding would put back the very data the assertion is about.
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('__shohoj_stale_spec')) {
      sessionStorage.setItem('__shohoj_stale_spec', '1');
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
      sessionStorage.setItem('shohoj_calc_unlocked', '1');
    }
    window.Chart = window.Chart || class { destroy() {} };
  }, seeded);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

const read = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

// The wipe removes the key; a normal boot then writes an empty snapshot back
// over it, exactly as it does for a first-time visitor. So the question is
// whether any of the student's content survived, not whether the key exists.
const semestersLeft = async (page) => {
  const raw = await read(page, 'shohoj_cgpa_v1');
  if (raw === null) return 0;
  return (JSON.parse(raw).semesters ?? []).length;
};

test('a device the old sign-out abandoned clears itself on the next load', async ({ page }) => {
  await bootWith(page, ABANDONED);

  await expect.poll(() => semestersLeft(page), { timeout: 10_000 }).toBe(0);
  expect(await read(page, 'shohoj_routine_v1')).toBe(null);
  expect(await read(page, 'shohoj_last_sync')).toBe(null);
  // A preference is not a trace of who was here.
  expect(await read(page, 'shohoj_theme')).toBe('light');
});

test('the cleaned device shows the gate, not the last student\'s transcript', async ({ page }) => {
  // The screenshot in the bug report: a full transcript sitting under a sign-in
  // prompt. This is that page after the fix.
  await bootWith(page, ABANDONED);
  await expect.poll(() => semestersLeft(page), { timeout: 10_000 }).toBe(0);

  await expect(page.getByTestId('signin-portal')).toBeVisible();
  await expect(page.locator('#calculator .calc-wrapper')).toBeHidden();
});

test('a student who never signed in keeps every bit of their data', async ({ page }) => {
  // The case that must never fire. Signed-out use is not an edge case on this
  // build — it is how Shohoj has always worked.
  await bootWith(page, NEVER_SIGNED_IN);

  // Give the auth-resolved path the same room the cleanup would have taken.
  await page.waitForTimeout(2000);

  // Compared by content, not by bytes: the running app re-serializes the
  // snapshot with its full field set (start term, plan, slices), so an exact
  // string match would fail on a device where nothing was lost.
  const snapshot = JSON.parse(await read(page, 'shohoj_cgpa_v1'));
  expect(snapshot.semesters).toEqual(JSON.parse(GRADES).semesters);
  expect(snapshot.currentDept).toBe('CSE');
  expect(await read(page, 'shohoj_routine_v1')).toBe(NEVER_SIGNED_IN.shohoj_routine_v1);
});
