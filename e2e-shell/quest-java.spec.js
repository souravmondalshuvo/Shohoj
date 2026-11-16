// e2e-shell/quest-java.spec.js
//
// The Java quests of Shohoj Quest (#981), end to end on the production build,
// with a stand-in for the JVM (e2e-support/questRunner.js).
//
// Each test takes a quest the way a student does: open it, type into the real
// editor, press Run, read the verdict. The stand-in answers for the engine;
// the source rules, the harness, the grader, the editor and the game around
// them are the shipped ones. One test of each code quest type, and the boss,
// which also walks through the gate it opens and out of the zone.
//
// Nothing here may fetch Java. Every test fails if a request goes to CheerpJ's
// CDN, which is also the check that the stand-in really replaces the download.

import { expect, test } from '../e2e-support/authFixture.js';
import {
  finished,
  heroRan,
  installQuestRunner,
  killed,
  passing,
  passingExcept,
  ran,
  refused,
  threw,
} from '../e2e-support/questRunner.js';
import { SOLUTIONS } from '../src/features/quest/content/solutions.ts';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const quest = (id) => bridge.quests.find((candidate) => candidate.id === id);
const PLANKS = quest('bridge-count-the-planks');
const SPAN = quest('bridge-first-span');
const TOLL = quest('bridge-the-toll');
const ROPES = quest('bridge-rope-counter');
const STRENGTH = quest('bridge-plank-strength');
const KEYSTONE = quest('bridge-keystone');

/** Start the game with some quests already solved, and the hero on a chosen square. */
async function begin(page, { solved = [], at = null } = {}) {
  await page.addInitScript(
    ({ ids, where }) => {
      localStorage.setItem(
        'shohoj_quest_progress_v1',
        JSON.stringify({
          uid: 'u_me',
          progress: {
            v: 1,
            completed: Object.fromEntries(ids.map((id, i) => [id, 1763200000000 + i])),
            zone: 'bridge',
            at: where,
          },
        }),
      );
    },
    { ids: solved.map((q) => q.id), where: at },
  );
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.locator('.quest-stage canvas')).toBeVisible();
  await expect(page.locator('.quest-tip')).toBeVisible();
}

