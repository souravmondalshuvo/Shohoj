import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

async function boot(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route('https://**/*', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    if (!localStorage.getItem('__shohoj_e2e_cleaned')) {
      localStorage.removeItem('shohoj_cgpa_v1');
      localStorage.removeItem('shohoj_theme');
      localStorage.removeItem('shohoj_last_sync');
      localStorage.setItem('__shohoj_e2e_cleaned', '1');
      sessionStorage.clear();
    }

    class FakePdf {
      addImage() {}
      addPage() {}
      line() {}
      rect() {}
      roundedRect() {}
      save() { window.__shohojPdfSaved = true; }
      setDrawColor() {}
      setFillColor() {}
      setFont() {}
      setFontSize() {}
      setLineWidth() {}
      setTextColor() {}
      text() {}
    }
    window.jspdf = { jsPDF: FakePdf };
    window.pdfjsLib = window.pdfjsLib || {};
    window.Chart = window.Chart || class { destroy() {} };
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
}

async function loadDemoMode(page) {
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');
  await expect(page.locator('#course-input-0-0')).toHaveValue(/CSE110/);
  await expect(page.locator('#course-input-1-1')).toHaveValue(/CSE220/);
}

test('app loads successfully', async ({ page }) => {
  await boot(page);

  await expect(page).toHaveTitle(/Shohoj/);
  await expect(page.locator('h1')).toContainText('University Life');
  await expect(page.locator('#calculator')).toBeVisible();
});

test('demo mode loads recruiter sample data', async ({ page }) => {
  await boot(page);
  await loadDemoMode(page);

  await expect(page.locator('#course-input-0-1')).toHaveValue(/ENG101/);
  await expect(page.locator('#course-input-1-2')).toHaveValue(/MAT110/);
  await expect(page.locator('#course-input-0-2')).toHaveValue(/PHY111/);
});

test('adding a course updates CGPA', async ({ page }) => {
  await boot(page);
  await loadDemoMode(page);

  await page.locator('#sem-0 .btn-add-course').click();
  await page.locator('#course-input-0-3').fill('CSE221');
  await page.locator('#course-input-0-3').blur();

  const newGradeInput = page
    .locator('#sem-0 .course-row:not(.course-header)')
    .nth(3)
    .locator('input[inputmode="decimal"]');
  await newGradeInput.fill('4.0');
  await newGradeInput.blur();

  await expect(page.locator('#course-input-0-3')).toHaveValue('Algorithms (CSE221)');
  await expect(page.locator('#cgpaVal')).toHaveText('3.57');
});

test('theme toggle persists across reloads', async ({ page }) => {
  await boot(page);

  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('semester planner opens with demo plan courses', async ({ page }) => {
  await boot(page);
  await loadDemoMode(page);

  await selectCalcTab(page, "planner");
  await expect(page.locator('#tabPlanner')).toHaveClass(/active/);
  await expect(page.locator('#plannerContent')).toContainText('CSE221');
});

test('mobile layout avoids page-level horizontal scroll', async ({ page }) => {
  await boot(page, { width: 390, height: 844 });
  await loadDemoMode(page);
  await page.locator('#calculator').scrollIntoViewIfNeeded();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

// Drives the production bundle (shohoj.html), whose CSP drops 'unsafe-inline'
// from script-src. Inline event-handler attributes are inert there, so this
// proves the summary-form Enter key is wired via the CSP-safe delegated
// keydown listener (data-enter-action) rather than an inline onkeydown.
test('summary form Enter confirms under the bundle CSP', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  // Pin "now" to the past so a future start semester (Fall 2026) generates no
  // past semesters, leaving the empty state where "Start from CGPA" lives.
  await page.clock.setFixedTime(new Date('2021-06-01T12:00:00'));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.Chart = window.Chart || class { destroy() {} };
  });
  // This test builds its own page rather than going through boot(), so it has
  // to clear the campus gate itself.
  await unlockCalculator(page);
  await page.goto('/shohoj.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();

  // Step 1 + 2: set department and a future starting semester to reach the
  // empty state (no past semesters are generated).
  await page.locator('#deptSelect').selectOption('CSE');
  await expect(page.locator('#startSemRow')).toBeVisible();
  await page.locator('#startSeason').selectOption('Fall');
  await page.locator('#startYear').selectOption('2026');
  await page.locator('#startSemConfirmBtn').click();

  // Open the "Start from CGPA" summary form.
  await page.locator('[data-action="render:showSummaryForm"]').click();
  await expect(page.locator('#summaryFormBlock')).toBeVisible();

  // Fill the inputs and submit by pressing Enter (not the Confirm button).
  await page.locator('#summaryCgpaInput').fill('3.30');
  await page.locator('#summaryAttemptedInput').fill('45');
  const credits = page.locator('#summaryCreditsInput');
  await credits.fill('42');
  await credits.press('Enter');

  // Enter confirmed the form: it closes and a "Past Semesters" block appears.
  await expect(page.locator('#summaryFormBlock')).toHaveCount(0);
  await expect(page.locator('#semestersContainer')).toContainText('Past Semesters');
});

test('export and import controls do not throw', async ({ page }) => {
  await boot(page);
  await loadDemoMode(page);

  await page.locator('#exportPdfBtn').click();
  await expect.poll(() => page.evaluate(() => window.__shohojPdfSaved === true)).toBe(true);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#importPdfBtn').click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
});
