// e2e-shell/calculator-results.spec.js
//
// Phase 5D: the bridge-driven CGPA results section on the React Router shell's
// /calculator route, against the built dist-shell/ output. Covers the journey
// the results exist for: an empty state that invites entry, live headline /
// meter / standing / credit totals as grades land, the incomplete-grades
// warning, recomputation from persisted state after a reload, and an axe scan
// of the whole results section.
//
// Like the sibling shell specs, the route is reached by loading the built index
// and navigating in-app (a deep link 404s on a static server — base/basename
// mismatch tracked separately).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../e2e-support/authFixture.js';

// A stable, well-known BRACU course present in the shipped catalogue (3 credits).
const KNOWN_CODE = 'CSE110';
const SECOND_CODE = 'MAT110';

async function openCalculator(page, { clear = true } = {}) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  if (clear) await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.getByTestId('calculator-results');
}

// Adds a course to the calculator. The first call creates the semester via the
// empty-state button; later calls add a row to that semester (the shell has no
// add-another-semester control yet — the legacy footer button is a later
// Phase 5 increment).
async function addCourse(page, code, { gradePoint = null } = {}) {
  const container = page.locator('#semestersContainer');
  if ((await container.locator('.semester-block').count()) === 0) {
    await container.getByRole('button', { name: '+ Add semester' }).click();
  } else {
    await container.getByRole('button', { name: '+ Add course' }).click();
  }
  const input = container.getByRole('combobox').last();
  await input.click();
  await input.fill(code);
  await container.getByRole('option', { name: new RegExp(code) }).first().click();
  if (gradePoint !== null) {
    const gpInput = container.getByPlaceholder('0.0 – 4.0').last();
    await gpInput.fill(gradePoint);
    await gpInput.blur();
  }
}

test('empty calculator shows the invite state: no figure, empty meter, no standing', async ({ page }) => {
  const results = await openCalculator(page);

  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('—');
  await expect(page.locator('.calc-header .cgpa-label')).toHaveText('Current CGPA');
  await expect(results.locator('.meter-status')).toHaveText('Add your courses to get started.');
  await expect(results.locator('.standing-box')).toHaveCount(0);
  await expect(results.locator('.incomplete-warning')).toHaveCount(0);
  await expect(results.locator('.footer-stat').first()).toContainText('Credits Attempted: 0');
});

test('grading a course updates headline, meter, standing and credit totals live', async ({ page }) => {
  const results = await openCalculator(page);
  await addCourse(page, KNOWN_CODE, { gradePoint: '4' });

  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('4.00');
  await expect(page.locator('.calc-header .cgpa-label')).toHaveText('Current CGPA');
  await expect(results.locator('.meter-status')).toContainText('Outstanding!');
  await expect(results.locator('.meter-status')).toContainText('4.00');

  const standing = results.locator('.standing-box');
  await expect(standing).toBeVisible();
  await expect(standing.locator('.standing-title')).toHaveText('Perfect Standing');

  await expect(results.locator('.footer-stat').nth(0)).toContainText('Credits Attempted: 3');
  await expect(results.locator('.footer-stat').nth(1)).toContainText('Credits Earned: 3');

  // Results recompute from persisted state alone after a reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('4.00');
});

test('a named course without a grade raises the incomplete warning', async ({ page }) => {
  const results = await openCalculator(page);
  await addCourse(page, KNOWN_CODE, { gradePoint: '4' });
  await addCourse(page, SECOND_CODE); // named, ungraded, same semester

  const warning = results.locator('.incomplete-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('1 semester has missing grades');
});

test('the results section has no serious/critical accessibility violations', async ({ page }) => {
  await openCalculator(page);
  await addCourse(page, KNOWN_CODE, { gradePoint: '4' });

  const scan = await new AxeBuilder({ page })
    .include('[data-testid="calculator-results"]')
    // The shell intentionally ships no visual system yet (Phase 3 note), so
    // color-contrast is out of scope here; assert the structural/ARIA rules.
    .disableRules(['color-contrast'])
    .analyze();
  const blocking = scan.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
