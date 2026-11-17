// e2e-pages/legacy-quest-3d.spec.js
//
// The 3D prototype of Shohoj Quest (#981), on the legacy page. It is drawn
// only when the address asks for it (?quest3d=1); students get the 2D zone.
// The game behind it is the same, so what is checked here is the switch: the
// 3D renderer runs when asked and only then, the hero walks in it and the
// quest-giver answers, and a browser with no WebGL gets the 2D zone instead of
// a broken screen.
//
// The legacy page's Firebase never loads (every https request is aborted), and
// the module is served from the pages build under dist-pages/, as in
// legacy-quest-tab.spec.js.

import { expect, test } from '@playwright/test';
import { portFor } from '../e2e-support/port.js';

const LEGACY = `http://127.0.0.1:${portFor(4179, 'PLAYWRIGHT_PAGES_LEGACY_PORT')}`;

async function open(page, { query = '', noWebGL = false } = {}) {
  await page.addInitScript(
    ({ withoutWebGL }) => {
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
    },
    { withoutWebGL: noWebGL },
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(`${LEGACY}/index.html${query}#calculator/quest`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.quest-root canvas')).toBeVisible({ timeout: 30_000 });
}

const threeD = (page) => page.locator('.quest-root canvas[data-quest-renderer="3d"]');

test('?quest3d=1 draws the zone in 3D, and the quest-giver answers', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { query: '?quest3d=1' });
  await expect(threeD(page)).toHaveCount(1);
  await expect(page.locator('.quest-tip')).toBeVisible();

  // Along the road to the head of the bridge, then up into Karim Majhi.
  for (const key of [...Array(11).fill('ArrowRight'), 'ArrowUp']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(260);
  }
  await expect(page.getByRole('dialog', { name: 'Karim Majhi speaks' })).toBeVisible();
});

test('without the flag, students get the 2D zone', async ({ page }) => {
  await open(page);
  await expect(threeD(page)).toHaveCount(0);
});

test('a browser that cannot start WebGL gets the 2D zone, not a broken screen', async ({ page }) => {
  await open(page, { query: '?quest3d=1', noWebGL: true });
  await expect(threeD(page)).toHaveCount(0);
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
