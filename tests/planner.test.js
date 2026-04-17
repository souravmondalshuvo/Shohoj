/**
 * tests/planner.test.js
 * Tests for plan persistence: sanitizeRestoredState's handling of the
 * new planCourses field, and its behavior across upgrade/cloud/malformed payloads.
 */

import { sanitizeRestoredState } from '../js/core/helpers.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.log('  \u2717 ' + name + '\n    ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

const base = () => ({
  currentDept: 'CSE',
  semesterCounter: 1,
  semesters: [{ id: 1, name: 'Fall 2024', courses: [] }],
});

console.log('\nsanitizeRestoredState — planCourses field:');

test('missing planCourses defaults to empty array (upgrade path)', () => {
  const out = sanitizeRestoredState(base());
  eq(out.planCourses, []);
});

test('null planCourses defaults to empty array', () => {
  const s = base(); s.planCourses = null;
  eq(sanitizeRestoredState(s).planCourses, []);
});

test('undefined planCourses defaults to empty array', () => {
  const s = base(); s.planCourses = undefined;
  eq(sanitizeRestoredState(s).planCourses, []);
});

test('non-array planCourses (string) defaults to empty array', () => {
  const s = base(); s.planCourses = 'CSE110';
  eq(sanitizeRestoredState(s).planCourses, []);
});

test('non-array planCourses (object) defaults to empty array', () => {
  const s = base(); s.planCourses = { bad: true };
  eq(sanitizeRestoredState(s).planCourses, []);
});

test('valid course codes pass through', () => {
  const s = base(); s.planCourses = ['CSE110', 'MAT120', 'ENG101'];
  eq(sanitizeRestoredState(s).planCourses, ['CSE110', 'MAT120', 'ENG101']);
});

test('course codes with trailing letter pass (e.g. CSE220L)', () => {
  const s = base(); s.planCourses = ['CSE220L', 'PHY111L'];
  eq(sanitizeRestoredState(s).planCourses, ['CSE220L', 'PHY111L']);
});

test('filters out non-string entries', () => {
  const s = base(); s.planCourses = ['CSE110', 42, null, undefined, { x: 1 }, 'MAT110'];
  eq(sanitizeRestoredState(s).planCourses, ['CSE110', 'MAT110']);
});

test('filters out malformed codes', () => {
  const s = base(); s.planCourses = ['cse110', 'CSE11', 'TOOLONG12345', 'X1', '', 'CSE110'];
  eq(sanitizeRestoredState(s).planCourses, ['CSE110']);
});

test('prevents XSS-looking payloads from surviving', () => {
  const s = base(); s.planCourses = ['<script>alert(1)</script>', 'CSE110'];
  eq(sanitizeRestoredState(s).planCourses, ['CSE110']);
});

test('empty array stays empty', () => {
  const s = base(); s.planCourses = [];
  eq(sanitizeRestoredState(s).planCourses, []);
});

test('does not mutate other fields (semesters, dept)', () => {
  const s = base(); s.planCourses = ['CSE110'];
  const out = sanitizeRestoredState(s);
  eq(out.currentDept, 'CSE');
  eq(out.semesters.length, 1);
  eq(out.semesterCounter, 1);
});

test('returns null for totally malformed input (unchanged behavior)', () => {
  assert(sanitizeRestoredState(null) === null);
  assert(sanitizeRestoredState(undefined) === null);
  assert(sanitizeRestoredState('bad') === null);
  assert(sanitizeRestoredState({ semesters: 'not-array' }) === null);
});

console.log('\n\u2500'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('\nSome tests failed \u2717'); process.exit(1); }
else console.log('\nAll tests passed \u2713');
