// e2e-shell/calculator-setup.spec.js
//
// #313: department + start-semester setup on the React Router shell's
// /calculator route, against the built dist-shell/ output. Covers: calendar
// names with ordinals once dept/start are chosen, department calendars
// scoping the season options and the next-semester math (LAW has no Summer),
// the legacy season-reset on switching to an incompatible department, the
// demo pre-selecting CSE, and setup persistence across a reload.

import { expect, test } from '../e2e-support/authFixture.js';

async function openCalculator(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
}

test('dept + start selection produces calendar names with ordinals', async ({ page }) => {
  await openCalculator(page);
  const setup = page.getByTestId('calculator-setup');

  await setup.getByLabel('Select your department').selectOption('CSE');
  await expect(setup.getByText('136 Total Credits')).toBeVisible();
  await setup.getByLabel('Starting semester season').selectOption('Spring');
  await setup.getByLabel('Starting semester year').selectOption('2025');

  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await expect(container.locator('.semester-label').first()).toHaveText('Spring 2025 (1st Semester)');

  await page.locator('.footer-btn-group').getByRole('button', { name: '+ Add Semester' }).click();
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Summer 2025 (2nd Semester)');
});

test('a two-season department scopes the seasons and the calendar math', async ({ page }) => {
  await openCalculator(page);
  const setup = page.getByTestId('calculator-setup');

  await setup.getByLabel('Select your department').selectOption('LAW');
  const seasonOptions = await setup.getByLabel('Starting semester season').locator('option:not([disabled])').allTextContents();
  expect(seasonOptions).toEqual(['Spring', 'Fall']);

  await setup.getByLabel('Starting semester season').selectOption('Spring');
  await setup.getByLabel('Starting semester year').selectOption('2025');

  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await page.locator('.footer-btn-group').getByRole('button', { name: '+ Add Semester' }).click();
  // LAW: after Spring comes Fall — never Summer.
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Fall 2025 (2nd Semester)');
});

test('switching to a department without the chosen season clears it', async ({ page }) => {
  await openCalculator(page);
  const setup = page.getByTestId('calculator-setup');

  await setup.getByLabel('Select your department').selectOption('CSE');
  await setup.getByLabel('Starting semester season').selectOption('Summer');
  await setup.getByLabel('Select your department').selectOption('LAW'); // no Summer in LAW
  await expect(setup.getByLabel('Starting semester season')).toHaveValue('');
});

test('demo mode pre-selects CSE and the setup persists across a reload', async ({ page }) => {
  await openCalculator(page);
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();

  const setup = page.getByTestId('calculator-setup');
  await expect(setup.getByLabel('Select your department')).toHaveValue('CSE');
  await expect(setup.getByText('136 Total Credits')).toBeVisible();
  await expect(setup.getByLabel('Starting semester season')).toHaveValue('Fall');
  await expect(setup.getByLabel('Starting semester year')).toHaveValue('2024');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  const setupAfter = page.getByTestId('calculator-setup');
  await expect(setupAfter.getByLabel('Select your department')).toHaveValue('CSE');
  await expect(setupAfter.getByLabel('Starting semester year')).toHaveValue('2024');
});
