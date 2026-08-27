// e2e/clear-data-wipe.spec.js
//
// #627: "Clear Data" promises to delete everything saved on this device, but
// its key list only ever covered the calculator snapshot, the theme and two
// sync markers — the routine, the review record, the seat watchlist and the
// CONNECT profile all stayed behind. Sign-out now shares that same list
// (js/core/personalData.js), so a gap here is a gap there too, on the build
// students actually land on.
//
// Driven through the real button so the wiring is covered, not just the list.

import { expect, test } from '@playwright/test';

// Everything a student can leave on the device, plus the public feed cache that
// must survive (identical bytes for everyone — dropping it only costs a refetch).
const SEEDED = {
  shohoj_cgpa_v1: JSON.stringify({
    currentDept: 'CSE',
    semesterCounter: 1,
    semesters: [{ id: 0, name: 'Fall 2024', courses: [] }],
  }),
  shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
  shohoj_my_reviews_v1: JSON.stringify({ u_test: [{ facultyInitials: 'ABC' }] }),
  shohoj_seat_watch_v1: JSON.stringify([{ sectionId: 1, courseCode: 'CSE110' }]),
  shohoj_seat_alerts_enabled: '1',
  shohoj_connect_profile_v1: JSON.stringify({ studentId: '20101234' }),
  shohoj_last_sync: '1756200000000',
  shohoj_session_start: '1756100000000',
  shohoj_connect_feed_v1: JSON.stringify({ sections: [] }),
};

async function bootWithData(page) {
  await page.route('https://**/*', (route) => route.abort());
  page.on('dialog', (dialog) => dialog.accept()); // the confirm, if it falls back to window.confirm
  // Seeded once, not on every navigation: addInitScript re-runs on reload, and
  // a spec about what a wipe removed cannot have its fixture put back. That
  // includes the gate unlock — helpers/gate.js sets it unconditionally, which
  // would hand the reloaded page a pass the wiped device should not have.
  await page.addInitScript((seeded) => {
    if (sessionStorage.getItem('__shohoj_wipe_spec')) return;
    sessionStorage.setItem('__shohoj_wipe_spec', '1');
    for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, value);
    sessionStorage.setItem('shohoj_calc_unlocked', '1');
  }, SEEDED);
  await page.addInitScript(() => {
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#clearDataBtn')).toBeVisible();
}

test('Clear Data removes every personal key, not just the calculator', async ({ page }) => {
  await bootWithData(page);

  await page.locator('#clearDataBtn').click();
  // The in-page confirm (js/auth/firebase.js) is absent on this un-bundled
  // build, so handleClearData falls back to window.confirm — auto-accepted above.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1')), { timeout: 5000 })
    .toBe(null);

  const leftovers = await page.evaluate(
    (keys) => keys.filter((key) => localStorage.getItem(key) !== null),
    [
      'shohoj_routine_v1',
      'shohoj_my_reviews_v1',
      'shohoj_seat_watch_v1',
      'shohoj_seat_alerts_enabled',
      'shohoj_connect_profile_v1',
      'shohoj_last_sync',
      'shohoj_session_start',
    ],
  );
  expect(leftovers, 'left on the device by Clear Data').toEqual([]);

  // Public bytes, not a trace of who was here.
  expect(await page.evaluate(() => localStorage.getItem('shohoj_connect_feed_v1'))).toBe(
    SEEDED.shohoj_connect_feed_v1,
  );
});

test('a cleared device meets the campus gate again, with no data behind it', async ({ page }) => {
  // The end state that matters on a shared machine: the next person gets the
  // portal, not the last student's semesters. The gate lets saved work through
  // (js/ui/signinPortal.js:hasSavedWork), so an incomplete wipe shows up here.
  await bootWithData(page);
  await page.locator('#clearDataBtn').click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1')), { timeout: 5000 })
    .toBe(null);

  // Straight back in. The spec's seed guard stays set, so nothing is put back,
  // and the wipe already took the per-tab gate unlock with it — which is the
  // state the next person at this browser actually arrives in.
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('signin-portal')).toBeVisible();
  await expect(page.locator('#calculator .calc-wrapper')).toBeHidden();
});
