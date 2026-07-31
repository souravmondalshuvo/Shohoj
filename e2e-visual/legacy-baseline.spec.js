import { test, expect } from '@playwright/test';
import {
  primeTheme,
  stabilize,
  pinForCapture,
  TARGETS,
  ADMIN_TARGETS,
  VIEWPORTS,
  THEMES,
  shotName,
} from './_stabilize.js';

// Authors the baseline images from the LEGACY page — the visual reference the
// migrated shell must match. Run with --update-snapshots to (re)author:
//
//   npm run test:visual:baseline
//
// Without that flag this suite still runs as a regression check on the legacy
// page itself, which is useful on its own: if these fail, legacy changed.
//
// e2e-visual/shell-parity.spec.js asserts the same snapshot names, and
// playwright.visual.config.js maps both projects onto one file per name.

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`legacy · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await primeTheme(page, theme);
        await page.goto('/index.html', { waitUntil: 'load' });
        await stabilize(page);
      });

      test('theme actually applied', async ({ page }) => {
        // Guards against silently baselining every shot in the default theme,
        // which would make the light/dark pairs identical and meaningless.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      });

      for (const target of TARGETS) {
        test(`${target.name} matches`, async ({ page }) => {
          const el = page.locator(target.selector).first();
          await expect(el).toBeVisible();
          await expect(el).toHaveScreenshot(shotName(target.name, viewport.name, theme));
        });
      }
    });

    test.describe(`legacy admin · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await primeTheme(page, theme);
        await page.goto('/index.html', { waitUntil: 'load' });
        // What updateAuthUI does once the `admin` custom claim resolves
        // (js/auth/firebase.js): the anchor ships in the markup as
        // `display: none` and only `.is-admin` reveals it. Adding the class
        // directly keeps the baseline a pure styling reference — no Firebase,
        // no fixture account, no signed-in email text in the frame.
        await page.evaluate(() => {
          document.getElementById('adminNavBtn')?.classList.add('is-admin');
        });
        await stabilize(page);
      });

      for (const target of ADMIN_TARGETS) {
        test(`${target.name} matches`, async ({ page }) => {
          const el = page.locator(target.selector).first();
          await expect(el).toBeVisible();
          await pinForCapture(page, target.selector);
          await expect(el).toHaveScreenshot(shotName(target.name, viewport.name, theme));
        });
      }
    });
  }
}
