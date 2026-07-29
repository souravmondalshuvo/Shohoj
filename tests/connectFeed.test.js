/**
 * tests/connectFeed.test.js
 * Pure-core tests for the Connect CDN feed helpers: parsing, normalization,
 * indexing, class/exam clash detection, summary.
 */

import {
    parseTimeToMinutes,
    normalizeSection,
    parseFeed,
    indexByCourse,
    listCourseCodes,
    hasClassClash,
    hasExamClash,
    detectClashes,
    isClashFree,
    summarizeFeed,
} from '../js/core/connectFeed.js';
// The typed twin (#479). Imported alongside the JS so the parity block below
// fails if either copy drifts again.
import {
    normalizeSection as tsNormalizeSection,
    parseFeed as tsParseFeed,
} from '../src/core/connectFeed.ts';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

// ---- Fixture: 4 sections covering the interesting cases ----------------------
// A: CSE220 sec 01 — Sun/Tue 14:00-15:20, mid Jul-26 11:00, final Sep-13 11:00
// B: CSE230 sec 02 — Sun 14:00-15:20 (CLASS-CLASH with A), final Sep-14 11:00
// C: MAT215 sec 03 — Mon 09:30-10:50, mid Jul-26 11:00 (EXAM-CLASH with A)
// D: PHY111 sec 04 — Wed 11:00-12:20, no clashes
const FIXTURE = [
    {
        sectionId: 1001,
        courseCode: 'CSE220',
        courseName: 'DATA STRUCTURES',
        courseCredit: 3,
        sectionName: '01',
        capacity: 30,
        consumedSeat: 30,
        semesterSessionId: 20262,
        faculties: 'abc',
        roomName: '09B-12C',
        sectionSchedule: {
            classSchedules: [
                { day: 'SUNDAY', startTime: '14:00:00', endTime: '15:20:00' },
                { day: 'TUESDAY', startTime: '14:00:00', endTime: '15:20:00' },
            ],
            midExamDate: '2026-07-26',
            midExamStartTime: '11:00:00',
            midExamEndTime: '13:00:00',
            finalExamDate: '2026-09-13',
            finalExamStartTime: '11:00:00',
            finalExamEndTime: '13:00:00',
        },
    },
    {
        sectionId: 1002,
        courseCode: 'CSE230',
        courseName: 'DISCRETE MATH',
        courseCredit: 3,
        sectionName: '02',
        capacity: 30,
        consumedSeat: 10,
        semesterSessionId: 20262,
        faculties: 'XYZ',
        roomName: '09C-04A',
        sectionSchedule: {
            classSchedules: [
                { day: 'SUNDAY', startTime: '14:00:00', endTime: '15:20:00' },
            ],
            midExamDate: '2026-07-27',
            midExamStartTime: '11:00:00',
            midExamEndTime: '13:00:00',
            finalExamDate: '2026-09-14',
            finalExamStartTime: '11:00:00',
            finalExamEndTime: '13:00:00',
        },
    },
    {
        sectionId: 1003,
        courseCode: 'MAT215',
        courseName: 'LINEAR ALGEBRA',
        courseCredit: 3,
        sectionName: '03',
        capacity: 40,
        consumedSeat: 5,
        semesterSessionId: 20262,
        faculties: 'PQR',
        roomName: '08A-01C',
        sectionSchedule: {
            classSchedules: [
                { day: 'MONDAY', startTime: '09:30:00', endTime: '10:50:00' },
            ],
            midExamDate: '2026-07-26',
            midExamStartTime: '11:00:00',
            midExamEndTime: '13:00:00',
            finalExamDate: '2026-09-15',
            finalExamStartTime: '11:00:00',
            finalExamEndTime: '13:00:00',
        },
    },
    {
        sectionId: 1004,
        courseCode: 'PHY111',
        courseName: 'PHYSICS I',
        courseCredit: 3,
        sectionName: '04',
        capacity: 30,
        consumedSeat: 12,
        semesterSessionId: 20262,
        faculties: 'JKL',
        roomName: '09A-22A',
        sectionSchedule: {
            classSchedules: [
                { day: 'WEDNESDAY', startTime: '11:00:00', endTime: '12:20:00' },
            ],
            midExamDate: '2026-07-28',
            midExamStartTime: '11:00:00',
            midExamEndTime: '13:00:00',
            finalExamDate: '2026-09-16',
            finalExamStartTime: '11:00:00',
            finalExamEndTime: '13:00:00',
        },
    },
];

