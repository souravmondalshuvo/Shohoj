// #633 on the legacy build — the one the site root serves.
//
// The CONNECT feed carries one semester and never says which; between advising
// and the start of term it holds a timetable nobody is attending yet. The shell
// routes name the semester and caveat Free Rooms (e2e-shell/semester-banner.spec.js);
// the legacy Free Rooms and Seats tabs did neither, so on 2026-09-17 the live
// site answered "180 rooms free" off Fall 2026, which starts on 3 Oct.

import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// Dates relative to today, so the fixture cannot go stale.
function iso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function feed({ sessionId, offsetDays }) {
  const section = (sectionId, courseCode, room, day) => ({
    courseId: sectionId, sectionType: 'THEORY', semesterSessionId: sessionId, courseCredit: 3,
    sectionId, courseCode, courseName: courseCode, sectionName: '01',
    capacity: 40, consumedSeat: 10, faculties: 'ABC', roomName: room,
    sectionSchedule: {
      classSchedules: [{ day, startTime: '08:00:00', endTime: '09:20:00' }],
      classStartDate: iso(offsetDays - 30),
      classEndDate: iso(offsetDays + 60),
    },
  });
  return [
    section(1, 'CSE110', '07A-01C', 'SUNDAY'),
    section(2, 'MAT110', '07B-11C', 'MONDAY'),
  ];
}

// +90: the whole term (+60 to +150) is ahead of today — the advising window.
const ADVISING = { sessionId: 20263, offsetDays: 90 };
// 0: the term (-30 to +60) straddles today.
const IN_TERM = { sessionId: 20262, offsetDays: 0 };

async function boot(page, semester, tab) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  const body = JSON.stringify(feed(semester));
  await page.route('https://**/*', route => {
    if (route.request().url().startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body,
      });
    }
    return route.abort();
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, tab);
}

test('Free Rooms flags a timetable that is not in effect yet', async ({ page }) => {
  await boot(page, ADVISING, 'freerooms');
  const badge = page.getByTestId('freerooms-semester');
  await expect(badge).toContainText('Fall 2026');
  await expect(badge).toContainText('classes start');
  await expect(badge).toHaveClass(/routine-semester--upcoming/);

  // Rooms are still listed; the reader is told not to take them for today.
  const notice = page.getByTestId('freerooms-out-of-term');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('semester running right now');
  await expect(page.locator('.freerooms-card').first()).toBeVisible();
});

test('Free Rooms says nothing extra while the timetable is in effect', async ({ page }) => {
  await boot(page, IN_TERM, 'freerooms');
  await expect(page.getByTestId('freerooms-semester')).toContainText('Summer 2026');
  await expect(page.getByTestId('freerooms-semester')).toHaveClass(/routine-semester--running/);
  await expect(page.getByTestId('freerooms-out-of-term')).toHaveCount(0);
});

test('Seat Status names the semester its counts belong to', async ({ page }) => {
  await boot(page, ADVISING, 'seats');
  const badge = page.getByTestId('seats-semester');
  await expect(badge).toContainText('Fall 2026');
  await expect(badge).toHaveAttribute('title', /open for advising/);
});
