// e2e-shell/seats.spec.js
//
// #397: the seat-status browser on the React Router shell's /seats route,
// migrated from the legacy seatsTab.js. Seeds the CONNECT feed cache (same seam
// as campus-map.spec.js) so the route renders real sections offline.
//
// Fixture exercises all three seat states: CSE110 has an open section (10/40),
// an almost-full section (38/40 > 85%), and a full section (40/40); MAT110 has
// one open section so search/sort/filter can be checked across courses.

import { expect, test } from '../e2e-support/authFixture.js';

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, courseName, sectionName, capacity, consumedSeat, day) => ({
      sectionId,
      courseCode,
      courseName,
      sectionName,
      capacity,
      consumedSeat,
      roomName: '07A-01C',
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', 'Programming Language', '01', 40, 10, 'SUNDAY'), // open
          section(2, 'CSE110', 'Programming Language', '02', 40, 38, 'MONDAY'), // tight (>85%)
          section(3, 'CSE110', 'Programming Language', '03', 40, 40, 'TUESDAY'), // full
          section(4, 'MAT110', 'Calculus', '01', 30, 5, 'WEDNESDAY'), // open
        ],
      }),
    );
  });
}

async function gotoSeats(page) {
  await seedFeed(page);
  await page.goto('/seats', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('seats-page')).toBeVisible();
  await expect(page.getByTestId('seats-feed-source')).toContainText('sections loaded');
}

test('empty query prompts; searching a code lists its sections with seat badges', async ({ page }) => {
  await gotoSeats(page);
  await expect(page.getByTestId('seats-prompt')).toBeVisible();

  await page.getByTestId('seats-search-input').fill('CSE110');
  const group = page.getByTestId('seats-group-CSE110');
  await expect(group).toBeVisible();
  await expect(group.getByText('3/3 open', { exact: false })).toHaveCount(0); // one is full
  // Badges for all three states are present.
  await expect(group.locator('.seats-badge--open')).toHaveCount(1);
  await expect(group.locator('.seats-badge--tight')).toHaveCount(1);
  await expect(group.locator('.seats-badge--full')).toHaveCount(1);
  await expect(group.getByText('2/3 open', { exact: false })).toBeVisible();
});

test('search matches by course name too', async ({ page }) => {
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('calculus');
  await expect(page.getByTestId('seats-group-MAT110')).toBeVisible();
  await expect(page.getByTestId('seats-group-CSE110')).toHaveCount(0);
});

test('"open seats only" hides the full section', async ({ page }) => {
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  const group = page.getByTestId('seats-group-CSE110');
  await expect(group.locator('.seats-section')).toHaveCount(3);

  await page.getByTestId('seats-available-only').check();
  await expect(group.locator('.seats-section')).toHaveCount(2);
  await expect(group.locator('.seats-badge--full')).toHaveCount(0);
});

test('sorting by seats-left puts the most-open section first', async ({ page }) => {
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  const group = page.getByTestId('seats-group-CSE110');

  // Default sort is by section name → 01, 02, 03.
  await expect(group.locator('.seats-section-name').first()).toHaveText('Section 01');

  await page.getByRole('button', { name: 'Seats left' }).click();
  // 01 has 30 left, 02 has 2, 03 has 0 → 01 stays first, 03 last.
  await expect(group.locator('.seats-section-name').first()).toHaveText('Section 01');
  await expect(group.locator('.seats-section-name').last()).toHaveText('Section 03');
});

test('no horizontal overflow at 360px with results shown', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  await expect(page.getByTestId('seats-group-CSE110')).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows, 'seats route overflows at 360px').toBe(false);
});

test('watching a section persists across a reload; unwatching clears it', async ({ page }) => {
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  const watch = page.getByTestId('seats-watch-1');
  await expect(watch).toHaveText('☆ Watch');

  await watch.click();
  await expect(watch).toHaveText('★ Watching');
  await expect(watch).toHaveAttribute('aria-pressed', 'true');

  // Reload (feed reseeded by the init script) — the watch survives.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('seats-search-input').fill('CSE110');
  const watchAfter = page.getByTestId('seats-watch-1');
  await expect(watchAfter).toHaveText('★ Watching');

  await watchAfter.click();
  await expect(watchAfter).toHaveText('☆ Watch');
});

test('the watchlist is written to the shared storage key the Profile hub reads', async ({ page }) => {
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  await page.getByTestId('seats-watch-2').click();
  const stored = await page.evaluate(() => localStorage.getItem('shohoj_seat_watch_v1'));
  expect(stored).toContain('"sectionId":2');
  expect(stored).toContain('"courseCode":"CSE110"');
});

test('watching while signed in syncs the set to the seat-alert repo', async ({ page }) => {
  // Inject a signed-in identity + a capturing seat-alert repo (no Firestore).
  await page.addInitScript(() => {
    const snapshot = { status: 'authenticated', uid: 'u_test', email: 'nabila@g.bracu.ac.bd' };
    window.__shohojAuthSource = { get: () => snapshot, subscribe: () => () => {}, getIdToken: async () => 't' };
    window.__seatAlertCalls = [];
    window.__shohojSeatAlertRepo = {
      sync: (uid, email, enabled, sections) => {
        window.__seatAlertCalls.push({ uid, email, enabled, sections });
        return Promise.resolve();
      },
    };
  });
  await gotoSeats(page);
  await page.getByTestId('seats-search-input').fill('CSE110');
  await page.getByTestId('seats-watch-1').click();

  await expect.poll(() => page.evaluate(() => window.__seatAlertCalls.length)).toBeGreaterThan(0);
  const last = await page.evaluate(() => window.__seatAlertCalls[window.__seatAlertCalls.length - 1]);
  expect(last.uid).toBe('u_test');
  expect(last.enabled).toBe(true);
  expect(last.sections).toEqual([{ id: 1, code: 'CSE110', name: '01' }]);
});