// ---- parseTimeToMinutes ------------------------------------------------------
console.log('\nparseTimeToMinutes:');
test('parses HH:MM:SS', () => eq(parseTimeToMinutes('14:00:00'), 14 * 60));
test('parses HH:MM', () => eq(parseTimeToMinutes('09:30'), 9 * 60 + 30));
test('trims whitespace', () => eq(parseTimeToMinutes('  08:15  '), 8 * 60 + 15));
test('returns null for missing', () => eq(parseTimeToMinutes(null), null));
test('returns null for malformed', () => eq(parseTimeToMinutes('not a time'), null));
test('returns null for out-of-range hour', () => eq(parseTimeToMinutes('25:00'), null));
test('returns null for out-of-range minute', () => eq(parseTimeToMinutes('12:60'), null));

// ---- normalizeSection --------------------------------------------------------
console.log('\nnormalizeSection:');
test('upper-cases courseCode and faculty initials', () => {
    const out = normalizeSection({
        sectionId: 1,
        courseCode: ' cse220 ',
        faculties: 'abc',
        sectionSchedule: { classSchedules: [] },
    });
    eq(out.courseCode, 'CSE220');
    eq(out.facultyInitials, 'ABC');
});
test('marks section full when consumed >= capacity', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X', capacity: 30, consumedSeat: 30,
    });
    eq(out.isFull, true);
});
test('marks section open when consumed < capacity', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X', capacity: 30, consumedSeat: 5,
    });
    eq(out.isFull, false);
});
test('does not mark section full when capacity is zero', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X', capacity: 0, consumedSeat: 0,
    });
    eq(out.isFull, false);
});
test('returns null on missing sectionId', () => {
    eq(normalizeSection({ courseCode: 'X' }), null);
});
test('returns null on missing courseCode', () => {
    eq(normalizeSection({ sectionId: 1 }), null);
});
test('drops malformed class slots but keeps valid ones', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: {
            classSchedules: [
                { day: 'SUNDAY', startTime: '14:00:00', endTime: '15:20:00' },
                { day: 'NOTADAY', startTime: '10:00', endTime: '11:00' },
                { day: 'MONDAY', startTime: '15:00', endTime: '14:00' },
                { day: 'MONDAY', startTime: 'bogus', endTime: '14:00' },
            ],
        },
    });
    eq(out.classSlots.length, 1);
    eq(out.classSlots[0].day, 'SUNDAY');
});
test('merges lab schedules into classSlots', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
        },
        labSchedules: [{ day: 'THURSDAY', startTime: '11:00', endTime: '13:50' }],
    });
    eq(out.classSlots.length, 2);
    eq(out.classSlots[1].day, 'THURSDAY');
});
test('parses classStartDate/classEndDate, nulling malformed values', () => {
    const ok = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: { classStartDate: '2026-06-09', classEndDate: '2026-09-08' },
    });
    eq([ok.classStartDate, ok.classEndDate], ['2026-06-09', '2026-09-08']);
    const bad = normalizeSection({
        sectionId: 2, courseCode: 'X',
        sectionSchedule: { classStartDate: '06/09/2026' },
    });
    eq([bad.classStartDate, bad.classEndDate], [null, null]);
});
test('rejects exam with malformed date', () => {
    const out = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: {
            midExamDate: '07/26/2026',
            midExamStartTime: '11:00',
            midExamEndTime: '13:00',
        },
    });
    eq(out.midExam, null);
});

// ---- parseFeed ---------------------------------------------------------------
console.log('\nparseFeed:');
test('parses fixture without dropping anything', () => {
    const out = parseFeed(FIXTURE);
    eq(out.sections.length, 4);
    eq(out.dropped, []);
});
test('reports dropped sectionIds for unusable entries', () => {
    const out = parseFeed([
        ...FIXTURE,
        { sectionId: 9999 }, // missing courseCode
    ]);
    eq(out.sections.length, 4);
    eq(out.dropped, [9999]);
});
test('returns empty result on non-array payload', () => {
    eq(parseFeed(null), { sections: [], dropped: [] });
    eq(parseFeed({}), { sections: [], dropped: [] });
});

