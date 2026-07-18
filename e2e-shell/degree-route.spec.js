// e2e-shell/degree-route.spec.js
//
// #450: the standalone /degree-progress view — the existing DegreeTracker
// (#315) over the shared persisted calculator state (shohoj_cgpa_v1), and the
// LAST placeholder swap before cutover.

import { expect, test } from '@playwright/test';

function seedState(page) {
  return page.addInitScript(() => {
    localStorage.setItem(
      'shohoj_cgpa_v1',
      JSON.stringify({
        semesters: [
          {
            id: 1,
            summary: true,
            courses: [],
            summaryCGPA: 3.42,
            summaryCredits: 60,
            summaryAttempted: 63,
            summarySemesters: 5,
          },
          {
            id: 2,
            name: 'Spring 2026',
            courses: [{ name: 'CSE220 - Data Structures', credits: 3, grade: 'A', gradePoint: 4 }],
          },
        ],
        startSeason: 'Spring',
        startYear: '2024',
        currentDept: 'CSE',
        planCourses: [],
      }),
    );
  });
}

test('empty state links to the calculator and transcript', async ({ page }) => {
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('degree-page')).toBeVisible();
  await expect(page.getByTestId('degree-empty')).toBeVisible();
  await expect(
    page.getByTestId('degree-empty').getByRole('link', { name: 'calculator' }),
  ).toHaveAttribute('href', '/calculator');
  await expect(page.getByTestId('degree-tracker')).toHaveCount(0);
});

test('seeded state renders the tracker stats, bar and timeline', async ({ page }) => {
  await seedState(page);
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });

  const tracker = page.getByTestId('degree-tracker');
  await expect(tracker).toBeVisible();
  // 60 summary credits + 3 graded = 63 earned toward the CSE 136.
  await expect(tracker).toContainText('63');
  await expect(tracker).toContainText('/ 136');
  await expect(tracker).toContainText('Credits Earned');
  await expect(tracker).toContainText('Est. Graduation');
  // The summary node shows the imported standing.
  await expect(tracker).toContainText('Past Semesters');
  await expect(tracker).toContainText('3.42');
});

test('no placeholder remains anywhere: unknown paths 404, degree renders real content', async ({ page }) => {
  await seedState(page);
  await page.goto('/degree-progress', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('coming soon')).toHaveCount(0);

  // The old placeholder element is gone from the router — an unmigrated-style
  // path now falls through to the NotFound route instead.
  await page.goto('/definitely-not-a-route', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});
