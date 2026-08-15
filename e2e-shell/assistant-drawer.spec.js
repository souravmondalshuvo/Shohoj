// e2e-shell/assistant-drawer.spec.js
//
// #435: the Shohoj Assistant launcher + drawer against the built dist-shell/.
// The launcher is gated on BOTH a cloud-capable shell (papersWorkerUrl) and a
// signed-in user (via the __shohojAuthSource e2e seam) — the offline/anonymous
// cases render nothing. The chat turn is driven against a routed stand-in for
// the Worker endpoint, asserting the request carries the Firebase bearer token
// and only the client-shaped transcript (no uid — the Worker derives it).

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
  // The real Worker origin, not a placeholder: the built shell now ships a CSP
  // whose connect-src only allows this host, and CSP is enforced before
  // page.route() can intercept — a made-up origin would be blocked outright and
  // the assistant round-trip could never run. The request is still fully stubbed.
  _shohoj_papers_worker_url: 'https://shohoj-papers.souravmondal033.workers.dev',
  _shohoj_recaptcha_v3_site_key: 'sitekey',
  _shohoj_google_client_id: 'client-id',
};

const signedIn = async (page) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
    const snapshot = {
      status: 'authenticated',
      uid: 'e2e-uid',
      email: 'student@g.bracu.ac.bd',
      displayName: 'E2E Student',
      isAdmin: false,
    };
    window.__shohojAuthSource = {
      get: () => snapshot,
      subscribe: () => () => {},
      getIdToken: async () => 'e2e-id-token',
    };
  }, VALID_GLOBALS);
};

// The launcher now also requires the Worker's readiness probe (GET /ready) to
// report the Assistant configured (#455). Stub it so the "configured" tests
// see the launcher; the routes below override it to exercise the hidden cases.
const readyReports = async (page, assistant) => {
  await page.route('**/ready', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', capabilities: { assistant } }),
    }),
  );
};

test('the offline shell renders no assistant launcher', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.locator('.assistant-fab')).toHaveCount(0);
});

anonymousTest('a signed-out cloud shell renders no assistant launcher', async ({ page }) => {
  await page.addInitScript((globals) => {
    Object.assign(window, globals);
  }, VALID_GLOBALS);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Auth settles anonymous (no persisted session) → still no launcher.
  await expect(page.locator('.shell-auth').getByRole('button', { name: 'Sign in' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.assistant-fab')).toHaveCount(0);
});

test('signed in but assistant unconfigured: no launcher (#455)', async ({ page }) => {
  await signedIn(page);
  await readyReports(page, false);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Wait for auth to settle (the account menu appears) so we know the launcher
  // had its chance to render, then assert it did not.
  await expect(page.locator('.shell-auth')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open Shohoj Assistant' })).toHaveCount(0);
});

test('signed in but readiness probe fails: no launcher (conservative)', async ({ page }) => {
  await signedIn(page);
  await page.route('**/ready', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.shell-auth')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open Shohoj Assistant' })).toHaveCount(0);
});

test('signed in: example prompt round-trips through the endpoint with the bearer token', async ({ page }) => {
  await signedIn(page);
  await readyReports(page, true);

  const requests = [];
  await page.route('**/api/assistant', async (route) => {
    const request = route.request();
    requests.push({
      auth: request.headers()['authorization'],
      body: request.postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'You need a 3.8 average on your next 12 credits.' }),
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const fab = page.getByRole('button', { name: 'Open Shohoj Assistant' });
  await expect(fab).toBeVisible({ timeout: 15_000 });
  await fab.click();

  const drawer = page.getByRole('dialog', { name: 'Shohoj Assistant' });
  await expect(drawer).toBeVisible();

  // Empty state offers tappable example prompts; tap the CGPA one.
  await drawer.getByRole('button', { name: 'What GPA do I need to reach a 3.5 CGPA?' }).click();
  await expect(drawer.locator('.assistant-bubble--user')).toHaveText(
    'What GPA do I need to reach a 3.5 CGPA?',
  );
  await expect(drawer.locator('.assistant-bubble--reply')).toHaveText(
    'You need a 3.8 average on your next 12 credits.',
  );

  expect(requests).toHaveLength(1);
  expect(requests[0].auth).toBe('Bearer e2e-id-token');
  expect(requests[0].body).toEqual({
    messages: [{ role: 'user', content: 'What GPA do I need to reach a 3.5 CGPA?' }],
  });

  // Closing resets the stateless transcript (documented v1 limitation).
  await drawer.getByRole('button', { name: 'Close assistant' }).click();
  await expect(drawer).toHaveCount(0);
  await fab.click();
  await expect(page.locator('.assistant-bubble')).toHaveCount(0);
});

test('signed in: a failing endpoint surfaces the unavailable error state', async ({ page }) => {
  await signedIn(page);
  await readyReports(page, true);
  await page.route('**/api/assistant', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"assistant_unavailable"}' }),
  );

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const fab = page.getByRole('button', { name: 'Open Shohoj Assistant' });
  await expect(fab).toBeVisible({ timeout: 15_000 });
  await fab.click();

  const drawer = page.getByRole('dialog', { name: 'Shohoj Assistant' });
  await drawer.getByRole('textbox', { name: 'Message the assistant' }).fill('Are seats open in MAT216?');
  await drawer.getByRole('button', { name: 'Send' }).click();

  await expect(drawer.getByRole('alert')).toHaveText(
    'The assistant is temporarily unavailable. Please try again in a bit.',
  );
});
