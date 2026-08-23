// e2e-shell/calculator-simulator.spec.js
//
// #317: the CGPA Goal Simulator on the React Router shell. It lives on
// /playground since #592 — legacy keeps it on the Playground tab beside the
// grade changer and the reverse solver, not on the calculator panel — so the
// setup still seeds through the calculator and then navigates there.
//
// Demo data keeps the math deterministic: CGPA 3.50 over 18 credits (63
// points), CSE dept → remaining credits auto-fill to 136 − 18 = 118.

import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

// Seeding happens on /calculator (that is where #semestersContainer lives) and
// the simulator is read on /playground. Tests that only need demo data can use
// openWithDemo; the ones that edit courses first seed, edit, then open.
async function seedDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
}

async function openSimulator(page) {
  await navigateTo(page, 'Playground');
  return page.getByTestId('cgpa-simulator');
}

async function openWithDemo(page) {
  await seedDemo(page);
  return openSimulator(page);
}

test('remaining credits auto-fill from the department and a target yields a plan', async ({
  page,
}) => {
  const sim = await openWithDemo(page);

  await expect(sim.getByText('Enter your target CGPA and remaining credits')).toBeVisible();
  await expect(sim.getByLabel('Credits remaining:')).toHaveValue('118');

  await sim.getByLabel('Target CGPA:').fill('3.8');
  // needed = (3.8×136 − 63) / 118 = 3.846 → Very Hard, A/A- average.
  await expect(sim.getByText('Avg GPA Needed')).toBeVisible();
  await expect(sim.locator('.sim-ba-right .sim-ba-val')).toHaveText('3.85');
  await expect(sim.getByText('🔴 Very Hard')).toBeVisible();
  const planRows = sim.locator('.sim-plan-table tbody tr');
  await expect(planRows.nth(0)).toContainText('14 sems');
  await expect(planRows.nth(2)).toContainText('8 sems');
  await expect(planRows.nth(0)).toContainText('A / A-');
});

test('the goal ladder leads before a target is typed (#502)', async ({ page }) => {
  const sim = await openWithDemo(page);

  // 63 points over 18 credits, 118 remaining → ceiling (4×118 + 63)/136 = 3.93,
  // floor 63/136 = 0.46. Nothing is secured; Perfect Standing (3.97) is gone.
  const ladder = sim.getByTestId('sim-ladder');
  await expect(ladder).toBeVisible();
  await expect(ladder).toContainText('3.93');
  await expect(ladder).toContainText('0.46');

  const perfect = ladder.locator('.sim-ladder-row', { hasText: 'Perfect Standing' });
  await expect(perfect).toHaveClass(/sim-ladder-row--out-of-reach/);
  await expect(perfect).toContainText('Out of reach');

  // Higher Distinction is still live: needs (3.65×136 − 63)/118 = 3.67.
  const higher = ladder.locator('.sim-ladder-row', { hasText: 'Higher Distinction' });
  await expect(higher).toContainText('needs 3.67 avg');

  // Typing a target hands over to the plan, exactly as before.
  await sim.getByLabel('Target CGPA:').fill('3.5');
  await expect(sim.getByText('Avg GPA Needed')).toBeVisible();
  await expect(sim.getByTestId('sim-ladder')).toHaveCount(0);
});

test('an impossible target reports the all-A ceiling', async ({ page }) => {
  const sim = await openWithDemo(page);
  await sim.getByLabel('Target CGPA:').fill('4');
  // ceiling = (4×118 + 63) / 136 = 3.93.
  await expect(sim.getByText('Your Ceiling', { exact: true })).toBeVisible();
  await expect(sim.locator('.sim-ba-val.red')).toHaveText('3.93');
  await expect(sim.getByText(/out of reach/)).toBeVisible();
});

test('a sub-B course appears in the retake table and stacks into the impact box', async ({
  page,
}) => {
  await seedDemo(page);

  // Add a C-grade course (gp 2) to the first demo semester.
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  const input = container.getByRole('combobox').nth(3); // new row in semester 1
  await input.click();
  await input.fill('PHY112');
  await container
    .getByRole('option', { name: /PHY112/ })
    .first()
    .click();
  const gp = container.getByPlaceholder('0.0 – 4.0').nth(3);
  await gp.fill('2');
  await gp.blur();

  const sim = await openSimulator(page);
  await sim.getByLabel('Target CGPA:').fill('3.8');
  const row = sim.locator('.sim-retake-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('PHY112');
  await expect(row.locator('.sim-strategy-badge')).toHaveText('Repeat'); // C, non-F

  await row.click();
  const impact = sim.getByTestId('sim-impact');
  await expect(impact).toContainText('1 course selected');
  // boost = 3×(3−2)/21 = 0.14.
  await expect(impact).toContainText('+0.14 boost');
  await row.click();
  await expect(sim.getByTestId('sim-impact')).toHaveCount(0);
});

test('the ranking toggle reorders the retake table (#501)', async ({ page }) => {
  await seedDemo(page);
  const container = page.locator('#semestersContainer');

  // A 1-credit D and a 3-credit C. The D is the better value per credit; the C
  // is the bigger absolute jump. Each ranking should lead with a different one.
  async function addCourse(code, gradePoint, nth) {
    await container.getByRole('button', { name: '+ Add course' }).first().click();
    const input = container.getByRole('combobox').nth(nth);
    await input.click();
    await input.fill(code);
    await container
      .getByRole('option', { name: new RegExp(code) })
      .first()
      .click();
    const gp = container.getByPlaceholder('0.0 – 4.0').nth(nth);
    await gp.fill(gradePoint);
    await gp.blur();
  }

  await addCourse('PHY112', '2', 3); // 3 credits, C
  await addCourse('EEE101L', '1', 4); // 1 credit, D

  const sim = await openSimulator(page);
  await sim.getByLabel('Target CGPA:').fill('3.8');
  const rows = sim.locator('.sim-retake-row');
  await expect(rows).toHaveCount(2);

  // Efficiency is the default: the 1-credit D leads.
  await expect(sim.getByRole('button', { name: 'Best value' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(rows.first()).toContainText('EEE101L');

  await sim.getByRole('button', { name: 'Biggest jump' }).click();
  await expect(rows.first()).toContainText('PHY112');

  await sim.getByRole('button', { name: 'Best value' }).click();
  await expect(rows.first()).toContainText('EEE101L');
});

test('summary-only data shows the nudge instead of the retake table', async ({ page }) => {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();

  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: '📊 Start from CGPA' }).click();
  await container.getByPlaceholder('e.g. 3.30').fill('3.00');
  await container.getByPlaceholder('e.g. 45').fill('60');
  await container.getByPlaceholder('e.g. 42').fill('60');
  await container.getByRole('button', { name: 'Confirm →' }).click();

  const sim = await openSimulator(page);
  // needed = (3.2×90 − 180)/30 = 3.6 → a reachable plan.
  await sim.getByLabel('Target CGPA:').fill('3.2');
  await sim.getByLabel('Credits remaining:').fill('30');
  await expect(sim.getByText('Avg GPA Needed')).toBeVisible();
  await expect(sim.getByTestId('sim-nudge')).toBeVisible();
  await expect(sim.locator('.sim-retake-row')).toHaveCount(0);
});
