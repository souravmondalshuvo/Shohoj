/**
 * tests/semesterBriefing.test.js
 * Pure tests for the Profile page's "This semester" briefing: week
 * measurement (contact time, gaps, tight floor hops), exam ordering with
 * real recovery gaps, and gap-room suggestion.
 */

import {
    BRIEFING_WEEK_ORDER,
    MIN_GAP_MINUTES,
    buildExamBriefing,
    buildWeekSummary,
    collectRoutineSlots,
    formatClock,
    formatDuration,
    parseRoomFloor,
    roomsFreeThroughout,
    suggestGapRooms,
} from '../js/core/semesterBriefing.js';
import { parseFeed } from '../js/core/connectFeed.js';
import { buildRoomBusyIndex } from '../js/core/freeRooms.js';

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

function sec(over) {
    return {
        courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
        capacity: 30, consumedSeat: 1, faculties: 'ABC',
        sectionSchedule: { classSchedules: [] },
        ...over,
    };
}

// A routine shaped like the real one this feature was built against:
//   Sat  MAT215 08:00-09:20 (12A-08C) … 4h40m gap … CSE251 14:00-15:20 (07H-27C)
//   Sun  MAT111 14:00-15:20 (12A-09C) → 10 min → CSE220 15:30-16:50 (09A-01C)
const ROUTINE = parseFeed([
    sec({
        sectionId: 1, courseCode: 'MAT215', courseName: 'M', sectionName: '01', roomName: '12A-08C',
        faculties: 'JKOI',
        sectionSchedule: {
            classSchedules: [{ day: 'SATURDAY', startTime: '08:00', endTime: '09:20' }],
            midExamDate: '2026-07-27', midExamStartTime: '08:30', midExamEndTime: '10:30',
            finalExamDate: '2026-09-14', finalExamStartTime: '08:30', finalExamEndTime: '10:30',
        },
    }),
    sec({
        sectionId: 2, courseCode: 'CSE251', courseName: 'C', sectionName: '02A', roomName: '07H-27C',
        faculties: 'SEF',
        sectionSchedule: {
            classSchedules: [{ day: 'SATURDAY', startTime: '14:00', endTime: '15:20' }],
            midExamDate: '2026-07-25', midExamStartTime: '16:30', midExamEndTime: '18:30',
            finalExamDate: '2026-09-12', finalExamStartTime: '16:30', finalExamEndTime: '18:30',
        },
    }),
    sec({
        sectionId: 3, courseCode: 'MAT111', courseName: 'M1', sectionName: '01', roomName: '12A-09C',
        faculties: 'EMNH',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
            midExamDate: '2026-07-27', midExamStartTime: '14:00', midExamEndTime: '16:00',
            finalExamDate: '2026-09-14', finalExamStartTime: '14:00', finalExamEndTime: '16:00',
        },
    }),
    sec({
        sectionId: 4, courseCode: 'CSE220', courseName: 'D', sectionName: '06', roomName: '09A-01C',
        faculties: 'RAK',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '15:30', endTime: '16:50' }],
            midExamDate: '2026-07-26', midExamStartTime: '14:00', midExamEndTime: '16:00',
            finalExamDate: '2026-09-13', finalExamStartTime: '14:00', finalExamEndTime: '16:00',
        },
    }),
]).sections;

console.log('\nsemesterBriefing — room floors');

test('parses the two-digit floor prefix', () => {
    eq(parseRoomFloor('09A-01C'), 9);
    eq(parseRoomFloor('12B-20L'), 12);
    eq(parseRoomFloor('07h-27c'), 7);
});

test('refuses to guess a floor from an unparseable code', () => {
    eq(parseRoomFloor('UB40402'), null, 'legacy UB codes carry no floor prefix');
    eq(parseRoomFloor('TBA'), null);
    eq(parseRoomFloor(''), null);
    eq(parseRoomFloor(null), null);
    eq(parseRoomFloor(undefined), null);
    eq(parseRoomFloor(123), null);
});

