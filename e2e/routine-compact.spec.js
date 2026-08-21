import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Browser coverage for compact-day auto-suggest (#183): the "Compact days"
// toggle feeds a gap penalty into ranking, suggestion cards surface each
// combo's idle-gap time, and a 0-gap combo is flagged "compact". Mock feed so
// Firestore ratings stay unloaded (every section is unrated) and the only
// score differentiator is the idle gap.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// Distinct exam dates per course so no combo carries an exam clash — gaps are
// then the sole score differentiator, matching this fixture's intent.
function sec(over, midDate, finalDate) {
  return {
    courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    capacity: 30, consumedSeat: 5, faculties: 'ABC', roomName: 'R1',
    sectionSchedule: {
      midExamDate: midDate, midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      finalExamDate: finalDate, finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      classSchedules: over.classSchedules,
    },
    ...over,
  };
}

// AAA101 has one section (Sun 09:00–10:20). BBB102 has two: B1 back-to-back at
// 10:20–11:40 (0 gap) and B2 at 14:00–15:20 (220-min gap after AAA101). Same
// seat slack + no ratings, so the only thing separating the two combos is gaps.
const MOCK_FEED = [
  sec({ sectionId: 1, courseCode: 'AAA101', courseName: 'Alpha', sectionName: '01',
    classSchedules: [{ day: 'SUNDAY', startTime: '09:00:00', endTime: '10:20:00' }] }, '2026-07-26', '2026-09-13'),
  sec({ sectionId: 2, courseCode: 'BBB102', courseName: 'Beta', sectionName: '01',
    classSchedules: [{ day: 'SUNDAY', startTime: '10:20:00', endTime: '11:40:00' }] }, '2026-07-28', '2026-09-15'),
  sec({ sectionId: 3, courseCode: 'BBB102', courseName: 'Beta', sectionName: '02',
    classSchedules: [{ day: 'SUNDAY', startTime: '14:00:00', endTime: '15:20:00' }] }, '2026-07-28', '2026-09-15'),
];

async function boot(page) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.route('https://**/*', route => {
    if (route.request().url().startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(MOCK_FEED),
      });
    }
    return route.abort();
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, "routine");
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
  await expect(page.locator('#routineCourseInput')).toBeVisible();
  for (const code of ['AAA101', 'BBB102']) {
    await page.locator('#routineCourseInput').fill(code);
    await page.locator('[data-action="routine:addCourse"]').click();
    await expect(page.locator('.routine-course-block').filter({ hasText: code })).toBeVisible();
  }
}

const compactToggle = (page) => page.locator('[data-action="routine:toggleCompact"]');

test('Compact toggle is on by default and ranks the gap-free combo first', async ({ page }) => {
  await boot(page);
  await expect(compactToggle(page)).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-action="routine:suggest"]').click();
  await expect(page.locator('.routine-suggest-card')).toHaveCount(2);

  // Top card is the back-to-back combo, flagged "compact"; the other shows gaps.
  await expect(
    page.locator('.routine-suggest-card').first().locator('.routine-suggest-card-gap.is-compact'),
  ).toBeVisible();
  await expect(page.locator('.routine-suggest-card-gap', { hasText: 'gaps' })).toContainText('3h 40m gaps');
});

test('turning Compact off re-ranks live and stops penalizing gaps', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="routine:suggest"]').click();
  await expect(page.locator('.routine-suggest-card')).toHaveCount(2);

  const scoreOf = async (i) => {
    const txt = await page.locator('.routine-suggest-card').nth(i).locator('.routine-suggest-card-score').innerText();
    return parseFloat(txt.match(/-?\d+(?:\.\d+)?/)[0]); // keep the sign
  };
  // Compact on: the gap-free combo strictly outscores the gappy one.
  expect(await scoreOf(0)).toBeGreaterThan(await scoreOf(1));

  // Toggle off → panel re-suggests automatically; gaps no longer penalized, so
  // the two combos tie on score.
  await compactToggle(page).click();
  await expect(compactToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.routine-suggest-card')).toHaveCount(2);
  expect(await scoreOf(0)).toBeCloseTo(await scoreOf(1), 1);
});
