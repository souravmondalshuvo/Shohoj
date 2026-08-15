// e2e-shell/calculator-chip-scores.spec.js
//
// #337: live faculty chip scores on the shell /calculator route. The standalone
// shell has no Firebase, so the FacultyReviewsProvider reads its repo from the
// window.__shohojReviewsRepo seam (the same role a config-built createReviewsRepo
// plays on a cloud shell). Demo data's courses all carry faculty initials, so
// their chips request scores on render. Parity: the aggregate shows only once at
// least three reviews exist (render.js HIDE_UNDER), and a submitted review
// invalidates the pair so its chip re-aggregates.

import { expect, test } from '../e2e-support/authFixture.js';

// A repo stub over an in-memory `key -> reviews` store. Only fetchByFaculty is
// exercised by the chips; the rest satisfy the ReviewsRepo shape.
function installRepo(store) {
  window.__reviewStore = store;
  const rating = (n) => ({ ratings: { teaching: n, marking: n, behavior: n, difficulty: 3, workload: 3 } });
  window.__reviewRating = rating;
  window.__shohojReviewsRepo = {
    async fetchByFaculty({ facultyInitials, courseCode }) {
      return { reviews: window.__reviewStore[`${facultyInitials}|${courseCode}`] || [], nextCursor: null };
    },
    async fetchByCourse() {
      return { reviews: [], nextCursor: null };
    },
    async fetchById() {
      return null;
    },
    async fetchFacultyProfiles() {
      return [];
    },
  };
}

async function openWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  return page.locator('#semestersContainer');
}

const chipScore = (container, initials) =>
  container.locator('.course-faculty-chip', { hasText: initials }).locator('.fac-score');

test('a chip shows the aggregate once three reviews exist, and hides it below', async ({ page }) => {
  await page.addInitScript(() => {
    const r = (n) => ({ ratings: { teaching: n, marking: n, behavior: n } });
    window.__shohojReviewsRepo = {
      async fetchByFaculty({ facultyInitials, courseCode }) {
        const store = {
          'GHI|CSE220': [r(4), r(4), r(4)], // 3 → shown, (4+4+4)/3 = 4.0
          'ABC|CSE110': [r(5), r(5)], //        2 → below threshold, stays –
        };
        return { reviews: store[`${facultyInitials}|${courseCode}`] || [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });

  const container = await openWithDemo(page);
  await expect(chipScore(container, 'GHI')).toHaveText('4.0');
  await expect(chipScore(container, 'ABC')).toHaveText('–');
});

test('submitting a review invalidates the pair and re-aggregates the chip', async ({ page }) => {
  await page.addInitScript(installRepo, { 'GHI|CSE220': null });
  await page.addInitScript(() => {
    // GHI starts with two reviews → hidden; a third arrives via the submit relay
    // (#353: the modal submits through the typed provider, whose e2e seam is
    // __shohojSubmitRelay — the legacy _shohoj_submitReview hook is not read).
    window.__reviewStore['GHI|CSE220'] = [window.__reviewRating(4), window.__reviewRating(4)];
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojSubmitRelay = async (submission) => {
      window.__reviewStore[`${submission.facultyInitials}|${submission.courseCode}`].push(window.__reviewRating(4));
      return { ok: true, id: 'e2e-id' };
    };
  });

  const container = await openWithDemo(page);
  await expect(chipScore(container, 'GHI')).toHaveText('–'); // 2 reviews

  await container.locator('.course-faculty-chip', { hasText: 'GHI' }).click();
  const modal = page.getByTestId('rate-faculty-modal');
  await expect(modal).toBeVisible();
  for (const dim of ['Teaching Quality', 'Marking Fairness', 'Behavior & Attitude', 'Course Difficulty', 'Workload']) {
    await modal.getByRole('radio', { name: `4 stars for ${dim}` }).click();
  }
  await modal.getByRole('button', { name: 'Submit Review' }).click();

  await expect(modal).toBeHidden();
  await expect(chipScore(container, 'GHI')).toHaveText('4.0'); // 3 reviews after invalidation
});
