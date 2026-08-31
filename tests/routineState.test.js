/**
 * tests/routineState.test.js
 * Pure-core tests for the Routine Builder state helpers:
 * pickCourse / pickSection / unpickCourse / selectedSections / buildClashMap /
 * summarizeRoutine.
 */

import {
    emptyRoutineBook,
    readRoutineBook,
    routineForSession,
    serializeRoutineBook,
    withRoutineForSession,
    emptyRoutineState,
    pickCourse,
    pickSection,
    unpickCourse,
    clearRoutine,
    pickedCourseCodes,
    selectedSections,
    buildClashMap,
    summarizeRoutine,
    encodeRoutinePicks,
    decodeRoutinePicks,
    MAX_SHARE_COURSES,
} from '../js/core/routineState.js';
import { parseFeed, indexByCourse } from '../js/core/connectFeed.js';

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

// ---- Fixture (reuses connectFeed shape) -----------------------------------
const FIXTURE = [
    {
        sectionId: 1001, courseCode: 'CSE220', courseName: 'DS', courseCredit: 3,
        sectionName: '01', capacity: 30, consumedSeat: 10,
        semesterSessionId: 20262, faculties: 'ABC', roomName: '09B-12C',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
            midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00',
            finalExamDate: '2026-09-13', finalExamStartTime: '11:00', finalExamEndTime: '13:00',
        },
    },
    {
        sectionId: 1002, courseCode: 'CSE230', courseName: 'DM', courseCredit: 3,
        sectionName: '02', capacity: 30, consumedSeat: 10,
        semesterSessionId: 20262, faculties: 'XYZ', roomName: '09C-04A',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
            midExamDate: '2026-07-27', midExamStartTime: '11:00', midExamEndTime: '13:00',
            finalExamDate: '2026-09-14', finalExamStartTime: '11:00', finalExamEndTime: '13:00',
        },
    },
    {
        sectionId: 1003, courseCode: 'MAT215', courseName: 'LA', courseCredit: 3,
        sectionName: '03', capacity: 40, consumedSeat: 5,
        semesterSessionId: 20262, faculties: 'PQR', roomName: '08A-01C',
        sectionSchedule: {
            classSchedules: [{ day: 'MONDAY', startTime: '09:30', endTime: '10:50' }],
            midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00',
            finalExamDate: '2026-09-15', finalExamStartTime: '11:00', finalExamEndTime: '13:00',
        },
    },
];
const { sections } = parseFeed(FIXTURE);
const index = indexByCourse(sections);

// ---- pickCourse / unpickCourse ---------------------------------------------
console.log('\npickCourse / unpickCourse:');
test('empty state has no picks', () => {
    eq(emptyRoutineState(), { picks: {} });
});
test('pickCourse adds null sectionId entry, upper-cases code, trims whitespace', () => {
    const s = pickCourse(pickCourse(emptyRoutineState(), '  cse220 '), 'mat215');
    eq(s.picks, { CSE220: null, MAT215: null });
});
test('pickCourse is idempotent for the same code', () => {
    const s1 = pickCourse(emptyRoutineState(), 'CSE220');
    const s2 = pickCourse(s1, 'CSE220');
    assert(s1 === s2, 'expected same state object reference');
});
test('pickCourse with empty string is a no-op', () => {
    const s1 = emptyRoutineState();
    const s2 = pickCourse(s1, '   ');
    assert(s1 === s2);
});
test('unpickCourse removes the entry', () => {
    const s = unpickCourse(pickCourse(emptyRoutineState(), 'CSE220'), 'CSE220');
    eq(s.picks, {});
});
test('unpickCourse for a non-picked course is a no-op', () => {
    const s1 = pickCourse(emptyRoutineState(), 'CSE220');
    const s2 = unpickCourse(s1, 'MAT215');
    assert(s1 === s2);
});
test('clearRoutine empties the picks', () => {
    const s = clearRoutine(pickCourse(pickCourse(emptyRoutineState(), 'A'), 'B'));
    eq(s.picks, {});
});
test('clearRoutine on empty state is a no-op', () => {
    const s1 = emptyRoutineState();
    const s2 = clearRoutine(s1);
    assert(s1 === s2);
});
test('pickedCourseCodes returns sorted list', () => {
    const s = pickCourse(pickCourse(pickCourse(emptyRoutineState(), 'MAT215'), 'CSE220'), 'CSE230');
    eq(pickedCourseCodes(s), ['CSE220', 'CSE230', 'MAT215']);
});

// ---- pickSection -----------------------------------------------------------
console.log('\npickSection:');
test('pickSection assigns sectionId to an existing course', () => {
    const s = pickSection(pickCourse(emptyRoutineState(), 'CSE220'), 'CSE220', 1001);
    eq(s.picks.CSE220, 1001);
});
test('pickSection auto-adds the course if not already picked', () => {
    const s = pickSection(emptyRoutineState(), 'CSE220', 1001);
    eq(s.picks.CSE220, 1001);
});
test('pickSection with same id is a no-op (same reference)', () => {
    const s1 = pickSection(emptyRoutineState(), 'CSE220', 1001);
    const s2 = pickSection(s1, 'CSE220', 1001);
    assert(s1 === s2);
});
test('pickSection with null marks course as awaiting selection', () => {
    const s = pickSection(pickSection(emptyRoutineState(), 'CSE220', 1001), 'CSE220', null);
    eq(s.picks.CSE220, null);
});

