// e2e-shell/semester-switcher.spec.js
//
// #633: the CONNECT feed keeps one semester and drops the rest, so the Worker
// archives them and /routine can read one back. This is the half a student
// actually sees — the switcher appears only when there is something to switch
// to, picking a semester loads it, and a hand-imported capture says so instead
// of passing for the live feed.

import { expect, test } from '../e2e-support/authFixture.js';

// The shell's CSP allowlists exactly one worker origin, so a made-up host is
// refused before any route handler sees it — which looks identical to "the
// archive is empty". Use the real origin; only the responses are fictional.
const WORKER = 'https://shohoj-papers.souravmondal033.workers.dev';

// The whole config, not just the worker URL: an incomplete one fails validation
// and useRuntimeConfig() hands back null, which reads as "offline shell".
const GLOBALS = {
  _shohoj_firebase_config: {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
    measurementId: 'G-XYZ',
  },
  _shohoj_papers_worker_url: WORKER,
  _shohoj_recaptcha_v3_site_key: 'sitekey',
  _shohoj_google_client_id: 'client-id',
};

// Summer 2026 as the backfill produces it: a capture, with the gaps recorded.
const LISTING = {
  semesters: [
    {
      sessionId: 20263,
      classStartDate: '2026-10-03',
      classEndDate: '2027-01-04',
      sections: 2086,
      archivedAt: 9,
    },
    {
      sessionId: 20262,
      classStartDate: '2026-06-09',
      classEndDate: '2026-09-08',
      sections: 2010,
      archivedAt: 5,
      provenance: {
        source: 'snapshot',
        sections: 2010,
        tbaFaculty: 1184,
        noSchedule: 27,
        unnamed: 0,
        seatsFrozen: true,
      },
    },
  ],
};

function section(sectionId, courseCode, courseName, sessionId, start, end) {
  return {
    sectionId,
    courseCode,
    courseName,
    sectionName: '01',
    capacity: 40,
    consumedSeat: 10,
    roomName: '07A-01C',
    semesterSessionId: sessionId,
    sectionSchedule: {
      classSchedules: [{ day: 'SUNDAY', startTime: '8:00', endTime: '9:20' }],
      classStartDate: start,
      classEndDate: end,
    },
  };
}

// Distinct course codes per semester, so which one is on screen is unambiguous.
const LIVE = [section(1, 'CSE110', 'Programming Language I', 20263, '2026-10-03', '2027-01-04')];
const SUMMER = [section(2, 'MAT110', 'Differential Calculus', 20262, '2026-06-09', '2026-09-08')];

/** Serve the CDN and the Worker archive; abort anything else. */
async function boot(page, { listing = LISTING } = {}) {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, GLOBALS);
  await page.route('https://usis-cdn.eniamza.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) }),
  );
  await page.route(`${WORKER}/api/semesters`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listing) }),
  );
  await page.route(`${WORKER}/api/semesters/20262`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMER) }),
  );
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
}

test('the live feed is what loads by default', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');
  // Nothing about a capture, because we are not looking at one.
  await expect(page.getByTestId('routine-archive-note')).toHaveCount(0);
});

test('choosing an archived semester loads that semester', async ({ page }) => {
  await boot(page);
  const picker = page.getByTestId('routine-semester-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveText(['Live feed', 'Fall 2026', 'Summer 2026']);

  await picker.selectOption('20262');

  // The badge is the proof the data actually changed source: Summer 2026 is
  // running today, which is the whole complaint that started this.
  await expect(page.getByTestId('routine-semester')).toContainText('Summer 2026');
  await expect(page.getByTestId('routine-semester')).toHaveClass(/routine-semester--running/);
});

test('the freshness badge stops claiming an archived semester is live', async ({ page }) => {
  await boot(page);
  const source = page.getByTestId('routine-feed-source');
  await expect(source).toContainText('Live');

  await page.getByTestId('routine-semester-picker').selectOption('20262');
  // The archive fetch is a live network hit, which is how this badge came to
  // sit beside "the semester in progress" saying "Live · just now".
  await expect(source).toHaveText('Archived');
  await expect(source).not.toContainText('ago');
  await expect(source).not.toContainText('just now');
});

test('an imported capture says it is one, and what it is missing', async ({ page }) => {
  await boot(page);
  await page.getByTestId('routine-semester-picker').selectOption('20262');

  const note = page.getByTestId('routine-archive-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('saved capture');
  // Frozen seats lead: a stale count reads exactly like a live one, which is
  // the failure a student cannot spot for themselves.
  await expect(note).toContainText('frozen');
  await expect(note).toContainText('1184 of 2010');
});

test('the choice survives a reload', async ({ page }) => {
  await boot(page);
  await page.getByTestId('routine-semester-picker').selectOption('20262');
  await expect(page.getByTestId('routine-semester')).toContainText('Summer 2026');

  await page.reload({ waitUntil: 'domcontentloaded' });
  // A student living in the current semester should not be put back on next
  // semester's timetable every time they open the tab.
  await expect(page.getByTestId('routine-semester-picker')).toHaveValue('20262');
  await expect(page.getByTestId('routine-semester')).toContainText('Summer 2026');
});

test('switching back returns to the live feed', async ({ page }) => {
  await boot(page);
  await page.getByTestId('routine-semester-picker').selectOption('20262');
  await expect(page.getByTestId('routine-semester')).toContainText('Summer 2026');

  await page.getByTestId('routine-semester-picker').selectOption('');
  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');
  await expect(page.getByTestId('routine-archive-note')).toHaveCount(0);
});

test('no switcher is offered when the archive holds nothing', async ({ page }) => {
  await boot(page, { listing: { semesters: [] } });
  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');
  // A control with nothing behind it is worse than no control.
  await expect(page.getByTestId('routine-semester-picker')).toHaveCount(0);
});

test('a failing archive listing leaves the route working on the live feed', async ({ page }) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, GLOBALS);
  await page.route('https://usis-cdn.eniamza.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) }),
  );
  await page.route(`${WORKER}/api/semesters`, (route) =>
    route.fulfill({ status: 500, body: 'boom' }),
  );
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('routine-semester')).toContainText('Fall 2026');
  await expect(page.getByTestId('routine-semester-picker')).toHaveCount(0);
  await expect(page.getByTestId('routine-page')).toBeVisible();
});
