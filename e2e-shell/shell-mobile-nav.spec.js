// e2e-shell/shell-mobile-nav.spec.js
//
// Part of #365 (mobile parity): the primary nav collapses behind a Menu toggle
// under the CSS breakpoint (720px) and shows the full link list above it. Also
// asserts no horizontal overflow at 360px and that the open mobile drawer has no
// serious/critical a11y violations (the new toggle is keyboard/AT-usable).

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('links collapse behind the Menu toggle, which opens the drawer and navigates', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Links are collapsed until the toggle opens the drawer.
    await expect(page.getByRole('link', { name: 'Calculator', exact: true })).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const calc = page.getByRole('link', { name: 'Calculator', exact: true });
    await expect(calc).toBeVisible();

    await calc.click();
    // Navigated to /calculator and the drawer closed on selection.
    await expect(page.locator('#semestersContainer')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Planner', exact: true })).toBeHidden();
  });

  test('the open drawer has no serious/critical a11y violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Menu' }).click();
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

  test('shows the full link list and hides the Menu toggle', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Calculator', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reviews', exact: true })).toBeVisible();
  });
});