console.log('\nsemesterBriefing — week summary');

test('flattens picks into slots ordered by day then start', () => {
    const slots = collectRoutineSlots(ROUTINE);
    eq(slots.map(s => `${s.day.slice(0, 3)} ${s.courseCode}`),
        ['SAT MAT215', 'SAT CSE251', 'SUN MAT111', 'SUN CSE220']);
});

test('a slot carries its own room, not the section room', () => {
    const withLab = parseFeed([
        sec({
            sectionId: 9, courseCode: 'CSE251', courseName: 'C', sectionName: '01',
            roomName: '07H-27C', labRoomName: '12B-20L',
            sectionSchedule: { classSchedules: [{ day: 'THURSDAY', startTime: '14:00', endTime: '15:20' }] },
            labSchedules: [{ day: 'THURSDAY', startTime: '11:00', endTime: '13:50' }],
        }),
    ]).sections;
    const slots = collectRoutineSlots(withLab);
    const lab = slots.find(s => s.kind === 'lab');
    const theory = slots.find(s => s.kind === 'theory');
    eq(lab.room, '12B-20L', 'lab keeps its own room');
    eq(theory.room, '07H-27C', 'theory keeps the section room');
});

test('measures contact time, campus days and the longest day', () => {
    const week = buildWeekSummary(ROUTINE);
    eq(week.contactMinutes, 320, '4 × 80-minute classes');
    eq(week.campusDays, 2);
    eq(week.earliestStartMin, 480, 'Saturday 08:00');
    eq(week.longestDay, 'SATURDAY');
    eq(week.longestDayMinutes, 440, '08:00 → 15:20');
});

test('counts a long wait as a gap, not a transition', () => {
    const week = buildWeekSummary(ROUTINE);
    eq(week.gaps.length, 1);
    const [gap] = week.gaps;
    eq(gap.day, 'SATURDAY');
    eq(gap.minutes, 280, '09:20 → 14:00');
    eq(gap.afterCourse, 'MAT215');
    eq(gap.beforeCourse, 'CSE251');
    eq(gap.nextRoom, '07H-27C');
    eq(gap.nextFloor, 7, 'the floor we should keep them near');
    eq(week.deadGapMinutes, 280);
});

test('flags a tight back-to-back that crosses floors', () => {
    const week = buildWeekSummary(ROUTINE);
    eq(week.hops.length, 1);
    const [hop] = week.hops;
    eq(hop.day, 'SUNDAY');
    eq(hop.minutes, 10);
    eq(hop.fromRoom, '12A-09C');
    eq(hop.toRoom, '09A-01C');
    eq(hop.floorDelta, -3, 'three floors down');
});

test('back-to-back in the same room is not a hop', () => {
    const sameRoom = parseFeed([
        sec({
            sectionId: 5, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '08:00', endTime: '09:20' }] },
        }),
        sec({
            sectionId: 6, courseCode: 'CSE111', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '09:30', endTime: '10:50' }] },
        }),
    ]).sections;
    eq(buildWeekSummary(sameRoom).hops.length, 0);
});

test('an unparseable room leaves the floor delta null rather than guessing', () => {
    const odd = parseFeed([
        sec({
            sectionId: 7, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '08:00', endTime: '09:20' }] },
        }),
        sec({
            sectionId: 8, courseCode: 'CSE111', courseName: 'C', sectionName: '01', roomName: 'ANNEX-2',
            sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '09:30', endTime: '10:50' }] },
        }),
    ]).sections;
    const [hop] = buildWeekSummary(odd).hops;
    eq(hop.floorDelta, null);
});

test('the gap threshold is configurable', () => {
    const week = buildWeekSummary(ROUTINE, { minGapMinutes: 600 });
    eq(week.gaps.length, 0, '280 minutes is under a 600-minute threshold');
    eq(week.deadGapMinutes, 0);
});