// ---- selectedSections ------------------------------------------------------
console.log('\nselectedSections:');
test('returns empty array when no sections are picked', () => {
    eq(selectedSections(emptyRoutineState(), index), []);
});
test('skips courses where sectionId is null', () => {
    const s = pickCourse(emptyRoutineState(), 'CSE220');
    eq(selectedSections(s, index), []);
});
test('returns the actual NormalizedSection objects for picked ids', () => {
    const s = pickSection(pickSection(emptyRoutineState(), 'CSE220', 1001), 'MAT215', 1003);
    const got = selectedSections(s, index).map(x => x.sectionId).sort();
    eq(got, [1001, 1003]);
});
test('silently skips section ids that no longer exist in the feed', () => {
    const s = pickSection(emptyRoutineState(), 'CSE220', 9999);
    eq(selectedSections(s, index), []);
});

// ---- buildClashMap ---------------------------------------------------------
console.log('\nbuildClashMap:');
test('empty routine -> empty map', () => {
    eq(buildClashMap([]).size, 0);
});
test('single section -> mark with no clashes', () => {
    const map = buildClashMap([sections[0]]);
    eq(map.get(1001), { classClash: false, examClash: false, clashesWith: [] });
});
test('two sections clashing on Sunday class slot are both marked classClash', () => {
    const map = buildClashMap([sections[0], sections[1]]);
    eq(map.get(1001).classClash, true);
    eq(map.get(1002).classClash, true);
    eq(map.get(1001).clashesWith, [1002]);
    eq(map.get(1002).clashesWith, [1001]);
});
test('exam clash also marks both sections', () => {
    const map = buildClashMap([sections[0], sections[2]]);
    eq(map.get(1001).examClash, true);
    eq(map.get(1003).examClash, true);
});
test('class + exam clashes accumulate without duplicating offenders', () => {
    // CSE220 (1001) clashes with CSE230 (1002) on class, and with MAT215 (1003) on exam.
    const map = buildClashMap([sections[0], sections[1], sections[2]]);
    const mA = map.get(1001);
    eq(mA.classClash, true);
    eq(mA.examClash,  true);
    eq(mA.clashesWith.sort((x,y)=>x-y), [1002, 1003]);
});

// ---- summarizeRoutine ------------------------------------------------------
console.log('\nsummarizeRoutine:');
test('empty state -> zero counts', () => {
    const sum = summarizeRoutine(emptyRoutineState(), index);
    eq(sum, { pickedCount: 0, resolvedCount: 0, unresolvedCourses: [], classClashPairs: 0, examClashPairs: 0 });
});
test('unresolved when section is null', () => {
    const s = pickCourse(emptyRoutineState(), 'CSE220');
    const sum = summarizeRoutine(s, index);
    eq(sum.pickedCount, 1);
    eq(sum.resolvedCount, 0);
    eq(sum.unresolvedCourses, ['CSE220']);
});
test('reports class clash pair count', () => {
    let s = pickSection(emptyRoutineState(), 'CSE220', 1001);
    s = pickSection(s, 'CSE230', 1002);
    const sum = summarizeRoutine(s, index);
    eq(sum.resolvedCount, 2);
    eq(sum.classClashPairs, 1);
    eq(sum.examClashPairs, 0);
});
test('reports exam clash pair count separately from class clashes', () => {
    let s = pickSection(emptyRoutineState(), 'CSE220', 1001);
    s = pickSection(s, 'MAT215', 1003);
    const sum = summarizeRoutine(s, index);
    eq(sum.classClashPairs, 0);
    eq(sum.examClashPairs, 1);
});
test('unresolved course where sectionId no longer exists', () => {
    const s = pickSection(emptyRoutineState(), 'CSE220', 9999);
    const sum = summarizeRoutine(s, index);
    eq(sum.unresolvedCourses, ['CSE220']);
});

