import { expect, test } from '@playwright/test';

// Browser coverage for the Free Rooms tab: day + time picker driving the
// free-room list, and per-room free windows. Reuses the mock-CONNECT-feed
// approach from the routine specs for determinism.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

function sched(day, start, end) {
  return {
    midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
    finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
    classSchedules: [{ day, startTime: start, endTime: end }],
  };
}

// R1 busy Sunday 08:00–09:20; R2 has no Sunday class (free all Sunday).
const MOCK_FEED = [
  { courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionId: 1, courseCode: 'CSE110', courseName: 'C', sectionName: '01',
    capacity: 30, consumedSeat: 10, faculties: 'ABC', roomName: 'R1',
    sectionSchedule: sched('SUNDAY', '08:00:00', '09:20:00') },
  { courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionId: 2, courseCode: 'MAT110', courseName: 'M', sectionName: '01',
    capacity: 30, consumedSeat: 5, faculties: 'DEF', roomName: 'R2',
    sectionSchedule: sched('TUESDAY', '10:00:00', '11:20:00') },
];

async function boot(page) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.route('https://**/*', route => {
    if (route.request().url().startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(MOCK_FEED),
      });
    }
    return route.abort();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.calc-tab[data-tab="freerooms"]').click();
  await expect(page.locator('#tabFreeRooms')).toHaveClass(/active/);
  await expect(page.locator('#freeRoomsContent')).toContainText('Free Rooms');
}

function card(page, room) {
  return page.locator('.freerooms-card', { hasText: room });
}

test('lists rooms free at the chosen day and time', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('#freeRoomsTime').fill('08:30');
  // R1 is in class 08:00–09:20; R2 is free.
  await expect(card(page, 'R2')).toBeVisible();
  await expect(card(page, 'R1')).toHaveCount(0);
});

test('a room frees up once its class ends', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('#freeRoomsTime').fill('09:30');
  await expect(card(page, 'R1')).toBeVisible();
  await expect(card(page, 'R2')).toBeVisible();
});

test('selecting a room reveals its full-week availability', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('#freeRoomsTime').fill('09:30');
  await card(page, 'R1').click();
  const detail = page.locator('.freerooms-detail');
  await expect(detail).toContainText('R1');
  // Every weekday is listed, not just the selected one.
  await expect(detail.locator('.freerooms-day-row')).toHaveCount(7);
  // Sunday: R1 busy 08:00–09:20 (labeled with its course), then free from 9:20 AM.
  const sunday = detail.locator('.freerooms-day-row', { hasText: 'Sun' });
  await expect(sunday.locator('.freerooms-seg--busy').filter({ hasText: 'CSE110' })).toBeVisible();
  await expect(sunday.locator('.freerooms-seg--free').filter({ hasText: '9:20 AM' })).toBeVisible();
});
