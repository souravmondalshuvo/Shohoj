// e2e/device-notice.spec.js
//
// #627: sign-out clears the device, but that never helped the student who NEVER
// signed in — and their data is just as present on a shared lab machine. They
// had no way to know it was stored (nothing said so) and no practical way to
// remove it (Clear Data lives at the foot of the calculator, which someone on
// Routine Builder or Seat Status never scrolls to).
//
// The notice names what is stored and offers the wipe next to the sign-in, on
// whichever tab they are on.

import { expect, test } from '@playwright/test';

const SEEDED = {
  shohoj_cgpa_v1: JSON.stringify({
    currentDept: 'CSE',
    semesterCounter: 2,
    semesters: [
      { id: 0, name: 'Fall 2024', courses: [] },
      { id: 1, name: 'Spring 2025', courses: [] },
    ],
  }),
  shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1, CSE221: 12 } }),
  shohoj_seat_watch_v1: JSON.stringify([
    { sectionId: 1, courseCode: 'CSE260' },
    { sectionId: 2, courseCode: 'CSE221' },
    { sectionId: 3, courseCode: 'CSE221' },
  ]),
};

async function bootSignedOut(page, seeded = SEEDED) {
  await page.route('https://**/*', (route) => route.abort());
  // Seeded once — the wipe reloads, and addInitScript re-runs on navigation.
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('__shohoj_notice_spec')) {
      sessionStorage.setItem('__shohoj_notice_spec', '1');
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
      sessionStorage.setItem('shohoj_calc_unlocked', '1');
    }
    window.Chart = window.Chart || class { destroy() {} };
  }, seeded);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

const notice = (page) => page.getByTestId('device-notice');

test('the notice names what is actually stored, in the student\'s terms', async ({ page }) => {
  await bootSignedOut(page);

  await expect(notice(page)).toBeVisible({ timeout: 10_000 });
  // Counts from the stored shape, not a vague "your data".
  await expect(notice(page)).toContainText('2 semesters');
  await expect(notice(page)).toContainText('your routine');
  await expect(notice(page)).toContainText('3 watched sections');
});

test('it is present on the tab the student is actually on', async ({ page }) => {
  // The whole point. It used to render after .calc-footer, inside the
  // calculator panel, so a student on Routine or Seats never saw it.
  await bootSignedOut(page);
  await expect(notice(page)).toBeVisible({ timeout: 10_000 });

  await page.locator('[data-tab="routine"]').first().click({ force: true });
  await expect(notice(page)).toBeVisible();
});

test('removing wipes every trace and leaves the gate behind it', async ({ page }) => {
  await bootSignedOut(page);
  await expect(notice(page)).toBeVisible({ timeout: 10_000 });

  // firebase.js never loads in this suite (https is aborted), so the confirm
  // falls back to window.confirm — which is the path a student on a build
  // without Firebase takes too, and it must still say what it is about to do.
  const asked = [];
  page.on('dialog', (dialog) => {
    asked.push(dialog.message());
    void dialog.accept();
  });

  await page.getByTestId('device-notice-forget').click();

  // It says there is no backup, because for this student there is not one.
  await expect.poll(() => asked.length, { timeout: 10_000 }).toBe(1);
  expect(asked[0]).toContain('no backup to restore it from');
  expect(asked[0]).toContain('2 semesters');

  const semestersLeft = async () => {
    const raw = await page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1'));
    return raw === null ? 0 : (JSON.parse(raw).semesters ?? []).length;
  };
  await expect.poll(semestersLeft, { timeout: 10_000 }).toBe(0);

  const leftovers = await page.evaluate(
    (keys) => keys.filter((k) => localStorage.getItem(k) !== null),
    ['shohoj_routine_v1', 'shohoj_seat_watch_v1'],
  );
  expect(leftovers, 'left on the device').toEqual([]);

  // The next person at this browser meets the gate, not a stranger's routine.
  // Generous: the wipe reloads on a short delay, and the storage assertions
  // above pass before that lands.
  await expect(page.getByTestId('signin-portal')).toBeVisible({ timeout: 15_000 });
});

test('a browser with nothing stored is told nothing', async ({ page }) => {
  // No notice for a first-time visitor — there is nothing to disclose or remove.
  await bootSignedOut(page, {});
  await page.waitForTimeout(2000);
  await expect(notice(page)).toBeHidden();
});
