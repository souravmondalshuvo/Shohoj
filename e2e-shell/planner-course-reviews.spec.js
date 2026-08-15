// e2e-shell/planner-course-reviews.spec.js
//
// #343: the planner ⭐ opens the read-only course-reviews viewer. Demo mode
// seeds the plan (CSE221/MAT120/PHY112); a stubbed window.__shohojReviewsRepo
// (the same seam the chip-score + probe specs use) drives fetchByCourse so the
// viewer shows faculty cards for a course with reviews and the empty state for
// one without. #359: each snippet's Report opens the report dialog, which files
// through a stubbed window.__shohojReportRepo. #363: a card's "+ Add your rating"
// opens RateFacultyModal (prefilled) and submits through a stubbed relay.

import { expect, test, installAuth } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

async function openPlannerWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await navigateTo(page, 'Planner');
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
  // The report carries the signed-in uid from the auth snapshot, which now
  // outranks the _shohoj_currentUid stand-in below, so the snapshot has to
  // agree with what this test asserts was sent.
  await installAuth(page, {
    status: 'authenticated', uid: 'e2e-uid', email: 'me@g.bracu.ac.bd',
    isAdmin: false, university: 'bracu',
  });
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

test('a card + Add your rating opens the rate modal prefilled and submits via the relay', async ({ page }) => {
  await installRepo(page);
  await page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojSubmitRelay = async (submission) => {
      window.__lastReview = submission;
      return { ok: true, id: 'e2e-id' };
    };
  });
  const planner = await openPlannerWithDemo(page);
  await planRowStar(planner, 'CSE221').click();

  const viewer = page.getByTestId('course-reviews-modal');
  await viewer.getByRole('button', { name: '+ Add your rating' }).first().click();

  const rate = page.getByTestId('rate-faculty-modal');
  await expect(rate).toBeVisible();
  await expect(rate.getByLabel('Faculty Initials')).toHaveValue('ABC'); // prefilled from the card
  await expect(rate.getByText('Course: CSE221')).toBeVisible(); //         course from the viewer
  for (const dim of ['Teaching Quality', 'Marking Fairness', 'Behavior & Attitude', 'Course Difficulty', 'Workload']) {
    await rate.getByRole('radio', { name: `5 stars for ${dim}` }).click();
  }
  await rate.getByRole('button', { name: 'Submit Review' }).click();

  await expect(rate).toBeHidden();
  await expect(page.getByText('Review submitted — thank you')).toBeVisible();

  const sent = await page.evaluate(() => window.__lastReview);
  expect(sent.facultyInitials).toBe('ABC');
  expect(sent.courseCode).toBe('CSE221');
  expect(sent.ratings.teaching).toBe(5);
});
