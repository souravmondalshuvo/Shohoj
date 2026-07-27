import { test, expect } from '@playwright/test';
import { primeTheme, stabilize, TARGETS, VIEWPORTS, THEMES, shotName } from './_stabilize.js';

// The parity gate. Asserts the migrated shell renders pixel-identical to the
// baselines authored from the legacy page by legacy-baseline.spec.js.
//
// THIS SUITE IS EXPECTED TO FAIL UNTIL PHASE 1 LANDS. Today the shell has no
// .hero and no #features at all, and css/style.css is not imported — so it
// fails on the visibility assertion long before it reaches a pixel compare.
// That is the point: this going green IS the definition of done, and it is the
// exit criterion for the migration.
//
// Do not wire `test:visual` into CI until it passes; add it to the workflow in
// the same change that turns it green, so it never lands as a known-red job.

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`shell · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await primeTheme(page, theme);
        await page.goto('/', { waitUntil: 'load' });
        await stabilize(page);
      });

      test('theme actually applied', async ({ page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      });

      for (const target of TARGETS) {
        test(`${target.name} matches legacy`, async ({ page }) => {
          const el = page.locator(target.selector).first();
          await expect(el).toBeVisible();
          await expect(el).toHaveScreenshot(shotName(target.name, viewport.name, theme));
        });
      }
    });
  }
}
