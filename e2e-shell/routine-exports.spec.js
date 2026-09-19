// e2e-shell/routine-exports.spec.js
//
// #690: taking a routine off the page — share link, QR, PNG, calendar — and
// the half everyone forgets, opening a link someone else made.
//
// The builders are unit-tested and the two PNG painters are held together by
// tests/routineExportPainter.test.js. What these drive is the wiring and the
// rules that protect a real routine from a stale link: a payload is applied
// once, validated against the live feed, and never re-applied on refresh.

import { expect, test } from '../e2e-support/authFixture.js';

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName: '07A-01C',
      faculties: 'ABC',
      sectionSchedule: {
        classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }],
        midExamDate: '2026-07-26',
        midExamStartTime: '11:00:00',
        midExamEndTime: '13:00:00',
      },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY'),
          section(2, 'CSE110', '02', 'MONDAY'),
          section(3, 'MAT110', '01', 'TUESDAY'),
        ],
      }),
    );
  });
}

// Clipboard permissions vary by browser; the spec is about what we hand the
// clipboard, so the write is recorded instead.
function stubClipboard(page) {
  return page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copied.push(text);
          return Promise.resolve();
        },
      },
    });
  });
}

async function gotoRoutine(page, { search = '' } = {}) {
  await seedFeed(page);
  await stubClipboard(page);
  await page.goto(`/routine${search}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
}

async function addAndPick(page, code, sectionName) {
  await page.getByTestId('routine-course-input').fill(code);
  await page.getByTestId('routine-add-btn').click();
  const course = page.getByTestId(`routine-course-${code}`);
  await expect(course).toBeVisible();
  if (sectionName) await course.getByText(`Section ${sectionName}`).click();
}

test('the exports appear only when there is something to export', async ({ page }) => {
  await gotoRoutine(page);
  // Nothing picked: no toolbar at all, which is what keeps the empty state
  // identical to the parity baseline.
  await expect(page.getByTestId('routine-share')).toHaveCount(0);
  await expect(page.getByTestId('routine-export-png')).toHaveCount(0);

  await addAndPick(page, 'CSE110');
  // A course with no section chosen can be shared, but there is no schedule
  // yet to put in a calendar or an image.
  await expect(page.getByTestId('routine-share')).toBeVisible();
  await expect(page.getByTestId('routine-qr-toggle')).toBeVisible();
  await expect(page.getByTestId('routine-calendar')).toHaveCount(0);

  await page.getByTestId('routine-course-CSE110').getByText('Section 01').click();
  await expect(page.getByTestId('routine-calendar')).toBeVisible();
  await expect(page.getByTestId('routine-export-png')).toBeVisible();
});

test('share copies a link that encodes the picks', async ({ page }) => {
  await gotoRoutine(page);
  await addAndPick(page, 'CSE110', '02');
  await page.getByTestId('routine-share').click();

  await expect(page.getByTestId('routine-share-note')).toContainText('Link copied');
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain('?routine=');
  expect(decodeURIComponent(copied[0])).toContain('CSE110');
});

test('a shared link opens the routine it encodes, once', async ({ page }) => {
  // Make a link in one visit…
  await gotoRoutine(page);
  await addAndPick(page, 'CSE110', '02');
  await addAndPick(page, 'MAT110', '01');
  const [url] = await page.evaluate(async () => {
    document.querySelector('[data-testid="routine-share"]').click();
    return window.__copied;
  });

  // …then arrive fresh with it, as the person it was sent to.
  await page.evaluate(() => localStorage.removeItem('shohoj_routine_picks_v1'));
  await gotoRoutine(page, { search: new URL(url).search });

  await expect(page.getByTestId('routine-share-note')).toContainText('shared routine');
  await expect(
    page.getByTestId('routine-course-CSE110').locator('.routine-section--picked'),
  ).toContainText('Section 02');
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();

  // The payload is stripped, so an edit now survives a refresh instead of
  // being overwritten by the link that opened the page.
  await expect(page).toHaveURL(/\/routine$/);
  await page.getByTestId('routine-course-CSE110').getByText('Section 01').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByTestId('routine-course-CSE110').locator('.routine-section--picked'),
  ).toContainText('Section 01');
});

test('a link naming courses the feed no longer has leaves the routine alone', async ({ page }) => {
  await gotoRoutine(page);
  await addAndPick(page, 'MAT110', '01');
  await expect(page.getByTestId('routine-controls')).toContainText('1/1 set');

  // GONE101 is not in the feed, so nothing in the payload survives validation.
  await gotoRoutine(page, { search: '?routine=GONE101:999' });
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();
  await expect(page.getByTestId('routine-course-GONE101')).toHaveCount(0);
  await expect(page.getByTestId('routine-share-note')).toHaveCount(0);
});

test('the QR panel renders a scannable code of the same link', async ({ page }) => {
  await gotoRoutine(page);
  await addAndPick(page, 'CSE110', '01');

  await expect(page.getByTestId('routine-qr-panel')).toHaveCount(0);
  await page.getByTestId('routine-qr-toggle').click();
  const panel = page.getByTestId('routine-qr-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('svg')).toBeVisible();
  // Geometry only — no text from the payload reaches the markup.
  await expect(panel.locator('svg')).not.toContainText('routine=');

  await page.getByTestId('routine-qr-toggle').click();
  await expect(page.getByTestId('routine-qr-panel')).toHaveCount(0);
});

test('add to calendar downloads an .ics of the classes and exams', async ({ page }) => {
  await gotoRoutine(page);
  await addAndPick(page, 'CSE110', '01');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('routine-calendar').click(),
  ]);
  expect(download.suggestedFilename()).toBe('shohoj-routine.ics');

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const ics = Buffer.concat(chunks).toString('utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('CSE110');
  expect(ics).toContain('BEGIN:VALARM'); // the reminder is the point of the file
});

test('export PNG downloads an image of the grid', async ({ page }) => {
  await gotoRoutine(page);
  await addAndPick(page, 'CSE110', '01');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('routine-export-png').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^shohoj-routine.*\.png$/);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  // A real PNG, not an empty or truncated file: magic bytes, and big enough to
  // be a painted grid rather than a blank canvas.
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(png.byteLength).toBeGreaterThan(5000);
});
