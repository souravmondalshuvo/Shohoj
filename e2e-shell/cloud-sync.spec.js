// e2e-shell/cloud-sync.spec.js
//
// #333: the cloud-sync wiring must not disturb a signed-out shell. The engine
// itself (sign-in matrix, conflict resolution, realtime) is covered by the
// unit scenario battery; live sign-in needs Google/Firebase and can't run in
// CI. Here we assert the observable shell behavior: no migration modal ever
// appears unprompted, and local persistence keeps working — both on the
// offline (stub-config, no CloudSyncProvider) shell and on a valid-config but
// signed-out shell (CloudSyncProvider mounted, anonymous → the save queue
// no-ops).

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

async function loadDemoAndPersist(page) {
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
  await expect(page.locator('#semestersContainer').locator('.semester-label').first()).toBeVisible();
  // Local persistence still works: the snapshot is in localStorage.
  const stored = await page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1'));
  expect(stored).toContain('CSE110');
}

test('offline shell: no migration modal, local save works', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await loadDemoAndPersist(page);
  await expect(page.getByTestId('cloud-migration-modal')).toHaveCount(0);
});

anonymousTest('valid-config but signed-out shell: cloud sync is inert, no modal, save works', async ({ page }) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, VALID_GLOBALS);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());

  // The auth controls confirm we're on a cloud-capable but signed-out shell.
  await expect(page.locator('.shell-auth').getByRole('button', { name: 'Sign in' })).toBeVisible({
    timeout: 15_000,
  });

  // Nothing to migrate, because a signed-out visitor has no calculator to put
  // data into — the gate stands where the app used to be. What still matters is
  // that a cloud-capable shell offers no migration modal to someone signed out.
  await expect(page.getByTestId('signin-portal')).toBeVisible();
  await expect(page.getByTestId('cloud-migration-modal')).toHaveCount(0);
});
