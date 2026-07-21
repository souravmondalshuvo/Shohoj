// e2e-shell/difficulty-route.spec.js
//
// #453 parity port: the Course Difficulty Map /difficulty route. A stubbed
// window.__shohojReviewsRepo (the seam the review specs share) drives the
// recent-reviews feed; the route aggregates it per course into difficulty +
// workload cards, with a department filter, sort controls, and an empty state.

import { expect, test } from '@playwright/test';

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

// A review for `code` with difficulty/workload `diff`/`load` (other dims fixed).
const r = (code, diff, load) => ({
  id: `${code}_${diff}_${load}_${Math.random()}`,
  facultyInitials: 'ABC',
  courseCode: code,
  ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: diff, workload: load },
  text: '',
});

async function openDifficulty(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Difficulty', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Course Difficulty Map' })).toBeVisible();
  return page.getByTestId('difficulty-page');
}

test('aggregates the recent feed into per-course difficulty cards', async ({ page }) => {
  // CSE110: 3 reviews (limited-sample cleared), avg difficulty 5 → "Brutal".
  // MAT110: 1 review, easy.
  await installRecent(page, [
    r('CSE110', 5, 5),
    r('CSE110', 5, 4),
    r('CSE110', 5, 5),
    r('MAT110', 1, 1),
  ]);
  const view = await openDifficulty(page);

  await expect(view.getByText('Based on 4 reviews across 2 courses.')).toBeVisible();
  await expect(view.getByTestId('difficulty-card')).toHaveCount(2);

  const cse = view.locator('[data-code="CSE110"]');
  await expect(cse).toContainText('CSE110');
  await expect(cse).toContainText('Brutal');
  await expect(cse).toContainText('3 reviews');
  await expect(cse).not.toContainText('limited sample');

  // MAT110 has a single review → flagged limited sample.
  await expect(view.locator('[data-code="MAT110"]')).toContainText('limited sample');
});

test('the department filter narrows the grid and falls back to All', async ({ page }) => {
  await installRecent(page, [r('CSE110', 4, 4), r('MAT110', 2, 2), r('MAT120', 3, 3)]);
  const view = await openDifficulty(page);

  await expect(view.getByTestId('difficulty-card')).toHaveCount(3);
  // CSE prefix → CSE dept pill; filtering leaves only CSE110.
  await view.getByRole('button', { name: 'CSE', exact: true }).click();
  await expect(view.getByTestId('difficulty-card')).toHaveCount(1);
  await expect(view.getByTestId('difficulty-card')).toContainText('CSE110');

  await view.getByRole('button', { name: 'All', exact: true }).click();
  await expect(view.getByTestId('difficulty-card')).toHaveCount(3);
});

test('sorting by difficulty orders hardest first', async ({ page }) => {
  await installRecent(page, [r('AAA110', 1, 1), r('AAA120', 5, 5), r('AAA130', 3, 3)]);
  const view = await openDifficulty(page);

  await view.getByRole('button', { name: 'Difficulty', exact: true }).click();
  const cards = view.getByTestId('difficulty-card');
  await expect(cards.nth(0)).toHaveAttribute('data-code', 'AAA120'); // hardest (5)
  await expect(cards.nth(2)).toHaveAttribute('data-code', 'AAA110'); // easiest (1)
});

test('an empty feed shows the empty state', async ({ page }) => {
  await installRecent(page, []);
  const view = await openDifficulty(page);
  await expect(view.getByTestId('difficulty-empty')).toContainText('No reviewed courses yet');
});
