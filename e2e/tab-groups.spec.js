import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// Browser coverage for the grouped tab bar: the ten calculator tabs are now
// folded into five top-level entries — two single tabs (Calculator, Groups) and
// three dropdown groups (Plan / Courses / Campus). This spec proves the bar no
// longer needs horizontal scroll, that a group opens and routes to its child
// tab, that the group pill reflects the active child, and that per-tab deep
// links still resolve to the right panel.

async function boot(page) {
  page.on('dialog', d => d.accept());
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
    window.pdfjsLib = window.pdfjsLib || {};
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#calcTabs')).toBeVisible();
}

test('top level shows five entries and never scrolls horizontally', async ({ page }) => {
  await boot(page);

  // Exactly the five top-level pills are direct children of the bar.
  const labels = await page.locator('#calcTabs > .calc-tab, #calcTabs > .calc-tab-group > .calc-tab-trigger')
    .evaluateAll(els => els.map(e => e.querySelector('span:not([class])').textContent.trim()));
  expect(labels).toEqual(['Calculator', 'Plan', 'Courses', 'Campus', 'Groups']);

  // The whole point of grouping: the bar fits without a horizontal scrollbar.
  const overflow = await page.locator('#calcTabs').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('opening a group routes to a child tab and lights its pill', async ({ page }) => {
  await boot(page);

  const campus = page.locator('#calcTabs .calc-tab-group[data-group="campus"]');
  const seats = campus.locator('[data-tab="seats"]');

  // Hidden until the group opens.
  await expect(seats).toBeHidden();
  await campus.locator('.calc-tab-trigger').click();
  await expect(seats).toBeVisible();

  await seats.click();
  await expect(page.locator('#tabSeats')).toHaveClass(/active/);
  // Selecting a child closes the menu but keeps the group pill marked active.
  await expect(seats).toBeHidden();
  await expect(campus.locator('.calc-tab-trigger')).toHaveClass(/active/);
});

test('the helper drives grouped and single tabs the same way', async ({ page }) => {
  await boot(page);

  await selectCalcTab(page, 'reviews');           // inside Courses group
  await expect(page.locator('#tabReviews')).toHaveClass(/active/);

  await selectCalcTab(page, 'calculator');         // single top-level tab
  await expect(page.locator('#tabCalculator')).toHaveClass(/active/);
});

test('per-tab deep link still resolves into the right group', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
    window.pdfjsLib = window.pdfjsLib || {};
  });
  await page.goto('/#calculator/freerooms', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#tabFreeRooms')).toHaveClass(/active/);
  await expect(page.locator('#calcTabs .calc-tab-group[data-group="campus"] .calc-tab-trigger'))
    .toHaveClass(/active/);
});
