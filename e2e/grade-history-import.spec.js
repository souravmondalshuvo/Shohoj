// An NSU student imports their grades by pasting the RDS Grade History page
// (#843). NSU has no grade-sheet PDF, so "Import Transcript" opens a paste box
// for them; a BRACU student still gets the file picker.
//
// The pasted page below is constructed to the layout described in
// tests/gradeHistoryImport.test.js — not captured from RDS.

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
    // Auth is settled from the start, so the sign-in gate reveals the
    // calculator at once rather than on its four-second fallback.
    window._shohoj_isAuthReady = () => true;
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#deptSelect')).toBeVisible();
}

async function signInAs(page, email) {
  await page.evaluate(address => {
    window._shohoj_userProfile = () => ({ signedIn: true, email: address });
    window._shohoj_currentUid = () => 'e2e-student';
    window.dispatchEvent(new Event('shohoj:auth-changed'));
  }, email);
}

const ROWS = [
  ['Spring', '2025', 'ENG102', '3', 'Introduction to Composition', 'A', '3'],
  ['', '', 'MAT116', '3', 'Pre-Calculus', 'C', '3'],
  ['', '', 'CSE115L', '0', 'Programming Language I Lab', 'A', '0'],
  null, // TGPA 3.00 / CGPA 3.00
  ['Summer', '2025', 'MAT116', '3', 'Pre-Calculus', 'A-', '3'],
  ['', '', 'BUS112', '3', 'Intro to Business Mathematics', 'W', '0'],
  ['', '', 'PHY107', '3', 'Physics I', 'B+', '3'],
  null, // TGPA 3.50 / CGPA 3.67
];
const SUMMARIES = [['3.00', '3.00'], ['3.50', '3.67']];
const HEADERS = ['Semester Name', 'Semester Year', 'Course Code', 'Course Credit', 'Course Title', 'Course Grade', 'Cr.Count'];

/** The page as a browser puts it on the clipboard: a table inside page chrome. */
function pageHtml(cgpas = SUMMARIES) {
  let summary = 0;
  const body = ROWS.map(row => {
    if (row) return `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    const [tgpa, cgpa] = cgpas[summary++];
    return `<tr class="summary-row"><td colspan="7">TGPA: ${tgpa} &nbsp; CGPA: ${cgpa}</td></tr>`;
  }).join('');
  return `<div><table><tr><td>Home</td><td>Logout</td></tr></table>
    <h3>Grade History of 2012345642</h3>
    <table><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr>${body}</table></div>`;
}

/** The same page as plain text, for a clipboard that carried no HTML. */
function pageText() {
  let summary = 0;
  return [
    HEADERS.join('\t'),
    ...ROWS.map(row => {
      if (row) return row.join('\t');
      const [tgpa, cgpa] = SUMMARIES[summary++];
      return `TGPA: ${tgpa}\tCGPA: ${cgpa}`;
    }),
  ].join('\n');
}

async function pasteHtml(page, html) {
  await page.locator('#gradeHistoryPaste').evaluate((box, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'not the table');
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, html);
}

async function openPasteBox(page) {
  await boot(page);
  await signInAs(page, 'first.last@northsouth.edu');
  await page.locator('#deptSelect').selectOption('CSE');
  await page.locator('#importPdfBtn').click();
  await expect(page.locator('#gradeHistoryPaste')).toBeVisible();
}

test('a BRACU student still gets the PDF picker, not a paste box', async ({ page }) => {
  await boot(page);
  await signInAs(page, '21301234@g.bracu.ac.bd');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#importPdfBtn').click();
  await chooser;
  await expect(page.locator('#gradeHistoryPaste')).toHaveCount(0);
});

test('an NSU student pastes Grade History and gets their semesters and CGPA', async ({ page }) => {
  await openPasteBox(page);
  await pasteHtml(page, pageHtml());
  await page.getByRole('button', { name: 'Read my grades' }).click();

  const modal = page.locator('#importModalContent');
  await expect(modal).toContainText('Found 2 semesters and 6 courses.');
  await expect(modal.locator('tbody tr')).toHaveCount(2);
  await expect(modal.locator('tbody tr').nth(1)).toContainText('Summer 2025');
  await expect(modal.locator('tbody tr').nth(1)).toContainText('3.50');
  await expect(page.locator('#gradeHistoryCheck')).toHaveText('CGPA 3.67 — matches RDS.');

  await page.getByRole('button', { name: /Import Now/ }).click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.67');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_cgpa_v1')));
  expect(saved.semesters.map(s => s.name)).toEqual(['Spring 2025', 'Summer 2025']);
  // Titles as NSU's catalogue spells them; credits and grades as RDS has them.
  expect(saved.semesters[0].courses[2]).toMatchObject({ name: 'Programming Language I Lab (CSE115L)', credits: 0, grade: 'A' });
  expect(saved.semesters[1].courses[1]).toMatchObject({ credits: 3, grade: 'W' });
  // The page names no programme, so the one already chosen is kept.
  await expect(page.locator('#deptSelect')).toHaveValue('CSE');
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('shohoj_connect_profile_v1')));
  expect(profile.sid).toBe('2012345642');
});

test('a clipboard with no HTML is read from the pasted text', async ({ page }) => {
  await openPasteBox(page);
  await page.locator('#gradeHistoryPaste').fill(pageText());
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await expect(page.locator('#gradeHistoryCheck')).toHaveText('CGPA 3.67 — matches RDS.');
});

test('a CGPA that disagrees with RDS is said out loud before importing', async ({ page }) => {
  await openPasteBox(page);
  await pasteHtml(page, pageHtml([['3.00', '3.00'], ['3.50', '3.21']]));
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await expect(page.locator('#gradeHistoryCheck')).toHaveText(/works this out as 3\.67, but RDS shows 3\.21/);
});

test('a paste that is not the grade history is refused, and markup in it never runs', async ({ page }) => {
  await openPasteBox(page);
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await expect(page.locator('#gradeHistoryStatus')).toHaveText('Paste your Grade History page first.');

  await pasteHtml(page, '<p>Class Schedule</p><img src="x" onerror="window.__ghXss = 1">');
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await expect(page.locator('#gradeHistoryStatus')).toContainText('No grades could be read');

  const hostile = pageHtml().replace('Pre-Calculus', '<img src="x" onerror="window.__ghXss = 1">Pre-Calc');
  await pasteHtml(page, hostile);
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await expect(page.locator('#gradeHistoryCheck')).toBeVisible();
  await expect(page.locator('#importModalContent img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ghXss)).toBeUndefined();
});

test('nothing pasted is sent anywhere', async ({ page }) => {
  await openPasteBox(page);
  const requests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://localhost') && !request.url().startsWith('http://127.0.0.1')) requests.push(request.url());
  });
  await pasteHtml(page, pageHtml());
  await page.getByRole('button', { name: 'Read my grades' }).click();
  await page.getByRole('button', { name: /Import Now/ }).click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.67');
  expect(requests).toEqual([]);
});
