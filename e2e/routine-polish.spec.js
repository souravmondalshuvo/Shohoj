import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Verifies the Routine Builder polish pass: numeric section ordering (full
// sections sink), a sort toggle, the column legend + humanized seat/exam text,
// fold-on-pick collapsing, and clash-aware dimming of alternative sections.
//
// Like routine-feed.spec.js this mocks the CONNECT CDN and aborts everything
// else, so faculty ratings (Firestore) stay unloaded — section/seat ordering
// and the rest don't depend on them.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

function slot(day, start, end) {
  return { startTime: start, endTime: end, day };
}
function section(over) {
  return {
    courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262,
    courseCredit: 3,
    sectionSchedule: {
      midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      classSchedules: [],
    },
    ...over,
  };
}

// CSE110 sections deliberately out of order in the feed (02, 04, 01, 03) with a
// FULL section (02) and a nearly-full one (04, 2 left). MAT110 Section 01 clashes with
// CSE110 Section 01 on Sunday morning; Section 02 does not.
const MOCK_FEED = [
  section({
    sectionId: 9002, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '02', capacity: 30, consumedSeat: 30, faculties: 'XYZ', roomName: '09B-11C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('MONDAY', '11:00:00', '12:20:00')] },
  }),
  section({
    sectionId: 9004, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '04', capacity: 30, consumedSeat: 28, faculties: 'LMN', roomName: '09C-12C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('TUESDAY', '16:00:00', '17:20:00')] },
  }),
  section({
    sectionId: 9001, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '01', capacity: 30, consumedSeat: 10, faculties: 'ABC', roomName: '09A-10C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '08:00:00', '09:20:00'), slot('TUESDAY', '08:00:00', '09:20:00')] },
  }),
  section({
    sectionId: 9003, courseCode: 'CSE110', courseName: 'PROGRAMMING LANGUAGE I',
    sectionName: '03', capacity: 30, consumedSeat: 5, faculties: 'DEF', roomName: '09D-13C',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '14:00:00', '15:20:00')] },
  }),
  section({
    sectionId: 9101, courseCode: 'MAT110', courseName: 'DIFFERENTIAL CALCULUS',
    sectionName: '01', capacity: 40, consumedSeat: 5, faculties: 'PQR', roomName: '08A-01C',
    sectionSchedule: { midExamDate: '2026-07-28', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-15', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('SUNDAY', '08:30:00', '09:50:00')] },
  }),
  section({
    sectionId: 9102, courseCode: 'MAT110', courseName: 'DIFFERENTIAL CALCULUS',
    sectionName: '02', capacity: 40, consumedSeat: 5, faculties: 'STU', roomName: '08B-02C',
    sectionSchedule: { midExamDate: '2026-07-28', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00', finalExamDate: '2026-09-15', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00', classSchedules: [slot('THURSDAY', '10:00:00', '11:20:00')] },
  }),
];

async function boot(page) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.route('https://**/*', route => {
    const url = route.request().url();
    if (url.startsWith(FEED_URL)) {
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
}

async function addCourse(page, code) {
  await page.locator('#routineCourseInput').fill(code);
  await page.locator('[data-action="routine:addCourse"]').click();
  await expect(page.locator('.routine-course-block').filter({ hasText: code })).toBeVisible();
}

function sectionNames(block) {
  return block.locator('.routine-section-row .routine-section-name').allTextContents();
}

test('sections render in numeric order with full sections sunk to the bottom', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  const block = page.locator('.routine-course-block', { hasText: 'CSE110' });

  // Feed order is 02,04,01,03 — default sort is numeric, and the FULL Section 02 sinks.
  const names = (await sectionNames(block)).map(s => s.trim());
  expect(names).toEqual(['Section 01', 'Section 03', 'Section 04', 'Section 02']);
});

test('column legend and humanized seat/exam text are shown', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  const block = page.locator('.routine-course-block', { hasText: 'CSE110' });

  // Legend row labels the otherwise-cryptic columns.
  await expect(block.locator('.routine-section-head')).toContainText('Seats');
  await expect(block.locator('.routine-section-head')).toContainText('Mid · Final');

  // Seats: full → FULL, nearly-full → "N left", roomy → taken/cap.
  const seats = (await block.locator('.routine-section-seats').allTextContents()).map(s => s.trim());
  expect(seats).toContain('FULL');     // Section 02 30/30
  expect(seats).toContain('2 left');   // Section 04 28/30
  expect(seats).toContain('10/30');    // Section 01 10/30

  // Exam dates are humanized (no raw ISO strings).
  await expect(block.locator('.routine-section-row').first().locator('.routine-section-exam'))
    .toContainText('Mid Jul 26 · Final Sep 13');
});

test('sort toggle reorders sections by seats available', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  const block = page.locator('.routine-course-block', { hasText: 'CSE110' });

  await page.locator('[data-action="routine:setSort"][data-sort="seats"]').click();
  // Seats left desc: Section 03 (25), Section 01 (20), Section 04 (2), then FULL Section 02.
  const names = (await sectionNames(block)).map(s => s.trim());
  expect(names).toEqual(['Section 03', 'Section 01', 'Section 04', 'Section 02']);
});

