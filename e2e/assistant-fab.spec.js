import { expect, test } from '@playwright/test';
import { selectCalcTab } from './helpers/tabs.js';

// Browser coverage for the Shohoj Assistant launcher on the legacy page (#533):
// the three-condition gate, one chat turn end to end, tab-aware starter
// prompts, and the transcript surviving a tab switch.
//
// All external requests are aborted except the stubbed Worker, so the real
// Firebase SDK (CDN imports) never boots and the _shohoj_* identity globals
// installed below stand — the same approach as the seats/profile specs.

// The real Worker origin, stubbed by page.route below. It has to be this exact
// host: the page's CSP connect-src allow-lists it, and a made-up test origin is
// blocked before the request leaves the page — so using one would test nothing
// but the CSP. Pinning it here also proves the endpoint stays reachable under
// the shipped policy.
const WORKER = 'https://shohoj-papers.souravmondal033.workers.dev';

// Identity + config the launcher gates on. Installed before any page script so
// the first refreshLauncher() call already sees a signed-in student.
function signedInStub(worker) {
  window._shohoj_papers_worker_url = worker;
  window.__uid = 'u1';
  window._shohoj_currentUid = () => window.__uid;
  window._shohoj_isAuthReady = () => true;
  window._shohoj_idToken = async () => 'id-token';
  // Records that the drawer flushed local edits before its first turn.
  window.__flushes = 0;
  window._shohoj_flushCloudSave = async () => {
    window.__flushes += 1;
    return true;
  };
}

/**
 * Boot the app with a stubbed Worker.
 * @param {object} opts
 *  - assistant: what GET /ready reports for capabilities.assistant
 *  - reply: the string POST /api/assistant answers with
 *  - status: HTTP status for the chat turn (default 200)
 *  - stub: init script (omit for the signed-out case)
 */
async function boot(page, opts = {}) {
  const { assistant = true, reply = 'Your CGPA is 3.42.', status = 200, stub = signedInStub } = opts;
  const turns = [];
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  if (stub) await page.addInitScript(stub, WORKER);

  await page.route('https://**/*', route => {
    const url = route.request().url();
    const cors = { 'access-control-allow-origin': '*' };
    if (url === `${WORKER}/ready`) {
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ capabilities: { assistant } }),
      });
    }
    if (url === `${WORKER}/api/assistant`) {
      turns.push({
        auth: route.request().headers().authorization,
        body: JSON.parse(route.request().postData() || '{}'),
      });
      return route.fulfill({
        status, contentType: 'application/json', headers: cors,
        body: JSON.stringify(status === 200 ? { reply } : { error: 'nope' }),
      });
    }
    return route.abort();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  return { turns };
}

const fab = page => page.locator('#assistantFab');
const drawer = page => page.locator('#assistantDrawer');

test('a signed-in student gets the launcher; opening it shows the chat drawer', async ({ page }) => {
  await boot(page);
  await expect(fab(page)).toBeVisible();

  await fab(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText('Shohoj Assistant');
  // The v1 limitation is stated in the panel, not just in the code.
  await expect(drawer(page)).toContainText("Chats aren’t saved");
  // The launcher steps aside while the drawer is open.
  await expect(fab(page)).toBeHidden();
});

test('signed-out visitors get no launcher at all', async ({ page }) => {
  // No identity stub: the page boots with Firebase blocked, so nobody is signed in.
  await boot(page, { stub: null });
  await expect(fab(page)).toHaveCount(0);
});

test('the launcher stays hidden when the Worker reports the assistant unconfigured', async ({ page }) => {
  // #455: a launcher we cannot stand behind is worse than no launcher.
  await boot(page, { assistant: false });
  await expect(page.locator('.assistant-fab')).toHaveCount(0);
  // Give the probe room to land before trusting the absence.
  await page.waitForTimeout(300);
  await expect(page.locator('.assistant-fab')).toHaveCount(0);
});

test('the launcher follows the auth state without a reload', async ({ page }) => {
  await boot(page, { stub: null });
  await expect(fab(page)).toHaveCount(0);

  await page.evaluate(worker => {
    window._shohoj_papers_worker_url = worker;
    window._shohoj_currentUid = () => 'u1';
    window._shohoj_isAuthReady = () => true;
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: true } }));
  }, WORKER);
  await expect(fab(page)).toBeVisible();

  await page.evaluate(() => {
    window._shohoj_currentUid = () => null;
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: false } }));
  });
  await expect(fab(page)).toHaveCount(0);
});

