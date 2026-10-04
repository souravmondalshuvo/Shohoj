// The legacy calculator reads courses and programs from the active campus's
// catalogue (js/core/activeCatalog.js).
//
// Legacy sign-in still admits BRACU accounts only, so no real NSU student
// reaches this yet. The specs stand in for one through the seam the auth layer
// publishes identity on — window._shohoj_userProfile and the
// shohoj:auth-changed event — which is what js/core/activeCampus.js reads.

import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

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
    // Auth is settled from the start, so the sign-in gate reveals the
    // calculator at once rather than on its four-second fallback.
    window._shohoj_isAuthReady = () => true;
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#deptSelect')).toBeVisible();
}

/** Become a signed-in student with this email, or signed out for null. */
async function signInAs(page, email) {
  await page.evaluate(address => {
    window._shohoj_userProfile = () => ({ signedIn: address !== null, email: address });
    // The Reviews tab asks for a uid, separately from the profile.
    window._shohoj_currentUid = () => (address === null ? null : 'e2e-student');
    window.dispatchEvent(new Event('shohoj:auth-changed'));
  }, email);
}

const programLabels = page =>
  page.locator('#deptSelect option').evaluateAll(options => options.map(o => o.textContent.trim()));

/** Add a course row to the first semester, type a code and leave the field. */
async function typeCourse(page, row, code) {
  await page.locator('#sem-0 .btn-add-course').click();
  const input = page.locator(`#course-input-0-${row}`);
  await input.fill(code);
  await input.blur();
  return input;
}

test('a BRACU student keeps the program list and the catalogue as shipped', async ({ page }) => {
  await boot(page);
  const shipped = await page.locator('#deptSelect').innerHTML();

  await signInAs(page, '21301234@g.bracu.ac.bd');
  expect(await page.locator('#deptSelect').innerHTML()).toBe(shipped);
  expect(await programLabels(page)).toContain('B.Sc. in Computer Science and Engineering (CSE)');

  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#course-input-0-0')).toHaveValue(/CSE110/);
  await expect(await typeCourse(page, 3, 'CSE221')).toHaveValue('Algorithms (CSE221)');
  expect(await page.evaluate(() => window._shohoj_isKnownCourse('CSE110'))).toBe(true);
});

test('an NSU student picks from NSU programs', async ({ page }) => {
  await boot(page);
  await signInAs(page, 'first.last@northsouth.edu');

  const labels = await programLabels(page);
  expect(labels[0]).toBe('— Select your department —');
  expect(labels).toHaveLength(26); // the placeholder and NSU's 25 programs
  expect(labels).toContain('BS in Computer Science & Engineering');
  expect(labels).toContain('Bachelor of Architecture');
  expect(labels).not.toContain('B.Sc. in Computer Science (CS)');
  expect(labels.slice(1)).toEqual([...labels.slice(1)].sort((a, b) => a.localeCompare(b)));

  // Choosing one reads NSU's total, not BRACU's 136 for the same code.
  await page.locator('#deptSelect').selectOption('CSE');
  await expect(page.locator('#deptCreditsText')).toHaveText('130 Total Credits');
});

test('an NSU student searches NSU courses, and BRACU-only codes are not offered', async ({ page }) => {
  await boot(page);
  // Demo mode is the quickest way to a semester with course rows.
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#course-input-0-0')).toHaveValue(/CSE110/);
  await signInAs(page, 'first.last@northsouth.edu');

  // NSU's own CSE115 resolves to its title...
  await expect(await typeCourse(page, 3, 'CSE115')).toHaveValue('Programming Language I (CSE115)');
  // ...and BRACU's CSE221, which resolved a moment ago for BRACU, does not.
  await expect(await typeCourse(page, 4, 'CSE221')).toHaveValue('CSE221');

  expect(await page.evaluate(() => [
    window._shohoj_isKnownCourse('CSE115'),
    window._shohoj_isKnownCourse('CSE110'),
    window._shohoj_courseCatalog.some(c => c.code === 'CSE115'),
    window._shohoj_courseCatalog.some(c => c.code === 'CSE110'),
  ])).toEqual([true, false, true, false]);

  // Both campuses have a CSE program; the badge follows the campus.
  await expect(page.locator('#deptCreditsText')).toHaveText('130 Total Credits');
});

