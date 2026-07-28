import { expect, test } from '@playwright/test';

// Browser coverage for the dedicated /profile/ page (#256). The account pill
// opens this page; the in-app Profile tab was retired. External requests
// (Firebase SDK on gstatic, the CONNECT feed) are aborted for determinism — the
// page depends on neither. With Firebase blocked the identity globals are
// absent, so the page falls back to its signed-out gate; the signed-in case
// stubs window._shohoj_userProfile via an init script.
//
// The page renders into #profilePageContent (inside a shell with a back link).
// The seat-alerts card is intentionally NOT on this page — it needs the Seats
// tab's live runtime, which the standalone page doesn't load.

const HOST = '#profilePageContent';

async function boot(page, initScript, initArg) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  });
  if (initScript) await page.addInitScript(initScript, initArg);
  await page.route('https://**/*', route => route.abort());
  await page.goto('/profile/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(HOST)).toBeVisible();
}

test('signed-out users see a sign-in prompt instead of the profile', async ({ page }) => {
  await boot(page);
  const content = page.locator(HOST);
  await expect(content).toContainText('Sign in to view your profile');
  await expect(content.locator('[data-action="auth:signin"]')).toBeVisible();
  // No CONNECT credential field anywhere.
  await expect(content.locator('input')).toHaveCount(0);
  await expect(content).not.toContainText(/connect/i);
});

test('the page offers a way back to the main site', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.pf-back')).toHaveAttribute('href', '../');
});

// A signed-in identity stub reused across the cases below.
function signedInStub() {
  window._shohoj_userProfile = () => ({
    signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
  });
}

test('signed-in users see their account header with a sign-out control', async ({ page }) => {
  await boot(page, signedInStub);
  const content = page.locator(HOST);
  await expect(content).toContainText('Test Student');
  await expect(content).toContainText('student@g.bracu.ac.bd');
  await expect(content.locator('[data-action="profile:signout"]')).toBeVisible();
  await expect(content.locator('input')).toHaveCount(0);
});

test('the seat-alerts card is not shown on the dedicated page', async ({ page }) => {
  await boot(page, signedInStub);
  await expect(page.locator(HOST)).not.toContainText('Seat alerts');
});

test('the academic-profile card shows an import CTA when no transcript is stored', async ({ page }) => {
  await boot(page, signedInStub);
  const content = page.locator(HOST);
  await expect(content).toContainText('🎓 Academic profile');
  await expect(content).toContainText('Import your transcript');
});

test('the academic-profile card renders the stored transcript snapshot', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
    });
    localStorage.setItem('shohoj_connect_profile_v1', JSON.stringify({
      sid: '20301234', name: 'Test Student',
      program: 'B.Sc. in Computer Science and Engineering (CSE)',
      cgpa: 3.74, earnedCredits: 96,
      semesters: [{ name: 'Fall 2023', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] }],
      savedAt: Date.now(),
    }));
  });
  const content = page.locator(HOST);
  await expect(content).toContainText('20301234');
  await expect(content).toContainText('3.74');
  await expect(content).toContainText('96');
  await expect(content).toContainText('Computer Science and Engineering');
  await expect(content).toContainText('Fall 2023');
});

test('the routine and reviews cards render the student\'s saved data', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
    });
    // Firebase is blocked, so the identity global is otherwise absent — stub the
    // uid the reviews receipt is keyed on, and preseed the local data sources.
    window._shohoj_currentUid = () => 'u1';
    localStorage.setItem('shohoj_routine_v1', JSON.stringify({ picks: { CSE220: 12345, MAT110: 678 } }));
    localStorage.setItem('shohoj_my_reviews_v1', JSON.stringify({
      u1: [{ facultyInitials: 'ABC', courseCode: 'CSE220', semester: 'Spring 2026' }],
    }));
  });
  const content = page.locator(HOST);
  await expect(content).toContainText('🗓️ Routine');
  await expect(content.locator('.pf-chip', { hasText: 'CSE220' })).toBeVisible();
  await expect(content.locator('.pf-chip', { hasText: 'MAT110' })).toBeVisible();
  await expect(content).toContainText('✍️ Your reviews');
  await expect(content).toContainText('ABC');
  await expect(content).toContainText('Spring 2026');
  await expect(content.locator('input')).toHaveCount(0);
});

