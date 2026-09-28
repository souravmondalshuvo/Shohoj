// e2e-shell/admin-campus-switcher.spec.js
//
// The admin's "view as" campus switcher (#798). A student's campus is their
// email's; an admin picks one, and the whole shell — tab list, grading scale,
// feature gates — follows the pick through useUniversity.
//
// Tasks is the probe for "which campus is this": it is a top-level tab that
// only BRACU has, so it is present on one campus and absent on the other
// without opening a group dropdown.

import { test, expect, installAuth, NSU_STUDENT } from '../e2e-support/authFixture.js';

/** An admin on an address no campus claims — resolves to no campus at all. */
const GMAIL_ADMIN = Object.freeze({
  status: 'authenticated',
  uid: 'u_admin',
  email: 'admin@gmail.com',
  isAdmin: true,
  university: null,
});

const switcher = (page) => page.getByTestId('admin-campus-switcher');
const tasksTab = (page) => page.getByRole('link', { name: 'Tasks', exact: true });
// Every campus has a Calculator tab: asserting it first proves the tab bar is
// rendered, so a missing Tasks tab means "filtered out", not "no tabs at all".
const calculatorTab = (page) => page.getByRole('link', { name: 'Calculator', exact: true });

test('a student gets no switcher', async ({ page }) => {
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(calculatorTab(page)).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
});

test('an admin with no campus is asked to choose one', async ({ page }) => {
  await installAuth(page, GMAIL_ADMIN);
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  await expect(switcher(page)).toBeVisible();
  await expect(switcher(page)).toHaveValue('');
  await expect(page.getByTestId('campus-required')).toContainText('Choose a campus to view');
});

test('picking a campus switches the tabs and unlocks the scale-bound routes', async ({ page }) => {
  await installAuth(page, GMAIL_ADMIN);
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('campus-required')).toBeVisible();

  await switcher(page).selectOption('nsu');
  await expect(page.getByTestId('campus-required')).toHaveCount(0);
  await expect(calculatorTab(page)).toBeVisible();
  await expect(tasksTab(page)).toHaveCount(0);
  // The placeholder goes once something resolves; it cannot be chosen back.
  await expect(switcher(page).locator('option[value=""]')).toHaveCount(0);

  await switcher(page).selectOption('bracu');
  await expect(tasksTab(page)).toBeVisible();
});

test('the choice survives a reload', async ({ page }) => {
  await installAuth(page, GMAIL_ADMIN);
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await switcher(page).selectOption('nsu');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(switcher(page)).toHaveValue('nsu');
  await expect(calculatorTab(page)).toBeVisible();
  await expect(tasksTab(page)).toHaveCount(0);
});

test('an admin with a campus email starts on that campus and can leave it', async ({ page }) => {
  await installAuth(page, { ...GMAIL_ADMIN, email: 'admin@g.bracu.ac.bd', university: 'bracu' });
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(switcher(page)).toHaveValue('bracu');
  await expect(tasksTab(page)).toBeVisible();
  await switcher(page).selectOption('nsu');
  await expect(calculatorTab(page)).toBeVisible();
  await expect(tasksTab(page)).toHaveCount(0);
});

test('a student who plants the stored choice stays on their own campus', async ({ page }) => {
  await installAuth(page, NSU_STUDENT);
  await page.addInitScript(() => localStorage.setItem('shohoj_admin_campus', 'bracu'));
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(calculatorTab(page)).toBeVisible();
  await expect(tasksTab(page)).toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
});

test('on a phone the switcher moves out of the full nav into a row above the tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installAuth(page, GMAIL_ADMIN);
  await page.goto('/transcript', { waitUntil: 'domcontentloaded' });
  const bar = page.getByTestId('admin-campus-switcher-bar');
  await expect(bar).toBeVisible();
  await expect(switcher(page)).toBeHidden();
  // One control in the accessibility tree at a time, named by its visible label.
  await expect(page.getByRole('combobox', { name: 'Viewing as' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'View Shohoj as campus' })).toHaveCount(0);

  await page.getByLabel('Viewing as').selectOption('nsu');
  await expect(page.getByTestId('campus-required')).toHaveCount(0);
  await expect(bar).toHaveValue('nsu');
});
