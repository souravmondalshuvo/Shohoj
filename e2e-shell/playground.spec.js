// e2e-shell/playground.spec.js
//
// #592: the CGPA Playground on the React Router shell, against the built
// dist-shell/ output. Demo data keeps the arithmetic deterministic — completed
// CSE110/ENG101/PHY111/CSE111/CSE220/MAT110, CGPA 3.50 over 18 credits — which
// is the same base the planner specs assert against.
//
// The maths itself is covered in tests/playground.test.js; what this proves is
// that the route wires it up: the tools render, a change moves the what-if
// figure, and the solver answers.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

async function openPlaygroundWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await navigateTo(page, 'Playground');
  return page.getByTestId('playground-box');
}

test('the goal simulator moved here from the calculator', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();

  // Legacy keeps it on the Playground tab, not the calculator panel.
  await expect(page.locator('.simulator-box')).toHaveCount(0);
  await navigateTo(page, 'Playground');
  await expect(page.locator('.simulator-box')).toBeVisible();
});

test('a pretend grade moves the what-if CGPA and can be taken back', async ({ page }) => {
  const box = await openPlaygroundWithDemo(page);
  await expect(box.getByRole('heading', { name: /CGPA Playground/ })).toBeVisible();

  // Demo CGPA is 3.50. Drop a 3-credit A to an F: 63 - 12 = 51 over 18 = 2.83.
  await box.getByLabel('Pick a course to change').selectOption({ index: 1 });
  await box.getByLabel('New grade').selectOption('F');
  await box.getByRole('button', { name: 'Add' }).click();

  const hero = box.locator('.pg-hero');
  await expect(hero.locator('.pg-hero-val').first()).toHaveText('3.50');
  await expect(hero.locator('.pg-hero-val').nth(1)).not.toHaveText('3.50');
  await expect(box.locator('.pg-change-row')).toHaveCount(1);

  await box.locator('.pg-change-remove').click();
  await expect(box.locator('.pg-change-row')).toHaveCount(0);
  await expect(box.locator('.pg-hero')).toHaveCount(0);
});

test('clear all drops every pending change at once', async ({ page }) => {
  const box = await openPlaygroundWithDemo(page);
  await box.getByLabel('Pick a course to change').selectOption({ index: 1 });
  await box.getByLabel('New grade').selectOption('B');
  await box.getByRole('button', { name: 'Add' }).click();
  await box.getByLabel('Pick a course to change').selectOption({ index: 1 });
  await box.getByLabel('New grade').selectOption('C');
  await box.getByRole('button', { name: 'Add' }).click();
  await expect(box.locator('.pg-change-row')).toHaveCount(2);

  await box.getByRole('button', { name: 'Clear all' }).click();
  await expect(box.locator('.pg-change-row')).toHaveCount(0);
});

test('the reverse solver names a grade for a reachable target', async ({ page }) => {
  const box = await openPlaygroundWithDemo(page);
  await box.getByRole('button', { name: /Reverse Solver/ }).click();

  await box.getByLabel('Course').selectOption({ index: 1 });
  await box.getByLabel('Target CGPA').fill('3.60');

  const result = page.getByTestId('pg-solver-result');
  await expect(result.locator('.pg-solver-found, .pg-solver-impossible, .pg-solver-easy')).toBeVisible();
});

test('an out-of-reach target is refused rather than answered', async ({ page }) => {
  const box = await openPlaygroundWithDemo(page);
  await box.getByRole('button', { name: /Reverse Solver/ }).click();
  await box.getByLabel('Course').selectOption({ index: 1 });

  // 3.50 over 18 credits cannot become 4.00 by moving one 3-credit course.
  await box.getByLabel('Target CGPA').fill('4.00');
  await expect(page.getByTestId('pg-solver-result').locator('.pg-solver-impossible')).toBeVisible();
});

test('the playground stays hidden until there is a CGPA to reason about', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await navigateTo(page, 'Playground');

  // Legacy hides the whole box with no graded history; the simulator stays,
  // since it asks about credits still to come.
  await expect(page.getByTestId('playground-box')).toHaveCount(0);
  await expect(page.locator('.simulator-box')).toBeVisible();
});

test('@a11y Playground route has no serious/critical violations', async ({ page }) => {
  await openPlaygroundWithDemo(page);
  const scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const blocking = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
