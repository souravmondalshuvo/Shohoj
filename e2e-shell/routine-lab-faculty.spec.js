// e2e-shell/routine-lab-faculty.spec.js
//
// #914 on the shell: a section with a lab names the lab's own faculty. The feed
// publishes it apart from the theory faculty (labFaculties) — often two people,
// not always including the theory faculty, and TBA until assigned. Legacy's
// section list grew a quieter "LAB …" line for it; this is the shell's copy of
// that line, and the grid's lab block saying the same names on hover.

import { expect, test } from '../e2e-support/authFixture.js';

// CSE221 §12: theory TAP, Saturday lab not yet assigned. §13: no lab at all.
// EEE103 §06: theory SAIF, lab run by two other faculty.
function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (over) => ({
      capacity: 36,
      consumedSeat: 10,
      sectionSchedule: { classSchedules: over.classSchedules },
      ...over,
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section({
            sectionId: 9201, courseCode: 'CSE221', sectionName: '12', faculties: 'TAP',
            roomName: '08H-22C',
            classSchedules: [{ day: 'SUNDAY', startTime: '11:00', endTime: '12:20' }],
            labSchedules: [{ day: 'SATURDAY', startTime: '14:00', endTime: '16:50' }],
            labFaculties: 'TBA', labRoomName: '09B-11L',
          }),
          section({
            sectionId: 9202, courseCode: 'CSE221', sectionName: '13', faculties: 'FGZ',
            roomName: '10B-18C',
            classSchedules: [{ day: 'MONDAY', startTime: '14:00', endTime: '15:20' }],
          }),
          section({
            sectionId: 9301, courseCode: 'EEE103', sectionName: '06', faculties: 'SAIF',
            roomName: '07A-01C',
            classSchedules: [{ day: 'MONDAY', startTime: '8:00', endTime: '9:20' }],
            labSchedules: [{ day: 'THURSDAY', startTime: '8:00', endTime: '10:50' }],
            labFaculties: 'AHFA,SMC', labRoomName: '07B-12L',
          }),
        ],
      }),
    );
  });
}

async function gotoRoutineWith(page, ...codes) {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  for (const code of codes) {
    await page.getByTestId('routine-course-input').fill(code);
    await page.getByTestId('routine-add-btn').click();
    await expect(page.getByTestId(`routine-course-${code}`)).toBeVisible();
  }
}

const sectionRow = (page, code, name) =>
  page.getByTestId(`routine-course-${code}`).locator('.routine-section', { hasText: `Section ${name}` });

test('a section with a lab names the lab faculty under the theory faculty', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE221', 'EEE103');

  // Unassigned: the theory faculty is known, the rest is TBA.
  await expect(sectionRow(page, 'CSE221', '12').getByTestId('routine-section-labfac'))
    .toHaveText('Lab TAP, TBA');
  // Assigned: both lab faculty, and not the theory faculty who isn't on it.
  await expect(sectionRow(page, 'EEE103', '06').getByTestId('routine-section-labfac'))
    .toHaveText('Lab AHFA, SMC');
  // No lab, no line.
  await expect(sectionRow(page, 'CSE221', '13').getByTestId('routine-section-labfac'))
    .toHaveCount(0);
});

test('the grid lab block names the lab faculty on hover', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE221');
  await sectionRow(page, 'CSE221', '12').click();

  const blocks = page.locator('.routine-block', { hasText: 'CSE221' });
  await expect(blocks).toHaveCount(2);
  await expect(blocks.filter({ hasText: '09B-11L' })).toHaveAttribute('title', /· TAP, TBA · 09B-11L$/);
  await expect(blocks.filter({ hasText: '08H-22C' })).toHaveAttribute('title', /· TAP · 08H-22C$/);
});
