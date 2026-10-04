// e2e-shell/reviews-numbered-initials.spec.js
//
// #819: NSU tells lecturers apart with a closing number — MMS1, MMS3 and MMS4
// are three people — so on the shell, where NSU students sign in, the number
// has to survive the review form and the directory. At BRACU a digit is still
// a typo and is dropped.

import { expect, test, installAuth, NSU_STUDENT } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

const DIMENSIONS = [
  'Teaching Quality', 'Marking Fairness', 'Behavior & Attitude', 'Course Difficulty', 'Workload',
];

function stubRelay(page) {
  return page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojSubmitRelay = async (submission) => {
      window.__lastReview = submission;
      return { ok: true, id: 'e2e-id' };
    };
  });
}

function installRecent(page, reviews) {
  return page.addInitScript((seed) => {
    window.__shohojReviewsRepo = {
      async fetchByFaculty() { return { reviews: [], nextCursor: null }; },
      async fetchByCourse() { return { reviews: [], nextCursor: null }; },
      async fetchById() { return null; },
      async fetchRecent() { return seed; },
      async fetchFacultyProfiles() { return []; },
    };
  }, reviews);
}

const review = (fac, n) => ({
  id: `${fac}_${n}_${Math.random()}`,
  facultyInitials: fac,
  courseCode: 'CSE115',
  ratings: { teaching: n, marking: n, behavior: n, difficulty: 3, workload: 3 },
  text: '',
});

/** Open the calculator on demo data and start rating a course with no faculty yet. */
async function openRateModal(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  const container = page.locator('#semestersContainer');
  await container.getByRole('button', { name: 'Try Demo Mode' }).click();
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  const input = container.getByRole('combobox').nth(3);
  await input.click();
  await input.fill('PHY112');
  await container.getByRole('option', { name: /PHY112/ }).first().click();
  const gp = container.getByPlaceholder('0.0 – 4.0').nth(3);
  await gp.fill('3.3');
  await gp.blur();
  await container.getByRole('button', { name: '+ Rate' }).click();
  return { container, modal: page.getByTestId('rate-faculty-modal') };
}

async function rateEverything(modal) {
  for (const dim of DIMENSIONS) {
    await modal.getByRole('radio', { name: `5 stars for ${dim}` }).click();
  }
}

test('an NSU student reviews MMS4 as MMS4, not as MMS', async ({ page }) => {
  await installAuth(page, NSU_STUDENT);
  await stubRelay(page);
  const { container, modal } = await openRateModal(page);

  const initials = modal.getByLabel('Faculty Initials');
  await initials.fill('mms4');
  await expect(initials).toHaveValue('MMS4');
  await rateEverything(modal);
  await modal.getByRole('button', { name: 'Submit Review' }).click();

  await expect(modal).toBeHidden();
  expect((await page.evaluate(() => window.__lastReview)).facultyInitials).toBe('MMS4');
  await expect(container.locator('.course-faculty-chip', { hasText: 'MMS4' })).toBeVisible();
});

test('at BRACU a digit in the initials is still dropped', async ({ page }) => {
  await stubRelay(page);
  const { container, modal } = await openRateModal(page);

  const initials = modal.getByLabel('Faculty Initials');
  await initials.fill('mnr2');
  await expect(initials).toHaveValue('MNR');
  await rateEverything(modal);
  await modal.getByRole('button', { name: 'Submit Review' }).click();

  await expect(modal).toBeHidden();
  expect((await page.evaluate(() => window.__lastReview)).facultyInitials).toBe('MNR');
  await expect(container.locator('.course-faculty-chip', { hasText: 'MNR' })).toBeVisible();
});

test('the NSU directory lists numbered lecturers separately', async ({ page }) => {
  await installAuth(page, NSU_STUDENT);
  await installRecent(page, [review('MMS4', 5), review('MMS4', 5), review('MMS1', 2), review('NVA', 4)]);
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await navigateTo(page, 'Reviews');

  const cards = page.getByTestId('reviews-page').getByTestId('reviews-faculty-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('MMS4');
  await expect(cards.filter({ hasText: 'MMS1' })).toHaveCount(1);
});
