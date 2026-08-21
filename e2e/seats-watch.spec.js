import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Browser coverage for seat-drop alerts on the Seat Status tab: watching a full
// section, the "Watching" panel, removing a watch, and — the point of the
// feature — getting alerted when a watched section frees up. Reuses the
// mock-CONNECT-feed approach from the routine/free-rooms specs for determinism,
// and drives the full→open transition via the manual Refresh button so we don't
// have to wait on the 90s background poller.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

function sec(over) {
  return {
    courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    faculties: 'ABC', roomName: 'R1',
    sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00' }] },
    ...over,
  };
}

// CSE220: Section 01 open (10/30), Section 02 driven by `consumed02` (starts full at 30/30).
function feed(consumed02) {
  return [
    sec({ sectionId: 1, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '01', capacity: 30, consumedSeat: 10 }),
    sec({ sectionId: 2, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '02', capacity: 30, consumedSeat: consumed02 }),
  ];
}

// Boot the app with a mutable feed. Returns `setSeats(n)` to change Section 02's taken
// count for the next fetch, simulating a seat freeing up on USIS.
async function boot(page) {
  let consumed02 = 30; // Section 02 full to begin with
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
    // Capture in-app alerts. firebase.js (which normally defines this) makes
    // CDN imports that the route below aborts, so our stub stands.
    window.__seatToasts = [];
    window._shohoj_showToast = (msg, isError) => window.__seatToasts.push({ msg, isError });
  });
  await page.route('https://**/*', route => {
    if (route.request().url().startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(feed(consumed02)),
      });
    }
    return route.abort();
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, "seats");
  await expect(page.locator('#tabSeats')).toHaveClass(/active/);
  await page.locator('#seatsCourseInput').fill('CSE220');
  await expect(page.locator('.seats-section-row')).toHaveCount(2);
  return { setSeats: (n) => { consumed02 = n; } };
}

function row(page, sectionName) {
  return page.locator('.seats-section-row', { hasText: `Section ${sectionName}` });
}

test('watch a full section → it shows in the Watching panel; remove clears it', async ({ page }) => {
  await boot(page);

  // Section 02 is full; no watch panel yet.
  await expect(row(page, '02').locator('.seats-section-seats')).toHaveText('FULL');
  await expect(page.locator('.seats-watch-panel')).toHaveCount(0);

  // Watch Section 02 → panel appears, listing it as FULL.
  await row(page, '02').locator('.seats-watch-btn').click();
  await expect(page.locator('.seats-watch-head h4')).toHaveText('🔔 Watching (1)');
  const watchRow = page.locator('.seats-watch-row', { hasText: 'CSE220 Section 02' });
  await expect(watchRow).toBeVisible();
  await expect(watchRow.locator('.seats-watch-status')).toHaveText('FULL');

  // The row's toggle now reads as pressed.
  await expect(row(page, '02').locator('.seats-watch-btn')).toHaveAttribute('aria-pressed', 'true');

  // Remove it → panel disappears, toggle un-pressed.
  await watchRow.locator('.seats-watch-remove').click();
  await expect(page.locator('.seats-watch-panel')).toHaveCount(0);
  await expect(row(page, '02').locator('.seats-watch-btn')).toHaveAttribute('aria-pressed', 'false');
});

test('a watched section that frees up fires a seat-open alert', async ({ page }) => {
  const { setSeats } = await boot(page);

  // Watch Section 02 while full — seeded as "no seat", so no alert yet.
  await row(page, '02').locator('.seats-watch-btn').click();
  await expect(page.locator('.seats-watch-row', { hasText: 'CSE220 Section 02' })).toBeVisible();
  expect(await page.evaluate(() => window.__seatToasts.length)).toBe(0);

  // A seat frees up (30→29). Re-fetch via Refresh → the watcher should fire.
  setSeats(29);
  await page.locator('[data-action="seats:refresh"]').click();

  // In-app alert fired, naming the course/section.
  await expect.poll(() => page.evaluate(
    () => window.__seatToasts.map(t => t.msg).join('\n'),
  )).toContain('Seat open in CSE220 Section 02');

  // The Watching panel now reflects the freed seat.
  await expect(
    page.locator('.seats-watch-row', { hasText: 'CSE220 Section 02' }).locator('.seats-watch-status'),
  ).toHaveText('1 left');

  // Refreshing again while it stays open must NOT re-fire (edge-triggered).
  await page.locator('[data-action="seats:refresh"]').click();
  await expect(page.locator('.seats-source-badge')).toBeVisible(); // let the refresh settle
  expect(await page.evaluate(() => window.__seatToasts.length)).toBe(1);
});
