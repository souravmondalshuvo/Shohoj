// e2e-shell/calculator-rate-faculty.spec.js
//
// #319: the faculty-rating flow on the React Router shell's /calculator route,
// against the built dist-shell/ output. Demo data's courses all carry faculty
// initials (chips); a freshly added graded course has none (the + Rate pill).
// The standalone shell has no Firebase, so a real submit fails with the
// signed-out message; the success path stubs the typed submit relay
// (window.__shohojSubmitRelay) plus the uid hook (_shohoj_currentUid) the
// signed-in guard reads.

import { expect, test, anonymousTest } from '../e2e-support/authFixture.js';

async function openWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  return page.locator('#semestersContainer');
}

// Add PHY112 to the first demo semester and grade it — a graded catalog course
// with no faculty, so the "+ Rate" pill renders.
async function addUnratedCourse(page, container) {
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  const input = container.getByRole('combobox').nth(3);
  await input.click();
  await input.fill('PHY112');
  await container.getByRole('option', { name: /PHY112/ }).first().click();
  const gp = container.getByPlaceholder('0.0 – 4.0').nth(3);
  await gp.fill('3.3');
  await gp.blur();
}

test('a faculty chip opens the modal prefilled with initials, course and semester', async ({ page }) => {
  const container = await openWithDemo(page);

  await container.locator('.course-faculty-chip', { hasText: 'GHI' }).click();
  const modal = page.getByTestId('rate-faculty-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Rate your faculty' })).toBeVisible();
  await expect(modal.getByLabel('Faculty Initials')).toHaveValue('GHI');
  await expect(modal.getByText('Course: CSE220 · Spring 2025')).toBeVisible();
});

test('validation: initials first, then the first missing rating by dimension', async ({ page }) => {
  const container = await openWithDemo(page);
  await addUnratedCourse(page, container);

  await container.getByRole('button', { name: '+ Rate' }).click();
  const modal = page.getByTestId('rate-faculty-modal');

  // Empty initials → the initials error, no rating error yet.
  await modal.getByRole('button', { name: 'Submit Review' }).click();
  await expect(modal.getByText('Initials must be 2–6 letters.')).toBeVisible();

  // Valid initials but no stars → the first dimension's message.
  await modal.getByLabel('Faculty Initials').fill('MNR');
  await modal.getByRole('button', { name: 'Submit Review' }).click();
  await expect(modal.getByRole('alert')).toHaveText('Please rate "Teaching Quality"');

  // Rating the first dimension moves the error to the next one.
  await modal.getByRole('radio', { name: '5 stars for Teaching Quality' }).click();
  await modal.getByRole('button', { name: 'Submit Review' }).click();
  await expect(modal.getByRole('alert')).toHaveText('Please rate "Marking Fairness"');
});

anonymousTest('a signed-out visitor never reaches the rate modal at all', async ({ page }) => {
  // Was: 'a complete signed-out submit fails with the sign-in message'. That
  // path is unreachable now — the gate replaces the outlet before the
  // calculator renders, so there is no course row and no + Rate button to
  // press. The modal's own 'Sign in to submit a review' guard still exists in
  // the component as defence in depth; it simply cannot be driven from the UI.
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('signin-portal')).toBeVisible();
  await expect(page.getByTestId('rate-faculty-modal')).toHaveCount(0);
});

test('a stubbed signed-in relay submits: initials land on the course as a chip + toast', async ({ page }) => {
  await page.addInitScript(() => {
    window._shohoj_currentUid = () => 'e2e-uid';
    window.__shohojSubmitRelay = async (submission) => {
      window.__lastReview = submission;
      return { ok: true, id: 'e2e-id' };
    };
  });
  const container = await openWithDemo(page);
  await addUnratedCourse(page, container);

  await container.getByRole('button', { name: '+ Rate' }).click();
  const modal = page.getByTestId('rate-faculty-modal');
  await modal.getByLabel('Faculty Initials').fill('mnr'); // normalized to MNR
  for (const dim of ['Teaching Quality', 'Marking Fairness', 'Behavior & Attitude', 'Course Difficulty', 'Workload']) {
    await modal.getByRole('radio', { name: `5 stars for ${dim}` }).click();
  }
  await modal.getByLabel('Your experience (optional)').fill('Great lectures');
  await modal.getByRole('button', { name: 'Submit Review' }).click();

  await expect(modal).toBeHidden();
  await expect(page.getByText('Review submitted — thank you')).toBeVisible();
  const chip = container.locator('.course-faculty-chip', { hasText: 'MNR' });
  await expect(chip).toBeVisible();

  // The hook received the shaped legacy payload.
  const sent = await page.evaluate(() => window.__lastReview);
  expect(sent.facultyInitials).toBe('MNR');
  expect(sent.courseCode).toBe('PHY112');
  expect(sent.text).toBe('Great lectures');
  expect(sent.ratings.teaching).toBe(5);

  // The write-back persists like any other course edit.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('#semestersContainer').locator('.course-faculty-chip', { hasText: 'MNR' }),
  ).toBeVisible();
});

test('Skip closes the modal without touching the course', async ({ page }) => {
  const container = await openWithDemo(page);
  await addUnratedCourse(page, container);

  await container.getByRole('button', { name: '+ Rate' }).click();
  const modal = page.getByTestId('rate-faculty-modal');
  await modal.getByLabel('Faculty Initials').fill('MNR');
  await modal.getByRole('button', { name: 'Skip' }).click();

  await expect(modal).toBeHidden();
  await expect(container.getByRole('button', { name: '+ Rate' })).toBeVisible(); // still unrated
});
