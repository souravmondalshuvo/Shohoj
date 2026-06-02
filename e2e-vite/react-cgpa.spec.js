// e2e-vite/react-cgpa.spec.js
//
// Verifies the React CGPA island (migration Step 4) against the built Vite
// output in dist/. Runs via playwright.vite.config.js, which serves dist/ —
// the only build where the React island is injected. The default E2E suite
// (e2e/, un-bundled source) does NOT include this, since React is absent there.

import { expect, test } from '@playwright/test';

async function boot(page) {
  // Block external calls, but let the firebase SDK modules load from gstatic:
  // in the Vite build they're bundled into the same chunk as main.js, so a
  // failed gstatic import would take the whole chunk (and the calculator) down.
  // (Isolating firebase into its own chunk is a separate pre-cutover task.)
  await page.route('https://**/*', route =>
    route.request().url().includes('gstatic.com') ? route.continue() : route.abort(),
  );
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    class FakePdf {
      save() { window.__shohojPdfSaved = true; }
    }
    window.jspdf = { jsPDF: FakePdf };
    window.pdfjsLib = window.pdfjsLib || {};
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
}

test('CGPA headline is React-owned and computed via the typed core', async ({ page }) => {
  await boot(page);

  // The island wraps #cgpaVal in a [data-react-cgpa] root and sets the flag
  // that tells recalc() to stop writing the node.
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toBeAttached();
  expect(await page.evaluate(() => window.__SHOHOJ_REACT_SUMMARY__)).toBe(true);

  // Demo data → React renders the same value the typed core computes.
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toHaveText('3.50');
  await expect(page.locator('.cgpa-label')).toHaveText('Current CGPA');
});

test('React island updates when a course changes', async ({ page }) => {
  await boot(page);
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');

  await page.locator('#sem-0 .btn-add-course').click();
  await page.locator('#course-input-0-3').fill('CSE221');
  await page.locator('#course-input-0-3').blur();

  const gradeInput = page
    .locator('#sem-0 .course-row:not(.course-header)')
    .nth(3)
    .locator('input[inputmode="decimal"]');
  await gradeInput.fill('4.0');
  await gradeInput.blur();

  // recalc() fires shohoj:recalc → the React island recomputes from the typed core.
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toHaveText('3.57');
});
