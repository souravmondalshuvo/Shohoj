// e2e-shell/calculator-autocomplete.spec.js
//
// Phase 5C: the typed BRACU catalogue + accessible course autocomplete on the
// React Router shell's /calculator route, against the built dist-shell/ output.
// Covers the critical user journey end to end: search → select (mouse +
// keyboard) → canonical identity + official credits → persistence/reload, plus
// the combobox accessibility contract and graceful handling of unknown input.
//
// Like the sibling shell spec, the route is reached by loading the built index
// and navigating in-app (a deep link 404s on a static server — base/basename
// mismatch tracked separately).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../e2e-support/authFixture.js';

// A stable, well-known BRACU course present in the shipped catalogue.
const KNOWN_CODE = 'CSE110';
const KNOWN_FULL = 'Programming Language I (CSE110)';
const KNOWN_CREDITS = '3';

async function openCalculator(page, { clear = true } = {}) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  // Clear once via evaluate (NOT addInitScript, which would persist and wipe the
  // store on the reload step too). The home route never touches calc storage, so
  // clearing here lands a clean slate before we enter /calculator.
  if (clear) await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.locator('#semestersContainer');
}

async function addSemesterWithCourse(container) {
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(1);
  const input = container.getByRole('combobox').first();
  await expect(input).toBeVisible();
  return input;
}

test('searching shows ranked suggestions and a mouse click selects the course', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  // Closed combobox before typing.
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  await input.click();
  await input.fill(KNOWN_CODE);

  // Listbox opens with the exact-code suggestion first.
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const listbox = container.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const option = container.getByRole('option', { name: new RegExp(KNOWN_CODE) }).first();
  await expect(option).toBeVisible();

  // Pointer-select fills the canonical identity + official credits.
  await option.click();
  await expect(input).toHaveValue(KNOWN_FULL);
  await expect(container.locator('.credits-static').first()).toHaveText(KNOWN_CREDITS);
  // No stale grade carried in (fresh course → no grade letter).
  await expect(container.locator('.grade-letter').first()).toHaveText('—');
  // Popup closed after selection.
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('keyboard-only: ArrowDown + Enter selects the active suggestion', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  await input.click();
  await input.fill(KNOWN_CODE);
  await expect(container.getByRole('option', { name: new RegExp(KNOWN_CODE) }).first()).toBeVisible();

  await input.press('ArrowDown');
  // The active option is exposed through aria-activedescendant.
  await expect(input).toHaveAttribute('aria-activedescendant', /-opt-0$/);
  const activeId = await input.getAttribute('aria-activedescendant');
  await expect(container.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true');

  await input.press('Enter');
  await expect(input).toHaveValue(KNOWN_FULL);
  await expect(container.locator('.credits-static').first()).toHaveText(KNOWN_CREDITS);
});

test('Escape closes the popup without clearing the typed text', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  await input.click();
  await input.fill(KNOWN_CODE);
  await expect(container.getByRole('listbox')).toBeVisible();

  await input.press('Escape');
  await expect(container.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue(KNOWN_CODE);
});

test('a selected course survives a reload', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  await input.click();
  await input.fill(KNOWN_CODE);
  await container.getByRole('option', { name: new RegExp(KNOWN_CODE) }).first().click();
  await expect(input).toHaveValue(KNOWN_FULL);

  // Reload and re-enter the route without clearing storage.
  const reopened = await openCalculator(page, { clear: false });
  const restored = reopened.getByRole('combobox').first();
  await expect(restored).toHaveValue(KNOWN_FULL);
  await expect(reopened.locator('.credits-static').first()).toHaveText(KNOWN_CREDITS);
});

test('unknown free-text input does not crash the route', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  await input.click();
  await input.fill('My Custom Independent Study');
  // No catalogue match → no popup, but the field stays usable.
  await expect(container.getByRole('listbox')).toHaveCount(0);
  await input.blur();
  await expect(input).toHaveValue('My Custom Independent Study');
  // Free text → zero credits, never inherited.
  await expect(container.locator('.credits-static').first()).toHaveText('0');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a grade entered right after a pick survives the deferred blur commit (#320)', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);

  await input.click();
  await input.fill(KNOWN_CODE);
  await container.getByRole('option', { name: new RegExp(KNOWN_CODE) }).first().click();

  // Grade immediately after the pick — inside the 150ms blur-defer window.
  const gp = container.getByPlaceholder('0.0 – 4.0').first();
  await gp.fill('3.3');
  await gp.blur();

  // Let the deferred resolve fire; the stale-closure bug reverted the grade here.
  await page.waitForTimeout(400);
  await expect(gp).toHaveValue('3.3');
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('shohoj_cgpa_v1')).semesters[0].courses[0],
  );
  expect(stored.grade).toBe('B+');
  expect(stored.gradePoint).toBe('3.3');
});

test('the open combobox has no axe accessibility violations', async ({ page }) => {
  const container = await openCalculator(page);
  const input = await addSemesterWithCourse(container);
  await input.click();
  await input.fill(KNOWN_CODE);
  await expect(container.getByRole('listbox')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('#semestersContainer')
    // The shell intentionally ships no visual system yet (Phase 3 note), so
    // color-contrast is out of scope here; assert the structural/ARIA rules.
    .disableRules(['color-contrast'])
    .analyze();

  expect(results.violations).toEqual([]);
});
