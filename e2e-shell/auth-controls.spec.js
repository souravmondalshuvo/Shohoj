// e2e-shell/auth-controls.spec.js
//
// #331: the shell header's auth controls, against the built dist-shell/. The
// CI build ships the runtime-config stub, so the default is the offline shell
// (no auth UI, and — isolation check — the lazy Firebase chunk is never
// requested). The cloud case injects valid-shaped globals: the SDK initialises
// locally, the auth listener settles anonymous (no persisted session), and the
// Sign in button renders. Real sign-in needs live Google/Firebase and stays
// covered by the unit-tested source + the legacy page.

import { expect, test, anonymousTest } from '../e2e-support/authFixture.js';

const VALID_GLOBALS = {
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

test('the offline shell renders no auth UI and never loads the Firebase chunk', async ({ page }) => {
  const firebaseRequests = [];
  page.on('request', (req) => {
    if (/firebase/i.test(req.url())) firebaseRequests.push(req.url());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await expect(page.locator('.shell-auth')).toHaveCount(0);
  expect(firebaseRequests, 'no Firebase SDK chunk on the offline shell').toEqual([]);
});

anonymousTest('a cloud-capable shell shows Sign in once the auth state settles', async ({ page }) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, VALID_GLOBALS);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // LOADING first (or already settled), then the anonymous state's button.
  await expect(page.locator('.shell-auth').getByRole('button', { name: 'Sign in' })).toBeVisible({
    timeout: 15_000,
  });
});
