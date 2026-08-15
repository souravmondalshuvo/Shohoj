// e2e-shell/responsive-overflow.spec.js
//
// Part of #365 (mobile parity): no horizontal overflow at 360-414px across the
// migrated routes and the review-write dialogs (extends the nav-only check in
// shell-mobile-nav.spec.js to the routes/modals themselves). Touch-target
// sizing for the shared legacy button library (course chips, remove/add
// controls, toast dismiss — css/style.css) is a documented carve-out: fixing
// it means editing the stylesheet the live legacy single-file app ships
// today, deferred to the full visual-system integration (same precedent as
// the a11y color-contrast carve-out in a11y-routes.spec.js).

import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

test.use({ viewport: { width: 360, height: 780 } });

async function noOverflow(page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
}

// The flat link list and its "Menu" toggle are gone: the bar now mirrors
// legacy's grouped tabs, so most routes have to have their dropdown opened
// first. navigateTo handles both shapes.
const openMobileNav = navigateTo;

test('Home has no horizontal overflow at 360px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await noOverflow(page);
});

test('Calculator (with demo content) has no horizontal overflow at 360px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openMobileNav(page, 'Calculator');
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await expect(page.locator('[data-testid="calculator-results"]')).toBeVisible();
  await noOverflow(page);
});

test('Planner has no horizontal overflow at 360px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openMobileNav(page, 'Calculator');
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await openMobileNav(page, 'Planner');
  await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
  await noOverflow(page);
});

test('Reviews directory has no horizontal overflow at 360px', async ({ page }) => {
  await page.addInitScript(() => {
    const r = (fac, n) => ({
      facultyInitials: fac,
      ratings: { teaching: n, marking: n, behavior: n, difficulty: 3, workload: 3 },
      text: 'ok',
    });
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchRecent() {
        return [r('ABC', 5), r('MRA', 4), r('XYZ', 3)];
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openMobileNav(page, 'Reviews');
  await expect(page.getByTestId('reviews-directory')).toBeVisible();
  await noOverflow(page);
});

test('RateFacultyModal has no horizontal overflow at 360px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openMobileNav(page, 'Calculator');
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await page.locator('.course-faculty-chip').first().click();
  await expect(page.getByTestId('rate-faculty-modal')).toBeVisible();
  await noOverflow(page);
});

test('CourseReviewsModal + ReportReviewModal have no horizontal overflow at 360px', async ({ page }) => {
  await page.addInitScript(() => {
    const r = (fac, n, text) => ({
      id: `${fac}_${text}`,
      facultyInitials: fac,
      ratings: { teaching: n, marking: n, behavior: n, difficulty: 2, workload: 3 },
      text,
    });
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [r('ABC', 4, 'Great course')], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openMobileNav(page, 'Calculator');
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await openMobileNav(page, 'Planner');
  await page.locator('.pl-plan-row').first().locator('.pl-reviews').click();

  const viewer = page.getByTestId('course-reviews-modal');
  await expect(viewer).toBeVisible();
  await noOverflow(page);

  await viewer.getByRole('button', { name: 'Report this review' }).click();
  await expect(page.getByTestId('report-review-modal')).toBeVisible();
  await noOverflow(page);
});
