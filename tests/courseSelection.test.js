// tests/courseSelection.test.js — pure course-identity invariants for catalogue
// selection (Phase 5C). These guard the rules that protect a user's grades when
// a course's identity changes, applied via the immutable `updateCourse` mutation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { coursePickPatch, courseResolvePatch } from '../src/features/calculator/courseSelection.ts';
import { updateCourse } from '../src/features/calculator/mutations.ts';

const COURSE = { code: 'CSE220', name: 'Data Structures', full: 'Data Structures (CSE220)', credits: 3 };
const OTHER = { code: 'CSE110', name: 'Programming Language I', full: 'Programming Language I (CSE110)', credits: 3 };

function semWith(course) {
  return [{ id: 1, courses: [{ ...course }] }];
}

// ── coursePickPatch ─────────────────────────────────────────────────────────
test('picking a suggestion fills canonical name + official credits and clears grade', () => {
  const patch = coursePickPatch(COURSE);
  assert.deepEqual(patch, {
    name: 'Data Structures (CSE220)',
    credits: 3,
    grade: '',
    gradePoint: '',
  });
});

test('picking a course replaces stale grade data from a previous course', () => {
  const before = semWith({ name: 'Old (CSE110)', credits: 3, grade: 'A', gradePoint: '4.0' });
  const after = updateCourse(before, 1, 0, coursePickPatch(COURSE));
  assert.equal(after[0].courses[0].name, 'Data Structures (CSE220)');
  assert.equal(after[0].courses[0].credits, 3);
  assert.equal(after[0].courses[0].grade, '');
  assert.equal(after[0].courses[0].gradePoint, '');
});

// ── courseResolvePatch: identity change ─────────────────────────────────────
test('resolving to a different course clears grade + gradePoint', () => {
  const patch = courseResolvePatch('Data Structures (CSE220)', OTHER, 'cse110');
  assert.equal(patch.name, 'Programming Language I (CSE110)');
  assert.equal(patch.credits, 3);
  assert.equal(patch.grade, '');
  assert.equal(patch.gradePoint, '');
});

test('resolving to the SAME course preserves valid grade data', () => {
  // prevName equals the resolved canonical name → identity unchanged → no clear.
  const patch = courseResolvePatch('Data Structures (CSE220)', COURSE, 'data structures');
  assert.equal(patch.name, 'Data Structures (CSE220)');
  assert.equal(patch.credits, 3);
  assert.equal('grade' in patch, false, 'grade must not be touched');
  assert.equal('gradePoint' in patch, false, 'gradePoint must not be touched');

  const before = semWith({ name: 'Data Structures (CSE220)', credits: 3, grade: 'A', gradePoint: '4.0' });
  const after = updateCourse(before, 1, 0, patch);
  assert.equal(after[0].courses[0].grade, 'A', 'grade preserved');
  assert.equal(after[0].courses[0].gradePoint, '4.0', 'gradePoint preserved');
});

// ── courseResolvePatch: unknown / manual text ───────────────────────────────
test('unknown manual text never inherits the previous course credits', () => {
  const patch = courseResolvePatch('Data Structures (CSE220)', null, 'My Custom Seminar');
  assert.equal(patch.name, 'My Custom Seminar');
  assert.equal(patch.credits, 0, 'no inherited credits for free text');
  assert.equal(patch.grade, '', 'identity changed → grade cleared');
  assert.equal(patch.gradePoint, '');
});

test('unknown manual text trims surrounding whitespace', () => {
  const patch = courseResolvePatch('', null, '  My Custom Seminar  ');
  assert.equal(patch.name, 'My Custom Seminar');
});

test('clearing the field resets credits and grade', () => {
  const patch = courseResolvePatch('Data Structures (CSE220)', null, '');
  assert.equal(patch.name, '');
  assert.equal(patch.credits, 0);
  assert.equal(patch.grade, '');
  assert.equal(patch.gradePoint, '');
});

test('re-typing the same free text keeps its (empty) grade untouched', () => {
  // Free-text course already named "Seminar"; resolving the same name → no clear.
  const patch = courseResolvePatch('Seminar', null, 'Seminar');
  assert.equal(patch.name, 'Seminar');
  assert.equal(patch.credits, 0);
  assert.equal('grade' in patch, false);
});

test('removing a course does not disturb sibling courses', () => {
  const before = [
    { id: 1, courses: [{ ...COURSE, grade: 'A' }, { ...OTHER, grade: 'B' }] },
  ];
  const after = updateCourse(before, 1, 0, coursePickPatch(OTHER));
  // Sibling at index 1 is untouched (same grade, same original name).
  assert.equal(after[0].courses[1].grade, 'B');
  assert.equal(after[0].courses[1].name, OTHER.name);
});
