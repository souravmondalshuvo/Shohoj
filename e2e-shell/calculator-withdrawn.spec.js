// e2e-shell/calculator-withdrawn.spec.js
//
// #499, UI half: a withdrawn course must be visible as a withdrawal. The core
// fix stopped W corrupting the totals, but the row still rendered as an empty
// grade-point box — indistinguishable from data the student had not finished
// typing — and the course never appeared among the things they could act on.
//
// Seeded through localStorage rather than the UI on purpose: the grade field is
// a numeric 0.0–4.0 input, so there is no way to type a W. That is exactly why
// the state renders as a badge.

import { expect, test } from '@playwright/test';

const SEED = {
  currentDept: 'CSE',
  semesterCounter: 1,
  semesters: [
    {
      id: 1,
      name: 'Fall 2024 (1st Semester)',
      running: false,
      summary: false,
      courses: [
        { name: 'Algebra (MAT110)', grade: 'A', credits: 3 },
        { name: 'Physics (PHY111)', grade: 'W', credits: 3 },
      ],
    },
  ],
};

async function openSeeded(page) {
  await page.addInitScript((seed) => {
    localStorage.clear();
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify(seed));
  }, SEED);
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
}

test('a withdrawn course renders as a W badge, not an empty grade box', async ({ page }) => {
  await openSeeded(page);

  const rows = page.locator('#semestersContainer .course-row');
  const withdrawn = rows.filter({ has: page.locator('input[value="Physics (PHY111)"]') });
  await expect(withdrawn.locator('.grade-w-badge')).toHaveText('W');

  // The badge replaces the grade-point input rather than sitting beside it —
  // the row must not read as unfinished data entry.
  await expect(withdrawn.locator('input[inputmode="decimal"]')).toHaveCount(0);

  // The graded row is untouched: it still takes a typed grade point.
  const graded = rows.filter({ has: page.locator('input[value="Algebra (MAT110)"]') });
  await expect(graded.locator('input[inputmode="decimal"]')).toHaveCount(1);
  await expect(graded.locator('.grade-w-badge')).toHaveCount(0);
});

test('the withdrawal is offered as a candidate, priced honestly', async ({ page }) => {
  await openSeeded(page);

  const sim = page.getByTestId('cgpa-simulator');
  // The candidate table only builds once a goal is named — until then the
  // simulator is still prompting for one.
  await sim.getByLabel('Target CGPA:').fill('3.5');

  const row = sim.locator('.sim-retake-row', { hasText: 'Physics (PHY111)' });
  await expect(row).toBeVisible();
  await expect(row.locator('.sim-strategy-badge.withdrawn')).toHaveText('Withdrawn');

  // 4.00 over 3 credits. Taking the withdrawn 3-credit course again for a B
  // gives (12 + 9) / 6 = 3.50 — a loss, and the cell says so in red rather
  // than the green every other candidate gets.
  await expect(row).toContainText('3.50');
  await expect(row.locator('td', { hasText: /^3\.50$/ })).toHaveCSS(
    'color',
    'rgb(231, 76, 60)',
  );

  // The legend explains the badge only because a withdrawal is on the table.
  await expect(sim.locator('.sim-legend .sim-strategy-badge.withdrawn')).toBeVisible();
});