test('asking a question posts the transcript and renders the reply', async ({ page }) => {
  const { turns } = await boot(page);
  await fab(page).click();

  await page.locator('.assistant-input').fill('what is my cgpa?');
  await page.locator('.assistant-send').click();

  await expect(page.locator('.assistant-bubble--reply')).toHaveText('Your CGPA is 3.42.');
  await expect(page.locator('.assistant-bubble--user')).toHaveText('what is my cgpa?');
  expect(turns).toHaveLength(1);
  expect(turns[0].auth).toBe('Bearer id-token');
  expect(turns[0].body).toEqual({ messages: [{ role: 'user', content: 'what is my cgpa?' }] });
  // Pending local edits are pushed first, or the Worker reads stale Firestore data.
  expect(await page.evaluate(() => window.__flushes)).toBe(1);

  // Every turn flushes, not just the first: an edit made between questions sits
  // in the same debounce window, and a stale answer later is just as wrong.
  await page.locator('.assistant-input').fill('and next semester?');
  await page.locator('.assistant-send').click();
  await expect(page.locator('.assistant-bubble--user')).toHaveCount(2);
  expect(await page.evaluate(() => window.__flushes)).toBe(2);
});

// Campus machines are shared. One student's questions — and the model's answers
// about their grades — must not survive into the next student's session, on
// screen or in the payload.
test('a chat does not survive a sign-out into the next student session', async ({ page }) => {
  const { turns } = await boot(page);
  await fab(page).click();
  await page.locator('.assistant-input').fill('what is my cgpa?');
  await page.locator('.assistant-send').click();
  await expect(page.locator('.assistant-bubble--reply')).toHaveText('Your CGPA is 3.42.');
  await page.keyboard.press('Escape');

  // Student A signs out, student B signs in on the same tab.
  await page.evaluate(() => {
    window.__uid = null;
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: false } }));
    window.__uid = 'u2';
    window.dispatchEvent(new CustomEvent('shohoj:auth-changed', { detail: { signedIn: true } }));
  });

  await fab(page).click();
  await expect(page.locator('.assistant-bubble')).toHaveCount(0);
  await expect(drawer(page)).toContainText('Try one:');

  // …and nothing of A's is replayed as B's context.
  await page.locator('.assistant-input').fill('what about me?');
  await page.locator('.assistant-send').click();
  await expect(page.locator('.assistant-bubble--reply')).toHaveCount(1);
  expect(turns[turns.length - 1].body).toEqual({
    messages: [{ role: 'user', content: 'what about me?' }],
  });
});

test('a model reply is rendered as text, never as markup', async ({ page }) => {
  await boot(page, { reply: '<img src=x onerror="window.__xss=1">' });
  await fab(page).click();
  await page.locator('.assistant-input').fill('hi');
  await page.locator('.assistant-send').click();

  const bubble = page.locator('.assistant-bubble--reply');
  await expect(bubble).toHaveText('<img src=x onerror="window.__xss=1">');
  await expect(bubble.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('a failed turn shows an error and keeps the question in the log', async ({ page }) => {
  await boot(page, { status: 429 });
  await fab(page).click();
  await page.locator('.assistant-input').fill('seats in MAT216?');
  await page.locator('.assistant-send').click();

  await expect(page.locator('.assistant-error')).toContainText('Slow down');
  await expect(page.locator('.assistant-bubble--user')).toHaveText('seats in MAT216?');
});

test('starter prompts follow the tab the student is on', async ({ page }) => {
  await boot(page);
  await fab(page).click();
  const examples = page.locator('.assistant-example');
  await expect(examples).toHaveCount(3);
  await expect(examples.first()).toContainText('GPA');

  // Close, move to Seat Status, reopen: the seat question leads instead.
  await page.locator('.assistant-drawer-close').click();
  await selectCalcTab(page, 'seats');
  await fab(page).click();
  await expect(page.locator('.assistant-example').first()).toContainText(/seats/i);
});

test('the transcript survives closing the drawer and switching tabs', async ({ page }) => {
  await boot(page);
  await fab(page).click();
  await page.locator('.assistant-input').fill('what is my cgpa?');
  await page.locator('.assistant-send').click();
  await expect(page.locator('.assistant-bubble--reply')).toHaveText('Your CGPA is 3.42.');

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await selectCalcTab(page, 'seats');

  await fab(page).click();
  await expect(page.locator('.assistant-bubble--user')).toHaveText('what is my cgpa?');
  await expect(page.locator('.assistant-bubble--reply')).toHaveText('Your CGPA is 3.42.');
});
