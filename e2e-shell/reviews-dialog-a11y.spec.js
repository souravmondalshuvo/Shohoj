// e2e-shell/reviews-dialog-a11y.spec.js
//
// Part of #365: focus trap/restore across the three review-write dialogs
// (RateFacultyModal, ReportReviewModal, CourseReviewsModal). Each shares the
// trapTabKey + useRestoreFocus hook (src/shared/ui/useFocusTrap.ts): focus
// moves into the dialog on open, Tab/Shift+Tab cycles within it, and closing
// restores focus to whatever opened it.

import { expect, test } from '@playwright/test';

import { navigateTo } from './_nav.js';

async function openPlannerWithDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await navigateTo(page, 'Planner');
  await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
}

function installRepo(page) {
  return page.addInitScript(() => {
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
}

test.describe('RateFacultyModal', () => {
  async function openWithDemo(page) {
    await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('link', { name: 'Calculator', exact: true }).click();
    await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
    return page.locator('#semestersContainer');
  }

  test('focus enters on the initials field, Tab wraps within the dialog, Escape restores it', async ({ page }) => {
    const container = await openWithDemo(page);
    const chip = container.locator('.course-faculty-chip', { hasText: 'GHI' });
    await chip.click();

    const modal = page.getByTestId('rate-faculty-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Faculty Initials')).toBeFocused();

    // Shift+Tab from the first focusable element wraps to the last (Submit Review).
    await page.keyboard.press('Shift+Tab');
    await expect(modal.getByRole('button', { name: 'Submit Review' })).toBeFocused();

    // Tab from the last wraps back to the first.
    await page.keyboard.press('Tab');
    await expect(modal.getByLabel('Faculty Initials')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(chip).toBeFocused();
  });
});

test.describe('ReportReviewModal', () => {
  test('focus enters on the reason field, Tab wraps within the dialog, Escape restores it', async ({ page }) => {
    await installRepo(page);
    await openPlannerWithDemo(page);
    await page
      .locator('.pl-plan-row', { has: page.locator('.pl-code', { hasText: 'CSE221' }) })
      .locator('.pl-reviews')
      .click();

    const viewer = page.getByTestId('course-reviews-modal');
    const reportButton = viewer.getByRole('button', { name: 'Report this review' });
    await reportButton.click();

    const modal = page.getByTestId('report-review-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Reason for reporting')).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(modal.getByRole('button', { name: 'Send report' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(modal.getByLabel('Reason for reporting')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(reportButton).toBeFocused();
  });
});

test.describe('CourseReviewsModal', () => {
  test('focus enters on the dialog, Tab wraps within it, Escape restores the opening star', async ({ page }) => {
    await installRepo(page);
    await openPlannerWithDemo(page);
    const star = page
      .locator('.pl-plan-row', { has: page.locator('.pl-code', { hasText: 'CSE221' }) })
      .locator('.pl-reviews');
    await star.click();

    const modal = page.getByTestId('course-reviews-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toBeFocused();

    // Shift+Tab from the dialog container (first stop) wraps to the last
    // focusable element, the footer's Close button.
    await page.keyboard.press('Shift+Tab');
    await expect(modal.getByRole('button', { name: 'Close' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(star).toBeFocused();
  });
});
