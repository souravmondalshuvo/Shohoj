// e2e-pages/legacy-quest-3d.spec.js
//
// The 3D zone of Shohoj Quest (#981), on the legacy page, where it is the
// default. The game behind it is the same as in 2D, so what is checked here is
// the switch (src/features/quest/game/rendererChoice.ts): a browser with a
// graphics card gets 3D, one drawing in software or without WebGL gets 2D,
// ?quest3d=0 and ?quest3d=1 override it; and in 3D the people's models load,
// the hero walks and the quest-giver answers.
//
// A CI runner has no graphics card: Chromium draws WebGL in software
// (SwiftShader). So the walk forces 3D with ?quest3d=1, and where the default
// is checked, the renderer's name is made up (`gpu`), one way or the other.
//
// The legacy page's Firebase never loads (every https request is aborted), and
// the module is served from the pages build under dist-pages/, as in
// legacy-quest-tab.spec.js.

import { expect, test } from '@playwright/test';
import { portFor } from '../e2e-support/port.js';

const LEGACY = `http://127.0.0.1:${portFor(4179, 'PLAYWRIGHT_PAGES_LEGACY_PORT')}`;

async function open(page, { query = '', noWebGL = false, gpu = null, wait = 30_000 } = {}) {
  await page.addInitScript(
    ({ withoutWebGL, rendererName }) => {
      if (window !== window.top) return;
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* storage unavailable */ }
      window.Chart = window.Chart || class { destroy() {} };
      window._shohoj_isAuthReady = () => true;
      window._shohoj_currentUid = () => 'u1';
      window._shohoj_userProfile = () => ({
        signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'T', photoURL: null,
      });
      window.__shohojQuestEmbedUrl = '/dist-pages/quest/embed.js';
      if (withoutWebGL) {
        // A browser where WebGL cannot start.
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return /webgl/.test(String(type)) ? null : original.call(this, type, ...rest);
        };
      }
      if (rendererName) {
        // What the renderer calls itself, by both names a page can ask for.
        for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
          const original = Context.prototype.getParameter;
          Context.prototype.getParameter = function (param) {
            return param === 0x9246 || param === 0x1f01 ? rendererName : original.call(this, param);
          };
        }
      }
    },
    { withoutWebGL: noWebGL, rendererName: gpu },
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(`${LEGACY}/index.html${query}#calculator/quest`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.quest-root canvas')).toBeVisible({ timeout: wait });
}

const threeD = (page) => page.locator('.quest-root canvas[data-quest-renderer="3d"]');

test('in 3D the people are models, the hero walks and the quest-giver answers', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { query: '?quest3d=1' });
  await expect(threeD(page)).toHaveCount(1);
  await expect(page.locator('.quest-tip')).toBeVisible();
  // The people's models arrive after the zone opens, and replace the shapes.
  await expect(threeD(page)).toHaveAttribute('data-quest-people', 'models', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'People by Quaternius' })).toBeVisible();

  // Along the road to the head of the bridge, then up into Karim Majhi. Each
  // step is waited for, by where the game saved the hero: a CI runner draws
  // 3D in software, a few frames a second, so a step takes as long as it takes.
  const at = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_quest_progress_v1') ?? 'null')?.progress?.at ?? null);
  for (let x = 4; x <= 14; x += 1) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(at, { timeout: 15_000 }).toEqual({ x, y: 11 });
  }
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('dialog', { name: 'Karim Majhi speaks' })).toBeVisible({ timeout: 15_000 });
});

// Where the default is checked, the quality is held at "low": a made-up
// graphics card would otherwise start the software renderer on "high".
test('by default, a browser with a graphics card gets the 3D zone', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { query: '?quest3dq=low', gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)' });
  await expect(threeD(page)).toHaveCount(1);
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('link', { name: 'People by Quaternius' })).toBeVisible();
});

test('by default, a browser drawing in software gets the 2D zone', async ({ page }) => {
  await open(page, { gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' });
  await expect(threeD(page)).toHaveCount(0);
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('link', { name: 'People by Quaternius' })).toHaveCount(0);
});

test('?quest3d=0 gets the 2D zone, even with a graphics card', async ({ page }) => {
  await open(page, { query: '?quest3d=0', gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)' });
  await expect(threeD(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'People by Quaternius' })).toHaveCount(0);
});

test('a browser without WebGL gets the 2D zone by default', async ({ page }) => {
  await open(page, { noWebGL: true });
  await expect(threeD(page)).toHaveCount(0);
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a 3D download that never arrives gives way to the 2D zone', async ({ page }) => {
  test.setTimeout(90_000);
  // The request for the 3D zone's code is held open: neither answered nor failed.
  await page.route('**/zoneGame3d-*.js', () => {});
  await open(page, {
    query: '?quest3dq=low',
    gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)',
    wait: 60_000,
  });
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(threeD(page)).toHaveCount(0);
});

test('3D forced on a browser that cannot start WebGL falls back to 2D, not a broken screen', async ({ page }) => {
  await open(page, { query: '?quest3d=1', noWebGL: true });
  await expect(threeD(page)).toHaveCount(0);
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
