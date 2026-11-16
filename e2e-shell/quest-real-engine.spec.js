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
// What it holds the game to, from the brief: an infinite loop in a student's
// code is stopped and the game carries on, and none of it needs the site's
// Content-Security-Policy loosened.

import { expect, test } from '../e2e-support/authFixture.js';
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

test('real Java: an endless loop is killed, the game carries on, and the CSP is untouched', async ({
  page,
}) => {
  test.setTimeout(300_000);
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

  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(pageErrors).toEqual([]);
});
