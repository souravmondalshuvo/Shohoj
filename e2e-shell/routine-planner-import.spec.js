// e2e-shell/routine-planner-import.spec.js
//
// #684: the way in from the Semester Planner. A student who has planned a
// semester should not have to retype its course codes into the routine picker.
//
// The resolver is unit-tested (tests/routinePlannerImport.test.js); what this
// drives is the wiring — that the shell reads the plan from calculator state
// rather than legacy's window bridge, and that importing is additive: it never
// disturbs a section already chosen.

import { expect, test } from '../e2e-support/authFixture.js';

// CSE110 and MAT110 are offered; PHY111 is planned but not in the feed.
function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName: '07A-01C',
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY'),
          section(2, 'CSE110', '02', 'MONDAY'),
          section(3, 'MAT110', '01', 'TUESDAY'),
        ],
      }),
    );
  });
}

function seedPlan(page, planCourses) {
  return page.addInitScript((courses) => {
    localStorage.setItem(
      'shohoj_cgpa_v1',
      JSON.stringify({
        semesters: [],
        startSeason: 'Spring',
        startYear: '2024',
        currentDept: 'CSE',
        planCourses: courses,
      }),
    );
  }, planCourses);
}

async function gotoRoutine(page, plan) {
  await seedFeed(page);
  await seedPlan(page, plan);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
}

test('no plan, no button — it would import nothing', async ({ page }) => {
  await gotoRoutine(page, []);
  await expect(page.getByTestId('routine-plan-import')).toHaveCount(0);
});

test('the button counts the plan and imports what CONNECT offers', async ({ page }) => {
  await gotoRoutine(page, ['CSE110', 'MAT110', 'PHY111']);

  const button = page.getByTestId('routine-plan-import');
  await expect(button).toContainText('Import from Planner (3)');
  await button.click();

  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();
  // Not offered this semester, so it is named rather than silently dropped.
  await expect(page.getByTestId('routine-course-PHY111')).toHaveCount(0);
  const note = page.getByTestId('routine-plan-note');
  await expect(note).toContainText('Added 2 courses');
  await expect(note).toContainText('PHY111');
  await expect(note).toContainText('not offered this semester');
});

test('importing leaves a section already chosen alone', async ({ page }) => {
  await gotoRoutine(page, ['CSE110', 'MAT110']);

  // Add CSE110 by hand and pick its Monday section first.
  await page.getByTestId('routine-course-input').fill('CSE110');
  await page.getByTestId('routine-add-btn').click();
  await page.getByTestId('routine-course-CSE110').getByText('Section 02').click();

  await page.getByTestId('routine-plan-import').click();

  // The pick survives — re-adding the course would have cleared it — and the
  // summary says the course was already there rather than claiming a fresh add.
  const picked = page.getByTestId('routine-course-CSE110').locator('.routine-section--picked');
  await expect(picked).toContainText('Section 02');
  const note = page.getByTestId('routine-plan-note');
  await expect(note).toContainText('Added 1 course');
  await expect(note).toContainText('1 already in routine');
});

test('a plan with nothing on offer says so rather than looking broken', async ({ page }) => {
  await gotoRoutine(page, ['PHY111']);
  await page.getByTestId('routine-plan-import').click();
  await expect(page.getByTestId('routine-plan-note')).toContainText('not offered this semester');
  await expect(page.getByTestId('routine-courses')).toHaveCount(0);
});

test('imported picks survive a reload, under the semester they were made in', async ({ page }) => {
  await gotoRoutine(page, ['CSE110', 'MAT110']);
  await page.getByTestId('routine-plan-import').click();
  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();
  // The note is about the action, not the state, so it does not come back.
  await expect(page.getByTestId('routine-plan-note')).toHaveCount(0);
});
