// The tab bar follows the signed-in student's campus (#808).
//
// The legacy twin of the shell's tabsFor(): a tab is shown only when the
// campus's registry profile lists the feature behind it. NSU has no live
// section feed, so Seats, Difficulty and Tasks go. Routine and Free Rooms stay:
// this page builds both from NSU's sections in the campus database
// (e2e/nsu-routine.spec.js, e2e/nsu-free-rooms.spec.js).
//
// Identity comes from the same bridge firebase.js installs
// (window._shohoj_userProfile). Every https request is aborted, so the Firebase
// SDK never loads and the stub is what the page sees — the pattern the profile
// and built-bundle specs use.
import { expect, test } from '@playwright/test';

async function boot(page, email, path = '/') {
  await page.addInitScript((address) => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: address, displayName: 'Test Student', photoURL: null,
    });
  }, email);
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('#calculator .calc-wrapper')).toBeVisible();
}

// Menu items sit inside a closed dropdown, so "visible" would be false for
// every one of them regardless. The `hidden` property is the thing under test.
const tab = (page, id) => page.locator(`#calcTabs [data-tab="${id}"]`);
const group = (page, id) => page.locator(`#calcTabs .calc-tab-group[data-group="${id}"]`);

const NSU_TABS = ['calculator', 'planner', 'playground', 'routine', 'reviews', 'papers', 'freerooms', 'groups'];
const BRACU_ONLY_TABS = ['tasks', 'difficulty', 'seats'];

test('an NSU student sees only the tabs NSU has data for', async ({ page }) => {
  await boot(page, 'student@northsouth.edu');

  for (const id of NSU_TABS) await expect(tab(page, id)).toHaveJSProperty('hidden', false);
  for (const id of BRACU_ONLY_TABS) await expect(tab(page, id)).toHaveJSProperty('hidden', true);

  // Every group keeps what is left of it. Campus is down to Free Rooms: Seats
  // and the three standalone pages (map, bus, lost & found) are BRACU's.
  await expect(group(page, 'plan')).toBeVisible();
  await expect(group(page, 'courses')).toBeVisible();
  await expect(group(page, 'campus')).toBeVisible();
  // Of the three standalone pages, Bus is the one NSU has: it opens NSU's own
  // service, so the link carries the campus. The map and lost & found are
  // BRAC University's.
  const bus = page.locator('#calcTabs [data-feature="bus"]');
  await expect(bus).toHaveJSProperty('hidden', false);
  await expect(bus).toHaveAttribute('href', 'bus/?campus=nsu');
  await expect(page.locator('#calcTabs [data-feature="campus"]')).toHaveJSProperty('hidden', true);
  await expect(page.locator('#calcTabs [data-feature="lostFound"]')).toHaveJSProperty('hidden', true);

  // The nav's Tasks link opens a tab NSU does not get.
  await expect(page.locator('.nav-link[data-calc-tab="tasks"]')).toBeHidden();
});

test('an NSU student cannot reach a hidden tab by script or by link', async ({ page }) => {
  await boot(page, 'student@northsouth.edu', '/#calculator/difficulty');
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
  await expect(page.locator('#tabDifficulty')).not.toHaveClass(/active/);

  await page.evaluate(() => window.switchCalcTab('seats'));
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
  await expect(page.locator('#tabSeats')).not.toHaveClass(/active/);

  // A tab NSU does get still opens.
  await page.evaluate(() => window.switchCalcTab('playground'));
  await expect(page.locator('#tabPlayground')).toHaveClass(/active/);
});

test('a BRACU student keeps every tab', async ({ page }) => {
  await boot(page, 'student@g.bracu.ac.bd');

  for (const id of [...NSU_TABS, ...BRACU_ONLY_TABS]) {
    await expect(tab(page, id)).toHaveJSProperty('hidden', false);
  }
  for (const id of ['plan', 'courses', 'campus']) await expect(group(page, id)).toBeVisible();
  await expect(page.locator('#calcTabs [data-feature]')).toHaveCount(3);
  for (const link of await page.locator('#calcTabs [data-feature]').all()) {
    await expect(link).toHaveJSProperty('hidden', false);
  }
  // BRAC University's Bus link is the bare path it has always been.
  await expect(page.locator('#calcTabs [data-feature="bus"]')).toHaveAttribute('href', 'bus/');
  await expect(page.locator('.nav-link[data-calc-tab="tasks"]')).toBeVisible();

  await page.evaluate(() => window.switchCalcTab('routine'));
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
});

test('the bar follows a campus change mid-session', async ({ page }) => {
  await boot(page, 'student@g.bracu.ac.bd');
  await page.evaluate(() => window.switchCalcTab('seats'));
  await expect(page.locator('#tabSeats')).toHaveClass(/active/);

  // Sign in as someone else without a reload.
  await page.evaluate(() => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u2', email: 'other@northsouth.edu', displayName: 'Other', photoURL: null,
    });
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: true } }));
  });

  await expect(tab(page, 'seats')).toHaveJSProperty('hidden', true);
  // Routine stays: this page has NSU's own sections (e2e/nsu-routine.spec.js).
  await expect(tab(page, 'routine')).toHaveJSProperty('hidden', false);
  // So does the Campus group, now holding Free Rooms alone.
  await expect(group(page, 'campus')).toBeVisible();
  await expect(tab(page, 'freerooms')).toHaveJSProperty('hidden', false);
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
});

test("the calculator's heading names the campus whose scale it applies", async ({ page }) => {
  await boot(page, 'student@northsouth.edu');
  await expect(page.locator('#calculator .section-desc')).toContainText("Built on NSU's exact grading scale");
});

test("a BRACU student's heading is unchanged", async ({ page }) => {
  await boot(page, 'student@g.bracu.ac.bd');
  await expect(page.locator('#calculator .section-desc')).toContainText("Built on BRACU's exact grading scale");
});
