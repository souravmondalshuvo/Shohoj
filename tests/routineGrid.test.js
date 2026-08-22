/**
 * tests/routineGrid.test.js
 * Pure-core tests for the weekly-grid layout helper.
 */

import { computeGridLayout } from '../js/core/routineGrid.js';
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

// ---- Fixture: three sections covering interesting cases ----
// A: CSE220 Sun 14:00-15:20 + Tue 15:30-16:50
// B: MAT215 Mon 09:30-10:50 (different day, earlier)
// C: PHY111 Sun 14:30-15:50 (overlaps A on Sunday)
const FIXTURE = parseFeed([
    {
        sectionId: 1001, courseCode: 'CSE220', courseName: 'DS',
        sectionName: '01', capacity: 30, consumedSeat: 10, faculties: 'ABC',
        roomName: '09B-12C',
        sectionSchedule: {
            classSchedules: [
                { day: 'SUNDAY',  startTime: '14:00', endTime: '15:20' },
                { day: 'TUESDAY', startTime: '15:30', endTime: '16:50' },
            ],
        },
    },
    {
        sectionId: 1003, courseCode: 'MAT215', courseName: 'LA',
        sectionName: '03', capacity: 40, consumedSeat: 5, faculties: 'PQR',
        roomName: '08A-01C',
        sectionSchedule: {
            classSchedules: [{ day: 'MONDAY', startTime: '09:30', endTime: '10:50' }],
        },
    },
    {
        sectionId: 1004, courseCode: 'PHY111', courseName: 'PH',
        sectionName: '04', capacity: 30, consumedSeat: 12, faculties: 'JKL',
        roomName: '09A-22A',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:30', endTime: '15:50' }],
        },
    },
]).sections;
const A = FIXTURE.find(s => s.sectionId === 1001);
const B = FIXTURE.find(s => s.sectionId === 1003);
const C = FIXTURE.find(s => s.sectionId === 1004);

// ---- Empty routine ----
console.log('\nempty / no-class:');
test('returns null for empty routine', () => eq(computeGridLayout([]), null));
test('returns null when no section has class slots', () => {
    const stripped = { ...A, classSlots: [] };
    eq(computeGridLayout([stripped]), null);
});
test('throws on non-positive rowMinutes', () => {
    let caught = null;
    try { computeGridLayout([A], { rowMinutes: 0 }); } catch (e) { caught = e; }
    assert(caught !== null);
});

// ---- Bounds ----
console.log('\nbounds:');
test('derived bounds snap to 30-min grid', () => {
    const layout = computeGridLayout([A, B]);
    // earliest 09:30 -> 09:30, latest 16:50 -> 17:00
    eq(layout.startMin, 9 * 60 + 30);
    eq(layout.endMin, 17 * 60);
    eq(layout.rowMinutes, 30);
    eq(layout.totalRows, 15); // (17:00 - 09:30) / 30 = 15
});
test('totalRows matches rowLabels length', () => {
    const layout = computeGridLayout([A, B]);
    eq(layout.rowLabels.length, layout.totalRows);
});
test('rowLabels are HH:MM and ascending', () => {
    const layout = computeGridLayout([A, B]);
    eq(layout.rowLabels[0], '09:30');
    eq(layout.rowLabels[1], '10:00');
    eq(layout.rowLabels[layout.rowLabels.length - 1], '16:30');
});
test('minHour / maxHour override derived bounds', () => {
    const layout = computeGridLayout([A], { minHour: 8, maxHour: 20 });
    eq(layout.startMin, 8 * 60);
    eq(layout.endMin, 20 * 60);
    eq(layout.totalRows, 24); // 12 hours * 2 rows/hr
});

