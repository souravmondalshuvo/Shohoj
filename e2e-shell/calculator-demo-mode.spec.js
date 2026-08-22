// e2e-shell/calculator-demo-mode.spec.js
//
// #309: Try Demo Mode on the React Router shell's /calculator route, against
// the built dist-shell/ output. Covers: demo fill from the empty state (two
// named semesters, 3.50 headline, Distinction standing, footer controls
// unlocked), the confirm-before-overwrite modal when data already exists
// (cancel keeps it, confirm replaces it), persistence across reload, and the
// demo calendar driving the next added semester's name.

import { expect, test } from '../e2e-support/authFixture.js';

async function openCalculator(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.locator('#semestersContainer');
}

test('Try Demo Mode fills the demo semesters and lights up the results', async ({ page }) => {
  const container = await openCalculator(page);
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();

  await expect(container.locator('.semester-block')).toHaveCount(2);
  await expect(container.locator('.semester-label').nth(0)).toHaveText('Fall 2024');
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Spring 2025');

  const results = page.getByTestId('calculator-results');
  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('3.50');
  await expect(results.locator('.standing-title')).toHaveText('Distinction');
  await expect(results.locator('.footer-stat').first()).toContainText('Credits Attempted: 18');

  // Demo start semester drives calendar naming for the next added semester.
  await page.locator('.footer-btn-group').getByRole('button', { name: '+ Add Semester' }).click();
  await expect(container.locator('.semester-label').nth(2)).toHaveText('Summer 2025 (3rd Semester)');
});

test('demo over existing data asks first — cancel keeps, confirm replaces', async ({ page }) => {
  const container = await openCalculator(page);

  // Existing data that keeps the empty-state actions visible: a summary block.
  // (The summary block also carries .semester-block, so count non-summary
  // blocks explicitly below.)
  await container.getByRole('button', { name: '📊 Start from CGPA' }).click();
  await container.getByPlaceholder('e.g. 3.30').fill('3.00');
  await container.getByPlaceholder('e.g. 45').fill('30');
  await container.getByPlaceholder('e.g. 42').fill('30');
  await container.getByRole('button', { name: 'Confirm →' }).click();
  await expect(container.locator('.summary-block')).toHaveCount(1);

  // Cancel keeps the summary.
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Load demo data?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(container.locator('.summary-block')).toHaveCount(1);
  await expect(container.locator('.semester-block:not(.summary-block)')).toHaveCount(0);

  // Confirm replaces it with the demo semesters.
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Load demo' }).click();
  await expect(container.locator('.semester-block:not(.summary-block)')).toHaveCount(2);
  await expect(container.locator('.summary-block')).toHaveCount(0);
  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('3.50');
});

test('demo data persists across a reload', async ({ page }) => {
  const container = await openCalculator(page);
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(2);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.locator('#semestersContainer .semester-block')).toHaveCount(2);
  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('3.50');
});
