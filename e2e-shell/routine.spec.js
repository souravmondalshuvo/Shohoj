// e2e-shell/routine.spec.js
//
// #397: the weekly routine builder on the React Router shell's /routine route,
// migrated from the legacy routineTab.js. Seeds the CONNECT feed cache (same
// seam as campus-map.spec.js / a11y-routes.spec.js) so the route renders real
// sections without touching the network.
//
// Deterministic fixture: CSE110 has two sections on different days; PHY111 has
// one section that overlaps CSE110 §01 in time — so picking both surfaces a
// class clash, and repicking CSE110 to its Monday section clears it.

import { expect, test } from '../e2e-support/authFixture.js';

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, room, day) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName: room,
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', '07A-01C', 'SUNDAY'),
          section(2, 'CSE110', '02', '07B-11C', 'MONDAY'),
          section(3, 'PHY111', '01', '09G-31T', 'SUNDAY'),
        ],
      }),
    );
  });
}

async function gotoRoutine(page) {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  // The feed badge is legacy's now — source and age, e.g. "Cached · just now",
  // rather than a sentence counting sections (#582). The fixture seeds the
  // cache, so which of the two words appears depends on the fixture, not on
  // what this test is about.
  await expect(page.getByTestId('routine-feed-source')).toHaveText(/(Live|Cached) · /);
}

test('add a course, pick a section, and the weekly grid fills in', async ({ page }) => {
  await gotoRoutine(page);

  await page.getByTestId('routine-course-input').fill('cse110');
  await page.getByTestId('routine-add-btn').click();

  const course = page.getByTestId('routine-course-CSE110');
  await expect(course).toBeVisible();
  // No section picked yet → grid is absent, hint is shown.
  await expect(course.getByText('Pick a section above.')).toBeVisible();
  await expect(page.getByTestId('routine-grid')).toHaveCount(0);

  await course.getByRole('button', { name: /Section 01/ }).click();
  await expect(course.getByRole('button', { name: /Section 01/ })).toHaveAttribute('aria-pressed', 'true');

  const grid = page.getByTestId('routine-grid');
  await expect(grid).toBeVisible();
  await expect(grid.getByText('CSE110')).toBeVisible();
  await expect(page.getByTestId('routine-summary')).toContainText('1 course · 1 scheduled');
  await expect(page.getByTestId('routine-summary-ok')).toBeVisible();
});

test('overlapping picks are flagged as a clash and repicking clears it', async ({ page }) => {
  await gotoRoutine(page);

  for (const code of ['CSE110', 'PHY111']) {
    await page.getByTestId('routine-course-input').fill(code);
    await page.getByTestId('routine-add-btn').click();
  }

  // Both Sunday 8:00 sections → clash.
  await page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 01/ }).click();
  await page.getByTestId('routine-course-PHY111').getByRole('button', { name: /Section 01/ }).click();

  await expect(page.getByTestId('routine-summary-clash')).toBeVisible();
  await expect(page.getByTestId('routine-summary-clash')).toContainText('time');
  await expect(page.locator('.routine-block--clash').first()).toBeVisible();

  // Repick CSE110 to its Monday section → no more overlap.
  await page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 02/ }).click();
  await expect(page.getByTestId('routine-summary-clash')).toHaveCount(0);
  await expect(page.getByTestId('routine-summary-ok')).toBeVisible();
});

test('picks persist across a reload; clear all empties the routine', async ({ page }) => {
  await gotoRoutine(page);

  await page.getByTestId('routine-course-input').fill('CSE110');
  await page.getByTestId('routine-add-btn').click();
  await page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 01/ }).click();
  await expect(page.getByTestId('routine-grid')).toBeVisible();

  // Reload (feed reseeded by the init script) — the picked section survives.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();
  await expect(
    page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 01/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('routine-grid')).toBeVisible();

  await page.getByTestId('routine-clear').click();
  await expect(page.getByTestId('routine-empty')).toBeVisible();
  await expect(page.getByTestId('routine-grid')).toHaveCount(0);
});

test('adding an unknown course code surfaces an inline error', async ({ page }) => {
  await gotoRoutine(page);
  await page.getByTestId('routine-course-input').fill('ZZZ999');
  await page.getByTestId('routine-add-btn').click();
  await expect(page.getByTestId('routine-add-error')).toContainText('No course "ZZZ999"');
  await expect(page.getByTestId('routine-empty')).toBeVisible();
});

test('no horizontal overflow at 360px with the grid rendered', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await gotoRoutine(page);
  await page.getByTestId('routine-course-input').fill('CSE110');
  await page.getByTestId('routine-add-btn').click();
  await page.getByTestId('routine-course-CSE110').getByRole('button', { name: /Section 01/ }).click();
  await expect(page.getByTestId('routine-grid')).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows, 'routine route overflows at 360px').toBe(false);
});
