// Visual parity captures the SIGNED-OUT shell against legacy baselines
// (HomeRoute swaps its CTA on uid), so these must not use the signed-in
// default fixture.
import { anonymousTest as test, expect } from '../e2e-support/authFixture.js';
import { unlockCalculator } from '../e2e/helpers/gate.js';
import {
  primeTheme,
  stabilize,
  pinForCapture,
  captureBox,
  pinFeedAndClock,
  TARGETS,
  ADMIN_TARGETS,
  PANEL_TARGETS,
  HEADER_TARGET,
  FOOTER_TARGET,
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

    // Route interiors. Legacy is ONE page whose features are `.calc-tab-panel`
    // divs toggled by switchCalcTab, reachable by the deterministic hash
    // restoreCalcTab understands — so the harness lands on a panel without
    // clicking through dropdown menus or racing their animations.
    test.describe(`legacy panels · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test(`${HEADER_TARGET.name} matches`, async ({ page }) => {
        await primeTheme(page, theme);
        await unlockCalculator(page);
        await pinFeedAndClock(page);
        await page.goto('/index.html#calculator', { waitUntil: 'load' });
        await stabilize(page);
        const el = page.locator(HEADER_TARGET.selector).first();
        await expect(el).toBeVisible();
        await captureBox(
          page,
          expect,
          HEADER_TARGET.selector,
          shotName(HEADER_TARGET.name, viewport.name, theme),
          { flattenGlass: true },
        );
      });

      test(`${FOOTER_TARGET.name} matches`, async ({ page }) => {
        await primeTheme(page, theme);
        await unlockCalculator(page);
        await pinFeedAndClock(page);
        await page.goto('/index.html#calculator', { waitUntil: 'load' });
        await stabilize(page);
        const el = page.locator(FOOTER_TARGET.selector).first();
        await expect(el).toBeVisible();
        // Below the fold on both sides — the footer sits under the whole panel.
        // captureBox clips out of a VIEWPORT screenshot, so without this the
        // clip lands outside the image and Playwright reports an empty area.
        await el.scrollIntoViewIfNeeded();
        await captureBox(
          page,
          expect,
          FOOTER_TARGET.selector,
          shotName(FOOTER_TARGET.name, viewport.name, theme),
          { flattenGlass: true },
        );
      });

      for (const target of PANEL_TARGETS) {
        test(`${target.name} panel matches`, async ({ page }) => {
          await primeTheme(page, theme);
          // The campus gate (#575) hides the calculator until sign-in resolves a
          // student to a campus, so a signed-out capture would photograph the
          // sign-in portal for all nine panels. This sets the same session flag
          // the portal's own escape hatches set — a returning student's browser
          // — which is what these baselines are meant to depict. The gate itself
          // is exercised in e2e/campus-gate.spec.js.
          await unlockCalculator(page);
          // Free Rooms reads the live CONNECT feed and the wall clock, so
          // without this the panel is a different picture every hour.
          await pinFeedAndClock(page);
          // Per-test rather than in a beforeEach: each panel needs its own hash,
          // and two consecutive gotos differing only by hash are a SAME-DOCUMENT
          // navigation — no reload, so restoreCalcTab never re-runs and the page
          // would keep showing the previous panel.
          await page.goto(`/index.html${target.hash}`, { waitUntil: 'load' });
          await stabilize(page);

          const el = page.locator(`#${target.panel}`);
          await expect(el).toBeVisible();
          await expect(el).toHaveScreenshot(shotName(`route-${target.name}`, viewport.name, theme));
        });
      }
    });
  }
}
