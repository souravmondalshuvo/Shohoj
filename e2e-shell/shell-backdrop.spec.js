// e2e-shell/shell-backdrop.spec.js
//
// Guards the ambient layer (src/app/ShellBackdrop.tsx). e2e-visual cannot cover
// any of this: its stabilize step hides the canvas, orbs and cursor before
// capturing, precisely because they are animated and pointer-driven. So the
// backdrop's presence and geometry are asserted here through the DOM instead.
//
// The load-bearing test is "reveals fire after a client-side navigation".
// Legacy's reveal.js walks the DOM once at boot, and every `.reveal` target
// starts at opacity: 0 (style.css:574). Ported naively that is not a missing
// animation — it is permanently invisible content on every route reached after
// first paint. That failure is silent: the markup is present and the tests that
// query text still pass, while a user sees a blank page.

import { expect, test } from '@playwright/test';

import { navigateTo } from './_nav.js';

test('the backdrop mounts its layers', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });

  await expect(page.locator('canvas#dot-matrix')).toHaveCount(1);
  await expect(page.locator('.orb')).toHaveCount(3);
  await expect(page.locator('#cursor-dot')).toHaveCount(1);
  await expect(page.locator('#cursor-ring')).toHaveCount(1);
  await expect(page.locator('#cursor-glow')).toHaveCount(1);
  await expect(page.locator('#scroll-progress')).toHaveCount(1);
  // Referenced as url(#liquid-distort) by the glass surfaces.
  await expect(page.locator('filter#liquid-distort')).toHaveCount(1);
});

test('the canvas is sized to the viewport and actually paints', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/', { waitUntil: 'load' });
  await page.mouse.move(500, 350);
  await page.mouse.move(300, 250, { steps: 12 });

  const painted = await page.evaluate(() => {
    const c = document.getElementById('dot-matrix');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
    return { w: c.width, h: c.height, lit };
  });

  expect(painted.w).toBe(1000);
  expect(painted.h).toBe(700);
  // A blank canvas is the regression this catches: the grid renders thousands
  // of dots, so any non-trivial count means the loop ran and drew.
  expect(painted.lit).toBeGreaterThan(500);
});

test('reveals fire after a client-side navigation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });

  // Leave the landing route, then come back through the router — the DOM the
  // observers were built against is gone by now.
  await navigateTo(page, 'Reviews');
  await expect(page).toHaveURL(/\/reviews$/);
  await page.getByRole('link', { name: 'Shohoj home' }).click();
  await expect(page).toHaveURL(/\/(#features)?$/);

  // The hero cascade is time-based, so it plays on arrival.
  await expect(page.locator('.hero-badge')).toHaveClass(/visible/);

  // The feature cards are observer-driven and start below the fold, so they are
  // correctly still hidden here — scrolling is what should reveal them, and a
  // stale observer is exactly what would leave them transparent forever.
  const card = page.locator('.feature-card').first();
  await expect(card).not.toHaveClass(/visible/);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveClass(/visible/);

  // The real user-visible symptom, independent of class names. Polled rather
  // than sampled once: the cards carry a staggered transition-delay, so the
  // fade is still in flight the instant `.visible` lands.
  await expect
    .poll(() => card.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 })
    .toBeGreaterThan(0.9);
});

test('the stat counters settle on their target values', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const nums = page.locator('.hero-stats .stat-num');
  await expect(nums.nth(0)).toHaveText('857');
  await expect(nums.nth(1)).toHaveText('16');
  await expect(nums.nth(2)).toHaveText('100%');
});
