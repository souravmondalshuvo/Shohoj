import { expect, test } from '@playwright/test';

// Guard for the class of bug that shipped #478 broken (#535).
//
// build3.py flattens an explicit list of modules into one scope per page. A
// module imported by an entry point but missing from that list simply does not
// exist at runtime — its functions throw ReferenceError on first call. Every
// other suite loads js/ un-bundled through the import map, where the import
// resolves normally, so the bundle is the one artifact nothing exercised. The
// unlock map sat dead in production for weeks with all gates green.
//
// These tests load the BUILT pages and fail on any uncaught page error. They
// deliberately assert nothing about content: the point is that whatever the
// entry point wires up actually runs, so a future module added to an entry
// without a build3.py entry fails here rather than in production.
//
// The built pages are committed build artifacts at the repo root, so CI must
// run build3.py before this suite (it already does).

const BUILT_PAGES = [
  { path: '/shohoj.html', name: 'main app' },
  { path: '/profile.html', name: 'profile' },
  { path: '/admin.html', name: 'admin' },
];

for (const page_ of BUILT_PAGES) {
  test(`the built ${page_.name} bundle runs without a ReferenceError`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // Signed in, with a transcript and routine picks stored, so the entry point
    // takes its real paths — the zones that call into other modules only render
    // for a signed-in student who has data.
    await page.addInitScript(() => {
      try { localStorage.clear(); } catch { /* storage unavailable */ }
      window._shohoj_userProfile = () => ({
        signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd',
        displayName: 'Test Student', photoURL: null,
      });
      window._shohoj_isAuthReady = () => true;
      window._shohoj_isAdmin = () => true;
      localStorage.setItem('shohoj_connect_profile_v1', JSON.stringify({
        sid: '20301234', name: 'Test Student', program: 'B.Sc. in CSE',
        cgpa: 3.25, earnedCredits: 12,
        semesters: [{ name: 'Fall 2023', courses: [{ name: 'CSE110', credits: 3, grade: 'B' }] }],
        savedAt: Date.now(),
      }));
      localStorage.setItem('shohoj_routine_v1', JSON.stringify({ picks: { CSE110: 1 } }));
    });
    await page.route('https://**/*', (route) => route.abort());

    await page.goto(page_.path, { waitUntil: 'domcontentloaded' });
    // Let the entry point's deferred work (feed-backed zones) reach its modules.
    await page.waitForTimeout(1500);

    expect(errors, `uncaught errors in the built ${page_.name} bundle`).toEqual([]);
  });
}

test('the built profile page renders the Next registration zone', async ({ page }) => {
  // The regression itself: the zone's host stayed empty because renderUnlockMap
  // was not in the bundle. Without a transcript it invites the import, which is
  // still the zone rendering — what must never happen again is nothing at all.
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch { /* storage unavailable */ }
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd',
      displayName: 'Test Student', photoURL: null,
    });
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.goto('/profile.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#pfUnlockHost')).not.toBeEmpty();
});

// The bundled review seed is an import of BRACU reviews (data/input_reviews.jsonl),
// and it only exists in the BUILT page — build3.py injects it — so this is the
// one suite that can see it. It must follow the campus the page is showing
// (#823): merged into every list on BRACU, absent everywhere else.
for (const campus of [
  { email: 'student@g.bracu.ac.bd', name: 'a BRACU student', seeded: true },
  { email: 'student@northsouth.edu', name: 'an NSU student', seeded: false },
]) {
  test(`the bundled BRACU review seed ${campus.seeded ? 'shows for' : 'is hidden from'} ${campus.name}`, async ({ page }) => {
    await page.addInitScript((email) => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
      window._shohoj_isAuthReady = () => true;
      window._shohoj_currentUid = () => 'u1';
      window._shohoj_userProfile = () => ({
        signedIn: true, uid: 'u1', email, displayName: 'Test Student', photoURL: null,
      });
    }, campus.email);
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/shohoj.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
    await page.evaluate(() => window.switchCalcTab('reviews'));

    const reviews = page.locator('#tabReviews');
    await expect(reviews).toContainText(/faculty with reviews/i);
    const none = /(^|\D)0\s*faculty with reviews/i;
    if (campus.seeded) await expect(reviews).not.toContainText(none);
    else await expect(reviews).toContainText(none);
  });

  // The faculty directory beside it (data/faculty_profiles.jsonl) is BRACU's
  // too — names, university emails, the courses each lecturer takes — and the
  // search box is where it surfaces first. Shadmin Sultana is a seeded BRACU
  // lecturer; no NSU student should be offered her.
  test(`the bundled BRACU faculty directory ${campus.seeded ? 'is searchable by' : 'is hidden from'} ${campus.name}`, async ({ page }) => {
    await page.addInitScript((email) => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
      window._shohoj_isAuthReady = () => true;
      window._shohoj_currentUid = () => 'u1';
      window._shohoj_userProfile = () => ({
        signedIn: true, uid: 'u1', email, displayName: 'Test Student', photoURL: null,
      });
    }, campus.email);
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/shohoj.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
    await page.evaluate(() => window.switchCalcTab('reviews'));

    const suggestions = page.locator('#_rvt_suggestions');
    await page.locator('#_rvt_q').pressSequentially('Shadmin');
    if (campus.seeded) {
      await expect(suggestions).toContainText('Shadmin Sultana');
    } else {
      await expect(suggestions).toBeHidden();
      // And the box still answers for the student's own campus.
      await page.locator('#_rvt_q').fill('');
      await page.locator('#_rvt_q').pressSequentially('CSE115');
      await expect(suggestions).toContainText('CSE115');
      await expect(suggestions).not.toContainText('Faculty');
    }
  });
}

// A campus with no live feed gets its Routine from a section file this site
// serves (feeds/, js/core/activeFeed.js). Two things about that only exist in
// the BUILT page: the modules have to be in build3.py's list, and the shipped
// Content-Security-Policy has to allow a same-origin fetch — connect-src had no
// 'self' until this feature needed one. The un-bundled suites would pass with
// either missing.
test('the built page loads an NSU student’s sections from this site', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to connect/i.test(m.text())) blocked.push(m.text());
  });
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@northsouth.edu',
      displayName: 'Test Student', photoURL: null,
    });
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.goto('/shohoj.html#calculator/routine', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.routine-source-badge')).toHaveText(/As of \d+ \w+ \d{4}/);
  await expect(page.getByTestId('routine-snapshot-note')).toBeVisible();
  expect(blocked.filter((m) => m.includes('feeds/'))).toEqual([]);
});

// Free Rooms reads the same snapshot through one more module
// (js/core/snapshotRooms.js). Missing from build3.py's list it would be a
// ReferenceError here and nowhere else.
test('the built page works out an NSU student’s free rooms', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
    window._shohoj_isAuthReady = () => true;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@northsouth.edu',
      displayName: 'Test Student', photoURL: null,
    });
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.goto('/shohoj.html#calculator/freerooms', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#tabFreeRooms .routine-source-badge')).toHaveText(/As of \d+ \w+ \d{4}/);
  await expect(page.getByTestId('freerooms-snapshot-note')).toBeVisible();
  await expect(page.locator('.freerooms-summary')).toBeVisible();
  expect(errors).toEqual([]);
});
