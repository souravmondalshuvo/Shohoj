/**
 * tests/routinePlannerImport.test.js
 * Pure tests for the Routine ↔ Planner bridge.
 */

import {
    resolvePlanImport,
    summarizePlanImport,
} from '../js/core/routinePlannerImport.js';
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

const mk = (sectionId, courseCode) => ({
    sectionId, courseCode, courseName: courseCode, courseCredit: 3,
    sectionName: '01', capacity: 30, consumedSeat: 5, faculties: 'ABC',
    roomName: 'R', sectionSchedule: { classSchedules: [{ day: 'SUNDAY', startTime: '09:00', endTime: '10:20' }] },
});
// Feed offers CSE220, MAT215, PHY111.
const index = indexByCourse(parseFeed([
    mk(1, 'CSE220'), mk(2, 'MAT215'), mk(3, 'PHY111'),
]).sections);

console.log('\nresolvePlanImport:');
test('importable = plan codes offered this semester', () => {
    const r = resolvePlanImport(['CSE220', 'MAT215'], index);
    eq(r.importable, ['CSE220', 'MAT215']);
    eq(r.notOffered, []);
    eq(r.alreadyPicked, []);
});
test('codes not in the feed go to notOffered', () => {
    const r = resolvePlanImport(['CSE220', 'CSE471'], index);
    eq(r.importable, ['CSE220']);
    eq(r.notOffered, ['CSE471']);
});
test('codes already in the routine are skipped', () => {
    const r = resolvePlanImport(['CSE220', 'MAT215'], index, ['CSE220']);
    eq(r.importable, ['MAT215']);
    eq(r.alreadyPicked, ['CSE220']);
});
test('normalizes case + whitespace', () => {
    const r = resolvePlanImport([' cse220 ', 'mat215'], index);
    eq(r.importable, ['CSE220', 'MAT215']);
});
test('de-dupes the plan list', () => {
    const r = resolvePlanImport(['CSE220', 'CSE220', 'cse220'], index);
    eq(r.importable, ['CSE220']);
});
test('ignores non-string / empty entries', () => {
    const r = resolvePlanImport([null, 42, '', '   ', 'CSE220'], index);
    eq(r.importable, ['CSE220']);
});
test('null / undefined plan list yields empty result', () => {
    eq(resolvePlanImport(null, index), { importable: [], notOffered: [], alreadyPicked: [] });
    eq(resolvePlanImport(undefined, index), { importable: [], notOffered: [], alreadyPicked: [] });
});
test('results are sorted', () => {
    const r = resolvePlanImport(['PHY111', 'CSE220', 'MAT215'], index);
    eq(r.importable, ['CSE220', 'MAT215', 'PHY111']);
});
test('alreadyPicked normalizes its input codes too', () => {
    const r = resolvePlanImport(['CSE220'], index, [' cse220 ']);
    eq(r.importable, []);
    eq(r.alreadyPicked, ['CSE220']);
});

console.log('\nsummarizePlanImport:');
test('summarizes a mixed result', () => {
    const r = resolvePlanImport(['CSE220', 'MAT215', 'CSE471'], index, ['MAT215']);
    // importable: CSE220; alreadyPicked: MAT215; notOffered: CSE471
    const s = summarizePlanImport(r);
    assert(s.includes('Added 1 course'), s);
    assert(s.includes('1 already in routine'), s);
    assert(s.includes('not offered this semester (CSE471)'), s);
});
test('empty everything -> nothing-to-import message', () => {
    eq(summarizePlanImport({ importable: [], notOffered: [], alreadyPicked: [] }),
       'Nothing to import from your plan.');
});
test('singular vs plural course wording', () => {
    eq(summarizePlanImport({ importable: ['A'], notOffered: [], alreadyPicked: [] }), 'Added 1 course');
    eq(summarizePlanImport({ importable: ['A', 'B'], notOffered: [], alreadyPicked: [] }), 'Added 2 courses');
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
