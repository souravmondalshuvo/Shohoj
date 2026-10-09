// A Daffodil International University student on the legacy page.
//
// DIU publishes its grading rules and its programs, and no course catalogue.
// So the calculator scores on DIU's scale and counts towards DIU's totals, the
// student types each course and its credits by hand, and every tab that needs
// a catalogue, a section feed or a transcript reader is not offered.
//
// Identity comes through the seam the auth layer publishes it on
// (window._shohoj_userProfile and shohoj:auth-changed), as in
// campus-catalog.spec.js.

import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';

async function boot(page) {
  await page.route('https://**/*', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    if (!localStorage.getItem('__shohoj_e2e_cleaned')) {
      localStorage.removeItem('shohoj_cgpa_v1');
      localStorage.setItem('__shohoj_e2e_cleaned', '1');
      sessionStorage.clear();
    }
    window.Chart = window.Chart || class { destroy() {} };
    window._shohoj_isAuthReady = () => true;
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#deptSelect')).toBeVisible();
}

async function signInAs(page, email) {
  await page.evaluate(address => {
    window._shohoj_userProfile = () => ({ signedIn: address !== null, email: address });
    window._shohoj_currentUid = () => (address === null ? null : 'e2e-student');
    window.dispatchEvent(new Event('shohoj:auth-changed'));
  }, email);
}

const tab = (page, id) => page.locator(`#calcTabs [data-tab="${id}"]`);

test('a DIU student gets the calculator, the playground and DIU\'s buses, and nothing DIU has no data for', async ({ page }) => {
  await boot(page);
  // Both of the domains DIU's students sign in from are DIU.
  for (const email of ['rahim15-1234@diu.edu.bd', 'rahim@s.diu.edu.bd']) {
    await signInAs(page, email);
    for (const id of ['calculator', 'playground']) await expect(tab(page, id)).toHaveJSProperty('hidden', false);
    for (const id of ['planner', 'routine', 'tasks', 'reviews', 'difficulty', 'papers', 'seats', 'freerooms', 'campus', 'groups']) {
      await expect(tab(page, id)).toHaveJSProperty('hidden', true);
    }
    // Of the standalone pages DIU has one: Bus opens DIU's own routes, so the
    // link carries the campus. Lost & found is another campus's — and so is
    // the Campus Map, which is a tab (hidden with the others above).
    const bus = page.locator('#calcTabs [data-feature="bus"]');
    await expect(bus).toHaveJSProperty('hidden', false);
    await expect(bus).toHaveAttribute('href', 'bus/?campus=diu');
    await expect(page.locator('#calcTabs [data-feature="lostFound"]')).toHaveJSProperty('hidden', true);
  }
  await expect(page.locator('#calculator')).toContainText("DIU's exact grading scale");

  // A subdomain DIU's students are not known to use is not DIU: the page stays
  // on the default campus, as it does for any address it does not know.
  await signInAs(page, 'someone@student.diu.edu.bd');
  await expect(tab(page, 'seats')).toHaveJSProperty('hidden', false);
});

test('a DIU student picks from DIU programs and counts towards DIU totals', async ({ page }) => {
  await boot(page);
  await signInAs(page, 'rahim@s.diu.edu.bd');

  const labels = await page.locator('#deptSelect option').evaluateAll(options => options.map(o => o.textContent.trim()));
  expect(labels).toHaveLength(34); // the placeholder and DIU's 33 programs
  expect(labels).toContain('B. Sc. in Computer Science and Engineering');
  expect(labels).toContain('Bachelor of Pharmacy (B. Pharm)');
  expect(labels).not.toContain('B.Sc. in Computer Science (CS)');

  // A half-credit total, which neither other campus has.
  await page.locator('#deptSelect').selectOption('CSE');
  await expect(page.locator('#deptCreditsText')).toHaveText('154.5 Total Credits');
});

test('with no catalogue to read them from, a DIU student types a course and its credits', async ({ page }) => {
  await boot(page);
  // Demo mode is the quickest way to a semester with course rows.
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#course-input-0-0')).toHaveValue(/CSE110/);
  // On BRACU credits are the catalogue's, and not a field.
  await expect(page.locator('#sem-0 input.credits-typed')).toHaveCount(0);
  await expect(page.locator('#importPdfBtn')).toBeVisible();
  await expect(page.locator('#minorTrackerBox')).toBeVisible();

  await signInAs(page, 'rahim15-1234@diu.edu.bd');
  // The same letters, scored on DIU's quarter points: A- A B+, then B+ A- B.
  await expect(page.locator('#cgpaVal')).toHaveText('3.38');
  // BRAC University's minors, and its transcript reader, are not DIU's.
  await expect(page.locator('#minorTrackerBox')).toBeHidden();
  await expect(page.locator('#importPdfBtn')).toBeHidden();

  // A course DIU offers, which no catalogue here knows.
  await page.locator('#sem-0 .btn-add-course').click();
  const name = page.locator('#course-input-0-3');
  await name.fill('CSE228');
  await name.blur();
  await expect(page.locator('#course-input-0-3')).toHaveValue('CSE228');

  // It starts at three credits, graded — not a 0-credit pass/fail row.
  const row = page.locator('#sem-0 .course-row', { has: page.locator('#course-input-0-3') });
  await expect(row.locator('input.credits-typed')).toHaveValue('3');
  await expect(row.locator('select.pf-select')).toHaveCount(0);

  // A lab is one and a half.
  await row.locator('input.credits-typed').fill('1.5');
  await row.locator('input.credits-typed').blur();
  await expect(row.locator('input.credits-typed')).toHaveValue('1.5');

  // 3.75 is an A at DIU; BRACU's scale has no such point.
  const grade = row.locator('input[data-action="render:autoDetectGrade"]');
  await grade.fill('3.75');
  await grade.blur();
  await expect(row.locator('.grade-letter')).toHaveText('A');
  // 10.5 × 3 + 3.75 × 1.5 in the first semester and 9.75 × 3 in the second, over 19.5 credits.
  await expect(page.locator('#cgpaVal')).toHaveText('3.40');

  // Nonsense in the credits field is put back, not saved.
  await row.locator('input.credits-typed').fill('lots');
  await row.locator('input.credits-typed').blur();
  await expect(row.locator('input.credits-typed')).toHaveValue('1.5');

  // What was typed survives a reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#deptSelect')).toBeVisible();
  await signInAs(page, 'rahim15-1234@diu.edu.bd');
  await expect(page.locator('#course-input-0-3')).toHaveValue('CSE228');
  await expect(row.locator('input.credits-typed')).toHaveValue('1.5');
  await expect(page.locator('#cgpaVal')).toHaveText('3.40');
});
