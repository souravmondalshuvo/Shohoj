// e2e-shell/rooms.spec.js
//
// #434: the Free Rooms finder on the React Router shell's /rooms route,
// migrated from the legacy freeRoomsTab.js. Seeds the CONNECT feed cache (same
// seam as seats.spec.js) so the route renders real rooms offline.
//
// Fixture: on SUNDAY at 09:00, R-01C is in class (CSE110 §01 08:00–09:20),
// R-02L is in lab (PHY111 §05 08:30–11:00), and R-03C is free (its only class
// is MONDAY). Times are driven through the time input, so the assertions don't
// depend on the wall clock.

import { expect, test } from '../e2e-support/authFixture.js';

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, roomName, day, startTime, endTime) => ({
      sectionId,
      courseCode,
      courseName: courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName,
      sectionSchedule: { classSchedules: [{ day, startTime, endTime }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', '07A-01C', 'SUNDAY', '8:00', '9:20'),
          section(2, 'PHY111', '05', '09G-31L', 'SUNDAY', '8:30', '11:00'),
          section(3, 'MAT110', '02', '08B-03C', 'MONDAY', '10:00', '11:20'),
        ],
      }),
    );
  });
}

async function gotoRooms(page) {
  await seedFeed(page);
  await page.goto('/rooms', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rooms-page')).toBeVisible();
  // Legacy's header badge is source AND freshness — "Cached · just now" (#600).
  await expect(page.getByTestId('rooms-feed-source')).toContainText('·');
  // Pin the moment under test: Sunday 09:00.
  await page.getByTestId('rooms-day-Sun').click();
  await page.getByTestId('rooms-time-input').fill('09:00');
}

test('free-only view lists exactly the rooms with no class at the chosen time', async ({ page }) => {
  await gotoRooms(page);

  // R-01C busy (class), R-02L busy (lab) → only 08B-03C is free.
  await expect(page.getByTestId('rooms-summary')).toContainText('1 room free');
  await expect(page.getByTestId('rooms-card-08B-03C')).toBeVisible();
  await expect(page.getByTestId('rooms-card-07A-01C')).toHaveCount(0);

  // The free card explains how long it stays free (no Sunday classes → all day).
  await expect(page.getByTestId('rooms-card-08B-03C')).toContainText('free rest of day');

  // After the 09:20 class ends, 07A-01C shows up free too.
  await page.getByTestId('rooms-time-input').fill('09:30');
  await expect(page.getByTestId('rooms-summary')).toContainText('2 rooms free');
  await expect(page.getByTestId('rooms-card-07A-01C')).toContainText('free rest of day');
});

test('all-rooms view shows occupancy labels and filters by room type', async ({ page }) => {
  await gotoRooms(page);
  await page.getByTestId('rooms-view-all').click();

  await expect(page.getByTestId('rooms-summary')).toContainText('3 rooms · 1 free');
  await expect(page.getByTestId('rooms-card-07A-01C')).toContainText('in class · CSE110 Section 01 · until 9:20 AM');
  await expect(page.getByTestId('rooms-card-09G-31L')).toContainText('in lab · PHY111 Section 05 · until 11:00 AM');

  // Type filter: labs only.
  await page.getByTestId('rooms-type-L').click();
  await expect(page.getByTestId('rooms-card-09G-31L')).toBeVisible();
  await expect(page.getByTestId('rooms-card-07A-01C')).toHaveCount(0);
});

test('room card opens the weekly availability dialog; Escape closes it', async ({ page }) => {
  await gotoRooms(page);
  await page.getByTestId('rooms-card-08B-03C').click();

  const dialog = page.getByTestId('rooms-week-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '08B-03C · weekly availability' })).toBeVisible();
  // Monday shows its class segment; Sunday (no classes) shows the no-data row.
  await expect(dialog.getByText('MAT110 Section 02')).toBeVisible();
  await expect(dialog.getByText('No class data')).toHaveCount(6); // every day but Monday

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Focus returns to the card that opened the dialog.
  await expect(page.getByTestId('rooms-card-08B-03C')).toBeFocused();
});
