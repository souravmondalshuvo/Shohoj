// e2e-pages/legacy-campus-tab.spec.js
//
// The Campus Map as a tab of the legacy site. The legacy page fetches the
// map — a module this build produces, campus/embed.js — the first time the tab
// is opened and mounts it inside its own panel (js/ui/campusMapTab.js), where
// it used to send the student away to the standalone /campus/ page.
//
// This is the one suite that has both halves: the legacy tree, un-bundled,
// from the repo root, and the pages build beside it under dist-pages/. The
// page is told where the module is through window.__shohojCampusEmbedUrl; on
// the deployed site it sits at campus/embed.js and needs no telling.
//
// What the map itself does is covered where the component is (campus.spec.js,
// campus-nsu.spec.js, e2e-shell/campus-map.spec.js). This file is about the
// mount: in the page, for the right campus, dressed as the legacy site.

import { expect, test } from '@playwright/test';
import { portFor } from '../e2e-support/port.js';

const LEGACY = `http://127.0.0.1:${portFor(4179, 'PLAYWRIGHT_PAGES_LEGACY_PORT')}`;
const EMBED_URL = '/dist-pages/campus/embed.js';
const FEED_KEY = 'shohoj_connect_feed_v1';

const WEEK = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const allDay = WEEK.map((day) => ({ day, startTime: '0:00', endTime: '23:59' }));
const section = (sectionId, courseCode, roomName, classSchedules) => ({
  sectionId,
  courseCode,
  sectionName: '01',
  capacity: 40,
  consumedSeat: 10,
  roomName,
  sectionSchedule: { classSchedules },
});

const BRACU_FEED = [
  section(1, 'CSE110', '07A-01C', allDay),
  section(2, 'CSE220', '09G-31T', [{ day: 'TUESDAY', startTime: '11:00', endTime: '12:20' }]),
];
const NSU_SNAPSHOT = [section(1, 'ACT201', 'NAC210', allDay)];

// A Wednesday morning inside NSU's term 263, as campus-nsu.spec.js fixes it.
const IN_TERM = new Date('2026-10-07T10:30:00');

/**
 * Open the legacy page signed in as `email`, on `hash`. Every https request
 * is aborted, so the Firebase SDK never loads and the identity stub is what
 * the page sees — the harness the legacy suite's campus specs use.
 */
