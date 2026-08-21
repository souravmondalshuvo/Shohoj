import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Browser-level coverage for the recent Routine Builder feature work:
//   - section time filters (avoid-day, no-early)            [#164]
//   - keyboard navigation of the course-search dropdown     [#162]
//   - shareable ?routine= link restore                      [#158]
//   - mobile agenda view replacing the grid                 [#160]
//   - side-by-side tiling of overlapping (clashing) blocks  [#152]
//
// Reuses the mock-CONNECT-feed approach from routine-polish.spec.js so faculty
// ratings (Firestore) stay unloaded and behavior is deterministic.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

function slot(day, start, end) {
  return { startTime: start, endTime: end, day };
}
function section(over) {
  return {
    courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionSchedule: {
      midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      classSchedules: [],
    },
    ...over,
  };
}

// CSE110: Section 01 Sun+Tue 08:00 (early, Sunday), Section 02 Mon 11:00 (FULL), Section 03 Sun 14:00,
// Section 04 Tue 16:00. MAT110: Section 01 Sun 08:30 (overlaps CSE110 Section 01 on Sunday morning),
// Section 02 Thu 10:00.
const MOCK_FEED = [
  section({ sectionId: 9001, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '01', capacity: 30, consumedSeat: 10, faculties: 'ABC', roomName: '09A-10C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '08:00:00', '09:20:00'), slot('TUESDAY', '08:00:00', '09:20:00')] } }),
  section({ sectionId: 9002, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '02', capacity: 30, consumedSeat: 30, faculties: 'XYZ', roomName: '09B-11C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('MONDAY', '11:00:00', '12:20:00')] } }),
  section({ sectionId: 9003, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '03', capacity: 30, consumedSeat: 5, faculties: 'DEF', roomName: '09D-13C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '14:00:00', '15:20:00')] } }),
  section({ sectionId: 9004, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '04', capacity: 30, consumedSeat: 5, faculties: 'LMN', roomName: '09C-12C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('TUESDAY', '16:00:00', '17:20:00')] } }),
  section({ sectionId: 9101, courseCode: 'MAT110', courseName: 'DIFFERENTIAL CALCULUS',
    sectionName: '01', capacity: 40, consumedSeat: 5, faculties: 'PQR', roomName: '08A-01C',
    sectionSchedule: { midExamDate: '2026-07-28', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-15', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '08:30:00', '09:50:00')] } }),
  section({ sectionId: 9102, courseCode: 'MAT110', courseName: 'DIFFERENTIAL CALCULUS',
    sectionName: '02', capacity: 40, consumedSeat: 5, faculties: 'STU', roomName: '08B-02C',
    sectionSchedule: { midExamDate: '2026-07-28', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-15', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('THURSDAY', '10:00:00', '11:20:00')] } }),
];

async function setupFeed(page) {
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
}

async function boot(page) {
  await setupFeed(page);
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, "routine");
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
  await expect(page.locator('#routineCourseInput')).toBeVisible();
}

async function addCourse(page, code) {
  await page.locator('#routineCourseInput').fill(code);
  await page.locator('[data-action="routine:addCourse"]').click();
  await expect(page.locator('.routine-course-block').filter({ hasText: code })).toBeVisible();
}

function cseBlock(page) {
  return page.locator('.routine-course-block', { hasText: 'CSE110' });
}

test('avoid-day filter hides every section scheduled on that day', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  // Section 01 (Sun+Tue) and Section 03 (Sun) have Sunday slots; Section 02 (Mon) and Section 04 (Tue) don't.
  await page.locator('[data-action="routine:toggleAvoidDay"][data-day="SUNDAY"]').click();
  const block = cseBlock(page);
  await expect(block.locator('.routine-section-row[data-sid="9001"]')).toHaveCount(0);
  await expect(block.locator('.routine-section-row[data-sid="9003"]')).toHaveCount(0);
  await expect(block.locator('.routine-section-row[data-sid="9002"]')).toBeVisible();
  await expect(block.locator('.routine-section-row[data-sid="9004"]')).toBeVisible();
  await expect(block.locator('.routine-section-hidden')).toContainText('filtered');
});

test('no-early filter hides sections starting before 9:00 AM', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  await page.locator('[data-action="routine:toggleFilterEarly"]').click();
  const block = cseBlock(page);
  // Section 01 starts 08:00 → hidden; the later sections remain.
  await expect(block.locator('.routine-section-row[data-sid="9001"]')).toHaveCount(0);
  await expect(block.locator('.routine-section-row[data-sid="9003"]')).toBeVisible();
});

test('keyboard: type, ArrowDown, Enter adds the highlighted course', async ({ page }) => {
  await boot(page);
  const input = page.locator('#routineCourseInput');
  await input.click();
  await input.fill('CSE');
  // Dropdown should list CSE110 as an option.
  await expect(page.locator('#routineSuggestions .routine-suggest-item')).toHaveCount(1);
  await input.press('ArrowDown');
  await expect(page.locator('#routine-sugg-0')).toHaveClass(/is-active/);
  await input.press('Enter');
  await expect(page.locator('.routine-course-block').filter({ hasText: 'CSE110' })).toBeVisible();
});

test('a ?routine= link restores the encoded picks on load', async ({ page }) => {
  await setupFeed(page);
  await unlockCalculator(page);
  await page.goto('/?routine=CSE110-9001#calculator/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
  // CSE110 Section 01 should be restored and folded to its collapsed summary line.
  const collapsed = page.locator('.routine-course-block--collapsed', { hasText: 'CSE110' });
  await expect(collapsed).toBeVisible();
  await expect(collapsed).toContainText('Section 01');
  // The shared param is stripped from the URL after applying.
  await expect.poll(() => page.evaluate(() => location.search)).toBe('');
});

test('mobile viewport shows the agenda and hides the grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await boot(page);
  await addCourse(page, 'CSE110');
  await page.locator('.routine-section-row[data-sid="9001"]').click(); // pick a section → grid/agenda render
  await expect(page.locator('.routine-agenda')).toBeVisible();
  await expect(page.locator('.routine-grid-wrap')).toBeHidden();
  // Section 01 meets on both Sunday and Tuesday, so it appears once per day — assert the first.
  await expect(page.locator('.routine-agenda-item').filter({ hasText: 'CSE110' }).first()).toBeVisible();
});

test('overlapping picks render as side-by-side split blocks', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  await addCourse(page, 'MAT110');
  // CSE110 Section 01 (Sun 08:00–09:20) and MAT110 Section 01 (Sun 08:30–09:50) overlap.
  await cseBlock(page).locator('.routine-section-row[data-sid="9001"]').click();
  await page.locator('.routine-course-block', { hasText: 'MAT110' })
    .locator('.routine-section-row[data-sid="9101"]').click();
  // Both Sunday-morning blocks should be tiled side-by-side.
  await expect(page.locator('.routine-grid-block--split')).toHaveCount(2);
});
