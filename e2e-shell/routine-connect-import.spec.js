// e2e-shell/routine-connect-import.spec.js
//
// #633: the feed is a catalog of every section on offer and carries no student
// identity, so nothing we archive can say which sections are YOURS. Pasting the
// CONNECT page is the only path to the semester a student is actually in.
//
// The paste is a real Summer 2026 schedule. Two of its rows — the CSE220L and
// CSE251L labs — are absent from the archived catalog entirely, which is why
// this reads the page rather than resolving codes against a feed.

import { expect, test } from '../e2e-support/authFixture.js';

const PASTE = [
  'TIME/DAY\tSUNDAY\tMONDAY\tTUESDAY\tWEDNESDAY\tTHURSDAY\tFRIDAY\tSATURDAY',
  '8:00 AM - 9:20 AM\t\tMAT215 -13 -MZK-12A-08C\t\tMAT215 -13 -MZK-12A-08C\t\t\t',
  '9:30 AM - 10:50 AM\tCSE220 -04 -MAHR-10B-15C\t\tCSE220 -04 -MAHR-10B-15C\t\t\t\t',
  '11:00 AM - 1:50 PM\t\tCSE220L -04 -TBA-09B-08L\tCSE251L -09B -TBA-FT10-02L\t\t\t\t',
  '2:00 PM - 3:20 PM\tMAT111 -01 -EMNH-12A-09C\t\tMAT111 -01 -EMNH-12A-09C\t\t\t\t',
  '3:30 PM - 4:50 PM\t\tCSE251 -09B -HMH-07H-27C\t\tCSE251 -09B -HMH-07H-27C\t\t\t',
  '',
  'DAY\tTIME\tEXAM\tCOURSE',
  'SATURDAY (2026-07-25)\t4:30 PM -6:30 PM\tMID\tCSE251',
].join('\n');

// Next semester, which is all the live feed can offer during advising.
const LIVE = [
  {
    sectionId: 1,
    courseCode: 'CSE221',
    courseName: 'ALGORITHMS',
    sectionName: '01',
    capacity: 40,
    consumedSeat: 10,
    roomName: '08H-22C',
    semesterSessionId: 20263,
    sectionSchedule: {
      classSchedules: [{ day: 'SUNDAY', startTime: '11:00', endTime: '12:20' }],
      classStartDate: '2026-10-03',
      classEndDate: '2027-01-04',
    },
  },
];

async function boot(page) {
  await page.addInitScript((payload) => {
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({ fetchedAt: Date.now(), etag: null, payload }),
    );
  }, LIVE);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
}

async function pasteSchedule(page, text = PASTE) {
  await page.getByTestId('routine-import-toggle').click();
  await page.getByTestId('routine-import-box').fill(text);
  await page.getByTestId('routine-import-apply').click();
}

test('pasting the CONNECT page builds the routine it shows', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');

  await pasteSchedule(page);

  await expect(page.getByTestId('routine-import-note')).toContainText('Imported 6 courses');
  // Ten meetings: four twice-weekly courses plus two labs.
  await expect(page.getByTestId('routine-grid').locator('.routine-block')).toHaveCount(10);
  await expect(page.getByTestId('routine-semester-picker')).toHaveValue('imported');
});

test('the badge stops claiming this is the live feed', async ({ page }) => {
  await boot(page);
  await pasteSchedule(page);
  const source = page.getByTestId('routine-feed-source');
  await expect(source).toHaveText('Pasted from CONNECT');
  // A paste is never fetched, so its stamp is 0 — which the age ladder used to
  // read as "just now" and print beside a routine of unknown vintage.
  await expect(source).not.toContainText('just now');
  await expect(source).not.toContainText('ago');
});

test('the paste survives a reload and the live plan is untouched', async ({ page }) => {
  await boot(page);
  await pasteSchedule(page);
  const grid = page.getByTestId('routine-grid').locator('.routine-block');
  await expect(grid).toHaveCount(10);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-semester-picker')).toHaveValue('imported');
  await expect(grid).toHaveCount(10);

  // Back to the live feed: the imported routine stays put rather than bleeding.
  await page.getByTestId('routine-semester-picker').selectOption('');
  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');
  await expect(page.getByTestId('routine-courses')).toHaveCount(0);
});

test('a paste it cannot read keeps the box open and says why', async ({ page }) => {
  await boot(page);
  await page.getByTestId('routine-import-toggle').click();
  await page.getByTestId('routine-import-box').fill('Dear student, please log in to CONNECT.');
  await page.getByTestId('routine-import-apply').click();

  // Closing the box would look like it worked.
  await expect(page.getByTestId('routine-import-box')).toBeVisible();
  await expect(page.getByTestId('routine-import-note')).toContainText(
    'Copy the whole Class Schedule table',
  );
  await expect(page.getByTestId('routine-semester-picker')).toHaveCount(0);
});

test('one click builds the routine straight off the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page);
  await page.evaluate((text) => navigator.clipboard.writeText(text), PASTE);

  await page.getByTestId('routine-import-toggle').click();
  await expect(page.getByTestId('routine-grid').locator('.routine-block')).toHaveCount(10);
  await expect(page.getByTestId('routine-import-box')).toHaveCount(0);
  await expect(page.getByTestId('routine-import-note')).toContainText('from your clipboard');
});

test('a clipboard holding something else just opens the box, quietly', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page);
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/not-a-schedule'));

  await page.getByTestId('routine-import-toggle').click();
  await expect(page.getByTestId('routine-import-box')).toBeVisible();
  await expect(page.getByTestId('routine-import-box')).toHaveValue('');
  await expect(page.getByTestId('routine-import-note')).toHaveCount(0);
});

test('no switcher until there is somewhere to switch to', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('routine-semester-picker')).toHaveCount(0);
});
