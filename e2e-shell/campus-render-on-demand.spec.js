// The Campus scene renders on demand (#769): a settled scene draws nothing,
// and a change asks for frames again.
//
// Counted from outside the app: every WebGL context the page creates is
// wrapped so its draw calls tally on window.__draws. Nothing in the scene is
// instrumented for the test, so this measures what a phone's GPU would do.
//
// Measured under reduced motion, where every transition snaps: with motion on,
// the idle orbit (9s after the last interaction) and pulsing rooms are
// deliberate animations that draw, and a test racing them against the model
// load would be exactly the kind of timing flake #769 set out to remove.

import { expect, test } from '../e2e-support/authFixture.js';

const section = (sectionId, courseCode, roomName, day) => ({
  sectionId,
  courseCode,
  sectionName: '01',
  capacity: 40,
  consumedSeat: 10,
  roomName,
  sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
});

async function openCampus(page, { reducedMotion = false } = {}) {
  // emulateMedia, not test.use({ reducedMotion }): the latter did not reach
  // the page under this config, and the scene reads matchMedia once at build.
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__draws = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const ctx = original.call(this, type, ...rest);
      if (ctx && /^(webgl|webgl2|experimental-webgl)$/.test(type) && !ctx.__counted) {
        ctx.__counted = true;
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const fn = ctx[name];
          if (typeof fn !== 'function') continue;
          ctx[name] = function (...args) {
            window.__draws += 1;
            return fn.apply(this, args);
          };
        }
      }
      return ctx;
    };
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '07A-01C', 'SUNDAY'),
          section(2, 'PHY111', '07B-11C', 'MONDAY'),
        ],
      }),
    );
  });
  await page.goto('/campus', { waitUntil: 'domcontentloaded' });
  // The route and its model load lazily.
  await expect(page.getByRole('button', { name: 'Floor 7' })).toBeVisible({ timeout: 15_000 });
}

/** Draw calls made over `ms` of wall time. */
async function drawsOver(page, ms) {
  const before = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(ms);
  return (await page.evaluate(() => window.__draws)) - before;
}

/** Wait until the scene has stopped drawing (easing and model load settled). */
async function settle(page, timeout = 20_000) {
  await expect.poll(() => drawsOver(page, 400), { timeout }).toBe(0);
}

test.describe('under reduced motion', () => {
  test('a settled scene draws nothing, and a floor change draws again', async ({ page }) => {
    await openCampus(page, { reducedMotion: true });
    expect(await page.evaluate(() => window.__draws)).toBeGreaterThan(0);

    await settle(page);
    expect(await drawsOver(page, 1000)).toBe(0);

    const beforeClick = await page.evaluate(() => window.__draws);
    await page.getByRole('button', { name: 'Floor 7' }).click();
    await expect.poll(() => page.evaluate(() => window.__draws)).toBeGreaterThan(beforeClick);
    // Drawn, then quiet again.
    await settle(page);
  });

  test('a resize redraws once and settles', async ({ page }) => {
    await openCampus(page, { reducedMotion: true });
    await settle(page);
    const before = await page.evaluate(() => window.__draws);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(() => page.evaluate(() => window.__draws)).toBeGreaterThan(before);
    await settle(page);
  });
});
