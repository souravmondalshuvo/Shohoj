// e2e-shell/planner-course-reviews.spec.js
//
// #343: the planner ⭐ opens the read-only course-reviews viewer. Demo mode
// seeds the plan (CSE221/MAT120/PHY112); a stubbed window.__shohojReviewsRepo
// (the same seam the chip-score + probe specs use) drives fetchByCourse so the
// viewer shows faculty cards for a course with reviews and the empty state for
// one without. #359: each snippet's Report opens the report dialog, which files
// through a stubbed window.__shohojReportRepo.

import { expect, test } from '@playwright/test';

async function openPlannerWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await page.getByRole('link', { name: 'Planner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
  return page.getByTestId('planner-page');
}

function installRepo(page) {
  return page.addInitScript(() => {
    const r = (fac, n, text) => ({
      id: `${fac}_${text}`,
      facultyInitials: fac,
      ratings: { teaching: n, marking: n, behavior: n, difficulty: 2, workload: 3 },
      text,
    });
    const byCourse = {
      CSE221: [r('ABC', 4, 'Great course'), r('ABC', 4, 'Learned a lot'), r('ABC', 4, '')],
    };
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse(code) {
        return { reviews: byCourse[code] || [], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });
}

const planRowStar = (planner, code) =>
  planner
    .locator('.pl-plan-row', { has: planner.page().locator('.pl-code', { hasText: code }) })
    .locator('.pl-reviews');

test('⭐ on a planned course opens the faculty cards viewer', async ({ page }) => {
  await installRepo(page);
  const planner = await openPlannerWithDemo(page);

  await planRowStar(planner, 'CSE221').click();

  const modal = page.getByTestId('course-reviews-modal');
  await expect(modal.getByRole('heading', { name: 'CSE221 reviews' })).toBeVisible();

  const card = modal.getByTestId('course-review-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('ABC');
  await expect(card).toContainText('3 reviews');
  await expect(card).toContainText('★ 4.0');
  await expect(card).toContainText('Teach:');
  await expect(card).toContainText('Great course');

  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toBeHidden();
});

test('⭐ on a course with no reviews shows the empty state', async ({ page }) => {
  await installRepo(page);
  const planner = await openPlannerWithDemo(page);

  await planRowStar(planner, 'MAT120').click();

  const modal = page.getByTestId('course-reviews-modal');
  await expect(modal.getByRole('heading', { name: 'MAT120 reviews' })).toBeVisible();
  await expect(modal.getByTestId('course-reviews-empty')).toContainText('No reviews yet');
  await expect(modal.getByTestId('course-review-card')).toHaveCount(0);
});

test('a snippet Report opens the dialog and files a report via the stub repo', async ({ page }) => {
  await installRepo(page);
  await page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojReportRepo = {
      async reportReview(input) {
        window.__lastReport = input;
        return { ok: true };
      },
    };
  });
  const planner = await openPlannerWithDemo(page);
  await planRowStar(planner, 'CSE221').click();

  const modal = page.getByTestId('course-reviews-modal');
  // Two non-empty snippets → two Report buttons; the first is 'Great course'.
  await modal.getByRole('button', { name: 'Report this review' }).first().click();

  const report = page.getByTestId('report-review-modal');
  await expect(report).toBeVisible();
  await report.getByLabel('Reason for reporting').fill('This is spam');
  await report.getByRole('button', { name: 'Send report' }).click();

  await expect(report).toBeHidden();
  await expect(page.getByText('Report submitted — thanks')).toBeVisible();

  const sent = await page.evaluate(() => window.__lastReport);
  expect(sent.reviewId).toBe('ABC_Great course');
  expect(sent.reason).toBe('This is spam');
  expect(sent.uid).toBe('e2e-uid');
});
