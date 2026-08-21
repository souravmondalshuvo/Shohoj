import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

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

// R1 in a theory class Sunday 08:00–09:20; R2 has no Sunday class (free all
// Sunday); 10A-01L runs a lab Sunday 08:00–10:50.
const MOCK_FEED = [
  { courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionId: 1, courseCode: 'CSE110', courseName: 'C', sectionName: '01',
    capacity: 30, consumedSeat: 10, faculties: 'ABC', roomName: 'R1',
    sectionSchedule: sched('SUNDAY', '08:00:00', '09:20:00') },
  { courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionId: 2, courseCode: 'MAT110', courseName: 'M', sectionName: '01',
    capacity: 30, consumedSeat: 5, faculties: 'DEF', roomName: 'R2',
    sectionSchedule: sched('TUESDAY', '10:00:00', '11:20:00') },
  { courseId: 2, sectionType: 'LAB', semesterSessionId: 20262, courseCredit: 1,
    sectionId: 3, courseCode: 'CSE111', courseName: 'L', sectionName: '02',
    capacity: 25, consumedSeat: 8, faculties: 'GHI', roomName: '10A-01L',
    sectionSchedule: { midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
                       finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
                       classSchedules: [] },
    labSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '10:50:00' }] },
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
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, "freerooms");
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

test('clicking a room opens its full-week availability in a modal', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('#freeRoomsTime').fill('09:30');
  await card(page, 'R1').click();
  const modal = page.locator('.app-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.app-modal-title')).toContainText('R1');
  // Every weekday is listed, not just the selected one.
  await expect(modal.locator('.freerooms-day-row')).toHaveCount(7);
  // Sunday: R1 busy 08:00–09:20 (labeled with its course), then free from 9:20 AM.
  const sunday = modal.locator('.freerooms-day-row', { hasText: 'Sun' });
  await expect(sunday.locator('.freerooms-seg--busy').filter({ hasText: 'CSE110' })).toBeVisible();
  await expect(sunday.locator('.freerooms-seg--free').filter({ hasText: '9:20 AM' })).toBeVisible();
  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('all-rooms view shows free / in-class / in-lab status', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('#freeRoomsTime').fill('08:30');
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();
  // Occupied rooms now appear (not just free ones), each with a status.
  await expect(card(page, 'R1')).toHaveClass(/is-class/);
  await expect(card(page, 'R1')).toContainText('in class');
  await expect(card(page, '10A-01L')).toHaveClass(/is-lab/);
  await expect(card(page, '10A-01L')).toContainText('in lab');
  await expect(card(page, 'R2')).toHaveClass(/is-free/);
});

test('the room-type filter narrows the all-rooms board', async ({ page }) => {
  await boot(page);
  await page.locator('[data-action="freerooms:setDay"][data-day="SUNDAY"]').click();
  await page.locator('[data-action="freerooms:setView"][data-view="all"]').click();
  await page.locator('[data-action="freerooms:setType"][data-type="L"]').click();
  // Only the lab-suffixed room survives the filter.
  await expect(card(page, '10A-01L')).toBeVisible();
  await expect(card(page, 'R1')).toHaveCount(0);
  await expect(card(page, 'R2')).toHaveCount(0);
});
