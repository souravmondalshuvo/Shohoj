// e2e-shell/runtime-config.spec.js
//
// #329: the shell loads /runtime-config.js and feeds the window._shohoj_*
// globals into the runtime-config boundary. The CI build ships the comment
// stub (js/config/runtime-config.js is gitignored and not generated here), so
// the default expectation is the offline capability set; the cloud case
// injects the globals via addInitScript — which runs before page scripts, and
// the stub never overwrites them.

import { expect, test } from '../e2e-support/authFixture.js';

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

test('the stub build defaults to the offline capability set', async ({ page }) => {
  const missing404 = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('runtime-config')) missing404.push(res.url());
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Cloud features: offline (local tools still work)')).toBeVisible();
  expect(missing404, '/runtime-config.js resolves (stub, no 404)').toEqual([]);
});

test('valid injected globals light up the cloud capability', async ({ page }) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, VALID_GLOBALS);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Cloud features: available')).toBeVisible();
});

test('unreplaced placeholder tokens stay offline (fork parity)', async ({ page }) => {
  await page.addInitScript(() => {
    window._shohoj_firebase_config = {
      apiKey: '__FIREBASE_API_KEY__',
      authDomain: '__FIREBASE_AUTH_DOMAIN__',
      projectId: '__FIREBASE_PROJECT_ID__',
      storageBucket: '__FIREBASE_STORAGE_BUCKET__',
      messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
      appId: '__FIREBASE_APP_ID__',
      measurementId: '__GA_MEASUREMENT_ID__',
    };
    window._shohoj_papers_worker_url = '__PAPERS_WORKER_URL__';
    window._shohoj_recaptcha_v3_site_key = '__RECAPTCHA_V3_SITE_KEY__';
    window._shohoj_google_client_id = '__GOOGLE_OAUTH_CLIENT_ID__';
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Cloud features: offline (local tools still work)')).toBeVisible();
});