test('an empty routine measures to zero, not NaN', () => {
    const week = buildWeekSummary([]);
    eq(week.contactMinutes, 0);
    eq(week.campusDays, 0);
    eq(week.earliestStartMin, null);
    eq(week.longestDay, null);
    eq(week.gaps, []);
    eq(week.hops, []);
});

test('the week order runs Saturday → Friday', () => {
    eq(BRIEFING_WEEK_ORDER[0], 'SATURDAY');
    eq(BRIEFING_WEEK_ORDER[BRIEFING_WEEK_ORDER.length - 1], 'FRIDAY');
    assert(MIN_GAP_MINUTES > 10, 'a 10-minute BRACU break must not read as a gap');
});

console.log('\nsemesterBriefing — exam crunch');

test('orders midterms chronologically across days', () => {
    const brief = buildExamBriefing(ROUTINE, 'mid');
    eq(brief.exams.map(e => e.courseCode), ['CSE251', 'CSE220', 'MAT215', 'MAT111']);
    eq(brief.missing, []);
});

test('measures the recovery gap between consecutive exams', () => {
    const brief = buildExamBriefing(ROUTINE, 'mid');
    eq(brief.exams[0].gapHoursFromPrev, null, 'nothing precedes the first');
    eq(brief.exams[1].gapHoursFromPrev, 19.5, 'Sat 18:30 → Sun 14:00');
    eq(brief.exams[2].gapHoursFromPrev, 16.5, 'Sun 16:00 → Mon 08:30');
    eq(brief.exams[3].gapHoursFromPrev, 3.5, 'Mon 10:30 → Mon 14:00');
    eq(brief.tightestGapHours, 3.5);
});

test('flags two exams landing on one day', () => {
    const brief = buildExamBriefing(ROUTINE, 'mid');
    eq(brief.exams.map(e => e.sameDayAsPrev), [false, false, false, true]);
    eq(brief.sameDayCount, 1);
});

test('spans the whole exam season', () => {
    const brief = buildExamBriefing(ROUTINE, 'mid');
    eq(brief.spanHours, 47.5, 'first exam start Sat 16:30 → last exam end Mon 16:00');
});