// ---- indexByCourse / listCourseCodes -----------------------------------------
console.log('\nindexByCourse / listCourseCodes:');
test('groups sections by courseCode', () => {
    const { sections } = parseFeed(FIXTURE);
    const idx = indexByCourse(sections);
    eq(idx.get('CSE220').length, 1);
    eq(idx.get('CSE230').length, 1);
    eq(idx.get('MAT215').length, 1);
    eq(idx.get('PHY111').length, 1);
});
test('listCourseCodes returns sorted course codes', () => {
    const { sections } = parseFeed(FIXTURE);
    const codes = listCourseCodes(indexByCourse(sections));
    eq(codes, ['CSE220', 'CSE230', 'MAT215', 'PHY111']);
});

// ---- hasClassClash -----------------------------------------------------------
console.log('\nhasClassClash:');
test('detects exact same-day overlap', () => {
    const { sections } = parseFeed(FIXTURE);
    const A = sections.find(s => s.sectionId === 1001);
    const B = sections.find(s => s.sectionId === 1002);
    eq(hasClassClash(A, B), true);
});
test('returns false for different days', () => {
    const { sections } = parseFeed(FIXTURE);
    const A = sections.find(s => s.sectionId === 1001);
    const C = sections.find(s => s.sectionId === 1003);
    eq(hasClassClash(A, C), false);
});
test('returns false when slots touch at boundary (15:20 vs 15:20)', () => {
    const A = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
        },
    });
    const B = normalizeSection({
        sectionId: 2, courseCode: 'Y',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '15:20', endTime: '16:40' }],
        },
    });
    eq(hasClassClash(A, B), false);
});
test('returns false when comparing section to itself', () => {
    const { sections } = parseFeed(FIXTURE);
    const A = sections.find(s => s.sectionId === 1001);
    eq(hasClassClash(A, A), false);
});

// ---- hasExamClash ------------------------------------------------------------
console.log('\nhasExamClash:');
test('detects same-day same-time exam clash (mid vs mid)', () => {
    const { sections } = parseFeed(FIXTURE);
    const A = sections.find(s => s.sectionId === 1001);
    const C = sections.find(s => s.sectionId === 1003);
    eq(hasExamClash(A, C), true);
});
test('returns false for different exam dates', () => {
    const { sections } = parseFeed(FIXTURE);
    const A = sections.find(s => s.sectionId === 1001);
    const B = sections.find(s => s.sectionId === 1002);
    eq(hasExamClash(A, B), false);
});
test('detects cross clash (mid vs final on same date)', () => {
    const A = normalizeSection({
        sectionId: 1, courseCode: 'X',
        sectionSchedule: {
            midExamDate: '2026-08-01',
            midExamStartTime: '11:00', midExamEndTime: '13:00',
        },
    });
    const B = normalizeSection({
        sectionId: 2, courseCode: 'Y',
        sectionSchedule: {
            finalExamDate: '2026-08-01',
            finalExamStartTime: '12:00', finalExamEndTime: '14:00',
        },
    });
    eq(hasExamClash(A, B), true);
});

// ---- detectClashes / isClashFree ---------------------------------------------
console.log('\ndetectClashes / isClashFree:');
test('reports class + exam clashes with sorted section-id pairs', () => {
    const { sections } = parseFeed(FIXTURE);
    const report = detectClashes(sections);
    eq(report.classClashes, [[1001, 1002]]);
    eq(report.examClashes, [[1001, 1003]]);
});
test('clash-free routine (CSE230 + MAT215 + PHY111) reports empty', () => {
    const { sections } = parseFeed(FIXTURE);
    const routine = sections.filter(s => s.sectionId !== 1001);
    eq(detectClashes(routine), { classClashes: [], examClashes: [] });
    eq(isClashFree(routine), true);
});
test('isClashFree false when any clash exists', () => {
    const { sections } = parseFeed(FIXTURE);
    eq(isClashFree(sections), false);
});

