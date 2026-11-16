// e2e-shell/quest-progress.spec.js
//
// Saving and resuming Shohoj Quest (#981), against the production build.
//
// The device copy is the real one: the browser's own localStorage, across a
// real reload. The cloud is a stand-in installed on window before the app
// loads (`__shohojQuestProgressRepo`), because the suite has no Firestore; the
// rules that guard the real collection are tested in the emulator
// (tests/firestore.rules.test.js), and the merge itself in
// tests/questProgress.test.js.
//
// Nothing here runs Java. Requests to CheerpJ's CDN are refused, so a quest
// that would fetch the engine shows its "could not be downloaded" line instead
// of pulling 14 MB into a test.

import { expect, test } from '../e2e-support/authFixture.js';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const [first] = bridge.quests;
const toll = bridge.quests.find((quest) => quest.id === 'bridge-the-toll');

async function openZone(page) {
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.locator('.quest-stage canvas')).toBeVisible();
  await expect(page.locator('.quest-tip')).toBeVisible();
}

async function solveFirstQuest(page) {
  await page.getByRole('button', { name: /^Quests/ }).click();
  await page.getByRole('button', { name: `Start ${first.title}` }).click();
  await page.getByLabel('What it prints').fill(first.answer);
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Back to the zone' }).click();
}

const savedProgress = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_quest_progress_v1') ?? 'null'));

/** A cloud that already holds `held`, and records what each device sends it. */
async function installCloud(page, held) {
  await page.addInitScript((initial) => {
    const calls = [];
    window.__questCloudCalls = calls;
    window.__shohojQuestProgressRepo = {
      async sync(uid, local) {
        calls.push({ uid, local });
        return { kind: 'ok', progress: initial };
      },
    };
  }, held);
}

test.beforeEach(async ({ page }) => {
  await page.route(/leaningtech\.com/, (route) => route.abort());
});

test('a solved quest and its XP are still there after a reload', async ({ page }) => {
  await openZone(page);
  await solveFirstQuest(page);
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();

  const saved = await savedProgress(page);
  expect(saved.uid).toBe('u_me');
  expect(Object.keys(saved.progress.completed)).toEqual([first.id]);
  // What is saved is the fact, never a score.
  expect(Object.keys(saved.progress).sort()).toEqual(['at', 'completed', 'v', 'zone']);

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();
  await expect(page.getByLabel(`${first.xp} experience points`)).toBeVisible();
});

test('the hero is where it was left after a reload', async ({ page }) => {
  await openZone(page);
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  // The spawn point is square 4,11; three steps east is 7,11.
  await expect.poll(async () => (await savedProgress(page))?.progress.at).toEqual({ x: 7, y: 11 });

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
  // It walks on from there, not from the spawn point.
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => (await savedProgress(page))?.progress.at).toEqual({ x: 9, y: 11 });
});

test('quests solved on another device arrive and open the bridge', async ({ page }) => {
  await installCloud(page, {
    completed: { [first.id]: 1763200000000, [toll.id]: 1763200005000 },
    zone: 'bridge',
    at: { x: 30, y: 12 },
  });
  await openZone(page);

  await expect(page.getByRole('button', { name: 'Quests 2/6' })).toBeVisible();
  await expect(page.getByLabel(`${first.xp + toll.xp} experience points`)).toBeVisible();
  // And they are kept on this device, so the next visit needs no network.
  await expect
    .poll(async () => Object.keys((await savedProgress(page))?.progress.completed ?? {}).sort())
    .toEqual([first.id, toll.id].sort());
});

test('a quest solved here is sent to the cloud, and only this student\'s copy', async ({ page }) => {
  await installCloud(page, null);
  await openZone(page);
  await solveFirstQuest(page);

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__questCloudCalls.some((call) => call.local && 'bridge-count-the-planks' in call.local.completed),
      ),
    )
    .toBe(true);
  const uids = await page.evaluate(() => [...new Set(window.__questCloudCalls.map((c) => c.uid))]);
  expect(uids).toEqual(['u_me']);
});

test('the game plays on when the cloud cannot be reached', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shohojQuestProgressRepo = {
      sync: async () => {
        throw new Error('permission-denied');
      },
    };
  });
  await openZone(page);
  await solveFirstQuest(page);
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();
});

test('code typed into a quest is still there after a reload', async ({ page }) => {
  await installCloud(page, { completed: { [first.id]: 1763200000000 }, zone: 'bridge', at: null });
  await openZone(page);
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();

  const openToll = async () => {
    await page.getByRole('button', { name: /^Quests/ }).click();
    await page.getByRole('button', { name: `Start ${toll.title}` }).click();
  };
  await openToll();
  const line = page.getByLabel(/^The missing line/);
  await line.fill('} while (toll <= 0);');
  // A draft is written a moment after typing stops.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('shohoj_quest_drafts_v1')))
    .toContain('while (toll <= 0)');

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
  await openToll();
  await expect(page.getByLabel(/^The missing line/)).toHaveValue('} while (toll <= 0);');
});

test('another student on the same browser does not see this one\'s save', async ({ page }) => {
  await openZone(page);
  await solveFirstQuest(page);
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();

  // Same browser, same storage, a different signed-in student.
  await page.addInitScript(() => {
    const snapshot = { ...window.__shohojAuthSource.get(), uid: 'u_someone_else' };
    window.__shohojAuthSource = { ...window.__shohojAuthSource, get: () => snapshot };
  });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.quest-tip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quests 0/6' })).toBeVisible();
});
