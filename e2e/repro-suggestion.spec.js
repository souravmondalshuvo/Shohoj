import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const BUNDLE_PATH = path.join(repoRoot, 'shohoj.html');
const BUNDLE = 'file://' + BUNDLE_PATH;

// The production bundle (shohoj.html) is a gitignored build artifact and CI
// builds it after the e2e step, so build it on demand here. If it can't be
// produced (e.g. no python), the bundle variants skip rather than fail.
let bundleReady = fs.existsSync(BUNDLE_PATH);
test.beforeAll(() => {
  if (bundleReady) return;
  try {
    execSync('python3 build3.py', { cwd: repoRoot, stdio: 'ignore' });
    bundleReady = fs.existsSync(BUNDLE_PATH);
  } catch {
    bundleReady = false;
  }
});

// Regression for: in the hardened production bundle (CSP without
// 'unsafe-inline'), inline on* handlers are blocked, so a user could not
// select a course from the suggestion list. Selection is now delegated.
// We run against both the dev modules (served at '/') and shohoj.html.
for (const target of ['/', BUNDLE]) {
  const isBundle = target === BUNDLE;
  const label = isBundle ? 'production bundle' : 'dev modules';

  async function openCourseSuggestions(page) {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.locator('#heroDemoBtn').click();
    await expect(page.locator('#cgpaVal')).toHaveText('3.50');
    await page.locator('#sem-0 .btn-add-course').click();

    const input = page.locator('#course-input-0-3');
    // Center the input so focusing/typing doesn't auto-scroll — a scroll
    // would clear the suggestion portal (see initSuggestionsScrollHandler).
    await input.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await input.click();
    await input.pressSequentially('cse221', { delay: 40 });
    await expect(page.locator('#suggestions-portal .suggestion-item').first()).toBeVisible();
    return input;
  }

  test(`pointer selects a course (${label})`, async ({ page }) => {
    test.skip(isBundle && !bundleReady, 'shohoj.html bundle not built');
    const input = await openCourseSuggestions(page);
    // Selection fires on mousedown (before the input blurs); dispatch it
    // directly to avoid Playwright's .click() racing the re-render.
    await page.locator('#suggestions-portal .suggestion-item').first()
      .dispatchEvent('mousedown');
    await expect(input).toHaveValue('Algorithms (CSE221)', { timeout: 2000 });
  });

  test(`keyboard Enter selects a course (${label})`, async ({ page }) => {
    test.skip(isBundle && !bundleReady, 'shohoj.html bundle not built');
    const input = await openCourseSuggestions(page);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toHaveValue('Algorithms (CSE221)', { timeout: 2000 });
  });
}