test('finals are read from their own dates', () => {
    const brief = buildExamBriefing(ROUTINE, 'final');
    eq(brief.kind, 'final');
    eq(brief.exams.map(e => e.date),
        ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-14']);
    eq(brief.sameDayCount, 1);
});

test('a section with no exam date is reported, not dropped', () => {
    const partial = parseFeed([
        sec({
            sectionId: 10, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: {
                classSchedules: [],
                midExamDate: '2026-07-26', midExamStartTime: '14:00', midExamEndTime: '16:00',
            },
        }),
        sec({
            sectionId: 11, courseCode: 'CSE111', courseName: 'C', sectionName: '01', roomName: '09A-02C',
            sectionSchedule: { classSchedules: [] },
        }),
    ]).sections;
    const brief = buildExamBriefing(partial, 'mid');
    eq(brief.exams.map(e => e.courseCode), ['CSE110']);
    eq(brief.missing, ['CSE111']);
});

test('no dated exam at all yields null', () => {
    const undated = parseFeed([
        sec({
            sectionId: 12, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: { classSchedules: [] },
        }),
    ]).sections;
    eq(buildExamBriefing(undated, 'mid'), null);
    eq(buildExamBriefing([], 'mid'), null);
});

test('a single exam has no gap to measure', () => {
    const one = parseFeed([
        sec({
            sectionId: 13, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '09A-01C',
            sectionSchedule: {
                classSchedules: [],
                midExamDate: '2026-07-26', midExamStartTime: '14:00', midExamEndTime: '16:00',
            },
        }),
    ]).sections;
    const brief = buildExamBriefing(one, 'mid');
    eq(brief.tightestGapHours, null);
    eq(brief.sameDayCount, 0);
    eq(brief.spanHours, 2);
});

console.log('\nsemesterBriefing — where to wait');

// 12A-09C is busy only outside the Saturday gap; 12A-12C is busy inside it.
const CAMPUS = parseFeed([
    sec({
        sectionId: 20, courseCode: 'CSE110', courseName: 'C', sectionName: '01', roomName: '07B-12C',
        sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00', endTime: '09:20' }] },
    }),
    sec({
        sectionId: 21, courseCode: 'CSE111', courseName: 'C', sectionName: '01', roomName: '12A-12C',
        sectionSchedule: { classSchedules: [{ day: 'SATURDAY', startTime: '10:00', endTime: '11:20' }] },
    }),
    sec({
        sectionId: 22, courseCode: 'CSE112', courseName: 'C', sectionName: '01', roomName: '07B-14C',
        sectionSchedule: { classSchedules: [{ day: 'SATURDAY', startTime: '16:00', endTime: '17:20' }] },
    }),
]).sections;
const CAMPUS_INDEX = buildRoomBusyIndex(CAMPUS);

test('a room busy in the middle of the gap is not free throughout', () => {
    const free = roomsFreeThroughout(CAMPUS_INDEX, 'SATURDAY', 560, 840);
    assert(!free.includes('12A-12C'), 'busy 10:00-11:20, inside the gap');
    assert(free.includes('07B-12C'), 'only busy on Sunday');
    assert(free.includes('07B-14C'), 'busy after the gap ends');
});

test('an inverted or out-of-hours span yields nothing', () => {
    eq(roomsFreeThroughout(CAMPUS_INDEX, 'SATURDAY', 840, 560), []);
    eq(roomsFreeThroughout(CAMPUS_INDEX, 'SATURDAY', 840, 840), []);
    eq(roomsFreeThroughout(CAMPUS_INDEX, 'SATURDAY', 300, 400), [], 'before campus opens');
});

test('suggests the next class floor first', () => {
    const gap = {
        day: 'SATURDAY', startMin: 560, endMin: 840, minutes: 280,
        afterCourse: 'MAT215', beforeCourse: 'CSE251', nextRoom: '07H-27C', nextFloor: 7,
    };
    const picks = suggestGapRooms(CAMPUS_INDEX, gap);
    eq(picks.sameFloor, ['07B-12C', '07B-14C']);
    eq(picks.elsewhere, [], 'the only other room is busy inside the gap');
    eq(picks.total, 2);
});

test('reports the true total even when the lists are capped', () => {
    const gap = {
        day: 'SATURDAY', startMin: 560, endMin: 840, minutes: 280,
        afterCourse: 'MAT215', beforeCourse: 'CSE251', nextRoom: '07H-27C', nextFloor: 7,
    };
    const picks = suggestGapRooms(CAMPUS_INDEX, gap, { limit: 1 });
    eq(picks.sameFloor, ['07B-12C']);
    eq(picks.total, 2, 'total is the real count, not the capped list length');
});

test('an unknown next floor puts every room in elsewhere', () => {
    const gap = {
        day: 'SATURDAY', startMin: 560, endMin: 840, minutes: 280,
        afterCourse: 'MAT215', beforeCourse: 'CSE251', nextRoom: 'TBA', nextFloor: null,
    };
    const picks = suggestGapRooms(CAMPUS_INDEX, gap);
    eq(picks.sameFloor, []);
    eq(picks.elsewhere, ['07B-12C', '07B-14C']);
});

console.log('\nsemesterBriefing — formatting');

test('formats a minute-of-day as a 24h clock', () => {
    eq(formatClock(480), '08:00');
    eq(formatClock(545), '09:05');
    eq(formatClock(0), '00:00');
});

test('formats durations without empty units', () => {
    eq(formatDuration(280), '4h 40m');
    eq(formatDuration(60), '1h');
    eq(formatDuration(45), '45m');
    eq(formatDuration(0), '0m');
    eq(formatDuration(-5), '0m', 'never renders a negative wait');
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
