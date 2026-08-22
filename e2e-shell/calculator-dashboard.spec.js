// e2e-shell/calculator-dashboard.spec.js
//
// #315: the degree tracker + GPA trend chart on the React Router shell's
// /calculator route, against the built dist-shell/ output. Demo mode is the
// vehicle: it pre-selects CSE (136 cr), starts Fall 2024 and fills two graded
// semesters (GPA 3.67 → 3.33), making every tracker stat and the declining
// trend deterministic regardless of the real clock (no summary block, so
// nothing clock-estimated).

import { expect, test } from '../e2e-support/authFixture.js';

async function openWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
}

test('demo data shows the declining GPA trend as an accessible SVG', async ({ page }) => {
  await openWithDemo(page);

  const trend = page.getByTestId('gpa-trend');
  await expect(trend).toBeVisible();
  await expect(trend.getByText('Semester GPA Trend')).toBeVisible();
  await expect(trend.getByText('↓ Declining')).toBeVisible();

  const svg = trend.locator('svg');
  await expect(svg).toHaveAttribute(
    'aria-label',
    "Semester GPA trend: Fall '24 3.67, Spring '25 3.33",
  );
  await expect(svg.locator('circle')).toHaveCount(2);
});

test('demo data shows the degree tracker with legacy-parity stats', async ({ page }) => {
  await openWithDemo(page);

  const tracker = page.getByTestId('degree-tracker');
  await expect(tracker).toBeVisible();

  // Stats: 18/136 earned, 2 done, 9 cr/sem pace, 16-semester walk from Fall 2024.
  const stats = tracker.locator('.tracker-stat');
  await expect(stats.nth(0)).toContainText('18 / 136');
  await expect(stats.nth(1)).toContainText('2');
  await expect(stats.nth(2)).toContainText('9 cr/sem');
  await expect(stats.nth(3)).toContainText("Fall '29");

  await expect(tracker.locator('.tracker-bar-labels')).toContainText('13% complete');
  await expect(tracker.locator('.tracker-bar-labels')).toContainText('118 credits remaining');

  // Timeline: two completed nodes, then projected continuation from Spring 2025.
  await expect(tracker.locator('.tracker-node.completed')).toHaveCount(2);
  const projected = tracker.locator('.tracker-node.projected');
  await expect(projected.first()).toContainText("Summer '25");
  await expect(tracker.locator('.tracker-node.projected.more')).toContainText('+10 more');
  await expect(tracker.locator('.tracker-node.graduation')).toContainText("Fall '29");
});

test('an even pace claims no range; an uneven one does (#503)', async ({ page }) => {
  await openWithDemo(page);

  const gradStat = page.getByTestId('degree-tracker').locator('.tracker-stat').nth(3);

  // Both demo semesters are 9 credits, so the observed spread is a single
  // value — the tracker must not dress that up as a range.
  await expect(gradStat).toContainText("Fall '29");
  await expect(gradStat.locator('.tracker-stat-note')).toHaveCount(0);

  // Add a 4th course to semester 1 → loads become 12 and 9, a real spread.
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  const input = container.getByRole('combobox').nth(3);
  await input.click();
  await input.fill('MAT110');
  await container.getByRole('option', { name: /MAT110/ }).first().click();
  const gp = container.getByPlaceholder('0.0 – 4.0').nth(3);
  await gp.fill('4');
  await gp.blur();

  const note = gradStat.locator('.tracker-stat-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('9–12 cr/sem');
});

test('a single semester says the pace is assumed rather than observed (#503)', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();

  // Drop the second demo semester, leaving one observation.
  const container = page.locator('#semestersContainer');
  page.once('dialog', (d) => d.accept());
  await container.getByRole('button', { name: 'Remove', exact: true }).last().click();

  const note = page
    .getByTestId('degree-tracker')
    .locator('.tracker-stat')
    .nth(3)
    .locator('.tracker-stat-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('too few semesters to judge');
});

test('a graded running semester appears as an In Progress node', async ({ page }) => {
  await openWithDemo(page);
  await page.locator('.footer-btn-group').getByRole('button', { name: '🎯 Running Semester' }).click();

  const container = page.locator('#semestersContainer');
  const input = container.getByRole('combobox').last();
  await input.click();
  await input.fill('CSE220');
  await container.getByRole('option', { name: /CSE220/ }).first().click();

  const tracker = page.getByTestId('degree-tracker');
  await expect(tracker.locator('.tracker-node.running')).toContainText('In Progress');
});

test('tracker and trend stay hidden without a department / second semester', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();

  // One graded semester, no department selected.
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '+ Add semester' }).click();
  const input = container.getByRole('combobox').first();
  await input.click();
  await input.fill('CSE110');
  await container.getByRole('option', { name: /CSE110/ }).first().click();
  const gp = container.getByPlaceholder('0.0 – 4.0').first();
  await gp.fill('4');
  await gp.blur();

  await expect(page.locator('.calc-header .cgpa-val')).toHaveText('4.00');
  await expect(page.getByTestId('degree-tracker')).toHaveCount(0); // no dept
  await expect(page.getByTestId('gpa-trend')).toHaveCount(0); // one semester
});
