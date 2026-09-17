// e2e-shell/routine-section-list.spec.js
//
// #682: sort, filters and clash-hiding on the shell's section list — the part
// of the legacy tab that makes a 20-section course usable. The ordering and
// filter rules themselves are unit-tested (tests/routineSectionList.test.js);
// what these drive is the wiring, and the two things a student would call a
// bug: a list that empties with no explanation, and a pick that disappears
// because a filter was set after it was made.

import { expect, test } from '../e2e-support/authFixture.js';

// CSE110 §01 early Sunday, §02 late Monday (runs past 17:00), §03 full,
// §04 mid-morning Sunday. PHY111 §01 overlaps CSE110 §01 exactly.
function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day, start, end, seats) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: seats,
      roomName: '07A-01C',
      sectionSchedule: { classSchedules: [{ day, startTime: start, endTime: end }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY', '8:00', '9:20', 10),
          section(2, 'CSE110', '02', 'MONDAY', '16:00', '17:30', 5),
          section(3, 'CSE110', '03', 'TUESDAY', '11:00', '12:20', 40),
          section(4, 'CSE110', '04', 'SUNDAY', '11:00', '12:20', 39),
          section(5, 'PHY111', '01', 'SUNDAY', '8:00', '9:20', 10),
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
    await expect(page.getByTestId(`routine-course-${code.toUpperCase()}`)).toBeVisible();
  }
}

const sectionNames = (page, code) =>
  page.getByTestId(`routine-course-${code}`).locator('.routine-section-name').allTextContents();

test('the controls only appear once there is a list to control', async ({ page }) => {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  await expect(page.getByTestId('routine-controls')).toHaveCount(0);
  await expect(page.getByTestId('routine-filters')).toHaveCount(0);

  await gotoRoutineWith(page, 'CSE110');
  await expect(page.getByTestId('routine-controls')).toBeVisible();
});

test('sorting reorders the list, and a full section never leads it', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110');

  // Section number, the default: 01, 02, 04 — §03 is full, so it sinks.
  expect(await sectionNames(page, 'CSE110')).toEqual([
    'Section 01',
    'Section 02',
    'Section 04',
    'Section 03',
  ]);

  // Seats left: §02 (35) → §01 (30) → §04 (1), with the full §03 still last.
  await page.getByTestId('routine-sort-seats').click();
  expect(await sectionNames(page, 'CSE110')).toEqual([
    'Section 02',
    'Section 01',
    'Section 04',
    'Section 03',
  ]);

  // Earliest start: 08:00 → 11:00 → 16:00, full section last again.
  await page.getByTestId('routine-sort-time').click();
  expect(await sectionNames(page, 'CSE110')).toEqual([
    'Section 01',
    'Section 04',
    'Section 02',
    'Section 03',
  ]);
});

test('filters hide sections and say how many they hid', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110');

  await page.getByTestId('routine-filter-early').click();
  // §01 starts at 08:00; the rest survive.
  expect(await sectionNames(page, 'CSE110')).not.toContain('Section 01');
  await expect(page.getByTestId('routine-hidden-CSE110')).toContainText('1 filtered');

  // "No evening" additionally drops §02, which runs to 17:30.
  await page.getByTestId('routine-filter-evening').click();
  expect(await sectionNames(page, 'CSE110')).not.toContain('Section 02');
  await expect(page.getByTestId('routine-hidden-CSE110')).toContainText('2 filtered');

  // Avoiding Sunday drops §04 too, leaving only the full Tuesday section.
  await page.getByTestId('routine-avoid-SUNDAY').click();
  expect(await sectionNames(page, 'CSE110')).toEqual(['Section 03']);
});

test('filtering everything away says so instead of showing an empty course', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110');
  for (const day of ['SUNDAY', 'MONDAY', 'TUESDAY']) {
    await page.getByTestId(`routine-avoid-${day}`).click();
  }
  await expect(page.getByTestId('routine-sections-empty-CSE110')).toBeVisible();
  await expect(page.getByTestId('routine-hidden-CSE110')).toContainText('4 filtered');
});

test('a section you already picked survives a filter set afterwards', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110');
  await page.getByTestId('routine-course-CSE110').getByText('Section 01').click();

  // §01 starts at 08:00, so "No early" would hide it — but hiding the pick
  // would leave the grid showing a section the list denies exists.
  await page.getByTestId('routine-filter-early').click();
  expect(await sectionNames(page, 'CSE110')).toContain('Section 01');
  await expect(page.getByTestId('routine-hidden-CSE110')).toHaveCount(0);
});

test('hide-clashes drops the sections that fight another course, not its own', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'PHY111');
  // The toggle is pointless until something is picked, so it isn't offered.
  await expect(page.getByTestId('routine-hide-clash')).toHaveCount(0);

  await page.getByTestId('routine-course-PHY111').getByText('Section 01').click();
  await page.getByTestId('routine-hide-clash').click();

  // CSE110 §01 overlaps the PHY111 pick and goes; the rest of CSE110 stays,
  // and PHY111's own alternatives are not judged against its own pick.
  expect(await sectionNames(page, 'CSE110')).not.toContain('Section 01');
  await expect(page.getByTestId('routine-hidden-CSE110')).toContainText('1 clashing');
  expect(await sectionNames(page, 'PHY111')).toContain('Section 01');
});

test('the stats row counts courses, credits and clashes', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'PHY111');
  const controls = page.getByTestId('routine-controls');
  await expect(controls).toContainText('2 courses');
  await expect(controls).toContainText('0/2 set');
  await expect(controls).toContainText('✓ no clashes');

  await page.getByTestId('routine-course-CSE110').getByText('Section 01').click();
  await page.getByTestId('routine-course-PHY111').getByText('Section 01').click();
  await expect(controls).toContainText('2/2 set');
  await expect(controls).toContainText('1 clash');
});
