import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';

// The custom cursor derives its shape (dot / hover ring / text I-beam) from
// body classes toggled by js/animations/cursor.js. These tests guard against
// the class getting stuck when the hovered element vanishes without a
// mouseout — e.g. an innerHTML repaint or a modal opening on top (#430).

async function boot(page) {
  await page.route('https://**/*', route => route.abort());
  await unlockCalculator(page);
  await page.goto('/');
  // Plant a fixed-position input to hover; wiggle the mouse over it until the
  // cursor module (loaded with the app bundle) has attached its listeners.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'cursor-spec-input';
    input.style.cssText = 'position:fixed;top:80px;left:80px;width:120px;height:32px;z-index:2147483647;';
    document.body.appendChild(input);
  });
  await expect(async () => {
    await page.mouse.move(60, 60);
    await page.mouse.move(120, 96);
    expect(await page.evaluate(() => document.body.classList.contains('cursor-text'))).toBe(true);
  }).toPass();
}

test('cursor-text clears when the hovered input is removed without a mouseout', async ({ page }) => {
  await boot(page);

  // Remove the input while the pointer is still over it — no mouseout fires,
  // which is exactly how repaints/modals used to strand the I-beam.
  await page.evaluate(() => document.getElementById('cursor-spec-input').remove());

  await page.mouse.move(400, 400);
  expect(await page.evaluate(() => document.body.classList.contains('cursor-text'))).toBe(false);
});

test('cursor states still track the element under the pointer', async ({ page }) => {
  await boot(page);

  // Off the input → text state drops.
  await page.mouse.move(400, 400);
  expect(await page.evaluate(() => document.body.classList.contains('cursor-text'))).toBe(false);

  // Over a link/button → hover state; the footer feedback pill is always there.
  const pill = page.locator('.js-open-feedback');
  await pill.scrollIntoViewIfNeeded();
  await pill.hover();
  expect(await page.evaluate(() => document.body.classList.contains('cursor-hover'))).toBe(true);

  // Back over the planted input → text state returns, hover state drops.
  await page.mouse.move(120, 96);
  expect(await page.evaluate(() => document.body.classList.contains('cursor-text'))).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains('cursor-hover'))).toBe(false);
});
