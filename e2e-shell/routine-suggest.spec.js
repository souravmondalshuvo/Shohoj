// e2e-shell/routine-suggest.spec.js
//
// #686: auto-suggest on the shell's /routine — the legacy tab's headline
// feature. The ranking itself is unit-tested (tests/routineSuggestions.test.js);
// these drive the wiring and the two claims a student would call a lie: that a
// suggestion never proposes a section the filters have ruled out, and that
// applying one sets every section it listed.

import { expect, test } from '../e2e-support/authFixture.js';

// CSE110: §01 Sun 08:00 (early), §02 Mon 11:00. MAT110: §01 Sun 08:00 — which
// clashes with CSE110 §01 — and §02 Mon 13:00, leaving exactly one clash-free
// pairing that survives an early filter.
function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day, start, end, seats) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: seats,
      roomName: '07A-01C',
      faculties: 'ABC',
      sectionSchedule: { classSchedules: [{ day, startTime: start, endTime: end }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY', '8:00', '9:20', 10),
          section(2, 'CSE110', '02', 'MONDAY', '11:00', '12:20', 10),
          section(3, 'MAT110', '01', 'SUNDAY', '8:00', '9:20', 10),
          section(4, 'MAT110', '02', 'MONDAY', '13:00', '14:20', 10),
        ],
      }),
    );
  });
}

async function gotoRoutineWith(page, ...codes) {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  for (const code of codes) {
    await page.getByTestId('routine-course-input').fill(code);
    await page.getByTestId('routine-add-btn').click();
    await expect(page.getByTestId(`routine-course-${code}`)).toBeVisible();
  }
}

test('nothing picked, nothing to suggest', async ({ page }) => {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  await expect(page.getByTestId('routine-suggest')).toHaveCount(0);
});

test('suggest ranks the clash-free combinations and counts what it searched', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'MAT110');
  await page.getByTestId('routine-suggest').click();

  const panel = page.getByTestId('routine-suggest-panel');
  await expect(panel).toBeVisible();
  // 2×2 enumerated; the Sunday/Sunday pairing clashes, so three survive.
  await expect(page.getByTestId('routine-suggest-meta')).toContainText(
    '3 feasible of 4 enumerated',
  );
  await expect(page.getByTestId('routine-suggest-card-0')).toBeVisible();
  // The top card is the compact one: CSE110 §02 and MAT110 §02 share Monday.
  await expect(page.getByTestId('routine-suggest-card-0')).toContainText('CSE110');
  await expect(page.getByTestId('routine-suggest-card-0')).toContainText('MAT110');
});

test('applying a combination sets every section and closes the panel', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'MAT110');
  await page.getByTestId('routine-suggest').click();

  const lines = await page
    .getByTestId('routine-suggest-card-0')
    .locator('.routine-suggest-line-sec')
    .allTextContents();
  await page.getByTestId('routine-suggest-apply-0').click();

  await expect(page.getByTestId('routine-suggest-panel')).toHaveCount(0);
  await expect(page.getByTestId('routine-controls')).toContainText('2/2 set');
  // Every section the card listed is the one now picked for its course.
  for (const [i, code] of ['CSE110', 'MAT110'].entries()) {
    const picked = page.getByTestId(`routine-course-${code}`).locator('.routine-section--picked');
    await expect(picked).toContainText(`Section ${lines[i].replace('§', '')}`);
  }
  await expect(page.getByTestId('routine-summary-ok')).toBeVisible();
});

test('a filter constrains the search, so no suggestion offers a hidden section', async ({
  page,
}) => {
  await gotoRoutineWith(page, 'CSE110', 'MAT110');
  await page.getByTestId('routine-filter-early').click();
  await page.getByTestId('routine-suggest').click();

  // Both 08:00 sections are ruled out, leaving one pairing of one combination.
  await expect(page.getByTestId('routine-suggest-meta')).toContainText(
    '1 feasible of 1 enumerated',
  );
  const card = page.getByTestId('routine-suggest-card-0');
  await expect(card).toContainText('§02');
  await expect(card).not.toContainText('§01');
});

test('a course with nothing left after filtering is named, not dropped', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'MAT110');
  // MAT110 meets only on Sunday and Monday; avoiding both empties it.
  await page.getByTestId('routine-avoid-SUNDAY').click();
  await page.getByTestId('routine-avoid-MONDAY').click();
  await page.getByTestId('routine-suggest').click();

  const skipped = page.getByTestId('routine-suggest-skipped');
  await expect(skipped).toContainText('CSE110');
  await expect(skipped).toContainText('MAT110');
});

test('the compact preference re-scores a panel that is already open', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110', 'MAT110');
  await page.getByTestId('routine-suggest').click();

  // The Monday pairing sits idle 12:20 → 13:00, so it is the card the
  // preference acts on: 40 idle minutes at 1.5/hour is a full point of score.
  const monday = page
    .getByTestId('routine-suggest-panel')
    .locator('.routine-suggest-card')
    .filter({ hasText: '40m gaps' });
  await expect(monday).toBeVisible();
  const penalised = await monday.locator('.routine-suggest-card-score').textContent();

  // Turning it off drops the penalty; the gap is still reported, not hidden.
  await page.getByTestId('routine-compact-days').click();
  await expect(page.getByTestId('routine-suggest-panel')).toBeVisible();
  const unpenalised = await monday.locator('.routine-suggest-card-score').textContent();
  expect(unpenalised).not.toEqual(penalised);
  await expect(monday).toContainText('40m gaps');
});

test('close puts the panel away without touching the picks', async ({ page }) => {
  await gotoRoutineWith(page, 'CSE110');
  await page.getByTestId('routine-suggest').click();
  await expect(page.getByTestId('routine-suggest-panel')).toBeVisible();
  await page.getByTestId('routine-suggest-close').click();
  await expect(page.getByTestId('routine-suggest-panel')).toHaveCount(0);
  await expect(page.getByTestId('routine-controls')).toContainText('0/1 set');
});
