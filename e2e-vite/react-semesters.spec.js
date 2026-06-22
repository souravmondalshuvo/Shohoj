// e2e-vite/react-semesters.spec.js
//
// Phase 5B: verifies the React calculator-semesters island against the built
// Vite output in dist/. The island is opt-in (?reactSemesters=1); when on, it
// owns #semestersContainer and the legacy renderSemesters() stands down. This
// proves the integration end to end: React renders the semester list from the
// shared state, and a React-driven mutation flows through the typed
// _shohoj_setSemesters write path back into a re-render.

import { expect, test } from '@playwright/test';

async function boot(page) {
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    class FakePdf {
      save() {
        window.__shohojPdfSaved = true;
      }
    }
    window.jspdf = { jsPDF: FakePdf };
    window.pdfjsLib = window.pdfjsLib || {};
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.goto('/?reactSemesters=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
}

test('the React island owns the semesters container when opted in', async ({ page }) => {
  await boot(page);
  // Demo data populates the shared state; recalc broadcasts shohoj:recalc, which
  // the island's bridge listens to.
  await page.locator('#heroDemoBtn').click();

  // Legacy renderer stood down in favor of React.
  await expect.poll(() => page.evaluate(() => window.__SHOHOJ_REACT_SEMESTERS__ === true)).toBe(true);

  // React rendered the demo semesters into the container.
  const container = page.locator('#semestersContainer');
  await expect(container.locator('.semester-label', { hasText: 'Fall 2024' })).toBeVisible();
  await expect(container.locator('.semester-label', { hasText: 'Spring 2025' })).toBeVisible();
});

test('a React mutation flows through the write path and re-renders', async ({ page }) => {
  await boot(page);
  await page.locator('#heroDemoBtn').click();

  const container = page.locator('#semestersContainer');
  await expect(container.locator('.semester-label', { hasText: 'Fall 2024' })).toBeVisible();

  // Count course inputs in the first (Fall 2024) semester block, then add one.
  const fallBlock = container.locator('.semester-block', { hasText: 'Fall 2024' }).first();
  const before = await fallBlock.locator('input[id^="course-input-"]').count();

  await fallBlock.getByRole('button', { name: '+ Add course' }).click();

  // The new row appears — proving onAddCourse → mutations.addCourse →
  // _shohoj_setSemesters → recalc → bridge → React re-render works end to end.
  await expect.poll(() => fallBlock.locator('input[id^="course-input-"]').count()).toBe(before + 1);
});
