// e2e-shell/calculator-review-probe.spec.js
//
// #341: the existing-review probe on the shell rate-faculty modal. With a uid
// (window._shohoj_currentUid, the same seam the submit spec uses) and a stubbed
// reviews repo (window.__shohojReviewsRepo), opening a chip whose pair already
// has a review shows the read-only "Review already submitted" state instead of
// the form. A fresh course (no faculty → no probe hit) still opens the form.

import { expect, test } from '../e2e-support/authFixture.js';

async function openWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  return page.locator('#semestersContainer');
}

test('an existing review opens the modal read-only, not the form', async ({ page }) => {
  await page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    const review = {
      id: 'GHI_CSE220_x',
      ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 2, workload: 3 },
      text: 'Clear lectures, fair marking.',
    };
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return review; // any probed id resolves to the existing review
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });

  const container = await openWithDemo(page);
  await container.locator('.course-faculty-chip', { hasText: 'GHI' }).click();

  const modal = page.getByTestId('rate-faculty-modal');
  await expect(modal.getByRole('heading', { name: 'Review already submitted' })).toBeVisible();

  const card = modal.getByTestId('existing-review');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Teaching Quality');
  await expect(card).toContainText('5/5');
  await expect(card).toContainText('Clear lectures, fair marking.');

  // Read-only: a Close action, no rating form.
  await expect(modal.getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Submit Review' })).toHaveCount(0);
  await expect(modal.getByLabel('Faculty Initials')).toHaveCount(0);
});

test('a fresh course with no faculty still opens the rating form', async ({ page }) => {
  await page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return { id: 'x', ratings: {} }; // would be read-only IF probed
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });

  const container = await openWithDemo(page);
  // Add a graded catalog course with no faculty → the "+ Rate" pill.
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  const input = container.getByRole('combobox').nth(3);
  await input.click();
  await input.fill('PHY112');
  await container.getByRole('option', { name: /PHY112/ }).first().click();
  const gp = container.getByPlaceholder('0.0 – 4.0').nth(3);
  await gp.fill('3.3');
  await gp.blur();

  await container.getByRole('button', { name: '+ Rate' }).click();
  const modal = page.getByTestId('rate-faculty-modal');
  // No faculty initials → the probe skips fetchById → the form renders.
  await expect(modal.getByRole('button', { name: 'Submit Review' })).toBeVisible();
  await expect(modal.getByLabel('Faculty Initials')).toBeVisible();
  await expect(modal.getByTestId('existing-review')).toHaveCount(0);
});