test('picking a section folds the course and Change re-expands it', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');

  // Pick Section 01 (sectionId 9001).
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  const collapsed = page.locator('.routine-course-block--collapsed', { hasText: 'CSE110' });
  await expect(collapsed).toBeVisible();
  await expect(collapsed).toContainText('Section 01');
  // Section rows are hidden while collapsed.
  await expect(page.locator('.routine-course-block', { hasText: 'CSE110' }).locator('.routine-section-row')).toHaveCount(0);

  // Change re-opens the section list.
  await collapsed.locator('[data-action="routine:toggleExpand"]').click();
  await expect(page.locator('.routine-course-block', { hasText: 'CSE110' }).locator('.routine-section-row').first()).toBeVisible();
});

test('sections clashing with a current pick are flagged as candidate clashes', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  await addCourse(page, 'MAT110');

  // Resolve CSE110 Section 01 (Sun 08:00–09:20). MAT110 Section 01 (Sun 08:30) now clashes.
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  const mat = page.locator('.routine-course-block', { hasText: 'MAT110' });
  await expect(mat.locator('.routine-section-row[data-sid="9101"]')).toHaveClass(/routine-section--candclash/);
  await expect(mat.locator('.routine-section-row[data-sid="9101"]')).toContainText('clash');
  // The non-clashing Section 02 stays normal.
  await expect(mat.locator('.routine-section-row[data-sid="9102"]')).not.toHaveClass(/routine-section--candclash/);

  // The status bar reflects two picked courses and total credits.
  await expect(page.locator('.routine-controls')).toContainText('6 cr');
});

test('Hide clashes removes clashing alternatives from the list', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  await addCourse(page, 'MAT110');
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  await page.locator('[data-action="routine:toggleHideClash"]').click();
  const mat = page.locator('.routine-course-block', { hasText: 'MAT110' });
  // Clashing Section 01 is hidden; Section 02 remains, with a note about what was hidden.
  await expect(mat.locator('.routine-section-row[data-sid="9101"]')).toHaveCount(0);
  await expect(mat.locator('.routine-section-row[data-sid="9102"]')).toBeVisible();
  await expect(mat.locator('.routine-section-hidden')).toContainText('1 clashing section hidden');
});

// Where a class actually meets is the point of the routine, so the room rides
// both the weekly grid block and the folded course row — not just the tooltip.
test('the weekly grid and the folded course row both name the room', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'CSE110');
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  // Section 01 meets Sun + Tue, both in 09A-10C.
  const rooms = page.locator('.routine-grid .routine-grid-block-room');
  await expect(rooms).toHaveCount(2);
  await expect(rooms.first()).toHaveText('09A-10C');
  // The block keeps its time alongside the room.
  await expect(page.locator('.routine-grid-block').first()).toContainText('8:00 AM–9:20 AM');

  // ...and none of it is clipped, in either direction. Both regressions here
  // were a block promising text it could not show: #580 lost the room off the
  // bottom of a 40px slot, then #585 truncated the time by sharing a line with
  // the room. Assert the geometry, not just the text.
  const clipped = await page.locator('.routine-grid-block').evaluateAll((els) => {
    const bad = [];
    for (const el of els) {
      const code = el.querySelector('.routine-grid-block-code')?.textContent?.trim();
      // clientHeight, not getBoundingClientRect(): the rect reports the
      // TRANSFORMED box, and the grid reveals with a scale animation, so a
      // block measured mid-reveal reads as ~1px shorter than the content it
      // comfortably fits — a clip that is not there. Layout against layout.
      if (el.scrollHeight > el.clientHeight + 0.5) bad.push(`${code}: vertical`);
      for (const line of el.querySelectorAll('div, span')) {
        if (line.clientWidth > 0 && line.scrollWidth > line.clientWidth + 0.5) {
          bad.push(`${code}: "${line.textContent.trim()}" needs ${line.scrollWidth}px, has ${line.clientWidth}px`);
        }
      }
    }
    return bad;
  });
  expect(clipped).toEqual([]);

  const collapsed = page.locator('.routine-course-block--collapsed', { hasText: 'CSE110' });
  await expect(collapsed.locator('.routine-collapsed-room')).toHaveText('09A-10C');
});

// The dim overlay marks "today" in the weekly grid. CSE110 Section 01 meets
// Sun + Tue, so the grid shows exactly those two day columns.
test('on a class day, only today\'s column stays bright', async ({ page }) => {
  await boot(page);
  await page.clock.setFixedTime(new Date('2026-07-19T10:00:00')); // a Sunday
  await addCourse(page, 'CSE110');
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  const grid = page.locator('.routine-grid');
  await expect(grid.locator('.routine-grid-day-header')).toHaveCount(2);
  await expect(grid.locator('.routine-grid-day-header--today')).toHaveText('Sun');
  // Tue gets the wash; Sun (today) stays bright.
  await expect(grid.locator('.routine-grid-dim-col')).toHaveCount(1);
});

test('on an off-day, every column is dimmed so it doesn\'t read as "class today"', async ({ page }) => {
  await boot(page);
  await page.clock.setFixedTime(new Date('2026-07-18T10:00:00')); // a Saturday — no classes
  await addCourse(page, 'CSE110');
  await page.locator('.routine-section-row[data-sid="9001"]').click();

  const grid = page.locator('.routine-grid');
  await expect(grid.locator('.routine-grid-day-header')).toHaveCount(2);
  await expect(grid.locator('.routine-grid-day-header--today')).toHaveCount(0);
  // No bright column: both Sun and Tue are washed.
  await expect(grid.locator('.routine-grid-dim-col')).toHaveCount(2);
});
