// Routine for DIU, read from the departments' routines in the campus database.
//
// Same arrangement as NSU's (e2e/nsu-routine.spec.js): a snapshot generated
// into CONNECT's raw shape (feeds/diu-263.json). What DIU adds is that a
// section's days meet in different rooms, so each class block names its own,
// and that only a few departments' routines are loaded, so the tab says whose
// — and Free Rooms, which would need everyone's, stays hidden.
import { expect, test } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      try { localStorage.clear(); } catch { /* storage unavailable */ }
      sessionStorage.setItem('__seeded', '1');
    }
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'rahim@s.diu.edu.bd', displayName: 'Test Student', photoURL: null,
    });
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.goto('/#calculator/routine', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
}

async function addCourse(page, code) {
  await page.locator('#routineCourseInput').fill(code);
  await page.locator(`[data-action="routine:addFromSuggest"][data-code="${code}"]`).click();
}

test('a DIU student gets DIU’s sections, labelled as a snapshot of some departments', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.routine-source-badge')).toHaveText(/As of 14 Oct 2026/);
  const note = page.getByTestId('routine-snapshot-note');
  await expect(note).toContainText('Only CSE, EEE, ENG and SWE routines are loaded so far.');
  await expect(note).toContainText('Final exams run from 17 Dec 2026 to 24 Dec 2026.');
  await expect(page.locator('.routine-semester-badge')).toContainText('Fall 2026');

  // Free Rooms would need every department's classes; Seats, a seat count.
  await expect(page.locator('#calcTabs [data-tab="freerooms"]')).toHaveJSProperty('hidden', true);
  await expect(page.locator('#calcTabs [data-tab="seats"]')).toHaveJSProperty('hidden', true);
});

test('each meeting of a section lands in its own room', async ({ page }) => {
  await boot(page);
  await addCourse(page, 'ACT327');

  // 67_A meets Tuesday in KT-303 and Thursday in KT-304.
  const row = page.locator('.routine-section-row', { hasText: /Section 67_A\b/ }).first();
  await expect(row.locator('.routine-section-room')).toHaveText('KT-303 · KT-304');
  await row.click();

  const blocks = page.locator('.routine-grid-block');
  await expect(blocks).toHaveCount(2);
  const rooms = await page.locator('.routine-grid-block-room').allInnerTexts();
  expect(rooms.sort()).toEqual(['KT-303', 'KT-304']);
});

test('a shared link restores a section whose code has a hyphen', async ({ page }) => {
  await boot(page);
  // English's codes carry a field part (ENG0232-01); the link writes it ENG0232.01.
  const pick = await page.evaluate(async () => {
    const feed = await (await fetch('feeds/diu-263.json')).json();
    const s = feed.find((x) => x.courseCode === 'ENG0232-01' && x.sectionSchedule.classSchedules.length > 0);
    return { sid: s.sectionId, meetings: s.sectionSchedule.classSchedules.length };
  });
  await page.goto(`/?routine=ENG0232.01-${pick.sid}#calculator/routine`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  const blocks = page.locator('.routine-grid-block');
  await expect(blocks).toHaveCount(pick.meetings);
  await expect(blocks.first()).toContainText('ENG0232-01');
});

test('an EEE course, written as an ISCED code, is found, picked and shared', async ({ page }) => {
  await boot(page);
  const pick = await page.evaluate(async () => {
    const feed = await (await fetch('feeds/diu-263.json')).json();
    const s = feed.find((x) => x.courseCode === '0713-111' && x.sectionSchedule.classSchedules.length > 0);
    return { sid: s.sectionId, meetings: s.sectionSchedule.classSchedules.length };
  });
  // Typing the field finds it, like any other code's prefix.
  await page.locator('#routineCourseInput').fill('0713');
  await expect(page.locator('[data-action="routine:addFromSuggest"][data-code="0713-111"]')).toBeVisible();

  await page.goto(`/?routine=0713.111-${pick.sid}#calculator/routine`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await expect(page.locator('.routine-grid-block')).toHaveCount(pick.meetings);
  await expect(page.locator('.routine-grid-block').first()).toContainText('0713-111');
});
