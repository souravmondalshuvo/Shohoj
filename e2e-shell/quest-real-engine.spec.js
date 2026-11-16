// e2e-shell/quest-real-engine.spec.js
//
// Shohoj Quest with the real Java engine (#981): CheerpJ, downloaded from its
// CDN, running real javac and a real JVM in the production build of the page.
//
// NOT part of CI, on purpose. It fetches about 14 MB from a third party, takes
// a minute, and would fail a deploy over somebody else's outage. It is skipped
// unless asked for:
//
//   npm run test:e2e:quest-real
//
// Run it after changing the runner, the harness or the worker, and before
// telling anyone the game works. The stand-in tests (quest-java.spec.js) prove
// the page around the engine; this proves the engine, in the page.
//
// What it holds the game to: an infinite loop in a student's code is stopped
// and the game carries on; the engine runs in the sandbox, on another origin,
// and cannot see what the site has stored; and the page's
// Content-Security-Policy is not violated.
//
// The sandbox is served from the Worker's own code (e2e-support/questSandbox.js)
// at its production address, so this does not depend on what is deployed.

import { expect, test } from '../e2e-support/authFixture.js';
import { QUEST_SANDBOX_URL, serveQuestSandbox, useQuestSandbox } from '../e2e-support/questSandbox.js';
import { SOLUTIONS } from '../src/features/quest/content/solutions.ts';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const quest = (id) => bridge.quests.find((candidate) => candidate.id === id);
const PLANKS = quest('bridge-count-the-planks');
const SPAN = quest('bridge-first-span');
const ROPES = quest('bridge-rope-counter');

test.skip(!process.env.QUEST_REAL_ENGINE, 'real-engine test: run npm run test:e2e:quest-real');

async function setCode(page, code) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

async function openFromLog(page, target) {
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${target.title}` }).click();
  await expect(page.locator('.cm-content')).toBeVisible({ timeout: 20_000 });
}

test('real Java: an endless loop is killed, the game carries on, and the engine is walled off', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000);
  await serveQuestSandbox(page, new URL(baseURL).origin);
  await useQuestSandbox(page);
  // Workers the page itself starts. The engine's must not be one of them.
  const pageWorkers = [];
  page.on('worker', (worker) => pageWorkers.push(worker.url()));
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible({ timeout: 20_000 });

  // Something the site keeps, of the kind the engine must not reach: a
  // database on the page's own origin, as Firebase's session store is.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('firebaseLocalStorage');
        open.onsuccess = () => resolve();
        open.onerror = () => reject(open.error);
      }),
  );
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain(
    'firebaseLocalStorageDb',
  );
  // No frame yet: nothing has asked for Java.
  await expect(page.locator('iframe[title="Java engine"]')).toHaveCount(0);

  // The first quest needs no Java. Solving it opens the ones that do.
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${PLANKS.title}` }).click();
  await page.getByLabel('What it prints').fill(PLANKS.answer);
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Back to the zone' }).click();

  // An endless loop, on the first run, while the engine is still downloading.
  await openFromLog(page, SPAN);
  const started = Date.now();
  await setCode(
    page,
    'public class Main {\n    public static void main(String[] args) {\n        Hero hero = new Hero();\n        while (true) { }\n    }\n}\n',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Stopped after 3 seconds', {
    timeout: 180_000,
  });
  console.log(`first verdict, engine download included: ${Date.now() - started} ms`);

  // The kill removed the engine's frame, and a fresh one is loading or loaded.
  const frame = page.locator('iframe[title="Java engine"]');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute('src', QUEST_SANDBOX_URL);

  // The page was never blocked: the panel still answers, and the next run works.
  await setCode(page, SOLUTIONS[SPAN.id]);
  const again = Date.now();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(`Solved. +${SPAN.xp} XP`)).toBeVisible({ timeout: 90_000 });
  console.log(`run after a kill, engine restart included: ${Date.now() - again} ms`);
  await expect(page.getByRole('img', { name: /hero's board/ })).toHaveAccessibleName(
    /column 9, row 2, facing right, holding 3 of 3/,
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: 'Back to the zone' }).click();
  await expect(page.getByRole('button', { name: 'Quests 2/6' })).toBeVisible();

  // A real compiler error, on a real line.
  await openFromLog(page, ROPES);
  await setCode(page, ROPES.starter.replace('int total = 0;', 'int total = 0'));
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Line 7', { timeout: 90_000 });
  await expect(page.locator('.quest-verdict')).toContainText('missing its semicolon');
  await expect(page.locator('.cm-line.quest-cm-error')).toHaveText(/int total = 0$/);

  // And the real reference solution, through real stdin and stdout.
  await setCode(page, SOLUTIONS[ROPES.id]);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(`Solved. +${ROPES.xp} XP`)).toBeVisible({ timeout: 90_000 });

  // The engine is on another origin, in the sandbox frame. From there the
  // site's database does not exist, and the page's own origin is not its own.
  const sandbox = page.frames().find((candidate) => candidate.url() === QUEST_SANDBOX_URL);
  expect(sandbox, 'the Java sandbox frame').toBeTruthy();
  const inside = await sandbox.evaluate(async () => ({
    origin: location.origin,
    databases: (await indexedDB.databases()).map((d) => d.name),
  }));
  expect(inside.origin).toBe(new URL(QUEST_SANDBOX_URL).origin);
  expect(inside.origin).not.toBe(new URL(baseURL).origin);
  expect(inside.databases).not.toContain('firebaseLocalStorageDb');
  // And the page itself never started a worker for Java.
  expect(pageWorkers.filter((url) => url.startsWith(new URL(baseURL).origin))).toEqual([]);

  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(pageErrors).toEqual([]);
});
