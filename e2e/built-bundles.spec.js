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
