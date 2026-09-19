// e2e-shell/routine-faculty-ratings.spec.js
//
// #688: the ★ badge on the shell's section list, and the two things that were
// inert without it — the Faculty ★ sort (#682) and auto-suggest's ranking
// (#686), which was scoring every faculty alike.
//
// The reviews feed comes from the same stubbed window.__shohojReviewsRepo the
// other review specs use. The aggregation is unit-tested; what these drive is
// the wiring, and the rule that matters when the feed is down: ratings are
// decoration, so their absence must never break the list.

import { expect, test } from '../e2e-support/authFixture.js';

// ABC rates excellent (4.6), XYZ badly (2.1), DEF has one review — low sample.
// GHI has none at all, so it must stay unbadged.
const review = (fac, score) => ({
  id: `${fac}_${score}_${Math.random()}`,
  facultyInitials: fac,
  courseCode: 'CSE110',
  ratings: { teaching: score, marking: score, behavior: score, difficulty: 3, workload: 3 },
  text: '',
});

const REVIEWS = [
  ...Array.from({ length: 6 }, () => review('ABC', 4.6)),
  ...Array.from({ length: 6 }, () => review('XYZ', 2.1)),
  review('DEF', 4.9),
];

function installReviews(page, reviews) {
  return page.addInitScript((seed) => {
    window.__shohojReviewsRepo = {
      async fetchByFaculty() {
        return { reviews: [], nextCursor: null };
      },
      async fetchByCourse() {
        return { reviews: [], nextCursor: null };
      },
      async fetchById() {
        return null;
      },
      async fetchRecent() {
        if (seed === null) throw new Error('reviews unavailable');
        return seed;
      },
      async fetchFacultyProfiles() {
        return [];
      },
    };
  }, reviews);
}

function seedFeed(page) {
  return page.addInitScript(() => {
    const section = (sectionId, courseCode, sectionName, day, faculty) => ({
      sectionId,
      courseCode,
      sectionName,
      capacity: 40,
      consumedSeat: 10,
      roomName: '07A-01C',
      faculties: faculty,
      sectionSchedule: { classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }] },
    });
    localStorage.setItem(
      'shohoj_connect_feed_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        etag: null,
        payload: [
          section(1, 'CSE110', '01', 'SUNDAY', 'XYZ'),
          section(2, 'CSE110', '02', 'MONDAY', 'ABC'),
          section(3, 'CSE110', '03', 'TUESDAY', 'GHI'),
          section(4, 'CSE110', '04', 'WEDNESDAY', 'DEF'),
        ],
      }),
    );
  });
}

async function gotoRoutine(page, { reviews = REVIEWS } = {}) {
  await seedFeed(page);
  await installReviews(page, reviews);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-page')).toBeVisible();
  await page.getByTestId('routine-course-input').fill('CSE110');
  await page.getByTestId('routine-add-btn').click();
  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();
}

const rowFor = (page, sectionName) =>
  page.getByTestId('routine-course-CSE110').locator('.routine-section', {
    hasText: `Section ${sectionName}`,
  });

test('each section carries its faculty rating, and an unrated one carries none', async ({
  page,
}) => {
  await gotoRoutine(page);

  await expect(rowFor(page, '02').getByTestId('routine-faculty-badge')).toContainText('4.6');
  await expect(rowFor(page, '01').getByTestId('routine-faculty-badge')).toContainText('2.1');
  // GHI has no reviews: no badge at all rather than an empty or zero one.
  await expect(rowFor(page, '03').getByTestId('routine-faculty-badge')).toHaveCount(0);
});

test('the badge says how much evidence is behind it', async ({ page }) => {
  await gotoRoutine(page);

  await expect(rowFor(page, '02').getByTestId('routine-faculty-badge')).toHaveAttribute(
    'title',
    /from 6 reviews/,
  );
  // One review is not a verdict, and legacy says so rather than hiding it.
  const lowSample = rowFor(page, '04').getByTestId('routine-faculty-badge');
  await expect(lowSample).toHaveClass(/routine-faculty-badge--low-sample/);
  await expect(lowSample).toHaveAttribute('title', /Low sample \(1 review\)/);
});

test('the Faculty sort appears with the ratings and orders by them', async ({ page }) => {
  await gotoRoutine(page);
  const sortFaculty = page.getByTestId('routine-sort-faculty');
  await expect(sortFaculty).toBeVisible();
  await sortFaculty.click();

  const names = await page
    .getByTestId('routine-course-CSE110')
    .locator('.routine-section-name')
    .allTextContents();
  // DEF 4.9, ABC 4.6, XYZ 2.1, then unrated GHI last.
  expect(names).toEqual(['Section 04', 'Section 02', 'Section 01', 'Section 03']);
});

test('suggestions rank on the ratings and show the average behind the score', async ({ page }) => {
  await gotoRoutine(page);
  await page.getByTestId('routine-suggest').click();

  // One course, so each combination is a single section. The engine scores by
  // TIER, not by raw average: ABC and DEF are both excellent and tie, the
  // unrated GHI earns nothing, and the badly-rated XYZ is penalised to last.
  const cards = page.getByTestId('routine-suggest-panel').locator('.routine-suggest-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText(/ABC|DEF/);
  await expect(cards.last()).toContainText('XYZ');

  // The average the ranking used is shown, so the score has a visible basis.
  await expect(page.getByTestId('routine-suggest-rating-0')).toContainText(/4\.[69]/);
  await expect(
    page.getByTestId('routine-suggest-card-0').getByTestId('routine-faculty-badge'),
  ).toBeVisible();
});

test('a feed that will not load leaves the list usable, just unbadged', async ({ page }) => {
  await gotoRoutine(page, { reviews: null });

  await expect(rowFor(page, '02')).toBeVisible();
  await expect(page.getByTestId('routine-faculty-badge')).toHaveCount(0);
  // Nothing can rank by faculty, so the sort is not offered at all.
  await expect(page.getByTestId('routine-sort-faculty')).toHaveCount(0);
  await expect(page.getByTestId('routine-sort-seats')).toBeVisible();
});

test('a cached map badges the list without going back to the feed', async ({ page }) => {
  await gotoRoutine(page);
  await expect(rowFor(page, '02').getByTestId('routine-faculty-badge')).toBeVisible();

  // Reload with the feed broken: the cache written on the first visit carries
  // the badges, which is the whole point of caching a slow-moving aggregate.
  await installReviews(page, null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('routine-course-CSE110')).toBeVisible();
  await expect(rowFor(page, '02').getByTestId('routine-faculty-badge')).toContainText('4.6');
});
