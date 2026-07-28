// e2e-shell/reviews-directory.spec.js
//
// #345: the lean Browse Reviews /reviews route. A stubbed
// window.__shohojReviewsRepo (the seam the other review specs use) drives the
// recent-reviews feed; the route aggregates it into a faculty directory that
// search filters by initials, with an empty state when the feed is empty.

import { expect, test } from '@playwright/test';

import { navigateTo } from './_nav.js';

function installRecent(page, reviews) {
  return page.addInitScript((seed) => {
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
        return seed;
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  }, reviews);
}

const r = (fac, n) => ({
  id: `${fac}_${n}_${Math.random()}`,
  facultyInitials: fac,
  courseCode: 'CSE110',
  ratings: { teaching: n, marking: n, behavior: n, difficulty: 3, workload: 3 },
  text: '',
});

async function openReviews(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await navigateTo(page, 'Reviews');
  await expect(page.getByRole('heading', { name: 'Faculty Reviews' })).toBeVisible();
  return page.getByTestId('reviews-page');
}

test('builds a faculty directory from the recent feed, sorted by review count', async ({ page }) => {
  await installRecent(page, [r('ABC', 4), r('ABC', 4), r('ABC', 4), r('MNR', 5), r('MNR', 5), r('XYZ', 3)]);
  const reviews = await openReviews(page);

  const cards = reviews.getByTestId('reviews-faculty-card');
  await expect(cards).toHaveCount(3);
  // aggregateByFaculty orders by count desc: ABC(3), MNR(2), XYZ(1).
  await expect(cards.nth(0)).toContainText('ABC');
  await expect(cards.nth(0)).toContainText('3 reviews');
  await expect(cards.nth(0)).toContainText('★ 4.0');
  await expect(reviews.getByText('3 of 3 faculty')).toBeVisible();
});

test('search filters the directory by initials, with a no-match state', async ({ page }) => {
  await installRecent(page, [r('ABC', 4), r('ABM', 4), r('MNR', 5)]);
  const reviews = await openReviews(page);

  await reviews.getByLabel('Search faculty by initials').fill('ab');
  await expect(reviews.getByTestId('reviews-faculty-card')).toHaveCount(2);
  await expect(reviews.getByText('2 of 3 faculty')).toBeVisible();

  await reviews.getByLabel('Search faculty by initials').fill('zzz');
  await expect(reviews.getByTestId('reviews-no-match')).toBeVisible();
});

test('an empty feed shows the empty state', async ({ page }) => {
  await installRecent(page, []);
  const reviews = await openReviews(page);
  await expect(reviews.getByTestId('reviews-empty')).toContainText('No reviews yet');
});
