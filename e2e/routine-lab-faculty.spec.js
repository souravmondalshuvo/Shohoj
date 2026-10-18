import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// A lab block names the lab's own faculty. The feed publishes it separately
// from the theory faculty (labFaculties) — often two people, not always
// including the theory faculty, and TBA until the university assigns them —
// and the grid used to label every lab with the theory faculty alone.
//
// Like routine-polish.spec.js this mocks the CONNECT CDN and aborts everything
// else, so faculty ratings (Firestore) stay unloaded and no badge is drawn.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

function slot(day, start, end) {
  return { startTime: start, endTime: end, day };
}
function section(over) {
  return {
    courseId: 1, sectionType: 'OTHER', semesterSessionId: 20262, courseCredit: 3,
    capacity: 36, consumedSeat: 10,
    ...over,
    sectionSchedule: {
      classStartDate: '2026-06-09', classEndDate: '2026-09-08',
      classSchedules: over.classSchedules,
    },
  };
}

// CSE221 §12 as the live feed has it today: theory TAP, lab not yet assigned.
// EEE103 §06: theory SAIF, lab run by two other faculty.
const MOCK_FEED = [
  section({
    sectionId: 9201, courseCode: 'CSE221', courseName: 'ALGORITHMS', sectionName: '12',
    faculties: 'TAP', roomName: '08H-22C',
    classSchedules: [slot('SUNDAY', '11:00:00', '12:20:00'), slot('TUESDAY', '11:00:00', '12:20:00')],
    labSchedules: [slot('SATURDAY', '14:00:00', '16:50:00')],
    labFaculties: 'TBA', labRoomName: '09B-11L',
  }),
  // A CSE221 section with no lab, so the list has a row that must not grow one.
  section({
    sectionId: 9202, courseCode: 'CSE221', courseName: 'ALGORITHMS', sectionName: '13',
    faculties: 'FGZ', roomName: '10B-18C',
    classSchedules: [slot('MONDAY', '14:00:00', '15:20:00')],
  }),
  section({
    sectionId: 9301, courseCode: 'EEE103', courseName: 'CIRCUITS I', sectionName: '06',
    faculties: 'SAIF', roomName: '07A-01C',
    classSchedules: [slot('MONDAY', '08:00:00', '09:20:00')],
    labSchedules: [slot('THURSDAY', '08:00:00', '10:50:00')],
    labFaculties: 'AHFA,SMC', labRoomName: '07B-12L',
  }),
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
  await page.clock.setFixedTime(new Date('2026-07-19T10:00:00'));
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, 'routine');
  await expect(page.locator('#routineCourseInput')).toBeVisible();
}

async function pick(page, code, sectionId) {
  await page.locator('#routineCourseInput').fill(code);
  await page.locator('[data-action="routine:addCourse"]').click();
  await page.locator(`[data-action="routine:pickSection"][data-sid="${sectionId}"]`).click();
}

function block(page, code, time) {
  return page.locator('.routine-grid-block').filter({ hasText: code }).filter({ hasText: time });
}

test('a lab block names its own faculty, a theory block the theory faculty', async ({ page }) => {
  await boot(page);
  await pick(page, 'CSE221', 9201);
  await pick(page, 'EEE103', 9301);

  // Unassigned lab: the theory faculty is known, the rest is TBA.
  const cseLab = block(page, 'CSE221', '2:00');
  await expect(cseLab.locator('.routine-grid-block-meta')).toHaveText('TAP, TBA · Sec 12');
  await expect(cseLab).toHaveAttribute('aria-label', /CSE221 Section 12 lab .* TAP, TBA/);
  const cseTheory = block(page, 'CSE221', '11:00').first();
  await expect(cseTheory.locator('.routine-grid-block-meta')).toHaveText('TAP · Sec 12');

  // Assigned lab: both lab faculty, and not the theory faculty who isn't on it.
  const eeeLab = block(page, 'EEE103', '8:00 AM–10:50');
  await expect(eeeLab.locator('.routine-grid-block-meta')).toHaveText('AHFA, SMC · Sec 06');
  const eeeTheory = block(page, 'EEE103', '9:20');
  await expect(eeeTheory.locator('.routine-grid-block-meta')).toHaveText('SAIF · Sec 06');
});

test('the section list and the folded course row name the lab faculty too', async ({ page }) => {
  await boot(page);
  await page.locator('#routineCourseInput').fill('CSE221');
  await page.locator('[data-action="routine:addCourse"]').click();

  const row = (sid) => page.locator(`.routine-section-row[data-sid="${sid}"]`);
  await expect(row(9201).locator('.routine-section-labfac')).toHaveText('Lab TAP, TBA');
  await expect(row(9201).locator('.routine-section-faculty')).toHaveAttribute('title', 'Faculty: TAP · Lab: TAP, TBA');
  await expect(row(9202).locator('.routine-section-labfac')).toHaveCount(0);

  await row(9201).click();
  const folded = page.locator('.routine-course-block--collapsed', { hasText: 'CSE221' });
  await expect(folded.locator('.routine-collapsed-fac')).toHaveText('TAP');
  await expect(folded.locator('.routine-collapsed-labfac')).toHaveText('Lab TAP, TBA');

  await pick(page, 'EEE103', 9301);
  const eee = page.locator('.routine-course-block--collapsed', { hasText: 'EEE103' });
  await expect(eee.locator('.routine-collapsed-labfac')).toHaveText('Lab AHFA, SMC');
});

test('the calendar export gives a lab its own faculty, room and title', async ({ page }) => {
  await boot(page);
  await pick(page, 'CSE221', 9201);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="routine:calendar"]').click(),
  ]);
  const fs = await import('node:fs/promises');
  const ics = await fs.readFile(await download.path(), 'utf8');
  // The event's own lines, before its alarm (which has a DESCRIPTION too).
  const events = ics.split('BEGIN:VEVENT').slice(1).map((e) => e.split('BEGIN:VALARM')[0]);
  const lab = events.find((e) => e.includes('SUMMARY:CSE221 (Section 12) lab'));
  expect(lab).toBeTruthy();
  expect(lab).toContain('LOCATION:09B-11L');
  expect(lab).toContain('DESCRIPTION:Lab faculty: TAP\\, TBA');
  const theory = events.filter((e) => e.includes('SUMMARY:CSE221 (Section 12) class'));
  expect(theory).toHaveLength(2);
  for (const e of theory) {
    expect(e).toContain('LOCATION:08H-22C');
    expect(e).toContain('DESCRIPTION:Faculty: TAP');
  }
});
