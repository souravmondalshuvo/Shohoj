// e2e-shell/quest-sandbox.spec.js
//
// Where Shohoj Quest's Java engine runs (#981), on the production build under
// its real Content-Security-Policy.
//
// The engine is third-party code, so it must not run with the site's origin:
// it runs in a sandboxed frame served from another one (worker/questSandbox.js).
// These tests hold the game to that without downloading the engine. The
// sandbox's own files are the real ones, served from the Worker's code
// (e2e-support/questSandbox.js); only CheerpJ itself is replaced, by a few
// lines that answer javac's part.
//
// So what runs for real here is everything the isolation is made of: the frame
// and its sandbox attribute, the page's frame-src, the handshake that hands the
// game a port, the engine's worker and the policy it is served with. The real
// engine in the same place is `npm run test:e2e:quest-real`.

import { expect, test } from '../e2e-support/authFixture.js';
import { QUEST_SANDBOX_URL, serveQuestSandbox, useQuestSandbox } from '../e2e-support/questSandbox.js';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const ROPES = bridge.quests.find((quest) => quest.id === 'bridge-rope-counter');

/** Stands in for CheerpJ's loader: a javac that passes the warm-up and fails everything else. */
const FAKE_CHEERPJ = `
  self.cheerpjInit = async (options) => {
    if (options && options.preloadProgress) options.preloadProgress(1, 1);
  };
  self.cheerpOSAddStringFile = () => {};
  self.cjGetRuntimeResources = () => '{}';
  self.cheerpjRunMain = async (className, classPath, ...args) => {
    if (className !== 'com.sun.tools.javac.Main') return 0;
    if (args.some((arg) => arg.endsWith('QuestWarmUp.java'))) return 0;
    console.log("/str/Main.java:7: error: ';' expected");
    console.log('        int total = 0');
    console.log('                     ^');
    console.log('1 error');
    return 1;
  };
`;

async function begin(page) {
  await page.addInitScript(() => {
    // Init scripts run in every frame, the sandbox included. This is the
    // page's own storage, so it is written from the page only.
    if (window !== window.top) return;
    localStorage.setItem(
      'shohoj_quest_progress_v1',
      JSON.stringify({
        uid: 'u_me',
        progress: { v: 1, completed: { 'bridge-count-the-planks': 1 }, zone: 'bridge', at: null },
      }),
    );
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
}

async function openRopes(page) {
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${ROPES.title}` }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test('the engine runs in a sandboxed frame on another origin, never in a worker of the page', async ({
  page,
  baseURL,
}) => {
  const site = new URL(baseURL).origin;
  const loaderRequests = [];
  await page.route(/cjrtnc\.leaningtech\.com/, async (route) => {
    loaderRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_CHEERPJ });
  });
  await serveQuestSandbox(page, site);
  await useQuestSandbox(page);
  const workers = [];
  page.on('worker', (worker) => workers.push(worker.url()));

  await begin(page);
  // Walking the zone has started nothing.
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(0);

  await openRopes(page);
  const frame = page.locator('iframe[title="Java engine"]');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', QUEST_SANDBOX_URL);
  // Scripts, and its own origin, which is not this page's. No top navigation,
  // popups or forms: nothing inside can send the student anywhere.
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toBeHidden();

  // A run goes into the frame and its answer comes back out.
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Java found 1 problem');
  await expect(page.locator('.quest-verdict')).toContainText('Line 7');

  // The engine's worker belongs to the sandbox. The page started none.
  expect(workers.length).toBeGreaterThan(0);
  for (const url of workers) expect(url.startsWith(new URL(QUEST_SANDBOX_URL).origin)).toBe(true);
  expect(workers.filter((url) => url.startsWith(site))).toEqual([]);
  // The engine was loaded by that worker, from CheerpJ's CDN and nowhere else.
  expect(loaderRequests).toEqual(['https://cjrtnc.leaningtech.com/5.0/loader.js']);

  // From inside, the page's origin and what it stores are out of reach.
  const sandbox = page.frames().find((candidate) => candidate.url() === QUEST_SANDBOX_URL);
  const inside = await sandbox.evaluate(() => {
    let parentReadable = true;
    try {
      void window.parent.document;
    } catch {
      parentReadable = false;
    }
    return { origin: location.origin, parentReadable, saved: localStorage.getItem('shohoj_quest_progress_v1') };
  });
  expect(inside.origin).toBe(new URL(QUEST_SANDBOX_URL).origin);
  expect(inside.parentReadable).toBe(false);
  expect(inside.saved).toBeNull();

  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('leaving a quest and the game removes the frame', async ({ page, baseURL }) => {
  await page.route(/cjrtnc\.leaningtech\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_CHEERPJ }),
  );
  await serveQuestSandbox(page, new URL(baseURL).origin);
  await useQuestSandbox(page);
  await begin(page);
  await openRopes(page);
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(1);

  // Closing the quest keeps the engine: the student may open another.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(1);
  await page.getByRole('link', { name: /Leave the game/ }).click();
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(0);
});

test('with no sandbox, code is not run on the page instead', async ({ page }) => {
  // No sandbox address at all: a build with no Worker configured.
  const workers = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  const cheerpj = [];
  page.on('request', (request) => {
    if (/leaningtech\.com/.test(request.url())) cheerpj.push(request.url());
  });

  await begin(page);
  await openRopes(page);
  await expect(page.getByText('Running Java is not set up on this copy of Shohoj')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Running Java is not set up');
  await expect(page.locator('.quest-verdict')).toContainText('Your code was not judged');

  // There is no falling back to the page's own origin.
  expect(workers).toEqual([]);
  expect(cheerpj).toEqual([]);
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(0);
});

test('a sandbox that does not answer is reported, and can be tried again', async ({ page, baseURL }) => {
  // The address is set but nothing useful is there: the Worker is down.
  await page.route(/shohoj-papers\.souravmondal033\.workers\.dev/, (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' }),
  );
  await useQuestSandbox(page);
  await page.clock.install();
  await begin(page);
  await openRopes(page);
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(1);

  await page.clock.fastForward(21_000);
  await expect(page.getByText('The Java engine could not be reached')).toBeVisible();
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(0);

  // Back up: "Try again" starts a fresh frame.
  await page.unroute(/shohoj-papers\.souravmondal033\.workers\.dev/);
  await page.route(/cjrtnc\.leaningtech\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_CHEERPJ }),
  );
  await serveQuestSandbox(page, new URL(baseURL).origin);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Java found 1 problem');
});
