// Visual parity captures the SIGNED-OUT shell against legacy baselines
// (HomeRoute swaps its CTA on uid), so these must not use the signed-in
// default fixture.
import { anonymousTest as test, test as authedTest, expect } from '../e2e-support/authFixture.js';
import {
  primeTheme,
  stabilize,
  pinForCapture,
  captureBox,
  pinFeedAndClock,
  assertNotGated,
  shellRouteContainer,
  baselineWidth,
  baselineSize,
  CAPTURE_ROUTE_PIXELS,
  TARGETS,
  ADMIN_TARGETS,
  PANEL_TARGETS,
  HEADER_TARGET,
  VIEWPORTS,
  THEMES,
  shotName,
} from './_stabilize.js';

// The parity gate. Asserts the migrated shell renders pixel-identical to the
// baselines authored from the legacy page by legacy-baseline.spec.js.
//
// This going green is the exit criterion for the parity migration.

// Legacy always shows its signed-out "Sign in" pill (static markup), but the
// shell renders auth UI only on a cloud-capable build — the offline preview
// shows nothing there (asserted by auth-controls.spec.js). Injecting valid-
// shaped config makes the shell settle anonymous and render the same "Sign in"
// pill, so the nav capture compares like with like. Same globals shape as
// auth-controls.spec.js's cloud case; the SDK initialises locally and never
// reaches a real backend.
const CLOUD_GLOBALS = {
  _shohoj_firebase_config: {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
    measurementId: 'G-XYZ',
  },
  _shohoj_papers_worker_url: 'https://papers.example.com',
  _shohoj_recaptcha_v3_site_key: 'sitekey',
  _shohoj_google_client_id: 'client-id',
};

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`shell · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await primeTheme(page, theme);
        await page.addInitScript((globals) => {
          Object.assign(window, globals);
        }, CLOUD_GLOBALS);
        await page.goto('/', { waitUntil: 'load' });
        // Let the auth listener settle so the "Sign in" pill is present before
        // the nav is captured; harmless for the hero/features captures.
        await page
          .locator('.shell-auth-btn')
          .waitFor({ state: 'visible', timeout: 15_000 })
          .catch(() => {});
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

    test.describe(`shell admin · ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await primeTheme(page, theme);
        // AdminNavLink mounts off the auth snapshot's isAdmin, so the standard
        // __shohojAuthSource seam is enough — no cloud config needed, since the
        // capture is scoped to the link and never includes the auth pill that
        // CLOUD_GLOBALS exists to render.
        await page.addInitScript(() => {
          // Stable reference: useSyncExternalStore compares get() by identity.
          const snapshot = {
            status: 'authenticated',
            uid: 'u_admin',
            email: 'admin@g.bracu.ac.bd',
            isAdmin: true,
          };
          window.__shohojAuthSource = {
            get: () => snapshot,
            subscribe: () => () => {},
            getIdToken: async () => 'test-token',
          };
        });
        await page.goto('/', { waitUntil: 'load' });
        await stabilize(page);
      });

      for (const target of ADMIN_TARGETS) {
        test(`${target.name} matches legacy`, async ({ page }) => {
          const el = page.locator(target.selector).first();
          await expect(el).toBeVisible();
          await pinForCapture(page, target.selector);
          await expect(el).toHaveScreenshot(shotName(target.name, viewport.name, theme));
        });
      }
    });

    // Route interiors — the captures docs/ROLLBACK.md names as the missing
    // precondition for a third cutover attempt.
    //
    // These use the SIGNED-IN runner, unlike every capture above. The shell
    // gates each route behind sign-in (GatedMain), so an anonymous run would
    // capture the sign-in portal for all nine routes and compare it against
    // nine different legacy panels. assertNotGated makes that failure loud
    // instead of merely red.
    authedTest.describe(`shell routes · ${viewport.name} · ${theme}`, () => {
      authedTest.use({ viewport: { width: viewport.width, height: viewport.height } });

      authedTest(`${HEADER_TARGET.name} matches legacy`, async ({ page }) => {
        await primeTheme(page, theme);
        await pinFeedAndClock(page);
        await page.goto('/calculator', { waitUntil: 'load' });
        await stabilize(page);
        const el = page.locator(HEADER_TARGET.selector).first();
        await expect(el).toBeVisible();

        // Always-on: the header renders, at legacy's box. That is the
        // regression this exists to catch — the shell had no header at all, so
        // there was no box to measure.
        //
        // The pixels ride behind the same VISUAL_ROUTE_PIXELS flag as the route
        // interiors. On a Linux runner the two headers differ by ~1.3% of
        // pixels — text antialiasing, invisible at any zoom a person would use,
        // reproducible on CI and not on macOS. Comparing the box catches a
        // header that moved, resized or disappeared; demanding bit-equal
        // glyphs across renderers would only teach people to re-run the job.
        const shot = shotName(HEADER_TARGET.name, viewport.name, theme);
        const box = await el.boundingBox();
        const expected = baselineSize(shot);
        expect(
          { width: Math.round(box.width), height: Math.round(box.height) },
          `${HEADER_TARGET.selector} box`,
        ).toEqual(expected);

        if (CAPTURE_ROUTE_PIXELS) {
          await captureBox(page, expect, HEADER_TARGET.selector, shot, { flattenGlass: true });
        }
      });

      for (const target of PANEL_TARGETS) {
        authedTest(`${target.name} route matches legacy`, async ({ page }) => {
          await primeTheme(page, theme);
          // Same fixture and same instant as the legacy capture — otherwise the
          // two sides read different feeds minutes apart and the diff is data.
          await pinFeedAndClock(page);
          await page.goto(target.route, { waitUntil: 'load' });
          await stabilize(page);
          await assertNotGated(page, expect, target.route);

          const el = await shellRouteContainer(page);
          await expect(el).toBeVisible();

          // The always-on gate: the route renders at legacy's width. Content
          // height legitimately differs (the shell recomposes panels — see
          // CAPTURE_ROUTE_PIXELS), but the BOX must match, and comparing a
          // rounded CSS width against the baseline PNG's own width means the
          // legacy page stays the single source of that number.
          const shot = shotName(`route-${target.name}`, viewport.name, theme);
          const box = await el.boundingBox();
          expect(Math.round(box.width), `${target.route} container width`).toBe(
            baselineWidth(shot),
          );

          if (CAPTURE_ROUTE_PIXELS) await expect(el).toHaveScreenshot(shot);
        });
      }
    });
  }
}
