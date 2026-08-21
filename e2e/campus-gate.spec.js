// The campus gate on the build people actually land on.
//
// Every other spec in this suite unlocks the gate up front (helpers/gate.js)
// because it is testing the calculator. This one is the opposite: it boots
// genuinely signed out and asserts the gate holds — the portal stands in for
// the tool, the pitch above it stays public, and the two ways through it work.
//
// Firebase is unreachable here (https is aborted, as in every legacy spec), so
// this also covers the build-without-config case: the portal has to say so
// rather than dangle a Continue-with-Google button that can never resolve.

import { expect, test } from '@playwright/test';

async function bootSignedOut(page, { search = '' } = {}) {
  await page.route('https://**/*', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    // Guarded: addInitScript re-runs on every navigation, so an unguarded
    // clear() would wipe the unlock flag the reload test is asserting on.
    if (!sessionStorage.getItem('__shohoj_gate_spec')) {
      localStorage.removeItem('shohoj_cgpa_v1');
      sessionStorage.clear();
      sessionStorage.setItem('__shohoj_gate_spec', '1');
    }
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.goto(`/${search}`, { waitUntil: 'domcontentloaded' });
}

const portal = page => page.getByTestId('signin-portal');
const tool   = page => page.locator('#calculator .calc-wrapper');

test('signed out, the portal stands in for the calculator', async ({ page }) => {
  await bootSignedOut(page);
  await expect(portal(page)).toBeVisible();
  await expect(tool(page)).toBeHidden();
});

test('the pitch above the gate stays public', async ({ page }) => {
  // '/' is the page people share and search engines read. Meeting a stranger
  // with a demand for their university account reads like a phishing page, so
  // the hero and the feature grid are deliberately outside the gate.
  await bootSignedOut(page);
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('#features')).toBeVisible();
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
});

test('a build with no Firebase config says so instead of dangling a dead button', async ({ page }) => {
  await bootSignedOut(page);
  await expect(portal(page)).toContainText(/Sign-in isn.t available on this build/);
  await expect(page.getByTestId('signin-portal-button')).toHaveCount(0);
});

// A deploy-built page has real Firebase values inlined by build3.py; the raw
// dev tree does not, which is why the specs above see the unavailable state.
// Standing the config up by hand is the only way to cover the path a real
// visitor takes. Mirrors asCloudShell in e2e-shell/signin-portal.spec.js.
const asCloudBuild = page => page.addInitScript(() => {
  window._shohoj_firebase_config = {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
  };
});

test('a build with Firebase configured offers the sign-in button', async ({ page }) => {
  await asCloudBuild(page);
  await bootSignedOut(page);
  const button = page.getByTestId('signin-portal-button');
  await expect(button).toBeVisible();
  // Wired through the action dispatcher, not an inline handler: the bundle's
  // CSP drops unsafe-inline, so an inline onclick would be dead in production.
  await expect(button).toHaveAttribute('data-action', 'auth:signin');
});

test('the portal names every campus and hands the others to the shell', async ({ page }) => {
  await bootSignedOut(page);
  // BRACU is what this bundle is built for; NSU is real but lives in /app/,
  // and saying so beats letting the domain check bounce them after the popup.
  const bracu = page.locator('.signin-portal-campus', { hasText: 'BRACU' });
  const nsu   = page.locator('.signin-portal-campus', { hasText: 'NSU' });
  await expect(bracu).toContainText('@g.bracu.ac.bd');
  await expect(bracu).toContainText('Sign in here');
  await expect(nsu).toContainText('@northsouth.edu');
  await expect(nsu.locator('a')).toHaveAttribute('href', 'app/');
});

test('the hero demo button opens the calculator without an account', async ({ page }) => {
  // Demo data is synthetic — there is no real transcript to score on the wrong
  // campus's scale — so the gate does not apply to it. This is also the path
  // the portfolio site's live-preview iframe depends on.
  await bootSignedOut(page);
  await page.locator('#heroDemoBtn').click();
  await expect(tool(page)).toBeVisible();
  await expect(portal(page)).toBeHidden();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');
});

test('?demo=1 auto-opens the calculator for the portfolio embed', async ({ page }) => {
  await bootSignedOut(page, { search: '?demo=1' });
  await expect(tool(page)).toBeVisible();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');
});

test('the demo unlock survives a reload within the session', async ({ page }) => {
  await bootSignedOut(page);
  await page.locator('#heroDemoBtn').click();
  await expect(tool(page)).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Not a persisted opt-out: sessionStorage, so a new tab meets the gate again.
  await expect(tool(page)).toBeVisible();
});

test('a returning student with saved semesters is offered their data, not locked out', async ({ page }) => {
  // Signed-out use is how Shohoj has always worked and the privacy copy
  // promises it. The gate must not make good on that promise by hiding a
  // student's own grades from them — but they still land on the portal first.
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify({
      currentDept: 'CSE',
      semesterCounter: 1,
      startSeason: 'Spring',
      startYear: '2024',
      planCourses: [],
      semesters: [{
        id: 0,
        name: 'Spring 2024',
        running: false,
        courses: [{ code: 'CSE110', name: 'Programming Language I', credits: 3, grade: 'A', retake: false }],
      }],
    }));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(portal(page)).toBeVisible();
  const resume = page.getByTestId('signin-portal-resume');
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(tool(page)).toBeVisible();
  await expect(portal(page)).toBeHidden();
});

test('a first-time visitor gets no such door', async ({ page }) => {
  await bootSignedOut(page);
  await expect(portal(page)).toBeVisible();
  await expect(page.getByTestId('signin-portal-resume')).toHaveCount(0);
});
