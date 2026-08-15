// e2e-shell/signin-portal.spec.js
//
// The campus gate. A student's university decides the grading scale, so until
// sign-in resolves who they are there is no correct app to render — the portal
// stands in for every route. These specs run signed OUT (anonymousTest); the
// rest of the shell suite runs signed in by default.

import { anonymousTest as test, expect, installAuth, NSU_STUDENT } from '../e2e-support/authFixture.js';

// The shell test build ships no Firebase config, so sign-in is genuinely
// unavailable there and the portal says so. Specs that need the button have to
// stand up a cloud-capable shell first, the same way cloud-sync.spec.js does.
const CLOUD_GLOBALS = {
    _shohoj_firebase_config: {
        apiKey: 'AIzaKey',
        authDomain: 'shohoj.firebaseapp.com',
        projectId: 'shohoj',
        storageBucket: 'shohoj.appspot.com',
        messagingSenderId: '123',
        appId: '1:123:web:abc',
        measurementId: 'G-XYZ',
    },
    _shohoj_papers_worker_url: 'https://papers.example.com',
    _shohoj_recaptcha_v3_site_key: 'sitekey',
    _shohoj_google_client_id: 'client-id',
};

const asCloudShell = (page) =>
    page.addInitScript((globals) => Object.assign(window, globals), CLOUD_GLOBALS);

test('the landing page stays public, with the portal above the hero', async ({ page }) => {
    // '/' is the pitch, not the product. A stranger should be able to read it
    // without handing over a university account first.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('signin-portal')).toBeVisible();
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('#features')).toBeVisible();
});

test('a cloud-capable shell offers the sign-in button', async ({ page }) => {
    await asCloudShell(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('signin-portal-button')).toBeVisible();
});

test('a shell with no Firebase config says so instead of dangling a dead button', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('signin-portal')).toContainText("isn\u2019t available on this build");
    await expect(page.getByTestId('signin-portal-button')).toHaveCount(0);
});

test('the portal stands in for a deep-linked route, not just the landing page', async ({ page }) => {
    // Deep links are the case that matters: a shared /calculator URL must not
    // render a calculator whose grading scale we cannot yet choose.
    for (const path of ['/calculator', '/planner', '/profile', '/reviews']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('signin-portal'), `${path} should be gated`).toBeVisible();
        // Unlike '/', these render no route content at all — a calculator whose
        // grading scale we cannot choose must not appear.
        await expect(page.locator('.hero'), `${path} should not fall back to the hero`).toHaveCount(0);
    }
});

test('the route tab bar is hidden while signed out', async ({ page }) => {
    // Nineteen tabs that all resolve to the same page would be worse than none.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('signin-portal')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Calculator', exact: true })).toHaveCount(0);
});

test('the skip link still points at a real main element', async ({ page }) => {
    // <main id="main-content"> stays mounted in every auth state — an anchor
    // pointing at nothing is an a11y bug that only shows up signed out.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toHaveCount(1);
});

test('the portal names every supported campus, from the registry', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const portal = page.getByTestId('signin-portal');
    await expect(portal).toContainText('BRACU');
    await expect(portal).toContainText('@g.bracu.ac.bd');
    await expect(portal).toContainText('NSU');
    await expect(portal).toContainText('@northsouth.edu');
});

test('signing in replaces the portal with the app', async ({ page }) => {
    await installAuth(page, NSU_STUDENT);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('signin-portal')).toHaveCount(0);
    await expect(page.locator('.hero')).toBeVisible();
});
