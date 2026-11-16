// e2e-pages/legacy-quest-tab.spec.js
//
// Shohoj Quest (#981) played on the legacy site. Its Courses menu used to link
// out to the shell's /app/quest; it is a tab now, and the legacy page fetches
// the game — quest/embed.js, which this build produces — the first time the
// tab is opened (js/ui/questTab.js). The game covers the window, and "← Shohoj"
// puts the student back on the tab they came from.
//
// This suite has both halves: the legacy tree, un-bundled, from the repo root,
// and the pages build beside it under dist-pages/. The page is told where the
// module is through window.__shohojQuestEmbedUrl; deployed, it sits at
// quest/embed.js and needs no telling.
//
// The legacy page's Firebase never loads here (every https request is
// aborted), so the test stands in for its one bridge the game uses,
// window._shohoj_questProgressTransact, and records what it is asked.
//
// What the game itself does is covered by the shell's suites
// (e2e-shell/quest*.spec.js). This file is about the mount.

import { expect, test } from '@playwright/test';
import { portFor } from '../e2e-support/port.js';

const LEGACY = `http://127.0.0.1:${portFor(4179, 'PLAYWRIGHT_PAGES_LEGACY_PORT')}`;
const EMBED_URL = '/dist-pages/quest/embed.js';

/** What the cloud holds for the student: the first quest, solved. */
const CLOUD_SAVE = {
  v: 1,
  zone: 'bridge',
  completed: { 'bridge-count-the-planks': 1_700_000_000_000 },
  at: null,
};

/**
 * Open the legacy page signed in as `email`, on `hash`. `cloud` is what the
 * stand-in for questProgress/{uid} holds; every call to it is recorded on
 * window.__questCloudCalls.
 */
async function openLegacy(page, { email = 'student@g.bracu.ac.bd', hash = '', cloud = null } = {}) {
  await page.addInitScript(
    ({ address, embed, saved }) => {
      if (window !== window.top) return;
      try {
        if (!sessionStorage.getItem('__legacy_quest_tab_spec')) {
          localStorage.clear();
          sessionStorage.clear();
          sessionStorage.setItem('__legacy_quest_tab_spec', '1');
        }
      } catch { /* storage unavailable */ }
      window.Chart = window.Chart || class { destroy() {} };
      window.__questUid = 'u1';
      window._shohoj_isAuthReady = () => true;
      window._shohoj_currentUid = () => window.__questUid;
      window._shohoj_userProfile = () => ({
        signedIn: !!window.__questUid, uid: window.__questUid, email: address,
        displayName: 'Test Student', photoURL: null,
      });
      window.__shohojQuestEmbedUrl = embed;
      window.__questCloudCalls = [];
      window._shohoj_questProgressTransact = async (uid, decide) => {
        window.__questCloudCalls.push(uid);
        decide(saved === null ? undefined : saved);
      };
    },
    { address: email, embed: EMBED_URL, saved: cloud },
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(`${LEGACY}/index.html${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
}

/** Pick an item from a closed dropdown in the tab bar, as a click would. */
async function pick(page, tabId) {
  await page.locator(`#calcTabs [data-tab="${tabId}"]`).evaluate((el) => {
    el.closest('.calc-tab-group')?.classList.add('open');
    el.click();
  });
}

const game = (page) => page.locator('.quest-root');

test('Quest opens on the legacy page, from the Courses menu', async ({ page }) => {
  await openLegacy(page);
  await expect(page.locator('#calcTabs a[href*="app/quest"]')).toHaveCount(0);

  await pick(page, 'quest');

  await expect(game(page)).toBeVisible();
  await expect(game(page).getByRole('heading', { level: 1, name: 'The Bridge' })).toBeVisible();
  await expect(game(page).getByRole('button', { name: /^Quests 0\/6/ })).toBeVisible();
  // Still the legacy page: the same document, on the tab's own address.
  expect(new URL(page.url()).pathname).toBe('/index.html');
  await expect(page).toHaveURL(/#calculator\/quest$/);
  await expect(page.locator('#tabQuest')).toHaveClass(/active/);
});

test('"← Shohoj" closes the game and returns to the tab the student came from', async ({ page }) => {
  await openLegacy(page);
  await pick(page, 'reviews');
  await expect(page.locator('#tabReviews')).toHaveClass(/active/);

  await pick(page, 'quest');
  await expect(game(page)).toBeVisible();
  await game(page).getByRole('button', { name: 'Leave the game, back to Shohoj' }).click();

  await expect(game(page)).toHaveCount(0);
  await expect(page.locator('#tabReviews')).toHaveClass(/active/);
  await expect(page).toHaveURL(/#calculator\/reviews$/);
});

test('a #calculator/quest link opens the game; a plain visit does not', async ({ page }) => {
  await openLegacy(page, { hash: '#calculator/quest' });
  await expect(game(page)).toBeVisible();

  // The tab is remembered for the session like any other, but a visit with no
  // address in it does not drop the student into a full-window game.
  await page.goto(`${LEGACY}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
  await expect(game(page)).toHaveCount(0);
});

test('progress is saved through the legacy page\'s own Firebase', async ({ page }) => {
  await openLegacy(page, { hash: '#calculator/quest', cloud: CLOUD_SAVE });

  // The cloud's solved quest shows on the board: the game read it through the
  // page's bridge, for the signed-in student.
  await expect(game(page).getByRole('button', { name: /^Quests 1\/6/ })).toBeVisible();
  expect(await page.evaluate(() => window.__questCloudCalls)).toContain('u1');
});

test('signing out takes the game down', async ({ page }) => {
  await openLegacy(page, { hash: '#calculator/quest' });
  await expect(game(page)).toBeVisible();

  await page.evaluate(() => {
    window.__questUid = null;
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: false } }));
  });

  await expect(game(page)).toHaveCount(0);
  await expect(page.locator('#questContent')).toContainText('Sign in to play Shohoj Quest.');
});

test('a student of another campus cannot open it', async ({ page }) => {
  await openLegacy(page, { email: 'student@northsouth.edu', hash: '#calculator/quest' });
  await expect(page.locator('#calcTabs [data-tab="quest"]')).toHaveJSProperty('hidden', true);
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
  await expect(game(page)).toHaveCount(0);
});

test('a module that cannot be fetched says so and can be retried', async ({ page }) => {
  await page.route('**/dist-pages/quest/embed.js', (route) => route.abort());
  await openLegacy(page, { hash: '#calculator/quest' });
  await expect(page.getByTestId('quest-unavailable')).toBeVisible();

  await page.unroute('**/dist-pages/quest/embed.js');
  await page.getByTestId('quest-unavailable').getByRole('button', { name: 'Try again' }).click();
  await expect(game(page)).toBeVisible();
});
