// e2e-shell/campus-map.spec.js
//
// Campus map route (#370) against a seeded CONNECT-feed cache — no network.
// The stub is planted in localStorage under the feed client's cache key with a
// fresh timestamp, so fetchConnectFeed serves it without touching the CDN.
// Room 07A-01C is scheduled 0:00–23:59 every day, so its "in class now" state
// is deterministic whenever the suite runs.

import { expect, test } from '../e2e-support/authFixture.js';

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
  // Busy around the clock — deterministic "in class now".
  section(1, 'CSE110', '07A-01C', WEEK.map((d) => slot(d, '0:00', '23:59'))),
  section(2, 'MAT110', '07A-02C', [slot('SUNDAY', '3:00', '3:05')]),
  section(3, 'PHY111', '07B-11C', [slot('MONDAY', '8:00', '9:20')]),
  section(4, 'CSE220', '09G-31T', [slot('TUESDAY', '11:00', '12:20')]),
  section(5, 'CSE250', '10B-04L', [slot('WEDNESDAY', '14:00', '15:50')]),
  // Outside the tower's room-code system → "Other venues".
  section(6, 'ENG101', 'AN1-01C', [slot('THURSDAY', '9:30', '10:50')]),
];

async function openCampus(page, path = '/campus') {
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

test('campus page renders floors from the feed and prompts for a floor', async ({ page }) => {
  await openCampus(page);
  await expect(page.getByRole('button', { name: 'Tower' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 7' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 9' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Floor 10' })).toBeVisible();
  // Floor 8 has no rooms in the stub, so it must not be offered.
  await expect(page.getByRole('button', { name: 'Floor 8' })).toHaveCount(0);
  await expect(page.getByTestId('campus-floor-hint')).toBeVisible();
  // 3D canvas when WebGL is available, an explanatory note otherwise —
  // either way the DOM controls carry the feature.
  const canvas = page.locator('.campus-canvas canvas');
  const fallback = page.getByTestId('campus-no-webgl');
  await expect(canvas.or(fallback).first()).toBeVisible();
});

test('selecting a floor lists its rooms by zone and persists across reload', async ({ page }) => {
  await openCampus(page);
  await page.getByRole('button', { name: 'Floor 7' }).click();
  await expect(page.getByRole('heading', { name: 'Zone A' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zone B' })).toBeVisible();
  await expect(page.getByRole('button', { name: /07A-01C/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /07B-11C/ })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Floor 7' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /07A-01C/ })).toBeVisible();
});

test('selecting a room shows live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
  await page.getByRole('button', { name: 'Floor 7' }).click();
  await page.getByRole('button', { name: /07A-01C/ }).click();

  const panel = page.getByTestId('campus-room-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('07A-01C');
  await expect(panel).toContainText('Classroom · Floor 7 · Zone A');
  await expect(panel).toContainText('In class now — CSE110 until 11:59 PM');
  // Selection is shareable: the room lands in the URL.
  await expect(page).toHaveURL(/room=07A-01C/);
});

test('?room= deep link focuses the floor and opens the room panel', async ({ page }) => {
  await openCampus(page, '/campus?room=09G-31T');
  await expect(page.getByRole('button', { name: 'Floor 9' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const panel = page.getByTestId('campus-room-panel');
  await expect(panel).toContainText('09G-31T');
  await expect(panel).toContainText('Theater · Floor 9 · Zone G');
});

test('?floor= deep link (from the cafeteria guide) focuses the floor without a room', async ({ page }) => {
  await openCampus(page, '/campus?floor=9');
  await expect(page.getByRole('button', { name: 'Floor 9' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A bare floor link highlights the floor but opens no room panel.
  await expect(page.getByTestId('campus-room-panel')).toHaveCount(0);
  // A floor with no rooms in the feed is ignored (no crash, prompt stays).
  await openCampus(page, '/campus?floor=8');
  await expect(page.getByTestId('campus-floor-hint')).toBeVisible();
});

test('search box focuses a room by its code (#385)', async ({ page }) => {
  await openCampus(page); // starts on the Tower (no floor)
  await page.getByTestId('campus-search-input').fill('07A-01C');
  await page.getByTestId('campus-search-btn').click();
  // Focuses the room's floor and opens its panel, same as a click.
  await expect(page.getByRole('button', { name: 'Floor 7' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('campus-room-panel')).toContainText('07A-01C');
});

test('“only free rooms” filter hides in-class rooms (#385)', async ({ page }) => {
  await openCampus(page);
  await page.getByRole('button', { name: 'Floor 7' }).click();
  // 07A-01C is scheduled around the clock → always busy; 07A-02C is free.
  await expect(page.getByRole('button', { name: /07A-01C/ })).toBeVisible();
  await page.getByTestId('campus-onlyfree').check();
  await expect(page.getByRole('button', { name: /07A-01C/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /07A-02C/ })).toBeVisible();
});

test('legend shows live free/busy counts (#385)', async ({ page }) => {
  await openCampus(page);
  const busy = page.getByTestId('campus-busy-count');
  const free = page.getByTestId('campus-free-count');
  await expect(busy).toBeVisible();
  await expect(free).toBeVisible();
  // 07A-01C is always in class, so the busy tally is at least one.
  expect(Number(await busy.textContent())).toBeGreaterThanOrEqual(1);
  expect(Number(await free.textContent())).toBeGreaterThanOrEqual(0);
});

test('non-tower venues are listed separately', async ({ page }) => {
  await openCampus(page);
  const other = page.locator('.campus-other');
  await expect(other).toContainText('Other venues (1)');
  await other.locator('summary').click();
  await expect(other).toContainText('AN1-01C');
});

test.describe('geofence', () => {
  // Emulated fix at the campus center (BRACU Merul Badda).
  test.use({
    geolocation: { latitude: 23.7733146, longitude: 90.424371 },
    permissions: ['geolocation'],
  });

  test('“Am I on campus?” answers from the geofence', async ({ page }) => {
    await openCampus(page);
    await page.getByRole('button', { name: 'Am I on campus?' }).click();
    await expect(page.getByTestId('campus-location')).toContainText('On campus');
  });
});
