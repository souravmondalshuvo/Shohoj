// e2e-vite/firebase-isolation.spec.js
//
// Verifies that the Vite build isolates Firebase auth into its own chunk
// (migration Step 4 follow-up). Firebase's SDK imports come from gstatic.com;
// in the old single-chunk layout a blocked gstatic load took the whole `main`
// chunk — and the calculator — down. Here we block gstatic ENTIRELY and assert
// the CGPA calculator still boots and computes, proving the isolation.
//
// Runs via playwright.vite.config.js, which serves dist/ (build:vite first).

import { expect, test } from '@playwright/test';

// Block every external request INCLUDING gstatic, so the firebase entry chunk
// can never finish loading. Only the local dist/ server (http) is allowed.
async function bootWithGstaticBlocked(page) {
  const blockedGstatic = [];
  await page.route('https://**/*', (route) => {
    const url = route.request().url();
    let host = '';
    try { host = new URL(url).hostname; } catch {}
    if (host === 'gstatic.com' || host.endsWith('.gstatic.com')) {
      blockedGstatic.push(url);
    }
    return route.abort();
  });
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
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
  return blockedGstatic;
}

test('calculator works with gstatic (firebase) fully blocked', async ({ page }) => {
  const blockedGstatic = await bootWithGstaticBlocked(page);

  // Demo data → the calculator still computes a CGPA even though the firebase
  // chunk failed to load. (If firebase shared the main chunk, this would hang
  // on a blank #cgpaVal.)
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');
  await expect(page.locator('.cgpa-label')).toHaveText('Current CGPA');

  // The React island (in the main chunk) is unaffected by the firebase failure.
  await expect(page.locator('[data-react-cgpa] #cgpaVal')).toBeAttached();

  // Sanity: gstatic really was requested (firebase tried to load) and blocked.
  expect(blockedGstatic.length).toBeGreaterThan(0);
});
