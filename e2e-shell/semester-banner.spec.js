// e2e-shell/semester-banner.spec.js
//
// #633: the CONNECT feed carries exactly one semester and never says which. It
// publishes whatever is open for advising, so between advising and the start of
// term it holds a timetable nobody is attending yet — on 2026-08-31 it held
// Fall 2026 (classes from 3 Oct) while Summer 2026 was still running.
//
// These drive the two claims that made that dangerous: that the header names
// the semester at all, and that Free Rooms stops answering "is this room free
// right now" off a timetable which is not in effect.

import { expect, test } from '../e2e-support/authFixture.js';

/**
 * Seed the feed cache with a semester positioned relative to today.
 *
 * `offsetDays` moves the whole term: +60 puts classes two months out (the
 * advising-window case), 0 straddles today (the normal case). Computed in the
 * page so the fixture cannot go stale the way a hardcoded 2026 date would.
 */
function seedSemester(page, { sessionId, offsetDays }) {
  return page.addInitScript(
    ({ sessionId, offsetDays }) => {
      const iso = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const section = (sectionId, courseCode, sectionName, room, day) => ({
        sectionId,
        courseCode,
        sectionName,
        capacity: 40,
        consumedSeat: 10,
        roomName: room,
        semesterSessionId: sessionId,
        sectionSchedule: {
          classSchedules: [{ day, startTime: '8:00', endTime: '9:20' }],
          classStartDate: iso(offsetDays - 30),
          classEndDate: iso(offsetDays + 60),
        },
      });
      localStorage.setItem(
        'shohoj_connect_feed_v1',
        JSON.stringify({
          fetchedAt: Date.now(),
          etag: null,
          payload: [
            section(1, 'CSE110', '01', '07A-01C', 'SUNDAY'),
            section(2, 'CSE110', '02', '07B-11C', 'MONDAY'),
            section(3, 'PHY111', '01', '09G-31T', 'TUESDAY'),
          ],
        }),
      );
    },
    { sessionId, offsetDays },
  );
}

// +90 days puts the whole term ahead of today: term runs +60 to +150.
const ADVISING = { sessionId: 20263, offsetDays: 90 };
// 0 straddles today: term runs -30 to +60.
const IN_TERM = { sessionId: 20262, offsetDays: 0 };

test('the routine header names the semester and flags one that has not started', async ({
  page,
}) => {
  await seedSemester(page, ADVISING);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });

  const badge = page.getByTestId('routine-semester');
  await expect(badge).toContainText('Fall 2026');
  await expect(badge).toContainText('classes start');
  await expect(badge).toHaveClass(/routine-semester--upcoming/);
  // The explanation a student needs to make sense of a timetable they are not
  // living in yet: this is what CONNECT publishes, not what we chose to show.
  await expect(badge).toHaveAttribute('title', /open for advising/);
});

test('a semester in progress is named without a warning', async ({ page }) => {
  await seedSemester(page, IN_TERM);
  await page.goto('/routine', { waitUntil: 'domcontentloaded' });

  const badge = page.getByTestId('routine-semester');
  await expect(badge).toContainText('Summer 2026');
  await expect(badge).toContainText('classes to');
  await expect(badge).toHaveClass(/routine-semester--running/);
});

test('Free Rooms refuses to answer "free right now" off an out-of-term timetable', async ({
  page,
}) => {
  await seedSemester(page, ADVISING);
  await page.goto('/rooms', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rooms-page')).toBeVisible();

  // The route still lists rooms — the timetable is real data and worth reading.
  // What it must not do is let the reader take it for the room's state today.
  const notice = page.getByTestId('rooms-out-of-term');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('not the');
  await expect(notice).toContainText('semester running right now');
  await expect(page.getByTestId('rooms-semester')).toContainText('Fall 2026');
});

test('Free Rooms says nothing extra while the timetable is in effect', async ({ page }) => {
  await seedSemester(page, IN_TERM);
  await page.goto('/rooms', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rooms-page')).toBeVisible();
  await expect(page.getByTestId('rooms-semester')).toContainText('Summer 2026');
  await expect(page.getByTestId('rooms-out-of-term')).toHaveCount(0);
});

test('Seat Status names the semester its counts belong to', async ({ page }) => {
  await seedSemester(page, ADVISING);
  await page.goto('/seats', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('seats-page')).toBeVisible();

  // Freshness and semester are different questions, and the seats route had
  // only ever answered the first: seconds-old counts for a semester nobody is
  // registering for yet still read as "Live".
  await expect(page.getByTestId('seats-feed-source')).toContainText(/(Live|Cached)/);
  await expect(page.getByTestId('seats-semester')).toContainText('Fall 2026');
});
