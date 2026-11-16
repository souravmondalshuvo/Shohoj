// e2e-shell/quest-a11y.spec.js
//
// Accessibility scans of Shohoj Quest's screens (#981), in the manner of
// a11y-routes.spec.js: axe, serious and critical violations only, with
// color-contrast left out as it is there.
//
// The zone itself is a canvas, which axe cannot see into and a screen reader
// cannot read. That is why the game can be played without it: every open quest
// starts from the quest log. So what is scanned is each thing a student reads
// or types in: the screen around the canvas, the quest-giver's dialog, the
// quest log, and a quest panel of each shape, including the code editor.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../e2e-support/authFixture.js';
import { installQuestRunner, killed } from '../e2e-support/questRunner.js';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const quest = (id) => bridge.quests.find((candidate) => candidate.id === id);
const PLANKS = quest('bridge-count-the-planks');
const SPAN = quest('bridge-first-span');
const TOLL = quest('bridge-the-toll');
const ROPES = quest('bridge-rope-counter');

async function blocking(page) {
  const scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  return scan.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html.slice(0, 160)),
    }));
}

async function begin(page, solved = []) {
  await installQuestRunner(page, { rules: [], otherwise: killed(0) });
  await page.addInitScript((ids) => {
    localStorage.setItem(
      'shohoj_quest_progress_v1',
      JSON.stringify({
        uid: 'u_me',
        progress: {
          v: 1,
          completed: Object.fromEntries(ids.map((id, i) => [id, 1763200000000 + i])),
          zone: 'bridge',
          at: null,
        },
      }),
    );
  }, solved.map((q) => q.id));
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
}

async function openFromLog(page, target) {
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${target.title}` }).click();
  await expect(page.getByRole('heading', { level: 2, name: target.title })).toBeVisible();
}

test('@a11y Quest: the zone screen has no serious/critical violations', async ({ page }) => {
  await begin(page);
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: the quest-giver\'s dialog has no serious/critical violations', async ({ page }) => {
  await begin(page);
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowRight']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole('dialog', { name: 'Karim Majhi speaks' })).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: the quest log has no serious/critical violations', async ({ page }) => {
  await begin(page, [PLANKS]);
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /^Quest log/ })).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: a predict quest, answered wrongly, has no serious/critical violations', async ({ page }) => {
  await begin(page);
  await openFromLog(page, PLANKS);
  await page.getByLabel('What it prints').fill('1 2 3');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.quest-verdict')).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: a fill quest has no serious/critical violations', async ({ page }) => {
  await begin(page, [PLANKS]);
  await openFromLog(page, TOLL);
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: the code editor with a failed run has no serious/critical violations', async ({ page }) => {
  await begin(page, [PLANKS]);
  await openFromLog(page, ROPES);
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.quest-verdict')).toContainText('Stopped after');
  expect(await blocking(page)).toEqual([]);
});

test('@a11y Quest: the hero board and its editor have no serious/critical violations', async ({ page }) => {
  await begin(page, [PLANKS]);
  await openFromLog(page, SPAN);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('img', { name: /hero's board/ })).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});

// A phone is where boxes overflow and start to scroll, and a box that scrolls
// has to be reachable without a pointer.
test.describe('on a phone-sized screen', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('@a11y Quest: the code editor with a failed run has no serious/critical violations', async ({
    page,
  }) => {
    await begin(page, [PLANKS]);
    await openFromLog(page, ROPES);
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.quest-verdict')).toContainText('Stopped after');
    expect(await blocking(page)).toEqual([]);
  });

  test('@a11y Quest: a predict quest, answered wrongly, has no serious/critical violations', async ({
    page,
  }) => {
    await begin(page);
    await openFromLog(page, PLANKS);
    await page.getByLabel('What it prints').fill('1 2 3');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.locator('.quest-verdict')).toBeVisible();
    expect(await blocking(page)).toEqual([]);
  });

  test('@a11y Quest: the quest log has no serious/critical violations', async ({ page }) => {
    await begin(page, [PLANKS]);
    await page.getByRole('button', { name: /^Quests/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^Quest log/ })).toBeVisible();
    expect(await blocking(page)).toEqual([]);
  });
});
