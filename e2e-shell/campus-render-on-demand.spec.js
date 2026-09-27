// The Campus scene renders on demand (#769): a settled scene draws nothing,
// and a change asks for frames again.
//
// Counted from outside the app: every WebGL context the page creates is
// wrapped so its draw calls tally on window.__draws. Nothing in the scene is
// instrumented for the test, so this measures what a phone's GPU would do.
//
// Mostly measured under reduced motion, where every transition snaps: with
// motion on, a selected floor's pulsing rooms are a deliberate animation that
// draws, and a test racing easing against the model load would be exactly the
// kind of timing flake #769 set out to remove. The one motion-on test opens
// no floor, so nothing in it is meant to move.

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
    // Draw calls per animation frame that drew anything, in order.
    window.__frameDraws = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        const before = window.__draws;
        callback(time);
        if (window.__draws > before) window.__frameDraws.push(window.__draws - before);
      });
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

/** Drag across the middle of the map, as a viewer orbiting it would. */
async function orbit(page) {
  const canvas = page.getByTestId('campus-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 120, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(x - 120 + step * 30, y);
  await page.mouse.up();
}

/** Wait until the scene has stopped drawing (easing and model load settled). */
async function settle(page, timeout = 20_000) {
  await expect.poll(() => drawsOver(page, 400), { timeout }).toBe(0);
}

/** Wait for the building model to finish (either way), then for the scene to settle. */
async function modelSettled(page) {
  await expect(page.getByTestId('campus-canvas')).toHaveAttribute('data-model-state', /loaded|failed|unavailable/, {
    timeout: 20_000,
  });
  await settle(page);
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

  test('orbiting redraws the camera view', async ({ page }) => {
    // Without damping, OrbitControls moves the camera inside its own pointer
    // handlers; the loop must still notice and draw.
    await openCampus(page, { reducedMotion: true });
    await modelSettled(page);
    const before = await page.evaluate(() => window.__draws);
    await orbit(page);
    await expect.poll(() => page.evaluate(() => window.__draws)).toBeGreaterThan(before);
    await settle(page);
  });

  test('a camera-only frame skips the shadow pass', async ({ page }) => {
    // The sun and the building never move (#781): an orbit frame draws the
    // scene once, a changed scene draws it into the shadow map too.
    await openCampus(page, { reducedMotion: true });
    await modelSettled(page);

    await page.evaluate(() => (window.__frameDraws = []));
    await page.setViewportSize({ width: 900, height: 700 });
    await settle(page);
    const changed = await page.evaluate(() => Math.max(...window.__frameDraws));

    await page.evaluate(() => (window.__frameDraws = []));
    await orbit(page);
    await settle(page);
    const cameraOnly = await page.evaluate(() => Math.max(...window.__frameDraws));

    expect(cameraOnly).toBeGreaterThan(0);
    expect(cameraOnly).toBeLessThan(changed);
  });
});

test('with motion on, an untouched tower stays still (no idle orbit)', async ({ page }) => {
  // The camera used to start drifting 9s after the last interaction, redrawing
  // the whole model every frame on a page nobody was looking at (#781).
  test.setTimeout(60_000);
  await openCampus(page);
  await settle(page);
  expect(await drawsOver(page, 11_000)).toBe(0);
});