// ── Danger zone ───────────────────────────────────────────────────────────────
// Stub the globals the delete handler reaches for: a confirm modal whose verdict
// we control, a delete that records it was called, and a toast we can read. The
// handler must only call delete when the confirm resolves truthy. The verdict +
// delete result are passed as a serializable arg (closures don't cross initScript).
function dangerStub(arg) {
  window._shohoj_userProfile = () => ({
    signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
  });
  window.__deleteCalls = 0;
  window.__lastToast = null;
  window._shohoj_confirmModal = () => Promise.resolve(arg.confirmVerdict);
  window._shohoj_deleteCloudData = () => { window.__deleteCalls++; return Promise.resolve(arg.deleteResult); };
  window._shohoj_showToast = (msg, isErr) => { window.__lastToast = { msg, isErr: !!isErr }; };
}

test('the signed-in view shows a Danger zone with a delete-cloud control', async ({ page }) => {
  await boot(page, signedInStub);
  const content = page.locator(HOST);
  await expect(content).toContainText('Danger zone');
  await expect(content.locator('[data-action="profile:deleteCloud"]')).toBeVisible();
  await expect(content.locator('input')).toHaveCount(0);
});

test('confirming the delete calls _shohoj_deleteCloudData exactly once and toasts success', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: true, deleteResult: true });
  await page.locator(`${HOST} [data-action="profile:deleteCloud"]`).click();
  await expect.poll(() => page.evaluate(() => window.__deleteCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__lastToast && window.__lastToast.isErr)).toBe(false);
});

test('dismissing the confirm fires nothing — no delete, no toast', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: false, deleteResult: true });
  await page.locator(`${HOST} [data-action="profile:deleteCloud"]`).click();
  // Give the async handler a tick; it must short-circuit before the delete call.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__deleteCalls)).toBe(0);
  expect(await page.evaluate(() => window.__lastToast)).toBeNull();
});

test('a failed delete surfaces a generic error toast with no backend detail', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: true, deleteResult: false });
  await page.locator(`${HOST} [data-action="profile:deleteCloud"]`).click();
  await expect.poll(() => page.evaluate(() => window.__lastToast && window.__lastToast.isErr)).toBe(true);
  const msg = await page.evaluate(() => window.__lastToast.msg);
  expect(msg).not.toMatch(/firestore|firebase|permission|network|undefined|null/i);
});

test('the avatar falls back to the name initial when there is no photo', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'ka@g.bracu.ac.bd', displayName: 'Kazi Anik', photoURL: null,
    });
  });
  const fallback = page.locator(`${HOST} .pf-avatar-fallback`);
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText('K');
});

// ── "This semester" briefing (#476) ──────────────────────────────────────────
// The briefing joins the student's saved routine picks against the live section
// feed. Network stays blocked, so the feed is seeded into the client's cache
// (fresh timestamp → no request). Fixture mirrors the real shape it was built
// against: a Saturday gap, a Sunday floor hop, and two exams on one day.

