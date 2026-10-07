// e2e-pages/campus-nsu.spec.js
//
// North South University's Campus Map on the standalone page, reached at
// /campus/?campus=nsu. The page reads NSU's section snapshot from the site
// root (feeds/…), which the pages build does not contain, so each test serves
// a small snapshot of its own at that address.

import { expect, test } from '@playwright/test';

const WEEK = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const allDay = WEEK.map((day) => ({ day, startTime: '0:00', endTime: '23:59' }));
const section = (sectionId, courseCode, roomName, classSchedules) => ({
  sectionId,
  courseCode,
  sectionName: '1',
  capacity: 0,
  consumedSeat: 0,
  roomName,
  sectionSchedule: { classSchedules },
});

const SNAPSHOT = [
  // In class every minute of the week, so "now" never decides the outcome.
  section(1, 'ACT201', 'NAC210', allDay),
  // Never in class at a time the test could run.
  section(2, 'ENG103', 'NAC201', [{ day: 'FRIDAY', startTime: '3:00', endTime: '3:01' }]),
  // A second booking of SAC414, the way NSU's list names it.
  section(3, 'CSE115', 'SAC414_V', allDay),
  section(4, 'MAT120', 'LIB601', allDay),
  section(5, 'PHY107', 'OAT1001', allDay),
  // Not a room of a mapped building.
  section(6, 'BIO103', 'NTR201', allDay),
];

async function openNsuCampus(page, query = '') {
  await page.route('**/feeds/nsu-*.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(SNAPSHOT) }),
  );
  await page.goto(`/campus/?campus=nsu${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('campus-page')).toHaveAttribute('data-campus', 'nsu');
  await expect(page.getByTestId('campus-buildings')).toBeVisible();
}

test('shows NSU, its buildings, and that the timetable is not live', async ({ page }) => {
  await openNsuCampus(page);
  const buildings = page.getByTestId('campus-buildings');
  for (const name of ['Whole campus', 'NAC', 'SAC', 'Library', 'Auditorium', 'Admin']) {
    await expect(buildings.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('campus-snapshot')).toContainText('not live');
  // BRACU's tower controls are not on NSU's page.
  await expect(page.getByRole('button', { name: 'Tower' })).toHaveCount(0);
});

test('building, then floor, then room — and the address follows', async ({ page }) => {
  await openNsuCampus(page);
  await page.getByTestId('campus-buildings').getByRole('button', { name: 'NAC', exact: true }).click();
  await expect(page.getByTestId('campus-floors').getByRole('button')).toHaveCount(10);
  await expect(page).toHaveURL(/campus=nsu/);
  await expect(page).toHaveURL(/building=NAC/);

  await page.getByTestId('campus-floors').getByRole('button', { name: /^Floor 2/ }).click();
  const rooms = page.getByTestId('campus-room-list');
  await expect(rooms.getByRole('button', { name: /NAC201/ })).toContainText('no class now');
  await expect(rooms.getByRole('button', { name: /NAC210/ })).toContainText('class timetabled now');

  await rooms.getByRole('button', { name: /NAC210/ }).click();
  await expect(page.getByTestId('campus-room-panel')).toContainText('NAC210');
  await expect(page.getByTestId('campus-room-panel')).toContainText('ACT201');
  await expect(page).toHaveURL(/campus=nsu/);
  await expect(page).toHaveURL(/room=NAC210/);
});

test('a room link opens its building and floor', async ({ page }) => {
  await openNsuCampus(page, '&room=LIB601');
  await expect(page.getByTestId('campus-room-panel')).toContainText('Library Building · Floor 6');
  await expect(page.getByTestId('campus-room-list')).toContainText('LIB601');
});

test('a second booking of a room is listed as the room', async ({ page }) => {
  await openNsuCampus(page, '&building=SAC&floor=4');
  const rooms = page.getByTestId('campus-room-list');
  await expect(rooms.getByRole('button')).toHaveCount(1);
  await rooms.getByRole('button', { name: /SAC414/ }).click();
  await expect(page.getByTestId('campus-room-panel')).toContainText('CSE115');
});

test('a floor with no timetabled room can still be opened, and says so', async ({ page }) => {
  await openNsuCampus(page, '&building=ADM&floor=3');
  await expect(page.getByTestId('campus-room-list')).toContainText('Administration Building · Floor 3');
  await expect(page.getByTestId('campus-floor-empty')).toBeVisible();
});

test('room search jumps to the room; a venue outside the map is only listed', async ({ page }) => {
  await openNsuCampus(page);
  await page.getByTestId('campus-search-input').fill('oat1001');
  await page.getByTestId('campus-search-btn').click();
  await expect(page.getByTestId('campus-room-panel')).toContainText('Auditorium Building · Floor 10');

  await page.getByTestId('campus-search-input').fill('NTR201');
  await page.getByTestId('campus-search-btn').click();
  await expect(page.getByTestId('campus-search-miss')).toBeVisible();
  await expect(page.locator('.campus-other')).toContainText('NTR201');
});

test('a snapshot that will not load offers a retry', async ({ page }) => {
  await page.route('**/feeds/nsu-*.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/campus/?campus=nsu', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('campus-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
