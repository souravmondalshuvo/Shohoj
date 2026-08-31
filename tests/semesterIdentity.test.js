/**
 * tests/semesterIdentity.test.js
 * Pure-core tests for naming the semester on screen and placing it on the calendar (#633).
 *
 * The bug this guards: the CONNECT feed is an advising feed carrying exactly one
 * semester, and on 2026-08-31 that was Fall 2026 — classes from 2026-10-03 —
 * while Summer 2026 was still running. Nothing said so, so the Routine grid drew
 * a "now" line over a timetable a month away. The load-bearing assertion here is
 * that such a feed classifies `upcoming`, never `running`.
 */

import {
    describeSemester,
    formatSemesterDate,
    semesterHeadline,
    semesterIsRunning,
    semesterNameFromSessionId,
    todayISODate,
} from '../js/core/semesterIdentity.js';
import { parseFeed } from '../js/core/connectFeed.js';

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

// ---- Fixture: the real shape of the 2026-08-31 feed, shrunk ----------------
// 2034 of 2086 Fall sections ran 2026-10-03 → 2027-01-04; 43 started early on
// 2026-09-12. The proportions are what matter, not the counts.
const raw = (id, start, end) => ({
    sectionId: id, courseCode: 'CSE110', courseName: 'PL I', sectionName: String(id),
    courseCredit: 3, capacity: 30, consumedSeat: 5, faculties: 'ABC', roomName: '09B-12C',
    semesterSessionId: 20263,
    sectionSchedule: {
        classSchedules: [{ day: 'SUNDAY', startTime: '11:00:00', endTime: '12:20:00' }],
        classStartDate: start, classEndDate: end,
    },
});

const FALL = parseFeed([
    raw(1, '2026-10-03', '2027-01-04'),
    raw(2, '2026-10-03', '2027-01-04'),
    raw(3, '2026-10-03', '2027-01-04'),
    raw(4, '2026-09-12', '2026-12-27'), // the early-starting minority
]).sections;

// ---- Session ids ----------------------------------------------------------
test('a session id decodes to term and year', () => {
    eq(semesterNameFromSessionId(20261), 'Spring 2026');
    eq(semesterNameFromSessionId(20262), 'Summer 2026');
    eq(semesterNameFromSessionId(20263), 'Fall 2026');
});
test('a fourth term is not invented', () => {
    // BRACU runs three semesters. Guessing a name for a digit we have never
    // seen would put a wrong semester in the header, which is worse than none.
    eq(semesterNameFromSessionId(20264), null);
    eq(semesterNameFromSessionId(20260), null);
});
test('junk session ids yield no name', () => {
    for (const bad of [null, undefined, '20263', 1999, 20263.5, NaN]) {
        eq(semesterNameFromSessionId(bad), null, `expected null for ${String(bad)}`);
    }
});

// ---- Term dates -----------------------------------------------------------
test('term dates come from the majority, not the earliest section', () => {
    // Section 4 starts three weeks early. Taking the min would report the
    // semester as beginning 2026-09-12 and, on 2026-09-20, call it running.
    const id = describeSemester(FALL, '2026-08-31');
    eq(id.classStartDate, '2026-10-03');
    eq(id.classEndDate, '2027-01-04');
});

// ---- Status: the assertion the bug turns on -------------------------------
test('the 2026-08-31 feed reads as upcoming, not running', () => {
    const id = describeSemester(FALL, '2026-08-31');
    eq(id.sessionId, 20263);
    eq(id.name, 'Fall 2026');
    eq(id.status, 'upcoming');
    assert(semesterIsRunning(id) === false, 'a semester a month away must not read as running');
});
test('the boundary days are inside the term', () => {
    eq(describeSemester(FALL, '2026-10-03').status, 'running');
    eq(describeSemester(FALL, '2027-01-04').status, 'running');
    eq(describeSemester(FALL, '2026-10-02').status, 'upcoming');
    eq(describeSemester(FALL, '2027-01-05').status, 'ended');
});
test('a feed without term dates is unknown, and unknown is not running', () => {
    const undated = parseFeed([{ ...raw(9, null, null), sectionSchedule: { classSchedules: [] } }]).sections;
    const id = describeSemester(undated, '2026-08-31');
    eq(id.classStartDate, null);
    eq(id.status, 'unknown');
    assert(!semesterIsRunning(id), 'an unplaceable semester must not license a live-schedule claim');
});
test('an empty or absent feed degrades without throwing', () => {
    eq(describeSemester([], '2026-08-31').status, 'unknown');
    eq(describeSemester(null, '2026-08-31').sessionId, null);
    eq(describeSemester(FALL, 'not-a-date').status, 'unknown');
});
test('semesterIsRunning rejects a missing identity', () => {
    assert(!semesterIsRunning(null));
    assert(!semesterIsRunning(undefined));
});

// ---- Presentation ---------------------------------------------------------
test('dates render short and unambiguous across a year boundary', () => {
    eq(formatSemesterDate('2026-10-03'), '3 Oct 2026');
    eq(formatSemesterDate('2027-01-04'), '4 Jan 2027');
});
test('unparseable dates render as nothing rather than as Invalid Date', () => {
    for (const bad of ['2026-13-01', '2026-10-00', 'not-a-date', '', null, undefined, 20261]) {
        eq(formatSemesterDate(bad), null, `expected null for ${String(bad)}`);
    }
});
test('the headline says which semester and where it sits', () => {
    eq(semesterHeadline(describeSemester(FALL, '2026-08-31')), 'Fall 2026 · classes start 3 Oct 2026');
    eq(semesterHeadline(describeSemester(FALL, '2026-11-01')), 'Fall 2026 · classes to 4 Jan 2027');
    eq(semesterHeadline(describeSemester(FALL, '2027-02-01')), 'Fall 2026 · classes ended 4 Jan 2027');
});
test('an unnameable session still identifies itself by number', () => {
    const id = { sessionId: 20264, name: null, classStartDate: null, classEndDate: null, status: 'unknown' };
    eq(semesterHeadline(id), 'Session 20264');
    eq(semesterHeadline(null), 'Semester unknown');
});

// ---- The one clock reader -------------------------------------------------
test('todayISODate reads local calendar parts, not UTC', () => {
    // 2026-08-31 23:30 local is still 31 Aug to the student looking at it,
    // whatever UTC thinks. Constructed from local parts to assert exactly that.
    eq(todayISODate(new Date(2026, 7, 31, 23, 30)), '2026-08-31');
    eq(todayISODate(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
