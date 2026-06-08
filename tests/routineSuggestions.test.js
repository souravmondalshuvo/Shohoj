/**
 * tests/routineSuggestions.test.js
 * Pure tests for the auto-suggest engine: enumeration, class-clash filter,
 * scoring, ranking, skipped courses, truncation.
 */

import {
    suggestCombinations,
    scoreCombination,
} from '../js/core/routineSuggestions.js';
import { parseFeed, indexByCourse } from '../js/core/connectFeed.js';
import { buildFacultyRatingMap } from '../js/core/routineFaculty.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

// ---- Fixture --------------------------------------------------------------
// CSE220 has 3 sections: A1 (good prof, open), A2 (bad prof, open),
//                        A3 (excellent prof, FULL).
// MAT215 has 2 sections: B1 (excellent prof, open, clashes with CSE220 A1),
//                        B2 (good prof, open, no clash).
// Outcome: top combo should be (CSE220 A1 + MAT215 B2) if A1 and B2 don't clash,
// (CSE220 A2 + MAT215 B1) otherwise.
const RAW = [
    { sectionId: 1, courseCode: 'CSE220', courseName: 'DS', courseCredit: 3,
      sectionName: 'A1', capacity: 30, consumedSeat: 10, faculties: 'GUD',
      roomName: 'R1',
      sectionSchedule: {
        classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
        midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00',
      },
    },
    { sectionId: 2, courseCode: 'CSE220', courseName: 'DS', courseCredit: 3,
      sectionName: 'A2', capacity: 30, consumedSeat: 5, faculties: 'BAD',
      roomName: 'R2',
      sectionSchedule: {
        classSchedules: [{ day: 'MONDAY', startTime: '14:00', endTime: '15:20' }],
        midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00',
      },
    },
    { sectionId: 3, courseCode: 'CSE220', courseName: 'DS', courseCredit: 3,
      sectionName: 'A3', capacity: 30, consumedSeat: 30, faculties: 'EXC',
      roomName: 'R3',
      sectionSchedule: {
        classSchedules: [{ day: 'TUESDAY', startTime: '14:00', endTime: '15:20' }],
        midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00',
      },
    },
    { sectionId: 4, courseCode: 'MAT215', courseName: 'LA', courseCredit: 3,
      sectionName: 'B1', capacity: 30, consumedSeat: 10, faculties: 'EXC',
      roomName: 'R4',
      sectionSchedule: {
        classSchedules: [{ day: 'SUNDAY', startTime: '14:30', endTime: '15:50' }], // clashes with A1 on Sunday
        midExamDate: '2026-07-30', midExamStartTime: '11:00', midExamEndTime: '13:00',
      },
    },
    { sectionId: 5, courseCode: 'MAT215', courseName: 'LA', courseCredit: 3,
      sectionName: 'B2', capacity: 30, consumedSeat: 12, faculties: 'GUD',
      roomName: 'R5',
      sectionSchedule: {
        classSchedules: [{ day: 'WEDNESDAY', startTime: '09:30', endTime: '10:50' }],
        midExamDate: '2026-07-30', midExamStartTime: '11:00', midExamEndTime: '13:00',
      },
    },
];
const sections = parseFeed(RAW).sections;
const idx = indexByCourse(sections);

const RATINGS = buildFacultyRatingMap([
    { facultyInitials: 'EXC', count: 10, overall: 4.6 },
    { facultyInitials: 'GUD', count: 10, overall: 3.9 },
    { facultyInitials: 'BAD', count: 10, overall: 1.8 },
]);

// ---- empty / trivial ------------------------------------------------------
console.log('\nempty / trivial:');
test('no picked courses -> empty suggestions', () => {
    const out = suggestCombinations([], idx, RATINGS);
    eq(out.suggestions, []);
    eq(out.skippedCourses, []);
});
test('one course with no usable sections -> skipped', () => {
    const allFullIdx = indexByCourse(parseFeed([
        { ...RAW[2], sectionId: 99 }, // A3 (full) only
    ]).sections);
    const out = suggestCombinations(['CSE220'], allFullIdx, RATINGS);
    eq(out.suggestions, []);
    eq(out.skippedCourses, ['CSE220']);
});
test('single-course picker enumerates per-section suggestions', () => {
    const out = suggestCombinations(['CSE220'], idx, RATINGS, { topK: 5 });
    // 3 sections, 1 is full (A3 skipped), so 2 combos.
    eq(out.suggestions.length, 2);
    eq(out.feasible, 2);
    eq(out.enumerated, 2);
});

