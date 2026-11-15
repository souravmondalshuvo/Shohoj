// e2e-shell/quest-route.spec.js
//
// Shohoj Quest's route (#981), against the production build and its real CSP.
//
// What this covers is what must hold before any Java runs: the zone draws, the
// hero can be walked to the quest-giver, a quest can be solved, and none of it
// loosens the policy or fetches the Java engine. The engine is 14 MB from a
// third-party CDN, so nothing here opens a quest that needs it.

import { NSU_STUDENT, expect, installAuth, test } from '../e2e-support/authFixture.js';
import { bridge } from '../src/features/quest/content/zones/bridge.ts';

const CHEERPJ = /leaningtech\.com/;

/** Collect every CSP violation and every request to CheerpJ's CDN. */
async function watch(page) {
  const seen = { cheerpj: [] };
  page.on('request', (request) => {
    if (CHEERPJ.test(request.url())) seen.cheerpj.push(request.url());
  });
  await page.addInitScript(() => {
    window.__questViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__questViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return seen;
}

async function openZone(page) {
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1, name: 'The Bridge' })).toBeVisible();
  await expect(page.locator('.quest-stage canvas')).toBeVisible();
  // The tip appears when Phaser reports the zone drawn.
  await expect(page.locator('.quest-tip')).toBeVisible();
}

/**
 * One square. A tap is one step however long a frame takes, and a square takes
 * 120 ms to walk, so the wait is for the hero to arrive before the next tap.
 */
async function step(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

test('the zone draws under the site CSP and fetches no Java', async ({ page }) => {
  const seen = await watch(page);
  await openZone(page);

  await expect(page.getByRole('link', { name: 'Built with CheerpJ' })).toBeVisible();
  expect(await page.evaluate(() => window.__questViolations)).toEqual([]);
  expect(seen.cheerpj).toEqual([]);
});

test('walking up to the quest-giver starts the first quest', async ({ page }) => {
  await openZone(page);

  // From the spawn point: five squares east, one north, then into the giver.
  for (let i = 0; i < 5; i += 1) await step(page, 'ArrowRight');
  await step(page, 'ArrowUp');
  await step(page, 'ArrowRight');

  const dialog = page.getByRole('dialog', { name: 'Karim Majhi speaks' });
  await expect(dialog).toContainText(bridge.quests[0].story[0]);
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Take the quest: Count the Planks' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Count the Planks' })).toBeVisible();
});

test('a quest is solved from the quest log, and its XP is counted once', async ({ page }) => {
  const seen = await watch(page);
  await openZone(page);
  const [first] = bridge.quests;

  await page.getByRole('button', { name: 'Quests 0/6' }).click();
  await page.getByRole('button', { name: `Start ${first.title}` }).click();

  // A wrong answer says where, and never what was expected.
  await page.getByLabel('What it prints').fill('1 2 3');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toContainText('Line 1 of your answer');
  await expect(page.getByRole('status')).not.toContainText(first.answer.split('\n')[0]);

  await page.getByLabel('What it prints').fill(first.answer);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText(`Solved. +${first.xp} XP`)).toBeVisible();
  await page.getByRole('button', { name: 'Back to the zone' }).click();

  await expect(page.getByLabel(`${first.xp} experience points`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quests 1/6' })).toBeVisible();

  // Solving it again is practice: the total does not move.
  await page.getByRole('button', { name: 'Quests 1/6' }).click();
  await page.getByRole('button', { name: `Practise ${first.title}` }).click();
  await page.getByLabel('What it prints').fill(first.answer);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Solved again.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the zone' }).click();
  await expect(page.getByLabel(`${first.xp} experience points`)).toBeVisible();

  // A "predict the output" quest is graded on the page: no Java was fetched.
  expect(seen.cheerpj).toEqual([]);
  expect(await page.evaluate(() => window.__questViolations)).toEqual([]);
});

test('a locked quest says what it is waiting for', async ({ page }) => {
  await openZone(page);
  await page.getByRole('button', { name: 'Quests 0/6' }).click();

  const boss = page.getByRole('listitem').filter({ hasText: 'The Keystone Arch' });
  await expect(boss).toContainText('Locked');
  await expect(boss).toContainText('Needs: The First Span, Plank Strength');
  await expect(boss.getByRole('button')).toHaveCount(0);
});

test('the game is not offered to a campus whose syllabus it does not follow', async ({ page }) => {
  await installAuth(page, NSU_STUDENT);
  await page.goto('/quest', { waitUntil: 'load' });
  await expect(page.getByTestId('feature-unavailable')).toBeVisible();
  await expect(page.locator('.quest-stage')).toHaveCount(0);
});
