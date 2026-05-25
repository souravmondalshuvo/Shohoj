import { expect, test } from '@playwright/test';

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

  await page.locator('.calc-tab[data-tab="planner"]').click();
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
