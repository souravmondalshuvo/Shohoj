// Routine for a campus with no live feed.
//
// NSU's sections come from the campus database, generated into the same raw
// shape as BRACU's CONNECT feed (feeds/nsu-263.json, scripts/campus_feed.mjs),
// so the tab reads them with the code it already has. What must differ is
// everything about freshness: the data is a snapshot, so the tab says when it
// was true, shows no seat count, and never polls or offers BRACU's own tools.
//
// Every https request is aborted — the feed is same-origin, so this also proves
// the tab needs nothing from the CONNECT CDN — and identity comes from the
// bridge firebase.js installs, as in e2e/campus-tabs.spec.js.
import { expect, test } from '@playwright/test';

async function boot(page, email = 'student@northsouth.edu') {
  const external = [];
  await page.addInitScript((address) => {
    if (!sessionStorage.getItem('__seeded')) {
      try { localStorage.clear(); } catch { /* storage unavailable */ }
      sessionStorage.setItem('__seeded', '1');
    }
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: address, displayName: 'Test Student', photoURL: null,
    });
  }, email);
  await page.route('https://**/*', (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('/#calculator/routine', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
  return { external };
}

async function addCourse(page, code) {
  await page.locator('#routineCourseInput').fill(code);
  await page.locator(`[data-action="routine:addFromSuggest"][data-code="${code}"]`).click();
}

test('an NSU student gets NSU’s sections, labelled as a snapshot', async ({ page }) => {
  const { external } = await boot(page);

  // Where the data came from, in the badge and — because a hover is not enough
  // for something this easy to mistake for live — in plain sight below it.
  await expect(page.locator('.routine-source-badge')).toHaveText(/As of 23 Sep 2026/);
  const note = page.getByTestId('routine-snapshot-note');
  await expect(note).toContainText('23 Sep 2026');
  await expect(note).toContainText('Seat counts');
  await expect(page.locator('.routine-semester-badge')).toContainText('Fall 2026');

  // BRACU's tools are not offered: nothing to refresh, no CONNECT to paste
  // from, no archive to switch to.
  await expect(page.locator('[data-action="routine:refresh"]')).toHaveCount(0);
  await expect(page.locator('[data-action="routine:toggleConnectImport"]')).toHaveCount(0);
  await expect(page.locator('#routineSemesterPicker')).toHaveCount(0);

  // And the CONNECT CDN was never asked.
  expect(external.filter((url) => url.includes('usis-cdn'))).toEqual([]);
});

test('sections list with times and rooms, and no seat count', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'ACT201');

  const rows = page.locator('.routine-section-row');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);

  const first = page.locator('.routine-section-row', { hasText: /^\s*Section 1\b/ }).first();
  await expect(first.locator('.routine-section-schedule')).toContainText('4:20 PM');
  await expect(first.locator('.routine-section-room')).toHaveText(/NAC/);
  await expect(first.locator('.routine-section-seats')).toHaveText('—');
  await expect(first).not.toContainText('0/0');

  // Nothing to sort by, so the Seats sort is not offered.
  await expect(page.locator('.routine-sort-btn[data-sort="seats"]')).toHaveCount(0);
  await expect(page.locator('.routine-sort-btn[data-sort="time"]')).toHaveCount(1);
});

test('a picked section lands on the grid and survives a reload', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'ACT201');
  await page.locator('.routine-section-row', { hasText: /^\s*Section 1\b/ }).first().click();

  // Section 1 meets Monday and Wednesday.
  const blocks = page.locator('.routine-grid-block');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.first()).toContainText('ACT201');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('.routine-grid-block')).toHaveCount(2);
});

test('two sections in the same slot are flagged as a clash', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'ACT201');
  await page.locator('.routine-section-row', { hasText: /^\s*Section 1\b/ }).first().click();

  // Find another course with a section in ACT201 section 1's slot, from the
  // same file the page loaded.
  const other = await page.evaluate(async () => {
    const feed = await (await fetch('feeds/nsu-263.json')).json();
    const slot = (s) => JSON.stringify(s.sectionSchedule.classSchedules);
    const mine = feed.find((s) => s.courseCode === 'ACT201' && s.sectionName === '1');
    const hit = feed.find((s) => s.courseCode !== 'ACT201' && slot(s) === slot(mine));
    return { code: hit.courseCode, section: hit.sectionName };
  });
  await addCourse(page, other.code);
  await page
    .locator(`.routine-section-row[data-code="${other.code}"]`, { hasText: new RegExp(`^\\s*Section ${other.section}\\b`) })
    .first()
    .click();

  await expect(page.locator('.routine-clash-warn')).toContainText('clash');
});
