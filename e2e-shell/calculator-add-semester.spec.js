// e2e-shell/calculator-add-semester.spec.js
//
// #307: the footer add-semester / running-semester controls on the React
// Router shell's /calculator route, against the built dist-shell/ output.
// Covers: footer only once a semester exists, adding a second semester with
// the shell's fallback naming (no start semester is set — no setup wizard on
// the shell yet), the single named running semester (second click no-ops),
// and the headline flipping to "Projected CGPA" when a running semester
// exists.

import { expect, test } from '../e2e-support/authFixture.js';

async function openCalculator(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.locator('#semestersContainer');
}

test('footer controls appear once a semester exists and add named semesters', async ({ page }) => {
  const container = await openCalculator(page);

  // Empty state: no footer controls, only the empty-state add button.
  await expect(page.locator('.footer-btn-group')).toHaveCount(0);
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(1);
  await expect(container.locator('.semester-label').first()).toHaveText('Semester 1');

  // Footer is now visible; it adds a second, sequentially named semester.
  const footer = page.locator('.footer-btn-group');
  await expect(footer).toBeVisible();
  await footer.getByRole('button', { name: '+ Add Semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(2);
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Semester 2');
});

test('running semester is single, named, and flips the headline to projected', async ({ page }) => {
  const container = await openCalculator(page);
  await container.getByRole('button', { name: '+ Add semester' }).click();

  const results = page.getByTestId('calculator-results');
  await expect(results.locator('.cgpa-label')).toHaveText('Current CGPA');

  const footer = page.locator('.footer-btn-group');
  await footer.getByRole('button', { name: '🎯 Running Semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(2);
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Current Semester (Running)');
  await expect(results.locator('.cgpa-label')).toHaveText('Projected CGPA');

  // A second running semester is a no-op (legacy guard).
  await footer.getByRole('button', { name: '🎯 Running Semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(2);
});

test('added semesters persist across a reload', async ({ page }) => {
  const container = await openCalculator(page);
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await page.locator('.footer-btn-group').getByRole('button', { name: '+ Add Semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(2);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.locator('#semestersContainer .semester-block')).toHaveCount(2);
  await expect(page.locator('#semestersContainer .semester-label').nth(1)).toHaveText('Semester 2');
});
