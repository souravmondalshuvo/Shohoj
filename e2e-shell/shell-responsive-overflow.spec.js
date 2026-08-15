// e2e-shell/shell-responsive-overflow.spec.js
//
// Part of #365 (mobile parity): assert no horizontal overflow across the
// content-heavy migrated routes and the three review-write dialogs at the
// 360px and 414px extremes of the small-phone range. shell-mobile-nav.spec.js
// already guards the Home route + the nav drawer; this locks in the routes
// that actually render feature content (calculator results + goal simulator
// plan table, planner, reviews directory) and every review modal, since those
// are where a future style change is most likely to spill sideways.
//
// The check is document-level: the root scroll width must not exceed its client
// width. Demo data / a stubbed reviews repo give each surface real content to
// measure (same seams as a11y-routes.spec.js and reviews-dialog-a11y.spec.js).

import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

const WIDTHS = [360, 414];

// Faculty reviews repo stub — a review body long enough to exercise wrapping
// inside the course-reviews / report dialogs at the narrowest width.
function installReviewsRepo(page) {
  return page.addInitScript(() => {
    const review = (fac, n, text) => ({
      id: `${fac}_${text}`,
      facultyInitials: fac,
      ratings: { teaching: n, marking: n, behavior: n, difficulty: 2, workload: 3 },
      text,
    });
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [review('ABC', 5, 'A fairly long review body to force wrapping.'), review('MRA', 4, 'ok')], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [review('ABC', 4, 'A long-ish review body to exercise wrapping inside the dialog at 360px without spilling sideways.')], nextCursor: null };
      },
      async fetchById() { return null; },
      async fetchRecent() { return [review('ABC', 5, 'ok'), review('MRA', 4, 'ok'), review('XYZ', 3, 'ok')]; },
      async fetchFacultyProfiles() { return []; },
    };
  });
}

async function assertNoOverflow(page, label) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows, `${label} overflows horizontally`).toBe(false);
}

// The flat link list and its "Menu" toggle are gone: the bar now mirrors
// legacy's grouped tabs, so most routes have to have their dropdown opened
// first. navigateTo handles both shapes.
const navigate = navigateTo;

for (const width of WIDTHS) {
  test.describe(`no horizontal overflow @ ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('calculator (results + goal simulator plan table)', async ({ page }) => {
      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.clear());
      await navigate(page, 'Calculator');
      await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
      await expect(page.locator('[data-testid="calculator-results"]')).toBeVisible();
      await assertNoOverflow(page, 'calculator results');

      // Drive the simulator to render its widest content (the plan table).
      const sim = page.getByTestId('cgpa-simulator');
      await sim.getByLabel('Target CGPA:').fill('3.8');
      await expect(sim.locator('.sim-plan-table tbody tr').first()).toBeVisible();
      await assertNoOverflow(page, 'simulator plan table');
    });

    test('planner', async ({ page }) => {
      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.clear());
      await navigate(page, 'Calculator');
      await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
      await navigate(page, 'Planner');
      await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
      await assertNoOverflow(page, 'planner');
    });

    test('reviews directory', async ({ page }) => {
      await installReviewsRepo(page);
      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.clear());
      await navigate(page, 'Reviews');
      await expect(page.getByTestId('reviews-directory')).toBeVisible();
      await assertNoOverflow(page, 'reviews directory');
    });

    test('cafeteria (outlet cards + weekly hours tables)', async ({ page }) => {
      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.clear());
      await navigate(page, 'Cafeteria');
      await expect(page.getByTestId('cafeteria-page')).toBeVisible();
      await expect(page.getByTestId('cafeteria-list')).toBeVisible();
      await assertNoOverflow(page, 'cafeteria guide');
    });

    test('review dialogs (rate, course-viewer, report)', async ({ page }) => {
      await installReviewsRepo(page);
      await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.clear());
      await navigate(page, 'Calculator');
      await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();

      // RateFacultyModal — opened from a faculty chip.
      await page.locator('#semestersContainer').locator('.course-faculty-chip', { hasText: 'GHI' }).first().click();
      await expect(page.getByTestId('rate-faculty-modal')).toBeVisible();
      await assertNoOverflow(page, 'rate faculty modal');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('rate-faculty-modal')).toBeHidden();

      // CourseReviewsModal — opened from a planner row's reviews star.
      await navigate(page, 'Planner');
      await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
      await page
        .locator('.pl-plan-row', { has: page.locator('.pl-code', { hasText: 'CSE221' }) })
        .locator('.pl-reviews')
        .click();
      const viewer = page.getByTestId('course-reviews-modal');
      await expect(viewer).toBeVisible();
      await assertNoOverflow(page, 'course reviews modal');

      // ReportReviewModal — opened from within the course-reviews viewer.
      await viewer.getByRole('button', { name: 'Report this review' }).click();
      await expect(page.getByTestId('report-review-modal')).toBeVisible();
      await assertNoOverflow(page, 'report review modal');
    });
  });
}
