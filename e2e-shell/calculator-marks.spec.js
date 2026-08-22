// e2e-shell/calculator-marks.spec.js
//
// #500: the per-course marks tracker. Every other projection in the app answers
// "you need a 3.70 across 45 credits", which is not a lever a student can pull
// in week 9. This one answers "what do I need on the final", so the tests are
// written in those terms — the worked example from the issue, end to end.
//
// The tracker is offered on running-semester rows only, and nothing it computes
// touches the CGPA until the student applies a letter. Both are asserted here,
// because both are the feature's promises rather than incidental behaviour.

import { expect, test } from '../e2e-support/authFixture.js';

const SEED = {
  currentDept: 'CSE',
  semesterCounter: 2,
  semesters: [
    {
      id: 1,
      name: 'Fall 2024 (1st Semester)',
      running: false,
      summary: false,
      courses: [{ name: 'Algebra (MAT110)', grade: 'A', gradePoint: 4, credits: 3 }],
    },
    {
      id: 2,
      name: 'Spring 2025 (Running)',
      running: true,
      summary: false,
      courses: [{ name: 'Data Structures (CSE220)', grade: '', credits: 3 }],
    },
  ],
};

async function openSeeded(page) {
  // Seed only when the key is absent: addInitScript re-runs on every navigation,
  // so an unconditional write would wipe what a test typed before it reloads.
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('shohoj_cgpa_v1')) {
      localStorage.setItem('shohoj_cgpa_v1', JSON.stringify(seed));
    }
  }, SEED);
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
}

const runningRow = (page) =>
  page
    .locator('#semestersContainer .course-row')
    .filter({ has: page.locator('input[value="Data Structures (CSE220)"]') });

const completedRow = (page) =>
  page
    .locator('#semestersContainer .course-row')
    .filter({ has: page.locator('input[value="Algebra (MAT110)"]') });

/** The worked example from #500: mid 18/25, quizzes 8/10, final still to come. */
async function enterWorkedExample(panel) {
  const fill = (ci, field, value) =>
    panel
      .locator(`input[aria-label*="Component ${ci + 1}"]`)
      .nth(field)
      .fill(value);

  // name / weight / score / outOf are the four inputs per row, in order.
  await fill(0, 0, 'Midterm');
  await fill(0, 1, '25');
  await fill(0, 2, '18');
  await fill(0, 3, '25');

  await panel.getByRole('button', { name: '+ Add component' }).click();
  await fill(1, 0, 'Quizzes');
  await fill(1, 1, '15');
  await fill(1, 2, '8');
  await fill(1, 3, '10');

  await panel.getByRole('button', { name: '+ Add component' }).click();
  await fill(2, 0, 'Final');
  await fill(2, 1, '60');
  await fill(2, 3, '100');
}

test('the tracker is offered on running courses only', async ({ page }) => {
  await openSeeded(page);

  await expect(runningRow(page).locator('.course-marks-pill')).toHaveCount(1);
  // A finished course has no final left to plan for.
  await expect(completedRow(page).locator('.course-marks-pill')).toHaveCount(0);
});

test('answers what the final needs, and stays honest about the floor', async ({ page }) => {
  await openSeeded(page);
  await runningRow(page).locator('.course-marks-pill').click();

  const panel = page.getByTestId('course-marks-panel');
  await expect(panel).toBeVisible();
  await enterWorkedExample(panel);

  // 30 of 40 banked = 75% in hand → on pace for a B.
  await expect(panel.locator('.course-marks-stat', { hasText: 'in hand' })).toContainText('75%');
  await expect(panel.locator('.course-marks-stat', { hasText: 'on pace for' })).toContainText('B');

  // Nothing is secured yet: 60% of the course is unmarked, so the floor is F
  // and the ceiling is A. Showing only the pace would be the dishonest version.
  await expect(panel.locator('.course-marks-stat', { hasText: 'floor' })).toContainText('F → A');

  // The question the feature exists for: A- needs 91.7% of the remaining 60%.
  await expect(panel.locator('.course-marks-targets li', { hasText: 'A-' })).toContainText('91.7%');

  // A+ is arithmetically gone — it must be absent from the targets, not listed
  // with a number above 100.
  await expect(panel.locator('.course-marks-targets li', { hasText: 'A+' })).toHaveCount(0);
});

