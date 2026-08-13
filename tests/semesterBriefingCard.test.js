/**
 * tests/semesterBriefingCard.test.js
 * Pure view-builder coverage for the Profile page's "This semester" block.
 *
 * The verdict lines are the point of these cards, and they branch on the
 * student's data — a comfortable exam spread must not be described in the
 * language of a crunch. E2E only ever exercises the crunch fixture, so the
 * kinder branches are covered here.
 *
 * The module registers a dispatch action at import time, so stub a window.
 */

global.window = { addEventListener() {} };

const { sbcExamVerdict, sbcWeekVerdict, sbcGapsVerdict, sbcFormatExamDate, sbcFormatHours,
        sbcFormatCountdown, sbcExamCardHtml, sbcWeekCardHtml, sbcGapRoomsCardHtml,
        sbcNoRoutineHtml, sbcBriefingHtml } =
  await import('../js/ui/semesterBriefingCard.js');
const { parseFeed } = await import('../js/core/connectFeed.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}\n    got:      ${a}\n    expected: ${b}`);
}

const exam = (courseCode, date, startMin, gapHoursFromPrev, sameDayAsPrev = false, isPast = false) => ({
  courseCode, sectionName: '01', facultyInitials: 'ABC',
  date, startMin, endMin: startMin + 120, gapHoursFromPrev, sameDayAsPrev, isPast,
});

/**
 * A briefing with every exam still ahead — what buildExamBriefing returns
 * before the season starts, so `upcoming` mirrors the whole-period numbers.
 */
const ahead = (exams, { spanHours, tightestGapHours = null, sameDayCount = 0, hoursUntilNext = 72 }) => ({
  kind: 'mid', exams, spanHours, tightestGapHours, sameDayCount, missing: [],
  upcoming: { count: exams.length, spanHours, tightestGapHours, sameDayCount },
  nextExam: exams[0], hoursUntilNext, pastCount: 0,
});

console.log('\nsemesterBriefingCard — exam verdict');

test('a packed exam season is named as one', () => {
  const v = sbcExamVerdict(ahead(
    [exam('CSE251', '2026-07-25', 990, null), exam('MAT111', '2026-07-27', 840, 3.5, true)],
    { spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1 },
  ));
  assert(v.includes('47.5h'), 'states the span');
  assert(v.includes('shares a day'), 'names the same-day pair');
});

test('a comfortable spread is not described as a crunch', () => {
  const v = sbcExamVerdict(ahead(
    [exam('A', '2026-07-01', 600, null), exam('B', '2026-07-08', 600, 166)],
    { spanHours: 170, tightestGapHours: 166 },
  ));
  assert(v.includes('kind spread'), `expected the kind branch, got: ${v}`);
  assert(!v.includes('hot'), 'no alarm styling on a comfortable spread');
});

test('a long season with a same-day pair still leads with the pair', () => {
  const v = sbcExamVerdict(ahead(
    [exam('A', '2026-07-01', 600, null), exam('B', '2026-07-20', 540, 12, true)],
    { spanHours: 460, tightestGapHours: 12, sameDayCount: 1 },
  ));
  assert(v.includes('1 landing on a day that already has one'), v);
});

test('a single exam reads as a single exam', () => {
  const v = sbcExamVerdict(ahead(
    [exam('CSE110', '2026-07-26', 840, null)],
    { spanHours: 2 },
  ));
  assert(v.includes('Your only midterm'), v);
  assert(v.includes('CSE110'), v);
});

test('the verdict opens with how long until the next exam', () => {
  const soon = sbcExamVerdict(ahead(
    [exam('CSE251', '2026-07-25', 990, null), exam('MAT111', '2026-07-27', 840, 3.5, true)],
    { spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1, hoursUntilNext: 5 },
  ));
  assert(soon.startsWith('Next: <b>CSE251</b>, in 5h.'), soon);

  const later = sbcExamVerdict(ahead(
    [exam('CSE251', '2026-07-25', 990, null), exam('MAT111', '2026-07-27', 840, 3.5, true)],
    { spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1, hoursUntilNext: 290 },
  ));
  assert(later.includes('in 12 days'), later);
});

