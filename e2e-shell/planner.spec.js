// e2e-shell/planner.spec.js
//
// #327: the Semester Planner on the React Router shell, against the built
// dist-shell/ output. Demo data keeps assertions deterministic: completed
// CSE110/ENG101/PHY111/CSE111/CSE220/MAT110 (CGPA 3.50 over 18 credits) and
// the seeded demo plan CSE221/MAT120/PHY112 (9 credits, all prereqs met;
// CSE221 carries the CSE230 soft-prereq note).

import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

async function openPlannerWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await navigateTo(page, 'Planner');
  await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
  return page.getByTestId('planner-page');
}

test('demo data: stats, the seeded plan, credits and the soft-prereq note', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);

  const stats = planner.getByTestId('planner-stats');
  await expect(stats.getByText('Passed')).toBeVisible();
  await expect(stats.locator('.pl-stat-val').first()).toHaveText('6'); // completed codes

  const plan = planner.getByTestId('planner-plan');
  await expect(plan.getByText('Your plan (3 courses)')).toBeVisible();
  for (const code of ['CSE221', 'MAT120', 'PHY112']) {
    await expect(plan.locator('.pl-code', { hasText: code })).toBeVisible();
  }
  await expect(plan.getByText('9 credits')).toBeVisible();
  await expect(plan.locator('.pl-warn-soft')).toHaveText('Recommended: CSE230'); // CSE221's sp
});

test('the impact preview projects the demo CGPA per assumed grade', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);
  const impact = planner.getByTestId('planner-impact');

  // 9 planned credits at A: (63 + 36) / 27 = 3.67, delta +0.17.
  await expect(impact.locator('.pl-impact-current')).toHaveText('3.50');
  await expect(impact.locator('.pl-impact-projected')).toHaveText('3.67');
  await expect(impact.locator('.pl-delta-up')).toHaveText('+0.17');

  // At B (3.0): (63 + 27) / 27 = 3.33, delta −0.17.
  await impact.getByLabel('Assumed grade for all planned courses').selectOption('B');
  await expect(impact.locator('.pl-impact-projected')).toHaveText('3.33');
  await expect(impact.locator('.pl-delta-down')).toHaveText('-0.17');
});

test('search, add, remove; the locked filter labels missing prereqs', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);

  // CSE230 has no prereq rule → addable; search narrows the list to it.
  await planner.getByLabel('Search available courses').fill('CSE230');
  const courses = planner.getByTestId('planner-courses');
  await courses.locator('.pl-course', { hasText: 'CSE230' }).getByRole('button', { name: '+ Add' }).click();
  await expect(
    planner.getByTestId('planner-plan').locator('.pl-code', { hasText: 'CSE230' }),
  ).toBeVisible();
  await expect(planner.getByText('Your plan (4 courses)')).toBeVisible();
  // An added course leaves the available list.
  await expect(courses.locator('.pl-course', { hasText: 'CSE230' })).toHaveCount(0);

  // Remove it again ('CSE230' as a row filter would also match CSE221's
  // "Recommended: CSE230" note — filter on the code chip instead).
  await planner
    .getByTestId('planner-plan')
    .locator('.pl-plan-row')
    .filter({ has: page.locator('.pl-code', { hasText: /^CSE230$/ }) })
    .getByRole('button', { name: '×' })
    .click();
  await expect(planner.getByText('Your plan (3 courses)')).toBeVisible();

  // CSE331 needs CSE220 (done) + CSE230 (not done) → locked.
  await planner.getByLabel('Search available courses').fill('CSE331');
  await planner.getByRole('button', { name: /^Locked \(/ }).click();
  const locked = courses.locator('.pl-course', { hasText: 'CSE331' });
  await expect(locked).toHaveClass(/pl-course--locked/);
  await expect(locked.getByText('Locked')).toBeVisible();
});

test('the prereq chain tree marks completed and missing courses', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);

  await planner.getByLabel('Search available courses').fill('CSE331');
  await planner
    .getByTestId('planner-courses')
    .locator('.pl-course', { hasText: 'CSE331' })
    .getByRole('button', { name: '🔗' })
    .click();

  const tree = planner.getByTestId('planner-tree');
  await expect(tree.getByText('Prerequisite chain for CSE331')).toBeVisible();
  await expect(tree.locator('.pl-tree-node', { hasText: 'CSE220' }).first()).toHaveClass(/pl-tree-node--done/);
  await expect(tree.locator('.pl-tree-node', { hasText: 'CSE230' }).first()).not.toHaveClass(/pl-tree-node--done/);
});

test('promote starts a running semester in the calculator and clears the plan', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);

  await planner.getByRole('button', { name: /Start Semester/ }).click();

  // Lands on /calculator with the prefilled running semester.
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  const container = page.locator('#semestersContainer');
  await expect(container.getByText('🎯 Projected')).toBeVisible();
  await expect(container.getByRole('combobox').nth(6)).toHaveValue(/CSE221/);

  // Back on the planner the plan is gone.
  await navigateTo(page, 'Planner');
  await expect(page.getByTestId('planner-plan')).toHaveCount(0);
});

test('promoting over an existing running semester asks and replaces it', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();
  await page.locator('.footer-btn-group').getByRole('button', { name: '🎯 Running Semester' }).click();
  await expect(container.getByText('🎯 Projected')).toBeVisible();

  await navigateTo(page, 'Planner');
  await page.getByTestId('planner-page').getByRole('button', { name: /Replace Running Semester/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();

  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  // Exactly one running semester, carrying the plan's three courses.
  await expect(container.getByText('🎯 Projected')).toHaveCount(1);
  await expect(container.getByRole('combobox').nth(6)).toHaveValue(/CSE221/);
});

test('a plan edit persists across a reload', async ({ page }) => {
  const planner = await openPlannerWithDemo(page);
  await planner.getByLabel('Search available courses').fill('CSE230');
  await planner
    .getByTestId('planner-courses')
    .locator('.pl-course', { hasText: 'CSE230' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await expect(planner.getByText('Your plan (4 courses)')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Your plan (4 courses)')).toBeVisible();
});

test('empty states: no setup at all, and summary-only data', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await navigateTo(page, 'Planner');
  await expect(page.getByText('Set up your department first')).toBeVisible();

  // Summary-only: totals exist but no completed courses.
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '📊 Start from CGPA' }).click();
  await container.getByPlaceholder('e.g. 3.30').fill('3.00');
  await container.getByPlaceholder('e.g. 45').fill('60');
  await container.getByPlaceholder('e.g. 42').fill('60');
  await container.getByRole('button', { name: 'Confirm →' }).click();

  await navigateTo(page, 'Planner');
  await expect(page.getByText('Add completed courses first')).toBeVisible();
});
