/**
 * tests/freeRooms.test.js
 * Pure tests for the free-room finder: busy index, free-at-minute queries,
 * and free-window (complement) computation.
 */

import {
    buildRoomBusyIndex,
    busyOnDay,
    freeRoomsAt,
    freeWindowsForRoom,
    CAMPUS_START_MIN,
    CAMPUS_END_MIN,
} from '../js/core/freeRooms.js';
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

function sec(over) {
    return {
        courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
        sectionSchedule: { classSchedules: [], midExamDate: '2026-07-26', midExamStartTime: '11:00', midExamEndTime: '13:00' },
        ...over,
    };
}

// R1: CSE110 §01 Sun 08:00-09:20 + Tue 08:00-09:20, and MAT110 §01 Mon 10:00-11:20.
// R2: PHY101 §01 Sun 14:00-15:20.
// R3: two overlapping Sunday classes (to exercise merge).
// One section has a blank room and must be excluded entirely.
const SECTIONS = parseFeed([
    sec({ sectionId: 1, courseCode: 'CSE110', courseName: 'C', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'ABC', roomName: 'R1',
          sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00', endTime: '09:20' }, { day: 'TUESDAY', startTime: '08:00', endTime: '09:20' }] } }),
    sec({ sectionId: 2, courseCode: 'MAT110', courseName: 'M', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'DEF', roomName: 'R1',
          sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '10:00', endTime: '11:20' }] } }),
    sec({ sectionId: 3, courseCode: 'PHY101', courseName: 'P', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'GHI', roomName: 'R2',
          sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }] } }),
    sec({ sectionId: 4, courseCode: 'CHE101', courseName: 'CH', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'JKL', roomName: 'R3',
          sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00', endTime: '09:20' }] } }),
    sec({ sectionId: 5, courseCode: 'CHE102', courseName: 'CH2', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'MNO', roomName: 'R3',
          sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '09:00', endTime: '10:20' }] } }),
    sec({ sectionId: 6, courseCode: 'ENG101', courseName: 'E', sectionName: '01', capacity: 30, consumedSeat: 1, faculties: 'PQR', roomName: '',
          sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '08:00', endTime: '09:20' }] } }),
]).sections;

const M = (h, m = 0) => h * 60 + m;

console.log('\nbuildRoomBusyIndex:');
test('indexes only real rooms (blank/TBA excluded)', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq([...idx.keys()].sort(), ['R1', 'R2', 'R3']);
});
test('a room used by two courses collects both intervals, sorted Sat→Fri then start', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq(idx.get('R1').map(i => [i.day, i.startMin]), [
        ['SUNDAY', M(8)], ['MONDAY', M(10)], ['TUESDAY', M(8)],
    ]);
});
test('busyOnDay filters to one day', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq(busyOnDay(idx, 'R1', 'MONDAY').map(i => i.courseCode), ['MAT110']);
    eq(busyOnDay(idx, 'R1', 'WEDNESDAY'), []);
});

console.log('\nfreeRoomsAt:');
test('a room mid-class is not free; others are', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    // Sunday 08:30: R1 + R3 in class; R2 free.
    eq(freeRoomsAt(idx, 'SUNDAY', M(8, 30)), ['R2']);
});
test('classes are half-open: a room frees up exactly at endMin', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    // Sunday 09:20: R1 just ended (free). R3 still in class until 10:20.
    eq(freeRoomsAt(idx, 'SUNDAY', M(9, 20)), ['R1', 'R2']);
});
test('every room is free on a day with no classes', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq(freeRoomsAt(idx, 'WEDNESDAY', M(12)), ['R1', 'R2', 'R3']);
});

console.log('\nfreeWindowsForRoom:');
test('complement of a single class within campus hours', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    // R1 Sunday busy 08:00-09:20 → free 09:20-22:00.
    eq(freeWindowsForRoom(idx, 'R1', 'SUNDAY'), [{ startMin: M(9, 20), endMin: CAMPUS_END_MIN }]);
});
test('a midday class splits the day into two windows', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    // R1 Monday busy 10:00-11:20 → 08:00-10:00 and 11:20-22:00.
    eq(freeWindowsForRoom(idx, 'R1', 'MONDAY'), [
        { startMin: CAMPUS_START_MIN, endMin: M(10) },
        { startMin: M(11, 20), endMin: CAMPUS_END_MIN },
    ]);
});
test('overlapping classes are merged before complementing', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    // R3 Sunday 08:00-09:20 and 09:00-10:20 merge to 08:00-10:20 → free 10:20-22:00.
    eq(freeWindowsForRoom(idx, 'R3', 'SUNDAY'), [{ startMin: M(10, 20), endMin: CAMPUS_END_MIN }]);
});
test('a room free all day yields the whole campus window', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq(freeWindowsForRoom(idx, 'R2', 'TUESDAY'), [{ startMin: CAMPUS_START_MIN, endMin: CAMPUS_END_MIN }]);
});
test('custom bounds are respected', () => {
    const idx = buildRoomBusyIndex(SECTIONS);
    eq(freeWindowsForRoom(idx, 'R2', 'TUESDAY', M(9), M(17)), [{ startMin: M(9), endMin: M(17) }]);
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
