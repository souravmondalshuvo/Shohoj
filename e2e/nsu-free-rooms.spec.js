// Free Rooms for a campus with no live feed.
//
// NSU's rooms are read off the same section snapshot as its Routine
// (feeds/nsu-263.json). Two things have to be true of a tab that tells someone
// a room is empty, on data that is weeks old: it says how old, where they will
// see it — and it never lists a "room" that is only a second spelling of one
// (LIB901_V), free whenever its one section is not meeting.
//
// Same harness as e2e/nsu-routine.spec.js: identity from the firebase.js
// bridge, every https request aborted.
import { expect, test } from '@playwright/test';

async function boot(page) {
  const external = [];
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@northsouth.edu',
      displayName: 'Test Student', photoURL: null,
    });
  });
  await page.route('https://**/*', (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('/#calculator/freerooms', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('#tabFreeRooms')).toHaveClass(/active/);
  await expect(page.locator('.freerooms-summary')).toBeVisible();
  return { external };
}

async function at(page, day, hhmm) {
  await page.locator(`[data-action="freerooms:setDay"][data-day="${day}"]`).click();
  await page.locator('#freeRoomsTime').fill(hhmm);
}

test('the tab opens from the Campus group and says the timetable is a snapshot', async ({ page }) => {
  const { external } = await boot(page);

  await expect(page.locator('#tabFreeRooms .routine-source-badge')).toHaveText(/As of 23 Sep 2026/);
  const note = page.getByTestId('freerooms-snapshot-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('23 Sep 2026');
  await expect(note).toContainText('may have a class in it');
  await expect(page.getByTestId('freerooms-semester')).toContainText('Fall 2026');

  // Nothing to refresh, and the CONNECT CDN was never asked.
  await expect(page.locator('[data-action="freerooms:refresh"]')).toHaveCount(0);
  expect(external.filter((url) => url.includes('usis-cdn'))).toEqual([]);
});

test('a room with a class in it reads as in class, with the section', async ({ page }) => {
  await boot(page);
  // ACT201 section 1 meets Monday and Wednesday 4:20–5:50 PM in NAC603.
  await at(page, 'MONDAY', '16:30');
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();

  const card = page.locator('.freerooms-card[data-room="NAC603"]');
  await expect(card).toHaveClass(/is-class/);
  await expect(card).toContainText('ACT201 Section 1');
  await expect(card).toContainText('until 5:50 PM');

  // And it is not in the free-only list at that moment.
  await page.locator('[data-action="freerooms:setView"][data-view="free"]').click();
  await expect(page.locator('.freerooms-card[data-room="NAC603"]')).toHaveCount(0);
});

test('BRACU’s room types are not guessed at for another campus', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();
  await expect(page.locator('.freerooms-card').first()).toBeVisible();
  // Class / Lab / Theater is read off a BRACU room code's last letter.
  await expect(page.locator('[data-action="freerooms:setType"]')).toHaveCount(0);
  await expect(page.locator('.freerooms-card-type')).toHaveCount(0);
});

test('a second spelling of a room is never listed, and its class counts against the real room', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();
  await expect(page.locator('.freerooms-card').first()).toBeVisible();

  const names = await page.locator('.freerooms-card').evaluateAll((cards) => cards.map((c) => c.dataset.room));
  expect(names.length).toBeGreaterThan(100);
  expect(names.filter((name) => /[_-][vV]\d*$/.test(name))).toEqual([]);

  // Pick a class that the listing files under a variant spelling, at a time
  // when nothing is listed under the real room's own name, and check the real
  // room shows it. Read from the same file the page loaded.
  const probe = await page.evaluate(async () => {
    const feed = await (await fetch('feeds/nsu-263.json')).json();
    const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    for (const s of feed) {
      const base = /^(.+?)[_-][vV]\d*$/.exec(s.roomName)?.[1];
      if (!base) continue;
      for (const c of s.sectionSchedule.classSchedules) {
        const start = mins(c.startTime);
        const clashes = feed.some((o) => o.roomName === base && o.sectionSchedule.classSchedules.some(
          (x) => x.day === c.day && mins(x.startTime) <= start + 10 && mins(x.endTime) > start + 10,
        ));
        if (!clashes && start >= 480 && start < 1300) {
          return { base, day: c.day, time: c.startTime.slice(0, 2) + ':' + String(Number(c.startTime.slice(3, 5)) + 10).padStart(2, '0'), course: s.courseCode, section: s.sectionName };
        }
      }
    }
    return null;
  });
  expect(probe, 'the feed has a variant-only class to test with').not.toBeNull();

  await at(page, probe.day, probe.time);
  const card = page.locator(`.freerooms-card[data-room="${probe.base}"]`);
  await expect(card).toHaveClass(/is-class|is-lab/);
  await expect(card).toContainText(`${probe.course} Section ${probe.section}`);
});

test('a room’s week opens in the modal', async ({ page }) => {
  await boot(page);
  await at(page, 'MONDAY', '16:30');
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();
  await page.locator('.freerooms-card[data-room="NAC603"]').click();
  await expect(page.locator('.freerooms-week')).toBeVisible();
  await expect(page.locator('.freerooms-week')).toContainText('ACT201 Section 1');
});
