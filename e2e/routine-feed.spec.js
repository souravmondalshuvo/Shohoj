import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Regression guard for the CSP/feed bug fixed in #135: the Routine tab fetches
// https://usis-cdn.eniamza.com/connect.json, which must be allowed by the page's
// Content-Security-Policy connect-src. The browser enforces connect-src BEFORE
// a request reaches Playwright's network interception, so a route.fulfill mock
// still exercises CSP: if the CDN is ever dropped from connect-src again, the
// fetch is blocked, this mock never fires, and the "sections render" assertion
// below fails instead of the bug reaching production.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// Minimal feed: CSE110 (2 sections) + MAT110 (1 section).
const MOCK_FEED = [
  {
    sectionId: 9001, courseId: 1, sectionName: '01', courseCredit: 3,
    courseCode: 'CSE110', sectionType: 'THEORY', capacity: 30, consumedSeat: 10,
    semesterSessionId: 20262, faculties: 'ABC', roomName: '09A-10C',
    courseName: 'PROGRAMMING LANGUAGE I',
    sectionSchedule: {
      finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      classSchedules: [
        { startTime: '08:00:00', endTime: '09:20:00', day: 'SUNDAY' },
        { startTime: '08:00:00', endTime: '09:20:00', day: 'TUESDAY' },
      ],
    },
  },
  {
    sectionId: 9002, courseId: 1, sectionName: '02', courseCredit: 3,
    courseCode: 'CSE110', sectionType: 'THEORY', capacity: 30, consumedSeat: 30,
    semesterSessionId: 20262, faculties: 'XYZ', roomName: '09B-11C',
    courseName: 'PROGRAMMING LANGUAGE I',
    sectionSchedule: {
      finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      classSchedules: [
        { startTime: '11:00:00', endTime: '12:20:00', day: 'MONDAY' },
        { startTime: '11:00:00', endTime: '12:20:00', day: 'WEDNESDAY' },
      ],
    },
  },
  {
    sectionId: 9003, courseId: 2, sectionName: '01', courseCredit: 3,
    courseCode: 'MAT110', sectionType: 'THEORY', capacity: 40, consumedSeat: 5,
    semesterSessionId: 20262, faculties: 'PQR', roomName: '08A-01C',
    courseName: 'DIFFERENTIAL CALCULUS',
    sectionSchedule: {
      finalExamDate: '2026-09-15', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      midExamDate: '2026-07-28', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      classSchedules: [
        { startTime: '09:30:00', endTime: '10:50:00', day: 'MONDAY' },
      ],
    },
  },
];

/**
 * Boot the app on the Routine tab. `feedMode`:
 *   'ok'    → CDN returns MOCK_FEED
 *   'fail'  → CDN returns 503 (simulates outage; no cache → error state)
 */
async function bootRoutine(page, feedMode = 'ok') {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });

  // Single handler so matching is unambiguous: fulfill the CDN, abort the rest.
  await page.route('https://**/*', route => {
    const url = route.request().url();
    if (url.startsWith(FEED_URL)) {
      if (feedMode === 'fail') return route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(MOCK_FEED),
      });
    }
    return route.abort();
  });

  await unlockCalculator(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, "routine");
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
}

test('Routine tab loads live feed through the CSP and renders sections', async ({ page }) => {
  await bootRoutine(page, 'ok');

  // Picker appears once the feed resolves — if CSP blocked the fetch this times out.
  await expect(page.locator('#routineCourseInput')).toBeVisible();

  // Source badge confirms a real (mocked) fetch succeeded, not a fallback.
  await expect(page.locator('.routine-source-badge')).toContainText(/Live/);

  // Add a course from the feed and confirm its sections render.
  await page.locator('#routineCourseInput').fill('CSE110');
  await page.locator('[data-action="routine:addCourse"]').click();

  await expect(page.locator('.routine-course-block')).toContainText('CSE110');
  // CSE110 has two sections in the mock feed.
  await expect(page.locator('.routine-section-row')).toHaveCount(2);
  // Faculty initials from the feed show up on the rows.
  await expect(page.locator('.routine-section-row').first()).toContainText(/ABC|XYZ/);
});

test('Routine auto-suggest produces a clash-free combination from the feed', async ({ page }) => {
  await bootRoutine(page, 'ok');
  await expect(page.locator('#routineCourseInput')).toBeVisible();

  for (const code of ['CSE110', 'MAT110']) {
    await page.locator('#routineCourseInput').fill(code);
    await page.locator('[data-action="routine:addCourse"]').click();
    await expect(page.locator('.routine-course-block').filter({ hasText: code })).toBeVisible();
  }

  await page.locator('[data-action="routine:suggest"]').click();
  await expect(page.locator('.routine-suggest-card').first()).toBeVisible();

  // Applying the top combo should populate the weekly grid.
  await page.locator('.routine-suggest-card [data-action="routine:applyCombo"]').first().click();
  await expect(page.locator('.routine-grid-block').first()).toBeVisible();
});

test('Routine tab shows an error state when the feed is unreachable', async ({ page }) => {
  await bootRoutine(page, 'fail');

  // No cache + failed fetch → explicit error state with a retry button.
  await expect(page.locator('.routine-error')).toBeVisible();
  await expect(page.locator('.routine-error')).toContainText(/Couldn't reach/i);
  await expect(page.locator('[data-action="routine:refresh"]')).toBeVisible();
});
