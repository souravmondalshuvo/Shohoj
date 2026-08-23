// e2e-shell/tab-slider.spec.js
//
// #593 / #595: the sliding pill under the active tab.
//
// Neither guard existed before. The visual parity gate captures the route
// interiors — the legacy `.calc-tab-panel` boxes and their shell counterparts
// (e2e-visual/panelRoutes.js) — and nothing in e2e-visual/ captures
// `.calc-tabs`, so the bar itself shipped unguarded: the slider sat ~391px from
// its pill on every route inside a dropdown, and on Home its collapsed self
// still painted a 2px sliver in the bar's left cap.
//
// Alignment is asserted against the active pill's own box rather than a fixed
// coordinate, so the test survives any relayout of the bar.

import { expect, test } from '../e2e-support/authFixture.js';

import { navigateTo } from './_nav.js';

const SLIDER = '.calc-tab-slider';

/** The slider's box once its transition has settled. */
async function sliderBox(page) {
  const slider = page.locator(SLIDER);
  await expect(slider).toHaveAttribute('data-active', 'true');
  // The pill animates over 0.28s; wait for two consecutive identical reads
  // rather than sleeping a fixed amount. Width has to be part of that check —
  // arriving from a hidden slider the x never moves while the width grows, so
  // watching x alone reports "settled" mid-animation.
  let previous = null;
  await expect(async () => {
    const box = await slider.boundingBox();
    const same =
      previous && Math.abs(box.x - previous.x) < 0.5 && Math.abs(box.width - previous.width) < 0.5;
    previous = box;
    expect(same).toBe(true);
  }).toPass({ timeout: 5_000 });
  return previous;
}

test('the slider sits on a top-level tab', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await navigateTo(page, 'Calculator');

  const tab = page.getByRole('link', { name: 'Calculator', exact: true });
  await expect(tab).toBeVisible();
  const slider = await sliderBox(page);
  const pill = await tab.boundingBox();
  expect(Math.abs(slider.x - pill.x)).toBeLessThan(1.5);
  expect(Math.abs(slider.width - pill.width)).toBeLessThan(1.5);
});

test('the slider sits on the group trigger, not the bar edge', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await navigateTo(page, 'Routine');

  // The active route is a menu item inside Plan; the slider tracks the group's
  // trigger pill. Its offsetLeft is measured from the group, not the bar, which
  // is exactly what #595 got wrong.
  const plan = page.getByRole('button', { name: 'Plan', exact: true });
  await expect(plan).toBeVisible();
  const slider = await sliderBox(page);
  const trigger = await plan.boundingBox();
  expect(Math.abs(slider.x - trigger.x)).toBeLessThan(1.5);
  expect(Math.abs(slider.width - trigger.width)).toBeLessThan(1.5);
});

test('the slider is not painted on a route with no active tab', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Home matches no tab. The slider stays in the DOM at width 0, where its own
  // 1px borders would otherwise read as a stray text cursor (#593).
  const slider = page.locator(SLIDER);
  await expect(slider).toHaveAttribute('data-active', 'false');
  await expect(slider).toHaveCSS('opacity', '0');
});
