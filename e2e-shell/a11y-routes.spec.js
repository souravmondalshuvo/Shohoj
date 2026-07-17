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

test('@a11y Cafeteria route (static outlet list + hours tables) has no serious/critical violations', async ({ page }) => {
  // Static guide (#373) — no seeding needed; every outlet card with its hours
  // table renders immediately. Scan that worst case.
  await page.goto('/cafeteria', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cafeteria-page')).toBeVisible();
  await expect(page.getByTestId('cafeteria-list')).toBeVisible();
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

test('@a11y Rooms route (finder + weekly dialog over a seeded feed) has no serious/critical violations', async ({ page }) => {
  // Same feed seam as rooms.spec.js; scan with the weekly dialog open — the
  // interactive worst case (#434).
  await page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, roomName, day) => ({
      sectionId,
      courseCode,
      courseName: courseCode,
      sectionName,
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
          section(1, 'CSE110', '01', '07A-01C', 'SUNDAY'),
          section(2, 'MAT110', '02', '08B-03C', 'MONDAY'),
        ],
      }),
    );
  });
  await page.goto('/rooms', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rooms-page')).toBeVisible();
  await page.getByTestId('rooms-view-all').click();
  await page.getByTestId('rooms-card-07A-01C').click();
  await expect(page.getByTestId('rooms-week-modal')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Feedback route (form + board over stub seams) has no serious/critical violations', async ({ page }) => {
  // Same seams as feedback.spec.js: injected repo fake + identity stand-in (#437).
  await page.addInitScript(() => {
    const now = Date.now();
    const items = [
      { id: 'f1', type: 'bug', text: 'Simulator forgets my grades', anonymous: true, createdAtMs: now - 3_600_000 },
      { id: 'f2', type: 'feature', text: 'Dark mode for the routine grid', anonymous: false, uid: 'u_other', createdAtMs: now - 60_000 },
    ];
    window.__shohojFeedbackIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd', isAdmin: true };
    window.__shohojFeedbackRepo = {
      async listRecent() { return items.slice(); },
      async listMyUpvotes() { return [{ feedbackId: 'f1', uid: 'u_me' }]; },
      async submit() {},
      async toggleUpvote() {},
      async adminDelete() {},
    };
  });
  await page.goto('/feedback', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('feedback-list')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Papers route (library + upload form over stub seams) has no serious/critical violations', async ({ page }) => {
  // Same seams as papers.spec.js; scan with the upload form and a report box
  // open — the interactive worst case (#440).
  await page.addInitScript(() => {
    const now = Date.now();
    window.__shohojPapersIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    window.__shohojPapersRepo = {
      async listRecent() {
        return [
          { id: 'p1', courseCode: 'CSE110', type: 'midterm', title: 'Fall 2025 midterm', semester: 'Fall 2025', size: 245760, createdAtMs: now - 86_400_000 },
        ];
      },
      async listByCourse() { return []; },
      async downloadUrl() { return null; },
      async upload() { return { ok: true, id: 'x' }; },
      async report() {},
    };
  });
  await page.goto('/papers', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('papers-list')).toBeVisible();
  await page.getByTestId('papers-upload-toggle').click();
  await expect(page.getByTestId('papers-upload-form')).toBeVisible();
  await page.getByTestId('papers-report-p1').click();
  await expect(page.getByTestId('papers-report-box')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Groups route (board + create form + roster over stub seams) has no serious/critical violations', async ({ page }) => {
  // Same seams as groups.spec.js; scan with the create form open and a roster
  // expanded — the interactive worst case (#443).
  await page.addInitScript(() => {
    const now = Date.now();
    window.__shohojGroupsIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    window.__shohojGroupsRepo = {
      async listGroups() {
        return [
          { id: 'g1', courseCode: 'CSE220', title: 'Algo midterm grind', description: 'DP + graphs', mode: 'in-person', schedule: 'Sun 4pm', contactLink: 'https://m.me/x', capacity: 6, creatorUid: 'u_other', createdAtMs: now - 3_600_000 },
          { id: 'g2', courseCode: 'CSE110', title: 'Recursion help desk', mode: 'online', contactLink: 'https://discord.gg/rec', capacity: 10, creatorUid: 'u_me', createdAtMs: now - 60_000 },
        ];
      },
      async listMyMemberships() { return [{ groupId: 'g2' }]; },
      async listMembers() { return [{ uid: 'u_me', email: 'me@g.bracu.ac.bd' }]; },
      async create() { return 'x'; },
      async join() {},
      async leave() {},
      async remove() {},
      async report() {},
    };
  });
  await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('groups-list')).toBeVisible();
  await page.getByTestId('groups-create-toggle').click();
  await expect(page.getByTestId('groups-form')).toBeVisible();
  await page.getByTestId('groups-roster-toggle-g2').click();
  await expect(page.getByTestId('groups-roster-g2')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('@a11y Transcript route (stats + tables over seeded state) has no serious/critical violations', async ({ page }) => {
  // Seeded through the shared calculator storage key (#445).
  await page.addInitScript(() => {
    localStorage.setItem(
      'shohoj_cgpa_v1',
      JSON.stringify({
        semesters: [
          { id: 1, summary: true, courses: [], summaryCGPA: 3.42, summaryCredits: 60, summaryAttempted: 63, summarySemesters: 5 },
          { id: 2, name: 'Spring 2026', courses: [{ name: 'CSE220 - Data Structures', credits: 3, grade: 'A', gradePoint: 4 }] },
          { id: 3, name: 'Summer 2026', running: true, courses: [{ name: 'CSE221 - Algorithms', credits: 3, grade: '' }] },
        ],
        startSeason: 'Spring',
        startYear: '2024',
        currentDept: 'CSE',
        planCourses: [],
      }),
    );
  });
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('transcript-sems')).toBeVisible();
  const blocking = await scanPage(page);
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
