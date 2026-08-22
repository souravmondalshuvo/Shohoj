// e2e-shell/calculator-transcript-import.spec.js
//
// #323: transcript import on the React Router shell's /calculator route,
// against the built dist-shell/ output. window.pdfjsLib is stubbed via
// addInitScript (the on-demand loader short-circuits on an existing global),
// returning positioned text items that flatten into a fixture transcript —
// the real pinned CDN build is exercised only by the failure test, which
// blocks the CDN and asserts the legacy error copy.

import { expect, test } from '../e2e-support/authFixture.js';

// One positioned item per transcript line; y falls 20 per row so the
// flattener breaks rows exactly like a real grade sheet.
const TRANSCRIPT_LINES = [
  'PROGRAM: B.Sc. in Computer Science and Engineering',
  'STUDENT ID: 21101234',
  'SEMESTER: FALL 2022',
  'CSE110 Programming Language I 3.00 A 4.00',
  'MAT110 Differential Calculus 3.00 B+ 3.30',
  'SEMESTER: SPRING 2023',
  'CSE111 Programming Language II 3.00 B 3.00',
];

function stubPdfJs(page, lines) {
  return page.addInitScript((textLines) => {
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({
              items: textLines.map((str, i) => ({
                str,
                transform: [1, 0, 0, 1, 10, 700 - i * 20],
                width: str.length * 5,
              })),
            }),
          }),
        }),
      }),
    };
  }, lines);
}

async function openCalculator(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
}

async function chooseTranscript(page, trigger) {
  const chooserPromise = page.waitForEvent('filechooser');
  await trigger.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'transcript.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-stub'), // content irrelevant — pdfjsLib is stubbed
  });
}

test('a transcript imports end to end: confirm dialog, state, setup, persistence', async ({ page }) => {
  await stubPdfJs(page, TRANSCRIPT_LINES);
  await openCalculator(page);
  const container = page.locator('#semestersContainer');

  await chooseTranscript(page, container.getByRole('button', { name: '📄 Import Transcript' }));

  const dialog = page.getByTestId('transcript-import-dialog');
  await expect(dialog.getByRole('heading', { name: /Transcript Parsed/ })).toBeVisible();
  await expect(dialog.getByText('Found 2 semesters and 3 courses')).toBeVisible();
  const rows = dialog.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('Fall 2022');
  await expect(rows.nth(0)).toContainText('2 courses');
  await expect(rows.nth(0)).toContainText('2 graded');
  await expect(rows.nth(1)).toContainText('Spring 2023');
  await expect(dialog.getByText(/Department detected:/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Import Now' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Imported 2 semesters from your transcript.')).toBeVisible();

  // Semesters render with the catalogue-canonical course names.
  await expect(container.locator('.semester-label').nth(0)).toHaveText('Fall 2022');
  await expect(container.locator('.semester-label').nth(1)).toHaveText('Spring 2023');
  await expect(container.getByRole('combobox').first()).toHaveValue('Programming Language I (CSE110)');

  // Detected department + start semester land in the setup controls.
  const setup = page.getByTestId('calculator-setup');
  await expect(setup.getByLabel('Select your department')).toHaveValue('CSE');
  await expect(setup.getByLabel('Starting semester season')).toHaveValue('Fall');
  await expect(setup.getByLabel('Starting semester year')).toHaveValue('2022');

  // And it persists like any other edit.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#semestersContainer').locator('.semester-label').nth(1)).toHaveText('Spring 2023');
  await expect(page.getByTestId('calculator-setup').getByLabel('Select your department')).toHaveValue('CSE');
});

test('Cancel keeps the calculator untouched', async ({ page }) => {
  await stubPdfJs(page, TRANSCRIPT_LINES);
  await openCalculator(page);
  const container = page.locator('#semestersContainer');

  await chooseTranscript(page, container.getByRole('button', { name: '📄 Import Transcript' }));
  const dialog = page.getByTestId('transcript-import-dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(container.getByText('Ready to go!')).toBeVisible(); // still the empty state
});

test('an unparseable PDF shows the could-not-parse dialog', async ({ page }) => {
  await stubPdfJs(page, ['Just some random text', 'with no semesters in it']);
  await openCalculator(page);
  const container = page.locator('#semestersContainer');

  await chooseTranscript(page, container.getByRole('button', { name: '📄 Import Transcript' }));

  const dialog = page.getByTestId('transcript-import-dialog');
  await expect(dialog.getByRole('heading', { name: /Could not parse transcript/ })).toBeVisible();
  await expect(dialog.getByText(/BRACU official grade sheet PDF/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('pdf.js unavailable surfaces the legacy connection error', async ({ page }) => {
  // No stub — and the pinned CDN is unreachable.
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await openCalculator(page);
  const container = page.locator('#semestersContainer');

  await chooseTranscript(page, container.getByRole('button', { name: '📄 Import Transcript' }));

  const dialog = page.getByTestId('transcript-import-dialog');
  await expect(dialog.getByRole('heading', { name: /Import failed/ })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveText('PDF.js not loaded. Check your connection.');
});

test('the simulator nudge and the footer both open the shared picker', async ({ page }) => {
  await stubPdfJs(page, TRANSCRIPT_LINES);
  await openCalculator(page);
  const container = page.locator('#semestersContainer');

  // Summary-only data → the simulator nudge renders.
  await container.getByRole('button', { name: '📊 Start from CGPA' }).click();
  await container.getByPlaceholder('e.g. 3.30').fill('3.00');
  await container.getByPlaceholder('e.g. 45').fill('60');
  await container.getByPlaceholder('e.g. 42').fill('60');
  await container.getByRole('button', { name: 'Confirm →' }).click();

  const sim = page.getByTestId('cgpa-simulator');
  await sim.getByLabel('Target CGPA:').fill('3.2');
  await sim.getByLabel('Credits remaining:').fill('30');
  const nudge = page.getByTestId('sim-nudge');
  await expect(nudge).toBeVisible();

  const chooserPromise = page.waitForEvent('filechooser');
  await nudge.getByRole('button', { name: '📄 Import Transcript' }).click();
  await chooserPromise; // resolves ⇒ the nudge opened the picker

  // The footer trigger appears once a non-summary semester exists.
  await container.getByRole('button', { name: '+ Add Semester' }).click();
  const footerChooser = page.waitForEvent('filechooser');
  await page.locator('.footer-btn-group').getByRole('button', { name: '📄 Import Transcript' }).click();
  await footerChooser;
});
