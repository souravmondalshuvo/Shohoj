// e2e-shell/minor-route.spec.js
//
// #731: the minor tracker on /degree-progress — selection persists through the
// shared academic state, and requirements are checked against the student's
// own courses.

import { expect, test } from '../e2e-support/authFixture.js';

/**
 * Seed the academic state, optionally with a minor already chosen.
 *
 * Seeds only when the key is absent. addInitScript runs before page scripts on
 * EVERY navigation, a reload included, so an unconditional write would restore
 * the seed over whatever the app had just persisted — and the reload test would
 * be asserting against the fixture rather than against persistence.
 */
function seedState(page, { currentMinor = '', extraCourses = [] } = {}) {
  return page.addInitScript(
    ([minor, extra]) => {
      if (localStorage.getItem('shohoj_cgpa_v1')) return;
      localStorage.setItem(
        'shohoj_cgpa_v1',
        JSON.stringify({
          semesters: [
            {
              id: 1,
              name: 'Spring 2026',
              courses: [
                { name: 'Principles of Mathematics (MAT111)', credits: 3, grade: 'A' },
                { name: 'Calculus I (MAT123)', credits: 3, grade: 'B+' },
                ...extra,
              ],
            },
          ],
          startSeason: 'Spring',
          startYear: '2024',
          currentDept: 'CSE',
          currentMinor: minor,
          planCourses: [],
        }),
      );
    },
    [currentMinor, extraCourses],
  );
}

test('the minor section offers a picker even before a minor is chosen', async ({ page }) => {
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('minor-tracker')).toBeVisible();
  await expect(page.getByTestId('minor-empty')).toBeVisible();
  await expect(page.getByTestId('minor-select')).toHaveValue('');
  await expect(page.getByTestId('minor-core-list')).toHaveCount(0);
});

test('choosing the Math minor checks the student courses against its requirements', async ({
  page,
}) => {
  await seedState(page);
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('minor-select').selectOption('MATH');

  const tracker = page.getByTestId('minor-tracker');
  await expect(tracker).toContainText('Minor in Mathematics');
  await expect(tracker).toContainText('/ 27');
  // Two of the seven core courses are done: 6 of 27 credits.
  await expect(tracker).toContainText('Core Courses');
  await expect(page.getByTestId('minor-req-mat111')).toContainText('Earned');
  await expect(page.getByTestId('minor-req-mat111')).toContainText('A');
  await expect(page.getByTestId('minor-req-mat221')).toContainText('Not taken');
  // The published alternative is shown until one of the two is taken.
  await expect(page.getByTestId('minor-req-mat223')).toContainText('MAT223 or CSE330');
  // Provenance: these came off a departmental course guide, not a feed.
  await expect(tracker).toContainText('Course Guide for Math Minor Students');
});

test('CSE 330 satisfies the Numerical Analysis requirement and names itself', async ({ page }) => {
  await seedState(page, {
    currentMinor: 'MATH',
    extraCourses: [{ name: 'Numerical Methods (CSE330)', credits: 3, grade: 'A-' }],
  });
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });

  const requirement = page.getByTestId('minor-req-mat223');
  await expect(requirement).toContainText('CSE330');
  await expect(requirement).toContainText('Earned');
});

test('the chosen minor survives a reload', async ({ page }) => {
  await seedState(page);
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('minor-select').selectOption('MATH');
  await expect(page.getByTestId('minor-core-list')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('minor-select')).toHaveValue('MATH');
  await expect(page.getByTestId('minor-core-list')).toBeVisible();
});

test('an elective counts, and a core course never counts twice', async ({ page }) => {
  await seedState(page, {
    currentMinor: 'MATH',
    extraCourses: [
      // Core, and also inside the MAT 3XX elective pattern — it must be spent once.
      { name: 'Abstract Algebra (MAT311)', credits: 3, grade: 'A' },
      { name: 'Optimization (CSE402)', credits: 3, grade: 'B' },
    ],
  });
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('minor-req-mat311')).toContainText('Earned');
  const electives = page.getByTestId('minor-elective-list');
  await expect(electives).toContainText('CSE402');
  await expect(electives).not.toContainText('MAT311');
  // 3 core courses (9 cr) + 3 elective credits = 12 of 27.
  await expect(page.getByTestId('minor-tracker')).toContainText('/ 27');
  await expect(page.getByTestId('minor-tracker')).toContainText('15 credits remaining');
});
