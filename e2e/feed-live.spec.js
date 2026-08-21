import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Browser coverage for the shared live-feed poller (js/ui/feedLive.js): seat
// counts and watch alerts must update on their own — no Refresh click — once a
// poll period elapses. Reuses the mock-CONNECT-feed approach from the other
// routine/seats specs, and drives time with Playwright's fake clock so the 90s
// cadence doesn't make the suite crawl.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
const POLL_MS = 90_000; // keep in sync with FEED_LIVE_POLL_MS in js/ui/feedLive.js

function sec(over) {
  return {
    courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    faculties: 'ABC', roomName: 'R1',
    sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00' }] },
    ...over,
  };
}

// CSE220: Section 01's taken count is driven by `consumed01`; Section 02 is
// driven by `consumed02` (starts full at 30/30) for the watch-alert case.
function feed(consumed01, consumed02) {
  return [
    sec({ sectionId: 1, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '01', capacity: 30, consumedSeat: consumed01 }),
    sec({ sectionId: 2, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '02', capacity: 30, consumedSeat: consumed02 }),
  ];
}

// Boot with a mutable feed and a fake clock installed before any app script
// runs (the poller captures setInterval at module init). Returns setters for
// each section's taken count, applied on the poller's next fetch.
async function boot(page) {
  let consumed01 = 10;
  let consumed02 = 30;
  await page.clock.install();
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
    window.__seatToasts = [];
    window._shohoj_showToast = (msg, isError) => window.__seatToasts.push({ msg, isError });
  });
  await page.route('https://**/*', route => {
    if (route.request().url().startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(feed(consumed01, consumed02)),
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
  return {
    setSeats01: (n) => { consumed01 = n; },
    setSeats02: (n) => { consumed02 = n; },
  };
}

function row(page, sectionName) {
  return page.locator('.seats-section-row', { hasText: `Section ${sectionName}` });
}

test('seat counts refresh on their own once a poll period elapses', async ({ page }) => {
  const { setSeats01 } = await boot(page);

  // Initial paint: Section 01 shows its 10/30 taken count.
  await expect(row(page, '01')).toContainText('10/30');

  // Seats fill up on USIS; nobody touches Refresh.
  setSeats01(28);
  await page.clock.fastForward(POLL_MS + 1_000);

  // The background poll repaints the row with the fresh count.
  await expect(row(page, '01')).toContainText('2 left');
});

test('a watch alert fires from the background poll, not just manual refresh', async ({ page }) => {
  const { setSeats02 } = await boot(page);

  // Watch the full Section 02 — seeded as "no seat", so no alert yet.
  await row(page, '02').locator('.seats-watch-btn').click();
  await expect(page.locator('.seats-watch-row', { hasText: 'CSE220 Section 02' })).toBeVisible();
  expect(await page.evaluate(() => window.__seatToasts.length)).toBe(0);

  // A seat frees up; the next background poll should catch the edge.
  setSeats02(29);
  await page.clock.fastForward(POLL_MS + 1_000);

  await expect.poll(() => page.evaluate(
    () => window.__seatToasts.map(t => t.msg).join('\n'),
  )).toContain('Seat open in CSE220 Section 02');
  await expect(
    page.locator('.seats-watch-row', { hasText: 'CSE220 Section 02' }).locator('.seats-watch-status'),
  ).toHaveText('1 left');
});

test('a live poll updates the routine tab section rows in place', async ({ page }) => {
  const { setSeats01 } = await boot(page);

  // Move to the Routine tab and add CSE220 — its section rows show live seats.
  await selectCalcTab(page, "routine");
  await page.locator('#routineCourseInput').fill('CSE220');
  await page.locator('[data-action="routine:addFromSuggest"]').click();
  const row01 = page.locator('.routine-section-row', { hasText: 'Section 01' });
  await expect(row01).toContainText('10/30');

  // Blur the search box (a focused input defers the live repaint on purpose),
  // then let a poll period pass with a fuller section.
  await page.locator('body').click();
  setSeats01(28);
  await page.clock.fastForward(POLL_MS + 1_000);

  await expect(row01).toContainText('2 left');
});