test('exams already sat are counted out of the crunch', () => {
  const v = sbcExamVerdict({
    kind: 'mid',
    exams: [
      exam('CSE251', '2026-07-25', 990, null, false, true),
      exam('CSE220', '2026-07-26', 840, 19.5),
      exam('MAT111', '2026-07-27', 840, 3.5, true),
    ],
    spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1, missing: [],
    upcoming: { count: 2, spanHours: 26, tightestGapHours: 3.5, sameDayCount: 1 },
    nextExam: exam('CSE220', '2026-07-26', 840, 19.5), hoursUntilNext: 20, pastCount: 1,
  });
  assert(v.includes('2 left'), `counts only what is ahead: ${v}`);
  assert(!v.includes('47.5h'), 'the whole-season span is not the crunch any more');
  assert(v.includes('26h'), v);
});

test('a finished period says so instead of restating the crunch', () => {
  const v = sbcExamVerdict({
    kind: 'mid',
    exams: [
      exam('CSE251', '2026-07-25', 990, null, false, true),
      exam('MAT111', '2026-07-27', 840, 3.5, true, true),
    ],
    spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1, missing: [],
    upcoming: null, nextExam: null, hoursUntilNext: null, pastCount: 2,
  });
  assert(v.includes('All 2 midterms are done'), v);
  assert(v.includes('Mon 27 Jul'), 'names when the last one was');
  assert(!v.includes('47.5h'), 'a season already lived through is not a warning');
});

test('a finished period of one names the exam', () => {
  const v = sbcExamVerdict({
    kind: 'final',
    exams: [exam('CSE110', '2026-09-14', 840, null, false, true)],
    spanHours: 2, tightestGapHours: null, sameDayCount: 0, missing: [],
    upcoming: null, nextExam: null, hoursUntilNext: null, pastCount: 1,
  });
  assert(v.includes('Your only final'), v);
  assert(v.includes('CSE110'), v);
});

test('no brief yields no verdict', () => {
  eq(sbcExamVerdict(null), '');
  eq(sbcExamVerdict({ exams: [] }), '');
});

console.log('\nsemesterBriefingCard — week and gap verdicts');

test('a week with no waiting is praised, not scolded', () => {
  const v = sbcWeekVerdict({ campusDays: 2, contactMinutes: 320, deadGapMinutes: 0 });
  assert(v.includes('No waiting around'), v);
});

test('a week with waiting reports both numbers', () => {
  const v = sbcWeekVerdict({ campusDays: 5, contactMinutes: 810, deadGapMinutes: 560 });
  assert(v.includes('5 days'), v);
  assert(v.includes('13h 30m'), v);
  assert(v.includes('9h 20m'), v);
});

test('an empty week has nothing to say', () => {
  eq(sbcWeekVerdict({ campusDays: 0 }), '');
  eq(sbcWeekVerdict(null), '');
});

test('the gap verdict multiplies the longest gap across the semester', () => {
  const v = sbcGapsVerdict([
    { day: 'SATURDAY', minutes: 280, startMin: 560, endMin: 840, afterCourse: 'A', beforeCourse: 'B', nextRoom: '07H-27C', nextFloor: 7 },
    { day: 'THURSDAY', minutes: 100, startMin: 560, endMin: 660, afterCourse: 'A', beforeCourse: 'B', nextRoom: '12B-20L', nextFloor: 12 },
  ]);
  assert(v.includes('Sat'), v);
  assert(v.includes('4h 40m'), 'uses the longest gap, not the first');
  assert(v.includes('61 hours'), '280 min × 13 weeks ≈ 61 hours');
});

console.log('\nsemesterBriefingCard — cards and escaping');

test('a missing exam brief still renders the period switch', () => {
  const html = sbcExamCardHtml(null, 'mid');
  assert(html.includes('data-kind="final"'), 'the switch survives an empty period');
  assert(html.includes('No midterm dates published'), html);
});

test('a sat exam is marked done and dimmed, not left looking pending', () => {
  const html = sbcExamCardHtml({
    kind: 'mid',
    exams: [
      exam('CSE251', '2026-07-25', 990, null, false, true),
      exam('CSE220', '2026-07-26', 840, 19.5),
    ],
    spanHours: 26, tightestGapHours: 19.5, sameDayCount: 0, missing: [],
    upcoming: { count: 1, spanHours: 2, tightestGapHours: null, sameDayCount: 0 },
    nextExam: exam('CSE220', '2026-07-26', 840, 19.5), hoursUntilNext: 20, pastCount: 1,
  }, 'mid');
  assert(html.includes('pfb-row is-past'), 'the sat exam is marked');
  assert(html.includes('pfb-chip done">done'), html);
  assert(!html.includes('19.5h gap'), 'a gap back to a sat exam is not a warning');
  assert(html.includes('next up'), 'the first exam ahead opens a fresh run');
});