test('the program list returns with the campus, and a program it lacks is kept for later', async ({ page }) => {
  await boot(page);
  // Option for option, attributes included; the whitespace between them in
  // index.html is not part of the list.
  const options = () =>
    page.locator('#deptSelect option').evaluateAll(list => list.map(o => o.outerHTML));
  const shipped = await options();

  // BRACU's B.Sc. in Computer Science (CS) has no NSU counterpart.
  await page.locator('#deptSelect').selectOption('CS');
  await expect(page.locator('#deptCredits')).toBeVisible();

  // On NSU it is not shown as chosen...
  await signInAs(page, 'first.last@northsouth.edu');
  await expect(page.locator('#deptSelect')).toHaveValue('');
  await expect(page.locator('#deptCredits')).toBeHidden();

  // ...but it is not forgotten: back on BRACU the list and the choice return.
  await signInAs(page, null);
  expect(await options()).toEqual(shipped);
  expect(shipped).toHaveLength(19);
  await expect(page.locator('#deptSelect')).toHaveValue('CS');
  await expect(page.locator('#deptCreditsText')).toHaveText('124 Total Credits');
  await expect(page.locator('#deptCredits')).toBeVisible();
});

test("an NSU-only program survives the moment before sign-in resolves", async ({ page }) => {
  await boot(page);
  const seasons = () =>
    page.locator('#startSeason option').evaluateAll(list => list.map(o => o.value).filter(Boolean));

  // An NSU student chooses LLB, which runs on NSU's two-term calendar.
  await signInAs(page, 'first.last@northsouth.edu');
  await page.locator('#deptSelect').selectOption('LLB');
  await expect(page.locator('#deptCreditsText')).toHaveText('130 Total Credits');
  expect(await seasons()).toEqual(['Spring', 'Summer']);

  // Every page load starts on BRACU's catalogue until sign-in resolves, and
  // BRACU has no LLB. The choice must not be cleared in that gap...
  await signInAs(page, null);
  await expect(page.locator('#deptSelect')).toHaveValue('');
  await expect(page.locator('#deptCredits')).toBeHidden();
  // ...and "Let's go" on a program this campus lacks does nothing, not crash.
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.evaluate(() => document.getElementById('startSemConfirmBtn')?.click());
  expect(errors).toEqual([]);

  // ...so that when it resolves, the program, its total and its calendar are back.
  await signInAs(page, 'first.last@northsouth.edu');
  await expect(page.locator('#deptSelect')).toHaveValue('LLB');
  await expect(page.locator('#deptCreditsText')).toHaveText('130 Total Credits');
  await expect(page.locator('#deptCredits')).toBeVisible();
  expect(await seasons()).toEqual(['Spring', 'Summer']);
});

test('an admin switching campus redraws the tab that is open', async ({ page }) => {
  await boot(page);
  // The admin's switcher (#807) changes the campus without any auth event, so
  // nothing but shohoj:campus-changed tells the open tab its content is stale.
  await page.evaluate(() => { window._shohoj_isAdmin = () => true; });
  await signInAs(page, 'admin@g.bracu.ac.bd');
  await selectCalcTab(page, 'reviews');
  await expect(page.locator('#tabReviews .rv-tab-deptcard')).toHaveCount(12);

  // NSU's catalogue has no department table, so the same view has no tiles.
  await page.getByTestId('admin-campus-switcher').selectOption('nsu');
  await expect(page.locator('#tabReviews')).toHaveClass(/active/);
  await expect(page.locator('#tabReviews .rv-tab-deptcard')).toHaveCount(0);

  await page.getByTestId('admin-campus-switcher').selectOption('bracu');
  await expect(page.locator('#tabReviews .rv-tab-deptcard')).toHaveCount(12);
});