test('marks change nothing until a letter is applied, then flow into the CGPA', async ({
  page,
}) => {
  await openSeeded(page);

  const headline = page.locator('.calc-header .cgpa-val');
  const before = await headline.textContent();

  await runningRow(page).locator('.course-marks-pill').click();
  const panel = page.getByTestId('course-marks-panel');
  await enterWorkedExample(panel);

  // Entering marks is not a grade: the row and the CGPA are untouched.
  await expect(runningRow(page).locator('.grade-letter')).toHaveText('—');
  await expect(headline).toHaveText(before ?? '');

  await panel.getByRole('button', { name: /Use B in my CGPA projection/ }).click();

  // Applying writes the letter onto the course, so the projection picks it up
  // through the same path a typed grade takes: A (4.00) and B (3.00) over
  // 3 credits each → 3.50.
  await expect(runningRow(page).locator('.grade-letter')).toHaveText('B');
  await expect(headline).toContainText('3.50');

  // The button now reports the state rather than offering the action again.
  await expect(panel.getByRole('button', { name: /B applied to this course/ })).toBeDisabled();
});

test('a partial syllabus is answered, and says it is partial', async ({ page }) => {
  await openSeeded(page);
  await runningRow(page).locator('.course-marks-pill').click();

  const panel = page.getByTestId('course-marks-panel');
  // Only the midterm has been announced — the common real case in week 9.
  await panel.locator('input[aria-label*="Component 1"]').nth(0).fill('Midterm');
  await panel.locator('input[aria-label*="Component 1"]').nth(1).fill('25');
  await panel.locator('input[aria-label*="Component 1"]').nth(2).fill('20');
  await panel.locator('input[aria-label*="Component 1"]').nth(3).fill('25');

  await expect(panel.locator('.course-marks-stat', { hasText: 'in hand' })).toContainText('80%');
  // The secured note is a sibling with the same class, hence the exclusion.
  await expect(panel.locator('.course-marks-note:not(.course-marks-secured)')).toContainText(
    'not 100%',
  );
});

test('tracked marks survive a reload, and clearing them leaves no trace', async ({ page }) => {
  await openSeeded(page);
  await runningRow(page).locator('.course-marks-pill').click();

  const panel = page.getByTestId('course-marks-panel');
  await panel.locator('input[aria-label*="Component 1"]').nth(0).fill('Midterm');
  await panel.locator('input[aria-label*="Component 1"]').nth(1).fill('25');
  await panel.locator('input[aria-label*="Component 1"]').nth(2).fill('18');
  await panel.locator('input[aria-label*="Component 1"]').nth(3).fill('25');
  await expect(panel.locator('.course-marks-stat', { hasText: 'in hand' })).toContainText('72%');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await runningRow(page).locator('.course-marks-pill').click();
  const reopened = page.getByTestId('course-marks-panel');
  await expect(reopened.locator('input[aria-label*="Component 1"]').nth(0)).toHaveValue('Midterm');
  await expect(reopened.locator('.course-marks-stat', { hasText: 'in hand' })).toContainText('72%');

  // Removing the last component must delete the key, not leave an empty array
  // behind on a course the student is no longer tracking.
  await reopened.getByRole('button', { name: 'Remove component 1' }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('shohoj_cgpa_v1') || '{}'),
  );
  const course = stored.semesters.find((s) => s.id === 2).courses[0];
  expect(Object.prototype.hasOwnProperty.call(course, 'marks')).toBe(false);
});