async function openFromLog(page, target) {
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${target.title}` }).click();
  await expect(page.getByRole('heading', { level: 2, name: target.title })).toBeVisible();
}

/** Replace what is in the editor, as one paste. */
async function setCode(page, code) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

const run = (page) => page.getByRole('button', { name: 'Run', exact: true }).click();
const verdict = (page) => page.locator('.quest-verdict');
const runs = (page) => page.evaluate(() => window.__questRuns);

/** One square. See quest-route.spec.js. */
async function step(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

let cheerpj;
test.beforeEach(({ page }) => {
  cheerpj = [];
  page.on('request', (request) => {
    if (/leaningtech\.com/.test(request.url())) cheerpj.push(request.url());
  });
});
test.afterEach(() => {
  expect(cheerpj, 'a Java quest under the stand-in must not fetch the engine').toEqual([]);
});

test('fix the bug: an endless loop is stopped, a compile error points at its line, the fix passes', async ({
  page,
}) => {
  const unfinishedLine = ROPES.starter.replace('int total = 0;', 'int total = 0');
  await installQuestRunner(page, {
    rules: [
      { when: SOLUTIONS[ROPES.id], outcome: passing(ROPES) },
      {
        when: 'int total = 0\n',
        outcome: refused(
          "/str/Main.java:7: error: ';' expected\n        int total = 0\n                     ^\n1 error\n",
        ),
      },
    ],
    // The quest's own starter never ends: i is never changed.
    otherwise: killed(0),
  });
  await begin(page, { solved: [PLANKS] });
  await openFromLog(page, ROPES);
  await expect(page.locator('.cm-content')).toContainText('while (i < n)');

  // Run it first, as the task says. It is killed, and says why.
  await run(page);
  await expect(verdict(page)).toContainText('Stopped after 3 seconds');
  await expect(verdict(page)).toContainText('never ending');
  await expect(verdict(page).getByText('not run')).toHaveCount(ROPES.grading.tests.length - 1);
  const [first] = await runs(page);
  expect(first.timeLimitMs).toBe(3000);
  expect(first.tests).toBe(ROPES.grading.tests.length);
  expect(first.studentFile).toBe('Main.java');
  expect(first.files).toEqual(['Main.java', 'QuestHarness.java']);

  // The game carries on: the same panel takes the next attempt.
  await setCode(page, unfinishedLine);
  await run(page);
  await expect(verdict(page)).toContainText('Java found 1 problem');
  await expect(verdict(page)).toContainText('Line 7');
  await expect(verdict(page)).toContainText('missing its semicolon');
  await expect(page.locator('.cm-line.quest-cm-error')).toHaveCount(1);
  await expect(page.locator('.cm-line.quest-cm-error')).toHaveText(/int total = 0$/);

  await setCode(page, SOLUTIONS[ROPES.id]);
  await run(page);
  await expect(verdict(page)).toContainText(`All ${ROPES.grading.tests.length} tests passed.`);
  await expect(page.getByText(`Solved. +${ROPES.xp} XP`)).toBeVisible();
  await expect(page.locator('.cm-line.quest-cm-error')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to the zone' }).click();
  await expect(page.getByRole('button', { name: 'Quests 2/6' })).toBeVisible();
  await expect(page.getByLabel(`${PLANKS.xp + ROPES.xp} experience points`)).toBeVisible();
});

test('command the hero: a pasted answer is refused unrun, and a loop walks the board', async ({ page }) => {
  await installQuestRunner(page, {
    rules: [
      // Eight steps east, picking up at squares 2, 5 and 7.
      { when: SOLUTIONS[SPAN.id], outcome: heroRan('SSPSSSPSSPS|8|1|E|3|') },
    ],
    // Anything else: one step, then into the water.
    otherwise: heroRan('SLB|1|1|N|0|blocked'),
  });
  await begin(page, { solved: [PLANKS] });
  await openFromLog(page, SPAN);
  const board = page.getByRole('img', { name: /hero's board/ });
  await expect(board).toHaveAccessibleName(/column 1, row 2, facing right, holding 0 of 3/);

  // The starter has no loop. The source rules stop it before any Java runs.
  await run(page);
  const needsLoop = SPAN.rules.find((rule) => rule.kind === 'requires').message;
  await expect(verdict(page)).toContainText(needsLoop);
  expect(await runs(page)).toEqual([]);

  // A loop that goes the wrong way: the run is replayed up to where it ended.
  await setCode(page, SOLUTIONS[SPAN.id].replace('hero.pick();', 'hero.turnLeft();'));
  await run(page);
  await expect(verdict(page)).toHaveClass(/quest-verdict--fail/);
  await expect(board).toHaveAccessibleName(/column 2, row 2, facing up, holding 0 of 3/);
  await expect(page.getByText(/^Solved/)).toHaveCount(0);

  await setCode(page, SOLUTIONS[SPAN.id]);
  await run(page);
  await expect(page.getByText(`Solved. +${SPAN.xp} XP`)).toBeVisible();
  // The replay takes a moment: eleven actions, one at a time.
  await expect(board).toHaveAccessibleName(/column 9, row 2, facing right, holding 3 of 3/, {
    timeout: 8000,
  });
  await expect(page.getByRole('button', { name: 'Watch again' })).toBeVisible();
});

test('fill in the line: it lands in the program, and a hidden test keeps its data to itself', async ({
  page,
}) => {
  const hidden = TOLL.grading.tests.findIndex((t) => t.hidden);
  await installQuestRunner(page, {
    rules: [
      { when: `${SOLUTIONS[TOLL.id]}\n`, outcome: passing(TOLL) },
      // Accepts zero as a payment: only the hidden test notices.
      { when: '} while (toll < 0);', outcome: passingExcept(TOLL, hidden, 'Toll paid: 0\n') },
    ],
    otherwise: refused('/str/Main.java:9: error: illegal start of expression\n1 error\n'),
  });
  await begin(page, { solved: [PLANKS] });
  await openFromLog(page, TOLL);

  const line = page.getByLabel(/^The missing line/);
  await line.fill('} while (toll < 0);');
  await line.press('Enter');

  const count = TOLL.grading.tests.length;
  await expect(verdict(page)).toContainText(`${count - 1} of ${count} tests passed.`);
  await expect(verdict(page)).toContainText(TOLL.grading.tests[hidden].hint);
  // A hidden test says that it failed and gives its hint. Not what it fed in,
  // not what it wanted, not what the program printed.
  await expect(verdict(page)).not.toContainText('Toll paid: 12');
  await expect(verdict(page)).not.toContainText('Toll paid: 0');
  await expect(verdict(page)).not.toContainText('99');

  // What went to the compiler is the whole program with the line in its place.
  const [sent] = await runs(page);
  expect(sent.source).not.toContain('__BLANK__');
  expect(sent.source).toContain(
    '} while (toll < 0);\n        System.out.println("Toll paid: " + toll);',
  );
  expect(sent.source.startsWith('import java.util.Scanner;')).toBe(true);

  await line.fill(SOLUTIONS[TOLL.id]);
  await run(page);
  await expect(page.getByText(`Solved. +${TOLL.xp} XP`)).toBeVisible();
});

test('write the code: a crash names its line in the editor, and a method is judged by what it returns', async ({
  page,
}) => {
  const dividesByZero = `public class Solution {
    public static int digitSum(int n) {
        int sum = 0;
        while (n > 0) { sum = sum + n % 10; n = n / 10; }
        return sum / n;
    }
}
`;
  await installQuestRunner(page, {
    rules: [
      { when: SOLUTIONS[STRENGTH.id], outcome: passing(STRENGTH) },
      // Every call ends with n at 0, so every call divides by it.
      {
        when: 'sum / n',
        outcome: ran(STRENGTH.grading.tests.map((_, i) => threw(i, 'ArithmeticException', 5))),
      },
    ],
    otherwise: ran(STRENGTH.grading.tests.map((_, i) => finished(i, { extra: '0' }))),
  });
  await begin(page, { solved: [PLANKS, TOLL, ROPES] });
  await openFromLog(page, STRENGTH);

  // The skeleton has no loop yet.
  await run(page);
  await expect(verdict(page)).toContainText(STRENGTH.rules[0].message);
  expect(await runs(page)).toEqual([]);

  await setCode(page, dividesByZero);
  await run(page);
  await expect(verdict(page)).toContainText('divided a whole number by zero');
  await expect(verdict(page).getByText(/^Line 5:/).first()).toBeVisible();
  await expect(page.locator('.cm-line.quest-cm-error')).toHaveText(/return sum \/ n;/);
  const sent = (await runs(page)).at(-1);
  expect(sent.studentFile).toBe('Solution.java');

  await setCode(page, SOLUTIONS[STRENGTH.id]);
  await run(page);
  await expect(verdict(page)).toContainText(`All ${STRENGTH.grading.tests.length} tests passed.`);
  await expect(page.getByText(`Solved. +${STRENGTH.xp} XP`)).toBeVisible();
});

test('the boss: walking into the far gate offers it, solving it opens the gate, and the zone can be left', async ({
  page,
}) => {
  const oneSpaceShort = SOLUTIONS[KEYSTONE.id].replace('s < n - row', 's < n - row - 1');
  await installQuestRunner(page, {
    rules: [{ when: SOLUTIONS[KEYSTONE.id], outcome: passing(KEYSTONE) }],
    // A pattern with every row one space short: right numbers, wrong shape.
    otherwise: ran(
      KEYSTONE.grading.tests.map((t, i) =>
        finished(i, {
          out: t.expected
            .split('\n')
            .map((row) => row.replace(/^ /, ''))
            .join('\n'),
        }),
      ),
    ),
  });
  // Everything but the boss is solved, and the hero stands on the road north,
  // two squares short of the gate.
  await begin(page, { solved: [PLANKS, SPAN, TOLL, ROPES, STRENGTH], at: { x: 38, y: 5 } });
  await expect(page.getByRole('button', { name: 'Quests 5/6' })).toBeVisible();

  await step(page, 'ArrowUp');
  await step(page, 'ArrowUp');
  const dialog = page.getByRole('dialog', { name: 'Karim Majhi speaks' });
  await expect(dialog).toContainText(KEYSTONE.story[0]);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: `Take the quest: ${KEYSTONE.title}` }).click();
  await expect(page.locator('.cm-content')).toBeVisible();

  await setCode(page, oneSpaceShort);
  await run(page);
  await expect(verdict(page)).toContainText('tests passed.');
  // In a pattern the mistake is usually spaces, so they are drawn as dots.
  await expect(verdict(page)).toContainText('First difference on line 1');
  await expect(verdict(page).locator('code', { hasText: '··1' }).first()).toBeVisible();

  await setCode(page, SOLUTIONS[KEYSTONE.id]);
  await run(page);
  await expect(page.getByText(`Solved. +${KEYSTONE.xp} XP`)).toBeVisible();
  await page.getByRole('button', { name: 'Back to the zone' }).click();

  const total = bridge.quests.reduce((sum, q) => sum + q.xp, 0);
  await expect(page.getByRole('button', { name: 'Quests 6/6' })).toBeVisible();
  await expect(page.getByLabel(`${total} experience points`)).toBeVisible();
  await expect(page.locator('.quest-tip')).toContainText('The far gate is open');

  // Through the gate that was shut a moment ago, and out.
  for (let i = 0; i < 4; i += 1) await step(page, 'ArrowUp');
  const cleared = page.getByRole('dialog', { name: 'Zone complete' });
  await expect(cleared).toContainText('You crossed The Bridge');
  await expect(cleared).toContainText(`${total} XP earned`);
});
