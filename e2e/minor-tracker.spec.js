// The legacy calculator's minor panel (#766): pick a minor, see the record
// measured against it, and find the choice still there after a reload — stored
// in the same `currentMinor` field the shell's /degree-progress reads.

import { expect, test } from '@playwright/test';

const course = (name, grade, credits = 3) => ({ name, credits, grade, retake: false });

const SEMESTERS = [
  {
    id: 0, name: 'Spring 2025', running: false,
    courses: [
      course('Principles of Mathematics (MAT111)', 'A'),
      course('Programming Language I (CSE110)', 'A-'),
      // Discharges "MAT 223 or CSE 330" — the one published alternative.
      course('Numerical Methods (CSE330)', 'B+'),
    ],
  },
  {
    id: 1, name: 'Summer 2025', running: false,
    courses: [
      course('Calculus I (MAT123)', 'F'),
      course('Complex Analysis (MAT341)', 'A'),
    ],
  },
  {
    id: 2, name: 'Fall 2025', running: true,
    courses: [course('Abstract Algebra (MAT311)', '')],
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.addInitScript(({ semesters }) => {
    if (sessionStorage.getItem('__shohoj_minor_spec')) return;
    sessionStorage.clear();
    sessionStorage.setItem('__shohoj_minor_spec', '1');
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify({
      currentDept: 'CSE',
      semesterCounter: semesters.length,
      startSeason: 'Spring',
      startYear: '2025',
      planCourses: [],
      semesters,
    }));
  }, { semesters: SEMESTERS });
});

test('picking a minor measures the record against it and survives a reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('signin-portal-resume').click();

  const panel = page.getByTestId('minor-tracker');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.minor-empty')).toBeVisible();

  await panel.getByTestId('minor-select').selectOption('MATH');

  await expect(panel.locator('.tracker-subtitle')).toHaveText('Minor in Mathematics · 27 credits');
  // MAT111 + CSE330-for-MAT223 on the core, MAT341 as an elective. The failed
  // MAT123 counts for nothing; MAT311 is in progress.
  const stats = panel.locator('.tracker-stat-val');
  await expect(stats.nth(0)).toHaveText('9 / 27');
  await expect(stats.nth(1)).toHaveText('2 / 7');
  await expect(stats.nth(2)).toHaveText('3 / 6');
  await expect(panel.locator('.tracker-stat-note')).toHaveText('3 cr in progress');

  const core = panel.getByTestId('minor-core-list');
  await expect(core.locator('.minor-req--earned')).toHaveCount(2);
  await expect(core.locator('.minor-req--earned').nth(1)).toContainText('CSE330');
  await expect(core.locator('.minor-req--in-progress')).toContainText('MAT311');
  await expect(core.locator('.minor-req--unmet').first()).toContainText('MAT123');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_cgpa_v1')));
  expect(saved.currentMinor).toBe('MATH');

  // The unlock lasts the session (signinPortal.js), so no resume click here.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('minor-select')).toHaveValue('MATH');
  await expect(page.getByTestId('minor-tracker').locator('.tracker-stat-val').first()).toHaveText('9 / 27');
});

test('clearing the minor saves an empty selection', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('signin-portal-resume').click();

  const select = page.getByTestId('minor-select');
  await select.selectOption('MATH');
  await select.selectOption('');

  await expect(page.getByTestId('minor-tracker').locator('.minor-empty')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_cgpa_v1')));
  expect(saved.currentMinor).toBe('');
});
