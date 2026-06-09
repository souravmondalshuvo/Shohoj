/**
 * tests/seatStatus.test.js
 * Pure tests for the Seat Status lookup: per-section seat math, section sort,
 * per-course summary, and the course search/ranking used by the Seats tab.
 */

import {
    TIGHT_THRESHOLD,
    seatInfo,
    sortSections,
    courseSeatSummary,
    searchCourseSections,
} from '../js/core/seatStatus.js';
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

function sec(over) {
    return {
        courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
        faculties: 'ABC', roomName: 'R1',
        sectionSchedule: { classSchedules: [] },
        ...over,
    };
}

// CSE110: §01 open (10/30), §02 full (30/30), §10 tight (18/20).
// CSE111: §01 open (1/30). MAT110: §01 open (1/30), name "Calculus".
const SECTIONS = parseFeed([
    sec({ sectionId: 1, courseCode: 'CSE110', courseName: 'Programming Language I', sectionName: '01', capacity: 30, consumedSeat: 10 }),
    sec({ sectionId: 2, courseCode: 'CSE110', courseName: 'Programming Language I', sectionName: '02', capacity: 30, consumedSeat: 30 }),
    sec({ sectionId: 3, courseCode: 'CSE110', courseName: 'Programming Language I', sectionName: '10', capacity: 20, consumedSeat: 18 }),
    sec({ sectionId: 4, courseCode: 'CSE111', courseName: 'Programming Language II', sectionName: '01', capacity: 30, consumedSeat: 1 }),
    sec({ sectionId: 5, courseCode: 'MAT110', courseName: 'Calculus and Coordinate Geometry', sectionName: '01', capacity: 30, consumedSeat: 1 }),
]).sections;
const INDEX = indexByCourse(SECTIONS);
const byId = (id) => SECTIONS.find(s => s.sectionId === id);

console.log('\nseatInfo:');
test('open section: seats left, status open', () => {
    eq(seatInfo(byId(1)), { capacity: 30, taken: 10, left: 20, pct: 10 / 30, status: 'open' });
});
test('full section: 0 left, status full', () => {
    const info = seatInfo(byId(2));
    eq([info.left, info.status], [0, 'full']);
});
test('section above the tight threshold is "tight", not full', () => {
    const info = seatInfo(byId(3)); // 18/20 = 0.9 > 0.85
    assert(info.pct > TIGHT_THRESHOLD);
    eq([info.left, info.status], [2, 'tight']);
});
test('capacity 0 is treated as open with 0 left (parity with routine seat badge)', () => {
    eq(seatInfo({ capacity: 0, consumedSeat: 0, isFull: false }), { capacity: 0, taken: 0, left: 0, pct: 0, status: 'open' });
});

console.log('\nsortSections:');
test("'section' orders numerically (01, 02, 10) and does not mutate input", () => {
    const input = INDEX.get('CSE110');
    const before = input.map(s => s.sectionName);
    const out = sortSections(input, 'section');
    eq(out.map(s => s.sectionName), ['01', '02', '10']);
    eq(input.map(s => s.sectionName), before, 'input was mutated');
});
test("'seats' puts the most open seats first, full last", () => {
    const out = sortSections(INDEX.get('CSE110'), 'seats');
    eq(out.map(s => s.sectionName), ['01', '10', '02']); // 20 left, 2 left, 0 left
});

console.log('\ncourseSeatSummary:');
test('counts open sections and total seats left', () => {
    eq(courseSeatSummary(INDEX.get('CSE110')), { totalSections: 3, openSections: 2, seatsLeft: 22 });
});

console.log('\nsearchCourseSections:');
test('empty / whitespace query returns nothing', () => {
    eq(searchCourseSections(INDEX, ''), []);
    eq(searchCourseSections(INDEX, '   '), []);
});
test('exact code match isolates that course (no accidental CSE111 pull-in)', () => {
    eq(searchCourseSections(INDEX, 'CSE110').map(g => g.courseCode), ['CSE110']);
});
test('prefix match returns all codes under that prefix, code-sorted', () => {
    eq(searchCourseSections(INDEX, 'CSE').map(g => g.courseCode), ['CSE110', 'CSE111']);
});
test('case-insensitive course-name substring matches when code does not', () => {
    eq(searchCourseSections(INDEX, 'calculus').map(g => g.courseCode), ['MAT110']);
});
test('availableOnly drops full sections and removes emptied groups', () => {
    // A query that only matches CSE110's full §02 would yield an empty group.
    const groups = searchCourseSections(INDEX, 'CSE110', { availableOnly: true });
    const cse110 = groups.find(g => g.courseCode === 'CSE110');
    eq(cse110.sections.map(s => s.sectionName), ['01', '10']); // §02 (full) dropped
});
test('sort option is applied within each group', () => {
    const groups = searchCourseSections(INDEX, 'CSE110', { sort: 'seats' });
    eq(groups[0].sections.map(s => s.sectionName), ['01', '10', '02']);
});
test('limit caps the number of course groups', () => {
    eq(searchCourseSections(INDEX, 'CSE', { limit: 1 }).map(g => g.courseCode), ['CSE110']);
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
