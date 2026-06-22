// tests/calculatorMutations.test.js — unit tests for the pure, immutable
// semester-list transforms (Phase 5B React-owned path).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCourse,
  blankCourse,
  removeCourse,
  removeSemester,
  reorderSemesters,
  updateCourse,
} from '../src/features/calculator/mutations.ts';

function fixture() {
  return [
    { id: 0, name: 'Past Semesters', summary: true, courses: [] },
    { id: 1, name: 'Fall 2024', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] },
    {
      id: 2,
      name: 'Spring 2025',
      courses: [
        { name: 'CSE111', credits: 3, grade: 'B+' },
        { name: 'MAT110', credits: 3, grade: 'A-' },
      ],
    },
  ];
}

test('addCourse appends a blank course and does not mutate the input', () => {
  const before = fixture();
  const after = addCourse(before, 1);
  assert.equal(after[1].courses.length, 2);
  assert.deepEqual(after[1].courses[1], blankCourse());
  assert.equal(before[1].courses.length, 1, 'original untouched');
});

test('removeCourse removes by index but never the last course', () => {
  const after = removeCourse(fixture(), 2, 0);
  assert.equal(after[2].courses.length, 1);
  assert.equal(after[2].courses[0].name, 'MAT110');

  const guarded = removeCourse(fixture(), 1, 0); // sem 1 has only one course
  assert.equal(guarded[1].courses.length, 1, 'last course is kept');
});

test('updateCourse patches one course field immutably', () => {
  const before = fixture();
  const after = updateCourse(before, 2, 1, { grade: 'A', gradePoint: 4 });
  assert.equal(after[2].courses[1].grade, 'A');
  assert.equal(after[2].courses[1].gradePoint, 4);
  assert.equal(after[2].courses[1].name, 'MAT110', 'other fields preserved');
  assert.equal(before[2].courses[1].grade, 'A-', 'original untouched');
});

test('removeSemester drops the matching id', () => {
  const after = removeSemester(fixture(), 1);
  assert.deepEqual(after.map((s) => s.id), [0, 2]);
});

test('reorderSemesters moves src to tgt position', () => {
  const after = reorderSemesters(fixture(), 2, 1);
  assert.deepEqual(after.map((s) => s.id), [0, 2, 1]);
});

test('reorderSemesters refuses to drop onto the summary block or with bad ids', () => {
  assert.deepEqual(reorderSemesters(fixture(), 2, 0).map((s) => s.id), [0, 1, 2]); // tgt is summary
  assert.deepEqual(reorderSemesters(fixture(), 99, 1).map((s) => s.id), [0, 1, 2]); // bad src
  assert.deepEqual(reorderSemesters(fixture(), 1, 1).map((s) => s.id), [0, 1, 2]); // same
});
