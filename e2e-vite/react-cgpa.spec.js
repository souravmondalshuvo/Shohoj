// e2e-vite/react-cgpa.spec.js
//
// Verifies the React CGPA island (migration Step 4) against the built Vite
// output in dist/. Runs via playwright.vite.config.js, which serves dist/ —
// the only build where the React island is injected. The default E2E suite
// (e2e/, un-bundled source) does NOT include this, since React is absent there.

import { expect, test } from '@playwright/test';

async function boot(page) {
  // Block external calls, but let the firebase SDK modules load from gstatic so
  // the auth boot exercises its real path here. (Firebase now lives in its own
  // chunk — see firebase-isolation.spec.js, which blocks gstatic entirely and
  // proves the calculator survives a firebase load failure.)
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

  // The islands wrap #cgpaVal, footer credit totals, and the CGPA meter; their
  // flags tell recalc() to stop writing those nodes.
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toBeAttached();
  expect(await page.evaluate(() => window.__SHOHOJ_REACT_SUMMARY__)).toBe(true);
  await expect(page.locator('[data-react-cgpa-credit="attempted"]#totalAttempted')).toBeAttached();
  await expect(page.locator('[data-react-cgpa-credit="earned"]#totalEarned')).toBeAttached();
  expect(await page.evaluate(() => window.__SHOHOJ_REACT_CREDIT_TOTALS__)).toBe(true);
  await expect(page.locator('.cgpa-meter[data-react-cgpa-meter="true"] #meterPct')).toBeAttached();
  expect(await page.evaluate(() => window.__SHOHOJ_REACT_METER__)).toBe(true);

  // Demo data → React renders the same values the typed core computes.
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toHaveText('3.50');
  await expect(page.locator('.cgpa-label')).toHaveText('Current CGPA');
  await expect(page.locator('[data-react-cgpa-credit="attempted"]#totalAttempted')).toHaveText('18');
  await expect(page.locator('[data-react-cgpa-credit="earned"]#totalEarned')).toHaveText('18');
  await expect(page.locator('.cgpa-meter[data-react-cgpa-meter="true"] #meterPct')).toHaveText('87.5%');
  await expect(page.locator('.cgpa-meter[data-react-cgpa-meter="true"] #meterStatus')).toContainText("You're on track for a strong degree.");
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
  await expect(page.locator('[data-react-cgpa-credit="attempted"]#totalAttempted')).toHaveText('21');
  await expect(page.locator('[data-react-cgpa-credit="earned"]#totalEarned')).toHaveText('21');
  await expect(page.locator('.cgpa-meter[data-react-cgpa-meter="true"] #meterPct')).toHaveText('89.3%');
  await expect(page.locator('.cgpa-meter[data-react-cgpa-meter="true"] #meterStatus')).toContainText('CGPA 3.57');
});