function briefingStub() {
  window._shohoj_userProfile = () => ({
    signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
  });

  const section = (id, code, room, days, exam) => ({
    sectionId: id, courseCode: code, courseName: code, sectionName: '01',
    courseCredit: 3, capacity: 30, consumedSeat: 1, faculties: 'ABC',
    roomName: room, semesterSessionId: 20262,
    sectionSchedule: {
      classSchedules: days.map(([day, startTime, endTime]) => ({ day, startTime, endTime })),
      midExamDate: exam[0], midExamStartTime: exam[1], midExamEndTime: exam[2],
      finalExamDate: '2026-09-14', finalExamStartTime: '08:30', finalExamEndTime: '10:30',
    },
  });

  const payload = [
    // Sat 08:00-09:20 … 4h40m gap … Sat 14:00-15:20 (different floor)
    section(1, 'MAT215', '12A-08C', [['SATURDAY', '08:00', '09:20']], ['2026-07-27', '08:30', '10:30']),
    section(2, 'CSE251', '07H-27C', [['SATURDAY', '14:00', '15:20']], ['2026-07-25', '16:30', '18:30']),
    // Sun 14:00-15:20 → 10 min → 15:30-16:50, floor 12 → floor 09
    section(3, 'MAT111', '12A-09C', [['SUNDAY', '14:00', '15:20']], ['2026-07-27', '14:00', '16:00']),
    section(4, 'CSE220', '09A-01C', [['SUNDAY', '15:30', '16:50']], ['2026-07-26', '14:00', '16:00']),
    // Unpicked sections — they supply the campus-wide room availability.
    section(9, 'ECO101', '07B-12C', [['SUNDAY', '08:00', '09:20']], ['2026-07-28', '08:30', '10:30']),
    section(10, 'ECO102', '07B-14C', [['SATURDAY', '16:00', '17:20']], ['2026-07-28', '11:00', '13:00']),
  ];

  localStorage.setItem('shohoj_connect_feed_v1', JSON.stringify({
    fetchedAt: Date.now(), etag: null, payload,
  }));
  localStorage.setItem('shohoj_routine_v1', JSON.stringify({
    picks: { MAT215: 1, CSE251: 2, MAT111: 3, CSE220: 4 },
  }));
}

const BRIEF = '#pfBriefingHost';

test('the briefing orders exams and flags the two that share a day', async ({ page }) => {
  await boot(page, briefingStub);
  const rows = page.locator(`${BRIEF} .pfb-row-code`);
  await expect(rows).toHaveText(['CSE251', 'CSE220', 'MAT215', 'MAT111']);
  await expect(page.locator(`${BRIEF} .pfb-chip.hot`)).toContainText('same day');
});

test('the exam switch flips to finals without refetching', async ({ page }) => {
  await boot(page, briefingStub);
  await expect(page.locator(`${BRIEF} .pfb-rows`)).toContainText('Sat 25 Jul');
  await page.locator(`${BRIEF} [data-action="briefing:examKind"][data-kind="final"]`).click();
  await expect(page.locator(`${BRIEF} .pfb-rows`)).toContainText('Mon 14 Sep');
  await expect(page.locator(`${BRIEF} .pfb-seg[data-kind="final"]`)).toHaveAttribute('aria-pressed', 'true');
});

test('the week card measures contact time, dead time and campus days', async ({ page }) => {
  await boot(page, briefingStub);
  const stats = page.locator(`${BRIEF} .pfb-stats`);
  await expect(stats).toContainText('5h 20m');  // 4 × 80-minute classes
  await expect(stats).toContainText('4h 40m');  // the Saturday gap
  await expect(stats).toContainText('2 / 6');   // campus days
  await expect(stats).toContainText('08:00');   // earliest start
});

test('a tight transition across floors is called out', async ({ page }) => {
  await boot(page, briefingStub);
  const hop = page.locator(`${BRIEF} .pfb-hop`);
  await expect(hop).toHaveCount(1);
  await expect(hop).toContainText('12A-09C → 09A-01C');
  await expect(hop).toContainText('3 floors down');
  await expect(hop).toContainText('10m');
});

test('gap rooms prefer the floor of the next class', async ({ page }) => {
  await boot(page, briefingStub);
  const best = page.locator(`${BRIEF} .pfb-room.is-best`).first();
  await expect(best).toContainText('07B-12C');   // floor 07, where CSE251 meets
  await expect(best).toContainText('same floor');
});

test('the briefing invites a routine when none is saved', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
    });
  });
  await expect(page.locator(BRIEF)).toContainText('Pick your sections');
  await expect(page.locator(`${BRIEF} .pfb-cta`)).toHaveAttribute('href', '../#routine');
});

test('signed-out users get no briefing at all', async ({ page }) => {
  await boot(page);
  await expect(page.locator(BRIEF)).toHaveCount(0);
});