// ---- Days ----
console.log('\ndays:');
test('only days with classes appear by default', () => {
    const layout = computeGridLayout([A, B]); // Sun + Tue + Mon
    eq(layout.days, ['SUNDAY', 'MONDAY', 'TUESDAY']);
});
test('pruneEmptyDays: false keeps full Sat..Fri', () => {
    const layout = computeGridLayout([A], { pruneEmptyDays: false });
    eq(layout.days, ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']);
});

// ---- Block placement ----
console.log('\nblocks:');
test('A (two slots) produces two blocks', () => {
    const layout = computeGridLayout([A]);
    eq(layout.blocks.length, 2);
    eq(layout.blocks.map(b => b.day).sort(), ['SUNDAY', 'TUESDAY']);
});
test('block fields carry section identity', () => {
    const layout = computeGridLayout([A]);
    const sunday = layout.blocks.find(b => b.day === 'SUNDAY');
    eq(sunday.sectionId, 1001);
    eq(sunday.courseCode, 'CSE220');
    eq(sunday.sectionName, '01');
    eq(sunday.facultyInitials, 'ABC');
    eq(sunday.roomName, '09B-12C');
});
test('a lab block carries the lab room, not the theory room', () => {
    const [withLab] = parseFeed([{
        sectionId: 1005, courseCode: 'CSE250', courseName: 'CIRCUITS',
        sectionName: '05', capacity: 30, consumedSeat: 4, faculties: 'MNO',
        roomName: '09B-12C', labRoomName: '10A-05L',
        sectionSchedule: {
            classSchedules: [{ day: 'MONDAY', startTime: '08:00', endTime: '09:20' }],
        },
        labSchedules: [{ day: 'WEDNESDAY', startTime: '08:00', endTime: '10:50' }],
    }]).sections;
    const layout = computeGridLayout([withLab]);
    const theory = layout.blocks.find(b => b.day === 'MONDAY');
    const lab = layout.blocks.find(b => b.day === 'WEDNESDAY');
    eq(theory.roomName, '09B-12C');
    eq(lab.roomName, '10A-05L');
});
test('CSS grid rows are 1-based; A on Sun 14:00 lands on row 10 (09:30..14:00 = 9 rows)', () => {
    const layout = computeGridLayout([A]);
    // startMin 14:00 = 13:30 + 30; actual startMin = 14:00 (snap-down already on the boundary).
    // Wait: A alone has earliest 14:00 → startMin=14:00.
    // So row 14:00 -> 1. A is 80 min -> span 3 (14:00, 14:30, 15:00 covers 14:00-15:30; 15:20 ceils to 15:30).
    const sunday = layout.blocks.find(b => b.day === 'SUNDAY');
    eq(sunday.gridRowStart, 1);
    eq(sunday.gridRowSpan, 3); // 80 min / 30 = 2.67 → 3
});
test('dayCol references position in days[] order', () => {
    const layout = computeGridLayout([A, B]); // days = [SUN, MON, TUE]
    const sunday = layout.blocks.find(b => b.day === 'SUNDAY');
    const monday = layout.blocks.find(b => b.day === 'MONDAY');
    const tuesday = layout.blocks.find(b => b.day === 'TUESDAY');
    eq(sunday.dayCol, 0);
    eq(monday.dayCol, 1);
    eq(tuesday.dayCol, 2);
});
test('overlapping Sunday sections both get blocks', () => {
    const layout = computeGridLayout([A, C]);
    const sundayBlocks = layout.blocks.filter(b => b.day === 'SUNDAY');
    eq(sundayBlocks.length, 2);
});
test('overlapping Sunday sections get distinct side-by-side sub-columns', () => {
    const layout = computeGridLayout([A, C]); // A 14:00-15:20, C 14:30-15:50 overlap
    const sun = layout.blocks.filter(b => b.day === 'SUNDAY').sort((x, y) => x.startMin - y.startMin);
    eq(sun.map(b => b.subCol), [0, 1]);    // distinct columns
    eq(sun.map(b => b.subCols), [2, 2]);   // cluster width 2 for both
});
test('non-overlapping blocks stay single-column (subCol 0 / subCols 1)', () => {
    const layout = computeGridLayout([A, B]); // no two share a day+time
    for (const b of layout.blocks) { eq(b.subCol, 0); eq(b.subCols, 1); }
});
test('a third concurrent section widens the cluster to 3 columns', () => {
    // D overlaps both A and C on Sunday around 14:40-15:10.
    const D = parseFeed([{
        sectionId: 1005, courseCode: 'CHE101', courseName: 'CH',
        sectionName: '05', capacity: 30, consumedSeat: 1, faculties: 'XYZ',
        roomName: '10A-01A',
        sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '14:40', endTime: '15:10' }] },
    }]).sections[0];
    const layout = computeGridLayout([A, C, D]);
    const sun = layout.blocks.filter(b => b.day === 'SUNDAY');
    eq(sun.every(b => b.subCols === 3), true);
    eq([...sun.map(b => b.subCol)].sort(), [0, 1, 2]);
});
test('sequential same-day sections reuse a single column', () => {
    // E then F back-to-back on Monday: 09:00-10:00, 10:00-11:00 — no overlap.
    const [E, F] = parseFeed([
        { sectionId: 2001, courseCode: 'ENG101', courseName: 'E', sectionName: '01',
          capacity: 30, consumedSeat: 1, faculties: 'AAA', roomName: '01A-01A',
          sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '09:00', endTime: '10:00' }] } },
        { sectionId: 2002, courseCode: 'ENG102', courseName: 'E2', sectionName: '02',
          capacity: 30, consumedSeat: 1, faculties: 'BBB', roomName: '01A-02A',
          sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '10:00', endTime: '11:00' }] } },
    ]).sections;
    const layout = computeGridLayout([E, F]);
    const mon = layout.blocks.filter(b => b.day === 'MONDAY');
    eq(mon.every(b => b.subCol === 0 && b.subCols === 1), true);
});
test('block startMin/endMin reflect the original slot, not snapped', () => {
    const layout = computeGridLayout([A]);
    const sunday = layout.blocks.find(b => b.day === 'SUNDAY');
    eq(sunday.startMin, 14 * 60);
    eq(sunday.endMin, 15 * 60 + 20);
});
test('A slot that falls outside override bounds is skipped', () => {
    // Force minHour 16 → A's Sunday 14:00-15:20 slot is fully before window.
    const layout = computeGridLayout([A], { minHour: 16, maxHour: 20 });
    // Tuesday 15:30-16:50 clamps to 16:00-16:50 → still has a block.
    const sundayBlocks = layout.blocks.filter(b => b.day === 'SUNDAY');
    eq(sundayBlocks.length, 0);
    const tuesdayBlocks = layout.blocks.filter(b => b.day === 'TUESDAY');
    eq(tuesdayBlocks.length, 1);
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
