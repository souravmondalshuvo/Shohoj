// e2e-shell/shell-mobile-nav.spec.js
//
// Part of #365 (mobile parity), rewritten for the grouped tab bar.
//
// The shell used to render a flat list of 19 links that collapsed behind a
// "Menu" toggle under 720px. It now mirrors legacy's grouped bar: five
// top-level slots at every width, with most routes inside a dropdown. Nothing
// collapses behind a toggle any more, so the guarantees worth asserting have
// changed shape — but not intent. Every route must stay reachable on a phone,
// the dropdown has to be usable by keyboard and AT, and the bar must not spill
// sideways at 360px.

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { navigateTo } from './_nav.js';

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a group opens, navigates, and closes on selection', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const trigger = page.getByRole('button', { name: 'Plan', exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Items stay collapsed until their group is opened.
    await expect(page.getByRole('link', { name: 'Planner', exact: true })).toBeHidden();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const planner = page.getByRole('link', { name: 'Planner', exact: true });
    await expect(planner).toBeVisible();

    await planner.click();
    await expect(page.getByRole('heading', { name: 'Semester Planner' })).toBeVisible();
    // Picking an item dismisses the dropdown rather than leaving it open.
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('the open dropdown has no serious/critical a11y violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    const blocking = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});

test('no horizontal overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test.describe('desktop viewport', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('top-level tabs are visible; grouped routes sit behind their trigger', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The Menu toggle is gone entirely — the bar no longer collapses.
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);

    await expect(page.getByRole('link', { name: 'Calculator', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Groups', exact: true })).toBeVisible();
    // Grouped routes are reachable, but only through their group.
    await expect(page.getByRole('link', { name: 'Reviews', exact: true })).toBeHidden();

    await navigateTo(page, 'Reviews');
    await expect(page).toHaveURL(/\/reviews$/);
  });
});
