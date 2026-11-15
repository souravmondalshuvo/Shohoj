// e2e-shell/csp-eval.spec.js
//
// The shell's CSP (app/index.html) has no 'unsafe-eval', and this suite runs
// the production build, so the meta policy here is the real one. Nothing we
// ship should try to eval under it.
//
// zod v4 used to, on every page: constructing a z.object() probes for JIT
// support with a caught `new Function('')`. zod swallowed the throw and fell
// back to jitless parsing, but the browser still fired a securitypolicyviolation
// (blockedURI "eval") on each load — noise in the console, and in any CSP
// reporting we add. src/shared/validation/schema.ts now configures zod jitless
// before any schema exists, so the probe never runs (#752).

import { expect, test } from '../e2e-support/authFixture.js';

// '/quest' is here for Phaser, which the route fetches as it mounts: its build
// carries a `new Function('return this')` fallback for finding the global
// object, reached only where `globalThis` is missing. Its heading is in the
// page before the game is, so this also waits for the canvas.
for (const path of ['/', '/campus', '/quest']) {
  test(`${path} loads without an eval CSP violation`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__evalViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        if (event.blockedURI === 'eval') {
          window.__evalViolations.push(`${event.violatedDirective} ${event.sourceFile}:${event.lineNumber}`);
        }
      });
    });

    await page.goto(path, { waitUntil: 'load' });
    // The route has mounted, so the bundle (and every module-level schema in
    // it) has evaluated — the point where the probe used to fire.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    if (path === '/quest') await expect(page.locator('.quest-stage canvas')).toBeVisible();

    expect(await page.evaluate(() => window.__evalViolations)).toEqual([]);
  });
}
