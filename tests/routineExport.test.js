/**
 * tests/routineExport.test.js
 * Pure tests for the PNG export plan geometry (no DOM/canvas needed).
 */

import {
    buildExportPlan,
    exportFileName,
    defaultHueForSection,
} from '../js/core/routineExport.js';
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

// Fixture: CSE220 Sun 14:00-15:20 + Tue 15:30-16:50; MAT215 Mon 09:30-10:50.
const layout = computeGridLayout(parseFeed([
    {
        sectionId: 1001, courseCode: 'CSE220', courseName: 'DS', sectionName: '01',
        capacity: 30, consumedSeat: 5, faculties: 'ABC', roomName: 'R1',
        sectionSchedule: { classSchedules: [
            { day: 'SUNDAY', startTime: '14:00', endTime: '15:20' },
            { day: 'TUESDAY', startTime: '15:30', endTime: '16:50' },
        ] },
    },
    {
        sectionId: 1003, courseCode: 'MAT215', courseName: 'LA', sectionName: '03',
        capacity: 40, consumedSeat: 5, faculties: 'PQR', roomName: 'R2',
        sectionSchedule: { classSchedules: [{ day: 'MONDAY', startTime: '09:30', endTime: '10:50' }] },
    },
]).sections);

console.log('\nbuildExportPlan dimensions:');
test('canvas width = padding*2 + timeCol + days*dayCol', () => {
    const plan = buildExportPlan(layout, { padding: 16, timeColWidth: 64, dayColWidth: 150 });
    // days = SUN, MON, TUE → 3 cols
    eq(layout.days.length, 3);
    eq(plan.width, 16 * 2 + 64 + 3 * 150);
});
test('canvas height grows with totalRows', () => {
    const plan = buildExportPlan(layout, { padding: 16, headerHeight: 34, rowHeight: 22 });
    eq(plan.height, 16 * 2 + 0 + (34 + layout.totalRows * 22));
});
test('title adds titleHeight to canvas height', () => {
    const noTitle = buildExportPlan(layout, {});
    const withTitle = buildExportPlan(layout, { title: 'My Routine', titleHeight: 36 });
    eq(withTitle.height - noTitle.height, 36);
});

console.log('\nbuildExportPlan ops:');
test('first op is the background rect covering the whole canvas', () => {
    const plan = buildExportPlan(layout, {});
    const bg = plan.ops[0];
    eq(bg.type, 'rect');
    eq(bg.x, 0); eq(bg.y, 0);
    eq(bg.w, plan.width); eq(bg.h, plan.height);
});
test('emits a day-header text op per day', () => {
    const plan = buildExportPlan(layout, {});
    const headers = plan.ops.filter(o => o.type === 'text' && ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].includes(o.text));
    eq(headers.length, 3);
});
test('emits a rect op per grid block', () => {
    const plan = buildExportPlan(layout, {});
    // 3 blocks: CSE220 Sun, CSE220 Tue, MAT215 Mon. Plus the bg rect.
    const rects = plan.ops.filter(o => o.type === 'rect');
    // bg + 3 blocks = 4 rects
    eq(rects.length, 4);
});
test('block rects carry hue-derived hsl fill + stroke', () => {
    const plan = buildExportPlan(layout, {});
    const blockRects = plan.ops.filter(o => o.type === 'rect' && typeof o.fill === 'string' && o.fill.startsWith('hsl'));
    eq(blockRects.length, 3);
    assert(blockRects[0].stroke.startsWith('hsl'), 'block rect should have hsl stroke');
});
test('each block emits its course code, with the room, as one text op', () => {
    const plan = buildExportPlan(layout, {});
    const codes = plan.ops.filter(o => o.type === 'text' && /^(CSE220|MAT215)\b/.test(o.text));
    // CSE220 appears twice (two slots), MAT215 once = 3
    eq(codes.length, 3);
    // Code and room ride one op so the room needs no measured offset.
    eq(codes.filter(o => o.text === 'CSE220 \u2022 R1').length, 2);
    eq(codes.filter(o => o.text === 'MAT215 \u2022 R2').length, 1);
});
test('block text is bounded by the block so a long room cannot spill into the next day', () => {
    const plan = buildExportPlan(layout, { dayColWidth: 120 });
    const blockText = plan.ops.filter(o => o.type === 'text' && /^CSE220\b/.test(o.text));
    assert(blockText.length > 0, 'expected block text ops');
    // dayColWidth 120 → block w = 116, minus the 7px inset on each side.
    for (const op of blockText) eq(op.maxWidth, 102);
});
test('title text op present when title given', () => {
    const plan = buildExportPlan(layout, { title: 'Spring 2026 Routine' });
    const titles = plan.ops.filter(o => o.type === 'text' && o.text === 'Spring 2026 Routine');
    eq(titles.length, 1);
});
test('block x position respects dayCol and column width', () => {
    const plan = buildExportPlan(layout, { padding: 16, timeColWidth: 64, dayColWidth: 150 });
    // MAT215 is on MONDAY = dayCol 1. x = 16 + 64 + 1*150 + 2 = 232
    const matRect = plan.ops.find(o => o.type === 'rect' && o.fill && o.fill.startsWith('hsl')
        && o.x === 16 + 64 + 1 * 150 + 2);
    assert(matRect, 'expected a block rect at MONDAY column x');
});

console.log('\nhelpers:');
test('defaultHueForSection is deterministic and in [0,360)', () => {
    const h = defaultHueForSection(1001);
    eq(h, defaultHueForSection(1001));
    assert(h >= 0 && h < 360, 'hue out of range: ' + h);
});
test('exportFileName encodes the date', () => {
    eq(exportFileName(new Date(2026, 5, 7)), 'shohoj-routine-2026-06-07.png');
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
