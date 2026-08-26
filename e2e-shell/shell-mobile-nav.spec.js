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

import { expect, test } from '../e2e-support/authFixture.js';
import AxeBuilder from '@axe-core/playwright';

import { navigateTo } from './_nav.js';

// Emulate a phone, not just a narrow window (#536). Width alone leaves
// Chromium reporting `(hover: hover) and (pointer: fine)`, and ShellTabs reads
// exactly that to choose its semantics — so the coarse-pointer path this block
// is named for never ran, and the hover path did. Playwright parks the pointer
// where it last clicked, so the re-render after navigation fired a fresh
// mouseenter on the trigger and re-opened the menu the route change had just
// closed: a ~50% flake that a real phone, with no hover, cannot reproduce.
test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

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
    // The page, not its heading: legacy's planner setup prompt carries no
    // title and the shell's now matches it (#582), and what this test is about
    // is that the link navigated at all.
    await expect(page.getByTestId('planner-page')).toBeVisible();
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

  // #608: a menu the student CLICKED open must not close itself because the
  // pointer is no longer over the trigger. On a slow machine the bar is still
  // reflowing when the menu opens, and a reflow slides the trigger out from
  // under a stationary cursor — the browser fires mouseleave nobody performed,
  // the 180ms grace period expires with the pointer somewhere else entirely,
  // and the menu vanishes a fifth of a second after the click that asked for
  // it. On CI that read as "element is not visible" for 46 straight retries.
  //
  // Moving the mouse away is the deterministic stand-in for the page moving
  // under it: both end with the pointer off the trigger and no way back.
  test('a clicked group stays open when the pointer leaves', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const planner = page.getByRole('link', { name: 'Planner', exact: true });
    await expect(planner).toBeVisible();

    // Well past the 180ms hover-close grace period.
    await page.mouse.move(5, 400);
    await page.waitForTimeout(600);
    await expect(planner).toBeVisible();

    // Still dismissable the ways a student would expect.
    await page.keyboard.press('Escape');
    await expect(planner).toBeHidden();
  });

  // The other half of the rule: a menu the pointer merely hovered open still
  // follows the pointer out, so the bar does not fill up with menus a student
  // never asked to keep.
  test('a hovered group still closes when the pointer leaves', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Plan', exact: true }).hover();
    const planner = page.getByRole('link', { name: 'Planner', exact: true });
    await expect(planner).toBeVisible();

    await page.mouse.move(5, 400);
    await expect(planner).toBeHidden();
  });
});
