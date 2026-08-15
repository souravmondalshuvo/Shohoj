// e2e-shell/papers.spec.js
//
// #440: the past-papers library on the React Router shell's /papers route,
// migrated from the legacy papersTab.js. Uses the injected-seam pattern
// (lost-found parity):
//   window.__shohojPapersIdentity — signed-in stand-in ({uid,email})
//   window.__shohojPapersRepo     — repo fake over an in-page array

import { expect, test } from '../e2e-support/authFixture.js';

function seed(page, { failLoad = false } = {}) {
  return page.addInitScript(({ failLoad }) => {
    const now = Date.now();
    const papers = [
      { id: 'p1', courseCode: 'CSE110', type: 'midterm', title: 'Fall 2025 midterm', semester: 'Fall 2025', facultyInitials: 'ABC', size: 245760, createdAtMs: now - 86_400_000 },
      { id: 'p2', courseCode: 'CSE110', type: 'notes', title: 'Week 3 recursion notes', size: 51200, createdAtMs: now - 3_600_000 },
      { id: 'p3', courseCode: 'MAT110', type: 'final', title: 'Spring 2026 final', createdAtMs: now - 60_000 },
    ];
    window.__shohojPapersUploads = [];
    window.__shohojPapersReports = [];
    window.__shohojPapersIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    window.__shohojPapersRepo = {
      async listRecent() {
        if (failLoad) throw new Error('missing index');
        return papers.slice();
      },
      async listByCourse(code) {
        if (failLoad) throw new Error('missing index');
        return papers.filter((p) => p.courseCode === code);
      },
      async downloadUrl(paperId) {
        // A tiny valid PDF-ish blob URL so preview/download have a real target.
        const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
        window.__shohojLastDownload = paperId;
        return URL.createObjectURL(blob);
      },
      async upload(payload) {
        window.__shohojPapersUploads.push({ courseCode: payload.courseCode, type: payload.type, title: payload.title });
        return { ok: true, id: 'new1' };
      },
      async report(paperId, reason, uid) {
        window.__shohojPapersReports.push({ paperId, reason, uid });
      },
    };
  }, { failLoad });
}

async function gotoPapers(page) {
  await page.goto('/papers', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('papers-page')).toBeVisible();
}

test('signed out shows the sign-in prompt', async ({ page }) => {
  await gotoPapers(page);
  await expect(page.getByTestId('papers-signin')).toBeVisible();
  await expect(page.getByTestId('papers-search')).toHaveCount(0);
});

test('recent list renders; course search narrows; type filter works', async ({ page }) => {
  await seed(page);
  await gotoPapers(page);

  const items = page.locator('[data-testid^="papers-item-"]');
  await expect(items).toHaveCount(3);

  // Full course code → repo course query.
  await page.getByTestId('papers-search').fill('cse110');
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('papers-item-p1')).toContainText('Fall 2025 midterm');

  // Type filter narrows further.
  await page.getByTestId('papers-filter-notes').click();
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId('papers-item-p2')).toBeVisible();

  // No matches → empty state names the query.
  await page.getByTestId('papers-filter-final').click();
  await expect(page.getByTestId('papers-empty')).toContainText('CSE110');
});

test('load failure shows the retry state, retry recovers', async ({ page }) => {
  await seed(page, { failLoad: true });
  await gotoPapers(page);
  await expect(page.getByTestId('papers-load-error')).toBeVisible();

  // Swap in a working repo, then retry.
  await page.evaluate(() => {
    window.__shohojPapersRepo.listRecent = async () => [
      { id: 'p9', courseCode: 'CSE110', type: 'quiz', title: 'Quiz 2', createdAtMs: Date.now() },
    ];
  });
  await page.getByTestId('papers-retry').click();
  await expect(page.getByTestId('papers-item-p9')).toBeVisible();
});

test('upload form validates against the catalog and posts through the repo', async ({ page }) => {
  await seed(page);
  await gotoPapers(page);
  await page.getByTestId('papers-upload-toggle').click();

  // A file + unknown course → catalog validation error.
  await page.getByTestId('papers-file').setInputFiles({
    name: 'mid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
  });
  await page.getByTestId('papers-course').fill('ZZZ999');
  await page.getByTestId('papers-title').fill('Some midterm');
  await page.getByTestId('papers-upload-send').click();
  await expect(page.getByTestId('papers-upload-error')).toContainText('Unknown course code');

  // A known course goes through and closes the form.
  await page.getByTestId('papers-course').fill('CSE110');
  await page.getByTestId('papers-upload-send').click();
  await expect(page.getByTestId('papers-upload-form')).toHaveCount(0);
  const uploads = await page.evaluate(() => window.__shohojPapersUploads);
  expect(uploads).toEqual([{ courseCode: 'CSE110', type: 'midterm', title: 'Some midterm' }]);
});

test('report box submits a reason and marks the paper reported', async ({ page }) => {
  await seed(page);
  await gotoPapers(page);

  await page.getByTestId('papers-report-p1').click();
  await page.getByTestId('papers-report-box').getByRole('textbox').fill('Wrong course');
  await page.getByTestId('papers-report-send').click();

  await expect(page.getByTestId('papers-report-p1')).toHaveText('Reported');
  await expect(page.getByTestId('papers-report-p1')).toBeDisabled();
  const reports = await page.evaluate(() => window.__shohojPapersReports);
  expect(reports).toEqual([{ paperId: 'p1', reason: 'Wrong course', uid: 'u_me' }]);
});

test('preview asks the repo for the object URL', async ({ page }) => {
  await seed(page);
  await gotoPapers(page);
  await page.getByTestId('papers-preview-p2').click();
  await expect
    .poll(() => page.evaluate(() => window.__shohojLastDownload))
    .toBe('p2');
});
