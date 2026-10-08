// e2e-pages/campus-nsu.spec.js
//
// North South University's Campus Map on the standalone page, reached at
// /campus/?campus=nsu. The page reads NSU's section snapshot from the site
// root (feeds/…), which the pages build does not contain, so each test serves
// a small snapshot of its own at that address.
//
// The page's clock is fixed. What a room shows depends on the minute and on
// whether today is inside the snapshot's term, so a test that read the real
// clock would fail for one minute a day and for good once the term ended.

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

// A Wednesday morning inside term 263 (classes 20 Sep – 20 Dec 2026).
const IN_TERM = new Date('2026-10-07T10:30:00');
// The same weekday and hour, after the term's last class.
const AFTER_TERM = new Date('2027-01-13T10:30:00');
// The same weekday and hour two weeks on: Durga Puja, a holiday inside the term.
const HOLIDAY = new Date('2026-10-21T10:30:00');

const SNAPSHOT = [
  section(1, 'ACT201', 'NAC210', allDay),
  // A class on another day: free at the fixed time.
  section(2, 'ENG103', 'NAC201', [{ day: 'FRIDAY', startTime: '9:00', endTime: '10:30' }]),
  // A second booking of SAC414, the way NSU's list names it.
  section(3, 'CSE115', 'SAC414_V', allDay),
  section(4, 'MAT120', 'LIB601', allDay),
  section(5, 'PHY107', 'OAT1001', allDay),
  // A basement room: level 1, room 13.
  section(7, 'CEE335', 'B113', allDay),
  // Not a room of a mapped building.
  section(6, 'BIO103', 'NTR201', allDay),
];

async function openNsuCampus(page, query = '', at = IN_TERM) {
  await page.clock.setFixedTime(at);
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
  for (const name of ['Whole campus', 'NAC', 'SAC', 'Library', 'Auditorium', 'Admin', 'Basements']) {
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

test('the campus model loads, and opening a floor keeps it', async ({ page }) => {
  await openNsuCampus(page);
  const canvas = page.getByTestId('campus-canvas');
  await expect(canvas).toHaveAttribute('data-model-state', 'loaded', { timeout: 20_000 });
  await page.getByTestId('campus-buildings').getByRole('button', { name: 'SAC', exact: true }).click();
  await page.getByTestId('campus-floors').getByRole('button', { name: /^Floor 4/ }).click();
  await expect(page.getByTestId('campus-room-list')).toContainText('SAC414');
  await expect(canvas).toHaveAttribute('data-model-state', 'loaded');
});

test('clicking a building in the model opens the storey under the pointer', async ({ page }) => {
  await openNsuCampus(page);
  const canvas = page.getByTestId('campus-canvas');
  await expect(canvas).toHaveAttribute('data-model-state', 'loaded', { timeout: 20_000 });
  // The whole-campus view looks at the middle of the site, where the
  // buildings stand; which one is under the centre is the camera's business.
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const floors = page.getByTestId('campus-floors');
  await expect(floors).toBeVisible();
  await expect(floors.locator('[aria-pressed="true"]')).toHaveCount(1);
});

test('without the model the drawn campus is still the map', async ({ page }) => {
  await page.route('**/nsu-campus*.gz', (route) => route.fulfill({ status: 404, body: '' }));
  await openNsuCampus(page);
  await expect(page.getByTestId('campus-canvas')).toHaveAttribute('data-model-state', 'failed');
  await page.getByTestId('campus-buildings').getByRole('button', { name: 'NAC', exact: true }).click();
  await expect(page.getByTestId('campus-floors').getByRole('button')).toHaveCount(10);
});

test('outside the term, no room is shown as in class or free', async ({ page }) => {
  await openNsuCampus(page, '&room=NAC210', AFTER_TERM);
  await expect(page.getByTestId('campus-out-of-term')).toContainText('ended on 20 December 2026');
  await expect(page.getByTestId('campus-legend')).toHaveCount(0);
  // In term this room is in class all day; now the page will not say so.
  const panel = page.getByTestId('campus-room-panel');
  await expect(panel).toContainText('NAC210');
  await expect(panel).not.toContainText('ACT201');
  await expect(
    page.getByTestId('campus-room-list').getByRole('button', { name: /NAC210/ }),
  ).toContainText('no timetable for today');
});

test('on a holiday inside the term, no room is shown as in class or free', async ({ page }) => {
  await openNsuCampus(page, '&room=NAC210', HOLIDAY);
  await expect(page.getByTestId('campus-out-of-term')).toContainText(
    'No classes today: Holiday- Durga Puja.',
  );
  await expect(page.getByTestId('campus-legend')).toHaveCount(0);
  // The timetable books this room every Wednesday; today it is not in use.
  await expect(page.getByTestId('campus-room-panel')).not.toContainText('ACT201');
});

test('the basements open level by level, B1 downward', async ({ page }) => {
  await openNsuCampus(page);
  await page.getByTestId('campus-buildings').getByRole('button', { name: 'Basements' }).click();
  const floors = page.getByTestId('campus-floors');
  await expect(floors.getByRole('button')).toHaveCount(3);
  await expect(floors.getByRole('button').first()).toContainText('B1');
  await expect(page).toHaveURL(/building=BAS/);

  await floors.getByRole('button', { name: /^B1/ }).click();
  const list = page.getByTestId('campus-room-list');
  await expect(list).toContainText('Basements · B1');
  await expect(list).toContainText('Vehicle parking');
  await list.getByRole('button', { name: /B113/ }).click();
  await expect(page.getByTestId('campus-room-panel')).toContainText('Basements · B1');
  await expect(page.getByTestId('campus-room-panel')).toContainText('CEE335');

  // A level with no timetabled room is still a level.
  await floors.getByRole('button', { name: /^B3/ }).click();
  await expect(page.getByTestId('campus-floor-empty')).toBeVisible();
});

test('a snapshot that will not load offers a retry', async ({ page }) => {
  await page.route('**/feeds/nsu-*.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/campus/?campus=nsu', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('campus-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
