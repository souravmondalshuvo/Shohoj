// e2e-shell/a11y-routes.spec.js
//
// Issue #238 axe smoke: a route-level accessibility gate across the migrated
// shell routes (Home, Calculator, Planner, Reviews). Each scan asserts no
// serious/critical violations, so CI fails on a11y regressions. color-contrast
// stays disabled until the visual system integrates (the 5C/5D precedent shared
// with the per-section scans in calculator-results / calculator-autocomplete).
//
// Routine, seats, and profile all migrated in #397 and are scanned below, so the
// #238 axe smoke now covers every route named there (profile is scanned in its
// signed-in state via the RootLayout auth seam).

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

test('@a11y Bus route (static timetable + route toggles + stop table) has no serious/critical violations', async ({ page }) => {
  // Static transcribed data (#372) — no seeding needed; the default selected
  // route renders the fare line and the stop table. Scan that worst case.
  await page.goto('/bus', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-page')).toBeVisible();
  await expect(page.getByTestId('bus-stops')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Routine route (builder with picked sections + weekly grid) has no serious/critical violations', async ({ page }) => {
  // Seed the CONNECT feed cache so the route resolves real sections (#397),
  // then add a course and pick a section — the worst case scans the section
  // picker AND the rendered weekly grid.
  await page.addInitScript(() => {
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          {
            sectionId: 1,
            courseCode: 'CSE110',
            sectionName: '01',
            capacity: 40,
            consumedSeat: 10,
            roomName: '07A-01C',
            sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '8:00', endTime: '9:20' }] },
          },
        ],
      }),
    );
  });
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  await page.getByTestId('routine-course-input').fill('CSE110');
  await page.getByTestId('routine-add-btn').click();
  await page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 01/ }).click();
  await expect(page.getByTestId('routine-grid')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Seats route (search results with open/tight/full sections) has no serious/critical violations', async ({ page }) => {
  // Seed the CONNECT feed cache so a search resolves real sections (#397), then
  // search a course to render the worst case — the sort/filter controls plus a
  // course group with all three seat-status badges.
  await page.addInitScript(() => {
    const section = (sectionId, sectionName, consumedSeat) => ({
      sectionId,
      courseCode: 'CSE110',
      courseName: 'Programming Language',
      sectionName,
      capacity: 40,
      consumedSeat,
      roomName: '07A-01C',
      sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [section(1, '01', 10), section(2, '02', 38), section(3, '03', 40)],
      }),
    );
  });
  await page.goto('/seats', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('seats-page')).toBeVisible();
  await page.getByTestId('seats-search-input').fill('CSE110');
  await expect(page.getByTestId('seats-group-CSE110')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Profile route (signed-in account hub) has no serious/critical violations', async ({ page }) => {
  // Auth-gated route: inject a signed-in auth source via the RootLayout e2e seam
  // and a saved routine so the hub renders its real content (#397 / #196). Scan
  // the authenticated worst case — account header + routine summary card.
  await page.addInitScript(() => {
    const snapshot = { status: 'authenticated', uid: 'u_test', email: 'student@g.bracu.ac.bd' };
    window.__shohojAuthSource = {
      get: () => snapshot,
      subscribe: () => () => {},
      getIdToken: async () => 'test-token',
    };
    localStorage.setItem('shohoj_routine_picks_v1', JSON.stringify({ picks: { CSE110: 1 } }));
  });
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-account')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Lost & Found route (board + form + claim box over stub seams) has no serious/critical violations', async ({ page }) => {
  // Same seams as lost-found.spec.js: injected repo fake + identity stand-in.
  await page.addInitScript(() => {
    const now = Date.now();
    const posts = [
      { id: 'mine1', type: 'lost', title: 'My scientific calculator', status: 'open', creatorUid: 'u_me', createdAtMs: now - 60_000 },
      { id: 'p1', type: 'lost', title: 'Black umbrella', description: 'Wooden handle', locationHint: 'lift lobby', roomCode: '09G-31T', status: 'open', creatorUid: 'u_other', createdAtMs: now - 3_600_000 },
    ];
    window.__shohojLostFoundIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    window.__shohojLostFoundRepo = {
      async listRecent() { return posts.slice(); },
      async createPost() { return 'x'; },
      async resolvePost() {},
      async deletePost() {},
      async createClaim() {},
    };
  });
  await page.goto('/lost-found', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('lostfound-list')).toBeVisible();
  // Scan with the post form AND a claim box open — the interactive worst case.
  await page.getByRole('button', { name: 'Report an item' }).click();
  await page.getByRole('button', { name: 'I found this' }).click();
  await expect(page.getByTestId('lostfound-claim-box')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