async function openLegacy(page, { email, hash = '#calculator/campus', embedUrl = EMBED_URL } = {}) {
  await page.clock.setFixedTime(IN_TERM);
  await page.addInitScript(
    ({ address, embed, key, payload }) => {
      try {
        if (!sessionStorage.getItem('__legacy_campus_tab_spec')) {
          localStorage.clear();
          sessionStorage.clear();
          sessionStorage.setItem('__legacy_campus_tab_spec', '1');
        }
        localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), etag: null, payload }));
      } catch { /* storage unavailable */ }
      window.Chart = window.Chart || class { destroy() {} };
      window._shohoj_isAuthReady = () => true;
      window._shohoj_currentUid = () => 'u1';
      window._shohoj_userProfile = () => ({
        signedIn: true, uid: 'u1', email: address, displayName: 'Test Student', photoURL: null,
      });
      window.__shohojCampusEmbedUrl = embed;
    },
    { address: email, embed: embedUrl, key: FEED_KEY, payload: BRACU_FEED },
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/feeds/nsu-*.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(NSU_SNAPSHOT) }),
  );
  await page.goto(`${LEGACY}/index.html${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
}

const panel = (page) => page.locator('#tabCampus');

test('the Campus Map opens inside the legacy page, under its tab bar', async ({ page }) => {
  await openLegacy(page, { email: 'student@g.bracu.ac.bd', hash: '' });

  // From the Campus menu, the way a student gets there. It is a tab now, so
  // nothing in the menu leads out to the standalone page.
  const item = page.locator('#calcTabs [data-tab="campus"]');
  await expect(page.locator('#calcTabs a[href^="campus/"]')).toHaveCount(0);
  await item.evaluate((el) => {
    el.closest('.calc-tab-group')?.classList.add('open');
    el.click();
  });

  await expect(panel(page)).toHaveClass(/active/);
  await expect(panel(page).getByTestId('campus-page')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Floor 9' })).toBeVisible();

  // Still the legacy page: same document, its tab bar above the map.
  expect(new URL(page.url()).pathname).toBe('/index.html');
  await expect(page).toHaveURL(/#calculator\/campus$/);
  await expect(page.locator('#calcTabs')).toBeVisible();
  await expect(page.locator('.campus-topbar')).toHaveCount(0);
});

test('the map wears the legacy site\'s controls', async ({ page }) => {
  await openLegacy(page, { email: 'student@g.bracu.ac.bd' });
  await expect(panel(page).getByTestId('campus-page')).toBeVisible();

  // The component brings class names and no styles; css/style.css dresses them
  // as the Free Rooms tab's: pill chips, a pill toolbar button, and no card of
  // its own inside the calculator's card.
  const radius = (locator) => locator.evaluate((el) => getComputedStyle(el).borderRadius);
  const floor = panel(page).getByRole('button', { name: 'Floor 9' });
  const dayChip = await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.className = 'freerooms-day';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const out = { radius: style.borderRadius, padding: style.padding, fontSize: style.fontSize };
    probe.remove();
    return out;
  });
  expect(await radius(floor)).toBe(dayChip.radius);
  expect(await floor.evaluate((el) => getComputedStyle(el).padding)).toBe(dayChip.padding);
  expect(await floor.evaluate((el) => getComputedStyle(el).fontSize)).toBe(dayChip.fontSize);
  expect(await radius(panel(page).getByRole('button', { name: 'Refresh' }))).toBe(dayChip.radius);

  const root = panel(page).getByTestId('campus-page');
  expect(await root.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('0px');
  expect(await root.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('none');
});

test('a link can open the map on a room', async ({ page }) => {
  await openLegacy(page, { email: 'student@g.bracu.ac.bd', hash: '#calculator/campus?room=09G-31T' });
  await expect(panel(page).getByTestId('campus-room-panel')).toContainText('09G-31T');
});

test('leaving the tab and coming back keeps the floor that was open', async ({ page }) => {
  await openLegacy(page, { email: 'student@g.bracu.ac.bd' });
  await panel(page).getByRole('button', { name: 'Floor 7' }).click();
  await expect(panel(page).getByRole('button', { name: /07A-01C/ })).toBeVisible();

  await page.evaluate(() => window.switchCalcTab('calculator'));
  await expect(panel(page)).not.toHaveClass(/active/);
  await page.evaluate(() => window.switchCalcTab('campus'));

  await expect(panel(page).getByRole('button', { name: 'Floor 7' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).getByRole('button', { name: /07A-01C/ })).toBeVisible();
});

test('an NSU student gets NSU\'s campus, read from the site root', async ({ page }) => {
  const snapshots = [];
  page.on('request', (request) => {
    if (/\/feeds\/nsu-.*\.json/.test(request.url())) snapshots.push(new URL(request.url()).pathname);
  });
  await openLegacy(page, { email: 'student@northsouth.edu' });

  const map = panel(page).getByTestId('campus-page');
  await expect(map).toHaveAttribute('data-campus', 'nsu');
  await expect(panel(page).getByTestId('campus-buildings')).toBeVisible();
  await expect(panel(page).getByTestId('campus-snapshot')).toContainText('not live');
  // The standalone page sits one directory down and asks for ../feeds/. From
  // here that would leave the site.
  expect(snapshots.length).toBeGreaterThan(0);
  for (const path of snapshots) expect(path).toMatch(/^\/feeds\/nsu-/);
});

test('says so when the map cannot be downloaded, and tries again', async ({ page }) => {
  await openLegacy(page, { email: 'student@g.bracu.ac.bd', embedUrl: '/dist-pages/campus/missing.js' });
  const unavailable = panel(page).getByTestId('campus-map-unavailable');
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText('Couldn’t load the Campus Map');

  await page.evaluate((url) => { window.__shohojCampusEmbedUrl = url; }, EMBED_URL);
  await unavailable.getByRole('button', { name: 'Try again' }).click();
  await expect(panel(page).getByTestId('campus-page')).toBeVisible();
});
