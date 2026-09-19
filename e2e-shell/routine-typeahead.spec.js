// e2e-shell/routine-typeahead.spec.js
//
// #698: the course picker as a combobox. The shell's placeholder has always
// said "start typing for matches" while showing none — on a feed of ~2000
// sections, knowing a code exists was the student's problem.
//
// Legacy's rules, mirrored: two characters before anything is offered (one
// letter is not a search), at most eight, arrows wrap, Enter takes the
// highlight when there is one and the typed text otherwise, Escape clears the
// query rather than just hiding its shadow.

import { expect, test } from '../e2e-support/authFixture.js';

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day) => ({
      sectionId,
      courseCode,
      courseName: `${courseCode} — Course Title`,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName: '07A-01C',
      faculties: 'ABC',
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY'),
          section(2, 'CSE110', '02', 'MONDAY'),
          section(3, 'CSE111', '01', 'TUESDAY'),
          section(4, 'CSE220', '01', 'WEDNESDAY'),
          section(5, 'MAT110', '01', 'THURSDAY'),
        ],
      }),
    );
  });
}

async function gotoRoutine(page) {
  await seedFeed(page);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  return page.getByTestId('routine-course-input');
}

const options = (page) => page.getByTestId('routine-suggestions').locator('[role="option"]');

test('one character is not a search; two offers matches', async ({ page }) => {
  const input = await gotoRoutine(page);

  await input.fill('C');
  await expect(page.getByTestId('routine-suggestions')).toHaveCount(0);

  await input.fill('CS');
  await expect(options(page)).toHaveCount(3); // CSE110, CSE111, CSE220
  await expect(page.getByTestId('routine-suggest-CSE110')).toContainText('2 sections');
  await expect(page.getByTestId('routine-suggest-CSE111')).toContainText('1 section');
});

test('the prefix narrows, and a miss says so rather than going blank', async ({ page }) => {
  const input = await gotoRoutine(page);

  await input.fill('CSE11');
  await expect(options(page)).toHaveCount(2);

  await input.fill('ZZZ');
  await expect(options(page)).toHaveCount(0);
  await expect(page.getByTestId('routine-suggest-none')).toContainText('No course matches "ZZZ"');
});

test('clicking a match adds that course and clears the query', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('CSE2');
  await page.getByTestId('routine-suggest-CSE220').click();

  await expect(page.getByTestId('routine-course-CSE220')).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('routine-suggestions')).toHaveCount(0);
});

test('arrows move the highlight, wrap, and Enter takes it', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('CS');
  await input.press('ArrowDown');

  // The highlight is announced to screen readers, not just painted.
  await expect(input).toHaveAttribute('aria-activedescendant', 'routine-sugg-0');
  await expect(options(page).first()).toHaveAttribute('aria-selected', 'true');

  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'routine-sugg-2');
  await input.press('ArrowDown'); // wraps back to the top
  await expect(input).toHaveAttribute('aria-activedescendant', 'routine-sugg-0');
  await input.press('ArrowUp'); // and backwards from the top
  await expect(input).toHaveAttribute('aria-activedescendant', 'routine-sugg-2');

  await input.press('Enter');
  await expect(page.getByTestId('routine-course-CSE220')).toBeVisible();
});

test('Enter with nothing highlighted still adds what was typed', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('MAT110');
  await input.press('Enter');
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();
});

test('typing again drops a stale highlight', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('CS');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'routine-sugg-0');

  // The old highlight pointed at CSE110; Enter must not add it now.
  await input.fill('MAT110');
  await expect(input).not.toHaveAttribute('aria-activedescendant', /routine-sugg/);
  await input.press('Enter');
  await expect(page.getByTestId('routine-course-MAT110')).toBeVisible();
  await expect(page.getByTestId('routine-course-CSE110')).toHaveCount(0);
});

test('Escape clears the query, not just the list', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('CSE');
  await expect(options(page)).toHaveCount(3);

  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('routine-suggestions')).toHaveCount(0);
});

test('a typed code that does not exist still reports the error it always did', async ({ page }) => {
  const input = await gotoRoutine(page);
  await input.fill('ZZZ999');
  await input.press('Enter');
  await expect(page.getByTestId('routine-add-error')).toContainText('No course "ZZZ999"');
});