test('the block opens on the period that is still ahead', () => {
  // Midterms in July, finals in September, read from a January-to-December feed.
  const sections = parseFeed([{
    courseId: 1, sectionId: 1, courseCode: 'CSE251', courseName: 'C', sectionName: '01',
    sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3, capacity: 30,
    consumedSeat: 1, faculties: 'ABC', roomName: '07H-27C',
    sectionSchedule: {
      classSchedules: [{ day: 'SATURDAY', startTime: '08:00', endTime: '09:20' }],
      midExamDate: '2026-07-25', midExamStartTime: '16:30', midExamEndTime: '18:30',
      finalExamDate: '2026-09-12', finalExamStartTime: '16:30', finalExamEndTime: '18:30',
    },
  }]).sections;

  const beforeMids = sbcBriefingHtml(sections, null, null, Date.parse('2026-07-01T09:00Z'));
  assert(/data-kind="mid"[^>]*aria-pressed="true"/s.test(beforeMids), 'midterms lead while they are ahead');
  assert(beforeMids.includes('Sat 25 Jul'), beforeMids);

  const afterMids = sbcBriefingHtml(sections, null, null, Date.parse('2026-08-13T09:00Z'));
  assert(/data-kind="final"[^>]*aria-pressed="true"/s.test(afterMids), 'finals take over once mids are sat');
  assert(afterMids.includes('Sat 12 Sep'), 'and the finals dates are what is listed');
  assert(!afterMids.includes('Sat 25 Jul'), 'no trace of the period that is over');
});

test('an empty week invites a routine instead of drawing a blank grid', () => {
  const html = sbcWeekCardHtml({ campusDays: 0, byDay: new Map(), gaps: [], hops: [] });
  assert(html.includes('Routine'), html);
  assert(!html.includes('pfb-col'), 'no grid columns without a routine');
});

test('back-to-back classes get an honest empty state, not a fabricated gap', () => {
  const html = sbcGapRoomsCardHtml([], []);
  assert(html.includes('classes run back to back'), html);
});

test('no picks renders the routine invitation', () => {
  assert(sbcBriefingHtml([], null).includes('Pick your sections'));
  assert(sbcNoRoutineHtml().includes('../#routine'));
});

test('feed-supplied strings are escaped', () => {
  const html = sbcGapRoomsCardHtml(
    [{ day: 'SATURDAY', minutes: 280, startMin: 560, endMin: 840,
       afterCourse: '<img src=x onerror=alert(1)>', beforeCourse: 'B', nextRoom: '07H-27C', nextFloor: 7 }],
    [{ sameFloor: ['<script>'], elsewhere: [], total: 1 }],
  );
  assert(!html.includes('<img src=x'), 'course code escaped');
  assert(!html.includes('<script>'), 'room code escaped');
  assert(html.includes('&lt;'), 'escaped rather than stripped');
});

console.log('\nsemesterBriefingCard — formatting');

test('formats exam dates as UTC so the day cannot drift', () => {
  eq(sbcFormatExamDate('2026-07-27'), 'Mon 27 Jul');
  eq(sbcFormatExamDate('2026-09-14'), 'Mon 14 Sep');
  eq(sbcFormatExamDate('nonsense'), 'nonsense');
});

test('the countdown reads as a phrase, at every distance', () => {
  eq(sbcFormatCountdown(-2), 'underway now', 'an exam in progress is not "in -2h"');
  eq(sbcFormatCountdown(0.5), 'within the hour');
  eq(sbcFormatCountdown(5), 'in 5h');
  eq(sbcFormatCountdown(30), 'tomorrow');
  eq(sbcFormatCountdown(290), 'in 12 days');
  eq(sbcFormatCountdown(null), '');
});

test('formats hours without trailing noise', () => {
  eq(sbcFormatHours(19.5), '19.5h');
  eq(sbcFormatHours(20), '20h');
  eq(sbcFormatHours(NaN), '—');
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