// ---- multi-course ranking -------------------------------------------------
console.log('\nmulti-course ranking:');
test('drops class-clashing combos before scoring', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, RATINGS);
    // CSE220 has A1, A2, A3. A3 is full -> filtered out. So usable = [A1, A2].
    // MAT215 = [B1, B2]. Cartesian = 4 combos.
    // (A1, B1) clashes Sunday -> dropped. So 3 feasible.
    eq(out.enumerated, 4);
    eq(out.feasible, 3);
});
test('ranks (good A1 + good B2) above (bad A2 + good B2)', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, RATINGS, { topK: 5 });
    // Top result should include A1 (good) + B2 (good), not A2 (bad).
    const top = out.suggestions[0];
    const sids = top.sections.map(s => s.sectionId).sort();
    eq(sids, [1, 5]);
});
test('top combo carries breakdown counts', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, RATINGS, { topK: 1 });
    const b = out.suggestions[0].breakdown;
    eq(b.goodCount, 2);
    eq(b.badCount, 0);
    eq(b.unratedCount, 0);
    eq(b.fullCount, 0);
});
test('combos with same-day mid exam clash get penalty', () => {
    // (A2, B1): A2's mid 2026-07-26, B1's mid 2026-07-30 -> no clash.
    // (A2, B2): A2 mid 2026-07-26, B2 mid 2026-07-30 -> no clash.
    // All A's share 2026-07-26; but A's are per-course not cross-course, only one A is in any combo.
    // So no exam clashes in the fixture. Construct one explicitly:
    const customRaw = [
        RAW[0], // CSE220 A1, mid 2026-07-26 11:00
        { ...RAW[4], sectionId: 50, sectionName: 'B3',
          sectionSchedule: { ...RAW[4].sectionSchedule, midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00' } },
    ];
    const ix = indexByCourse(parseFeed(customRaw).sections);
    const out = suggestCombinations(['CSE220', 'MAT215'], ix, RATINGS);
    // (A1, B3) has exam clash; score should reflect the penalty.
    const top = out.suggestions[0];
    eq(top.breakdown.examClashPairs, 1);
    assert(top.breakdown.examClashPenalty > 0);
});
test('seat slack rewards open sections over tight ones', () => {
    // Same prof + schedule, different fill ratios.
    const baseSched = {
        classSchedules: [{ day: 'SUNDAY', startTime: '08:00', endTime: '09:20' }],
    };
    const openSec = {
        sectionId: 100, courseCode: 'XXX111', courseName: 'X', courseCredit: 3,
        sectionName: 'OP', capacity: 30, consumedSeat: 5, faculties: 'GUD',
        roomName: 'R', sectionSchedule: baseSched,
    };
    const tightSec = {
        sectionId: 101, courseCode: 'XXX111', courseName: 'X', courseCredit: 3,
        sectionName: 'TI', capacity: 30, consumedSeat: 27, faculties: 'GUD',
        roomName: 'R', sectionSchedule: baseSched,
    };
    const ix = indexByCourse(parseFeed([openSec, tightSec]).sections);
    const out = suggestCombinations(['XXX111'], ix, RATINGS);
    // Open should score higher than Tight (same rating, more seat slack).
    const top = out.suggestions[0];
    eq(top.sections[0].sectionId, 100);
});

// ---- truncation -----------------------------------------------------------
console.log('\ntruncation:');
test('hits maxCombinations cap and reports truncated', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, RATINGS, { maxCombinations: 2 });
    eq(out.truncated, true);
    eq(out.enumerated, 2);
});

// ---- options pass-through -------------------------------------------------
console.log('\nscoreCombination options:');
test('topK > number of feasible combos returns all', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, RATINGS, { topK: 999 });
    eq(out.suggestions.length, 3);
});
test('skipAboveFillRatio = 0.5 drops sections with > 50% fill', () => {
    const out = suggestCombinations(['MAT215'], idx, RATINGS, { skipAboveFillRatio: 0.5 });
    // B1 is 10/30 = 33% (kept), B2 is 12/30 = 40% (kept), so both kept.
    // Tighten to 0.35:
    const out2 = suggestCombinations(['MAT215'], idx, RATINGS, { skipAboveFillRatio: 0.35 });
    eq(out2.suggestions.length, 1);
    eq(out2.suggestions[0].sections[0].sectionId, 4); // B1
});
test('unrated section contributes nothing to ratingScore but appears in combo', () => {
    const noRatings = new Map();
    const out = suggestCombinations(['CSE220'], idx, noRatings, { topK: 3 });
    eq(out.suggestions.length, 2);
    eq(out.suggestions[0].breakdown.unratedCount, 1);
    eq(out.suggestions[0].breakdown.avgRating, null);
});

// ---- sectionFilter option -------------------------------------------------
console.log('\nsectionFilter:');
test('sectionFilter drops non-matching sections before enumeration', () => {
    const noSunday = (s) => !s.classSlots.some(sl => sl.day === 'SUNDAY');
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, new Map(), { sectionFilter: noSunday });
    const ids = out.suggestions.flatMap(s => s.sections.map(x => x.sectionId));
    assert(!ids.includes(1) && !ids.includes(4), 'Sunday sections (1, 4) should be filtered out');
    assert(out.suggestions.length > 0, 'a Sunday-free combo should still exist');
});
test('a sectionFilter that rejects everything skips all courses', () => {
    const out = suggestCombinations(['CSE220', 'MAT215'], idx, new Map(), { sectionFilter: () => false });
    eq(out.suggestions, []);
    eq(out.skippedCourses.sort(), ['CSE220', 'MAT215']);
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
