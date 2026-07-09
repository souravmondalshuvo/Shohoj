// e2e-shell/a11y-routes.spec.js
//
// Issue #238 axe smoke: a route-level accessibility gate across the migrated
// shell routes (Home, Calculator, Planner, Reviews). Each scan asserts no
// serious/critical violations, so CI fails on a11y regressions. color-contrast
// stays disabled until the visual system integrates (the 5C/5D precedent shared
// with the per-section scans in calculator-results / calculator-autocomplete).
//
// Routine, seats, and profile are listed in #238 but are not shell routes yet
// (routine/seats are legacy tabs; profile is unmigrated) — add their scans when
// those routes land.

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Serious/critical only, color-contrast excluded (no visual system yet).
async function scanPage(page) {
  const scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  return scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
}

async function gotoHome(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

test('@a11y Home route has no serious/critical violations', async ({ page }) => {
  await gotoHome(page);
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Calculator route (with demo content) has no serious/critical violations', async ({ page }) => {
  await gotoHome(page);
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  // Demo data gives the route real content (semesters, courses, results) to scan.
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await expect(page.locator('[data-testid="calculator-results"]')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Planner route has no serious/critical violations', async ({ page }) => {
  await gotoHome(page);
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await page.getByRole('link', { name: 'Planner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Reviews route (directory over a stub feed) has no serious/critical violations', async ({ page }) => {
  await page.addInitScript(() => {
    const r = (fac, n) => ({
      facultyInitials: fac,
      ratings: { teaching: n, marking: n, behavior: n, difficulty: 3, workload: 3 },
      text: 'ok',
    });
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchRecent() {
        return [r('ABC', 5), r('MRA', 4), r('XYZ', 3)];
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  });
  await gotoHome(page);
  await page.getByRole('link', { name: 'Reviews', exact: true }).click();
  await expect(page.getByTestId('reviews-directory')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Campus route (map over a seeded feed cache) has no serious/critical violations', async ({ page }) => {
  // Seed the CONNECT feed cache so the route renders real content (floors,
  // room list, room panel) without touching the network — same seeding as
  // campus-map.spec.js.
  await page.addInitScript(() => {
    const section = (sectionId, courseCode, roomName, day) => ({
      sectionId,
      courseCode,
      sectionName: '01',
      capacity: 40,
      consumedSeat: 10,
      roomName,
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '07A-01C', 'SUNDAY'),
          section(2, 'PHY111', '07B-11C', 'MONDAY'),
          section(3, 'CSE220', '09G-31T', 'TUESDAY'),
        ],
      }),
    );
  });
  await page.goto('/campus', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Floor 7' }).click();
  await page.getByRole('button', { name: /07A-01C/ }).click();
  await expect(page.getByTestId('campus-room-panel')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
