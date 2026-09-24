import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// #761: the CONNECT feed's origin is uncached and has been measured taking
// 10–20 s to answer. The Routine tab used to sit on its skeleton for all of
// it — even with yesterday's copy in storage — and forever if it hung.
//
// Now an expired copy paints at once and refreshes behind it, and a request
// that never answers gives up after the client's 8 s timeout.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
const CACHE_KEY = 'shohoj_connect_feed_v1';

function section(sectionId, courseCode, courseName) {
  return {
    sectionId, courseId: sectionId, sectionName: '01', courseCredit: 3,
    courseCode, sectionType: 'THEORY', capacity: 30, consumedSeat: 10,
    semesterSessionId: 20263, faculties: 'ABC', roomName: '09A-10C', courseName,
    sectionSchedule: {
      classSchedules: [{ startTime: '08:00:00', endTime: '09:20:00', day: 'SUNDAY' }],
    },
  };
}

const SAVED = [section(9001, 'CSE110', 'PROGRAMMING LANGUAGE I')];
const LIVE = [...SAVED, section(9002, 'MAT110', 'DIFFERENTIAL CALCULUS')];

/**
 * `feed`: 'slow' answers after `delayMs`; 'hang' never answers.
 * `savedAgoMs`: seed a saved copy that old (null = no saved copy).
 */
async function bootRoutine(page, { feed, delayMs = 0, savedAgoMs = null }) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(({ key, payload, agoMs }) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if (agoMs !== null) {
        localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now() - agoMs, etag: null, payload }));
      }
    } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  }, { key: CACHE_KEY, payload: SAVED, agoMs: savedAgoMs });

  await page.route('https://**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(FEED_URL)) return route.abort();
    if (feed === 'hang') return; // never fulfilled
    setTimeout(() => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(LIVE),
      }).catch(() => { /* page already closed */ });
    }, delayMs);
  });

  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, 'routine');
  await expect(page.locator('#tabRoutine')).toHaveClass(/active/);
}

test('an expired saved copy paints at once, then refreshes to Live', async ({ page }) => {
  await bootRoutine(page, { feed: 'slow', delayMs: 4000, savedAgoMs: 2 * 60 * 60 * 1000 });

  // Well inside the origin's 4 s: this is the saved copy, badged as such.
  await expect(page.locator('#routineCourseInput')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('.routine-source-badge')).toContainText(/Cached/);
  await expect(page.locator('.routine-loading-note')).toHaveCount(0);

  // The background revalidation lands and replaces it.
  await expect(page.locator('.routine-source-badge')).toContainText(/Live/, { timeout: 8000 });
});

test('a feed that never answers gives up instead of loading forever', async ({ page }) => {
  test.setTimeout(30_000);
  await bootRoutine(page, { feed: 'hang' });

  await expect(page.locator('.routine-loading-note')).toBeVisible();
  // The client's 8 s timeout, plus slack for a loaded CI runner.
  await expect(page.locator('.routine-error')).toContainText(/Couldn't reach the Connect feed/, { timeout: 12_000 });
  await expect(page.locator('[data-action="routine:refresh"]')).toBeVisible();
});

test('a hanging feed with a saved copy shows the copy, not a skeleton', async ({ page }) => {
  await bootRoutine(page, { feed: 'hang', savedAgoMs: 24 * 60 * 60 * 1000 });

  await expect(page.locator('#routineCourseInput')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('.routine-source-badge')).toContainText(/Cached/);
});
