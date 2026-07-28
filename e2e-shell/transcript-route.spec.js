// e2e-shell/transcript-route.spec.js
//
// #445: the standalone /transcript view over the shared persisted calculator
// state (shohoj_cgpa_v1). Seeded through localStorage — the same store the
// /calculator route reads/writes, which is the point: one dataset, two views.

import { expect, test } from '@playwright/test';

import { navigateTo } from './_nav.js';

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
            courses: [
              { name: 'CSE220 - Data Structures', credits: 3, grade: 'A', gradePoint: 4 },
              { name: 'MAT216 - Linear Algebra', credits: 3, grade: 'B+', gradePoint: 3.3 },
            ],
          },
          {
            id: 3,
            name: 'Summer 2026',
            running: true,
            courses: [{ name: 'CSE221 - Algorithms', credits: 3, grade: '' }],
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

test('empty state offers import and links to the calculator', async ({ page }) => {
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('transcript-page')).toBeVisible();
  await expect(page.getByTestId('transcript-empty')).toBeVisible();
  await expect(page.getByTestId('transcript-import-btn')).toBeVisible();
  await expect(
    page.getByTestId('transcript-empty').getByRole('link', { name: 'calculator' }),
  ).toHaveAttribute('href', '/calculator');
});

test('seeded state renders stats, summary card, graded table and running badge', async ({ page }) => {
  await seedState(page);
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });

  // Cumulative stats over summary + graded semesters.
  await expect(page.getByTestId('transcript-stats')).toContainText('Projected CGPA');
  await expect(page.getByTestId('transcript-stats')).toContainText('Credits earned');

  // Summary standing card.
  await expect(page.getByTestId('transcript-summary')).toContainText('CGPA 3.42');
  await expect(page.getByTestId('transcript-summary')).toContainText('60 credits earned across 5 semesters');

  // Graded semester: per-semester GPA and its course rows.
  const spring = page.getByTestId('transcript-sem-2');
  await expect(spring).toContainText('Spring 2026');
  await expect(spring).toContainText('GPA 3.65'); // (4*3 + 3.3*3) / 6
  await expect(spring).toContainText('CSE220 - Data Structures');
  await expect(spring).toContainText('B+');

  // Running semester is badged, not graded.
  const summer = page.getByTestId('transcript-sem-3');
  await expect(summer).toContainText('In progress');
  await expect(summer).not.toContainText('GPA ');
});

test('shares state with /calculator (one dataset, two views)', async ({ page }) => {
  await seedState(page);
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.semester-block').first()).toBeVisible();

  await navigateTo(page, 'Transcript');
  await expect(page.getByTestId('transcript-sem-2')).toContainText('Spring 2026');
});

test('import button opens the shared TranscriptImport flow', async ({ page }) => {
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('transcript-import-btn').click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
});
