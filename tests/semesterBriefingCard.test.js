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
        sbcExamCardHtml, sbcWeekCardHtml, sbcGapRoomsCardHtml, sbcNoRoutineHtml, sbcBriefingHtml } =
  await import('../js/ui/semesterBriefingCard.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}\n    got:      ${a}\n    expected: ${b}`);
}

const exam = (courseCode, date, startMin, gapHoursFromPrev, sameDayAsPrev = false) => ({
  courseCode, sectionName: '01', facultyInitials: 'ABC',
  date, startMin, endMin: startMin + 120, gapHoursFromPrev, sameDayAsPrev,
});

console.log('\nsemesterBriefingCard — exam verdict');

test('a packed exam season is named as one', () => {
  const v = sbcExamVerdict({
    exams: [exam('CSE251', '2026-07-25', 990, null), exam('MAT111', '2026-07-27', 840, 3.5, true)],
    spanHours: 47.5, tightestGapHours: 3.5, sameDayCount: 1, missing: [],
  });
  assert(v.includes('47.5h'), 'states the span');
  assert(v.includes('shares a day'), 'names the same-day pair');
});

test('a comfortable spread is not described as a crunch', () => {
  const v = sbcExamVerdict({
    exams: [exam('A', '2026-07-01', 600, null), exam('B', '2026-07-08', 600, 166)],
    spanHours: 170, tightestGapHours: 166, sameDayCount: 0, missing: [],
  });
  assert(v.includes('kind spread'), `expected the kind branch, got: ${v}`);
  assert(!v.includes('hot'), 'no alarm styling on a comfortable spread');
});

test('a long season with a same-day pair still leads with the pair', () => {
  const v = sbcExamVerdict({
    exams: [exam('A', '2026-07-01', 600, null), exam('B', '2026-07-20', 540, 12, true)],
    spanHours: 460, tightestGapHours: 12, sameDayCount: 1, missing: [],
  });
  assert(v.includes('1 landing on a day that already has one'), v);
});

test('a single exam reads as a single exam', () => {
  const v = sbcExamVerdict({
    exams: [exam('CSE110', '2026-07-26', 840, null)],
    spanHours: 2, tightestGapHours: null, sameDayCount: 0, missing: [],
  });
  assert(v.includes('One exam'), v);
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

test('formats hours without trailing noise', () => {
  eq(sbcFormatHours(19.5), '19.5h');
  eq(sbcFormatHours(20), '20h');
  eq(sbcFormatHours(NaN), '—');
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