// ---- summarizeFeed -----------------------------------------------------------
console.log('\nsummarizeFeed:');
test('counts courses, faculty initials, sessions', () => {
    const { sections } = parseFeed(FIXTURE);
    const summary = summarizeFeed(sections);
    eq(summary.totalSections, 4);
    eq(summary.totalCourses, 4);
    eq(summary.totalFaculty, 4);
    eq(summary.semesterSessionIds, [20262]);
});

// ---- per-slot room tagging (#479) --------------------------------------------
// Sections exercising the room rules. Kept out of FIXTURE so the count-based
// assertions above stay untouched.
const ROOM_FIXTURE = [
    {
        // Theory + lab in DIFFERENT rooms — the case the bug got wrong.
        sectionId: 2001,
        courseCode: 'CSE110',
        sectionName: '01',
        faculties: 'ABC',
        roomName: '09B-12C',
        labRoomName: '21A-05L',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00' }],
        },
        labSchedules: [{ day: 'THURSDAY', startTime: '08:00:00', endTime: '10:50:00' }],
    },
    {
        // Lab with no labRoomName → falls back to the theory room.
        sectionId: 2002,
        courseCode: 'CSE111',
        sectionName: '02',
        roomName: '09C-04A',
        sectionSchedule: {
            classSchedules: [{ day: 'MONDAY', startTime: '11:00:00', endTime: '12:20:00' }],
        },
        labSchedules: [{ day: 'TUESDAY', startTime: '14:00:00', endTime: '16:50:00' }],
    },
    {
        // Empty roomName must fall THROUGH to roomNumber (`||`, not `??`).
        sectionId: 2003,
        courseCode: 'MAT110',
        sectionName: '03',
        roomName: '',
        roomNumber: '08A-01C',
        sectionSchedule: {
            classSchedules: [{ day: 'WEDNESDAY', startTime: '09:30:00', endTime: '10:50:00' }],
        },
    },
    {
        // No room information at all → empty tag, not undefined.
        sectionId: 2004,
        courseCode: 'PHY110',
        sectionName: '04',
        sectionSchedule: {
            classSchedules: [{ day: 'SATURDAY', startTime: '13:00:00', endTime: '14:20:00' }],
        },
    },
];

console.log('\nper-slot room tagging (typed core):');
test('theory and lab slots each carry their own room', () => {
    const s = tsNormalizeSection(ROOM_FIXTURE[0]);
    eq(s.classSlots.map(x => [x.kind, x.room]), [
        ['theory', '09B-12C'],
        ['lab', '21A-05L'],
    ]);
});
test('a lab with no labRoomName falls back to the theory room', () => {
    const s = tsNormalizeSection(ROOM_FIXTURE[1]);
    eq(s.classSlots.map(x => [x.kind, x.room]), [
        ['theory', '09C-04A'],
        ['lab', '09C-04A'],
    ]);
});
test('an empty roomName falls through to roomNumber', () => {
    const s = tsNormalizeSection(ROOM_FIXTURE[2]);
    eq(s.roomName, '08A-01C');
    eq(s.classSlots.map(x => x.room), ['08A-01C']);
});
test('no room information yields an empty tag, not undefined', () => {
    const s = tsNormalizeSection(ROOM_FIXTURE[3]);
    eq(s.roomName, '');
    eq(s.classSlots.map(x => x.room), ['']);
});

// ---- twin parity (#479) ------------------------------------------------------
// js/core/connectFeed.js and src/core/connectFeed.ts are hand-kept twins with
// nothing generating one from the other. Run identical input through both and
// require byte-identical output, so the next drift fails here instead of on
// campus.
console.log('\ntwin parity (js/core vs src/core):');
test('normalizeSection agrees on every fixture section', () => {
    for (const raw of [...FIXTURE, ...ROOM_FIXTURE]) {
        eq(tsNormalizeSection(raw), normalizeSection(raw), `section ${raw.sectionId}`);
    }
});
test('parseFeed agrees on the whole payload, junk entries included', () => {
    const payload = [...FIXTURE, ...ROOM_FIXTURE, { sectionId: 9001 }, null, { courseCode: 'X' }];
    eq(tsParseFeed(payload), parseFeed(payload));
});

// -----------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