// ---- Share codec ----
console.log('\nshare codec:');
test('encode is sorted, ~-joined, with CODE-sid and bare-code forms', () => {
    let s = pickCourse(emptyRoutineState(), 'PHY111');
    s = pickSection(s, 'CSE220', 123);
    s = pickCourse(s, 'MAT215'); // null pick
    eq(encodeRoutinePicks(s), 'CSE220-123~MAT215~PHY111');
});
test('encode of empty routine is the empty string', () => {
    eq(encodeRoutinePicks(emptyRoutineState()), '');
});
test('decode round-trips encode', () => {
    let s = pickSection(pickCourse(emptyRoutineState(), 'MAT215'), 'CSE220', 7);
    eq(decodeRoutinePicks(encodeRoutinePicks(s)).picks, { CSE220: 7, MAT215: null });
});
test('decode lowercases-in / uppercases-out and trims', () => {
    eq(decodeRoutinePicks('cse220-5').picks, { CSE220: 5 });
});
test('decode skips malformed entries but keeps valid ones', () => {
    eq(decodeRoutinePicks('CSE220-9~~garbage!~MAT215').picks, { CSE220: 9, MAT215: null });
});
test('decode treats a non-positive / non-numeric sid as null', () => {
    eq(decodeRoutinePicks('CSE220-0~MAT215-abc').picks, { CSE220: null, MAT215: null });
});
test('decode caps at MAX_SHARE_COURSES entries', () => {
    const many = Array.from({ length: MAX_SHARE_COURSES + 5 }, (_, i) => `CSE${100 + i}`).join('~');
    eq(Object.keys(decodeRoutinePicks(many).picks).length, MAX_SHARE_COURSES);
});
test('decode of empty / non-string is an empty routine', () => {
    eq(decodeRoutinePicks('').picks, {});
    eq(decodeRoutinePicks(null).picks, {});
});


// ---------------------------------------------------------------------------
// Per-semester scoping (#633).
//
// The bug: a routine is picks against ONE semester's sections, but the picks
// were stored flat. Course codes carry across semesters (CSE221 is offered in
// both Summer and Fall) while section ids do not — so switching semesters left
// four courses listed that the student was not taking, above an empty grid.
//
// The compatibility constraint is as load-bearing as the fix. Six other modules
// read `parsed.picks` — the Assistant, the Profile hub on both shells, and the
// cloud snapshot — and every one of them means the live semester. So `picks`
// has to keep meaning exactly what it always meant.

test('a routine saved before scoping is read as the live one', () => {
    const book = readRoutineBook({ picks: { CSE110: 1001, MAT110: null } });
    eq(book.live.picks, { CSE110: 1001, MAT110: null });
    eq(book.bySession, {});
});

test('the live routine still serializes to a top-level picks', () => {
    // If this breaks, the Assistant and both Profile hubs silently see an empty
    // routine — they read parsed.picks and nothing tells them the shape moved.
    const book = withRoutineForSession(emptyRoutineBook(), null, { picks: { CSE221: 9001 } });
    const stored = serializeRoutineBook(book);
    eq(stored.picks, { CSE221: 9001 });
    eq(readRoutineBook(stored).live.picks, { CSE221: 9001 });
});

test('each semester keeps its own picks', () => {
    let book = withRoutineForSession(emptyRoutineBook(), null, { picks: { CSE221: 9001 } });
    book = withRoutineForSession(book, 20262, { picks: { CSE220: 5001 } });

    eq(routineForSession(book, null).picks, { CSE221: 9001 });
    eq(routineForSession(book, 20262).picks, { CSE220: 5001 });
    // The case from the report: switching to a semester never touched gives an
    // empty routine, not the other semester's courses.
    eq(routineForSession(book, 20263).picks, {});
});

test('writing one semester leaves the others alone', () => {
    let book = readRoutineBook({
        picks: { CSE221: 9001 },
        bySession: { 20262: { picks: { CSE220: 5001 } } },
    });
    book = withRoutineForSession(book, 20263, { picks: { HUM101: 3001 } });

    eq(routineForSession(book, null).picks, { CSE221: 9001 });
    eq(routineForSession(book, 20262).picks, { CSE220: 5001 });
    eq(routineForSession(book, 20263).picks, { HUM101: 3001 });
});

test('a round trip through storage preserves every semester', () => {
    let book = withRoutineForSession(emptyRoutineBook(), null, { picks: { CSE221: 9001 } });
    book = withRoutineForSession(book, 20262, { picks: { CSE220: 5001, CSE251: 5002 } });
    const reread = readRoutineBook(JSON.parse(JSON.stringify(serializeRoutineBook(book))));
    eq(reread.live.picks, { CSE221: 9001 });
    eq(reread.bySession['20262'].picks, { CSE220: 5001, CSE251: 5002 });
});

test('a corrupt store degrades to empty rather than throwing', () => {
    for (const bad of [null, undefined, 'text', 42, [], {}, { picks: null }, { picks: 'x' }]) {
        const book = readRoutineBook(bad);
        eq(book.live.picks, {}, `expected empty live for ${JSON.stringify(bad)}`);
        eq(book.bySession, {});
    }
});

test('unusable session keys and picks are dropped, not half-read', () => {
    const book = readRoutineBook({
        picks: { cse110: 7, BAD: 'nope', OK: null },
        bySession: { 'not-a-session': { picks: { X: 1 } }, 20262: null, 20263: { picks: { Y: 2 } } },
    });
    // Codes are upper-cased on the way in, and a non-numeric pick is not a pick.
    eq(book.live.picks, { CSE110: 7, OK: null });
    eq(Object.keys(book.bySession).sort(), ['20262', '20263']);
    eq(book.bySession['20262'].picks, {});
    eq(book.bySession['20263'].picks, { Y: 2 });
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
