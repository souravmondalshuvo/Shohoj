// The admin's "view as" campus switcher on the legacy site (#807).
//
// A student's campus is their email's; an admin picks one, and everything
// js/core/activeCampus.js feeds follows the pick. The probe is the retake
// policy, because it moves the headline number: MAT110 taken twice, an A and
// then a C. BRACU (a Fall 2025 start) keeps the LATEST attempt — 2.00. NSU
// keeps the BEST — 4.00.
//
// Firebase is unreachable here (https is aborted), so firebase.js never loads
// and the identity globals it would publish are stubbed by an init script —
// the same seam e2e/profile.spec.js uses.

import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';

const course = (name, grade) => ({ name, credits: 3, grade, retake: false });

const SEMESTERS = [
  { id: 0, name: 'Fall 2025', running: false, courses: [course('Calculus I (MAT110)', 'A')] },
  { id: 1, name: 'Spring 2026', running: false, courses: [course('Calculus I (MAT110)', 'C')] },
];

async function boot(page, { email, admin, stored = null, viewport }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(({ email, admin, stored, semesters }) => {
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_userProfile = () => ({
      signedIn: email !== null, uid: email ? 'u1' : null, email, displayName: 'Test', photoURL: null,
    });
    window._shohoj_isAdmin = () => admin;
    // Seed once per test, so a reload keeps what the page itself stored.
    if (sessionStorage.getItem('__shohoj_admin_campus_spec')) return;
    localStorage.clear();
    sessionStorage.setItem('__shohoj_admin_campus_spec', '1');
    if (stored) localStorage.setItem('shohoj_admin_campus', stored);
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify({
      currentDept: 'CSE',
      semesterCounter: 2,
      startSeason: 'Fall',
      startYear: '2025',
      planCourses: [],
      semesters,
    }));
  }, { email, admin, stored, semesters: SEMESTERS });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#cgpaVal')).toHaveText(/\d\.\d\d/);
}

const pill = page => page.getByTestId('admin-campus-switcher');
const bar = page => page.getByTestId('admin-campus-switcher-bar');
const cgpa = page => page.locator('#cgpaVal');

test('a student gets no switcher, even with a choice planted in storage', async ({ page }) => {
  await boot(page, { email: 'student@g.bracu.ac.bd', admin: false, stored: 'nsu' });
  await expect(pill(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();
  await expect(cgpa(page)).toHaveText('2.00');
});

test('an admin on a non-campus address starts on BRACU and can switch to NSU', async ({ page }) => {
  await boot(page, { email: 'admin@gmail.com', admin: true });
  await expect(pill(page)).toBeVisible();
  await expect(pill(page)).toHaveValue('bracu');
  await expect(cgpa(page)).toHaveText('2.00');

  await pill(page).selectOption('nsu');
  await expect(cgpa(page)).toHaveText('4.00');
  // The same key the shell's switcher reads (#798).
  expect(await page.evaluate(() => localStorage.getItem('shohoj_admin_campus'))).toBe('nsu');

  await pill(page).selectOption('bracu');
  await expect(cgpa(page)).toHaveText('2.00');
});

test('the choice survives a reload', async ({ page }) => {
  await boot(page, { email: 'admin@gmail.com', admin: true });
  await pill(page).selectOption('nsu');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pill(page)).toHaveValue('nsu');
  await expect(cgpa(page)).toHaveText('4.00');
});

test('a choice made in the shell is picked up here', async ({ page }) => {
  await boot(page, { email: 'admin@gmail.com', admin: true, stored: 'nsu' });
  await expect(pill(page)).toHaveValue('nsu');
  await expect(cgpa(page)).toHaveText('4.00');
});

test('on a phone the switcher is a row above the calculator, not a nav pill', async ({ page }) => {
  await boot(page, { email: 'admin@gmail.com', admin: true, viewport: { width: 375, height: 812 } });
  await expect(bar(page)).toBeVisible();
  await expect(pill(page)).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Viewing as' })).toBeVisible();

  await page.getByLabel('Viewing as').selectOption('nsu');
  await expect(cgpa(page)).toHaveText('4.00');
  await expect(bar(page)).toHaveValue('nsu');
  // The page never scrolls sideways for it.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
