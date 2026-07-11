// e2e-campus/campus-standalone.spec.js
//
// The standalone campus-map page (#383) — dist-campus/ served as it will be on
// Pages. Behavior depth lives in e2e-shell/campus-map.spec.js (same component);
// this suite pins what is unique to the standalone mount: the page boots
// without the shell, the ?room= deep link resolves without a router basename,
// and the top bar links back to the main site. Feed stub matches the shell
// suite: seeded into the client's localStorage cache so no network is touched.

import { expect, test } from '@playwright/test';

const FEED_KEY = 'shohoj_connect_feed_v1';

const WEEK = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const slot = (day, startTime, endTime) => ({ day, startTime, endTime });
const section = (sectionId, courseCode, roomName, classSchedules) => ({
  sectionId,
  courseCode,
  sectionName: '01',
  capacity: 40,
  consumedSeat: 10,
  roomName,
  sectionSchedule: { classSchedules },
});

const STUB_FEED = [
  section(1, 'CSE110', '07A-01C', WEEK.map((d) => slot(d, '0:00', '23:59'))),
  section(2, 'CSE220', '09G-31T', [slot('TUESDAY', '11:00', '12:20')]),
];

async function openCampus(page, path = '/') {
  await page.addInitScript(
    ({ key, payload }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ fetchedAt: Date.now(), etag: null, payload }),
      );
    },
    { key: FEED_KEY, payload: STUB_FEED },
  );
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('campus-page')).toBeVisible();
}

test('boots standalone and renders floors from the feed', async ({ page }) => {
  await openCampus(page);
  await expect(page.getByRole('button', { name: 'Tower' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 7' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 9' })).toBeVisible();
});

test('?room= deep link selects the room without a basename', async ({ page }) => {
  await openCampus(page, '/?room=09G-31T');
  await expect(page.getByTestId('campus-room-panel')).toContainText('09G-31T');
  // Selecting elsewhere keeps the URL shareable at the standalone mount point.
  await page.getByRole('button', { name: 'Floor 7' }).click();
  await page.getByRole('button', { name: /07A-01C/ }).click();
  await expect(page).toHaveURL(/room=07A-01C/);
});

test('shows the under-development note while #385 is open', async ({ page }) => {
  await openCampus(page);
  await expect(page.getByTestId('campus-wip')).toContainText('Under development');
});

test('top bar links back to the main site', async ({ page }) => {
  await openCampus(page);
  const back = page.getByRole('link', { name: '← Shohoj' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '../');
});
