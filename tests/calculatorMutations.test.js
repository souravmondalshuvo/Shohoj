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
  setCourseMarks,
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
  assert.deepEqual(
    after.map((s) => s.id),
    [0, 2],
  );
});

test('reorderSemesters moves src to tgt position', () => {
  const after = reorderSemesters(fixture(), 2, 1);
  assert.deepEqual(
    after.map((s) => s.id),
    [0, 2, 1],
  );
});

test('reorderSemesters refuses to drop onto the summary block or with bad ids', () => {
  assert.deepEqual(
    reorderSemesters(fixture(), 2, 0).map((s) => s.id),
    [0, 1, 2],
  ); // tgt is summary
  assert.deepEqual(
    reorderSemesters(fixture(), 99, 1).map((s) => s.id),
    [0, 1, 2],
  ); // bad src
  assert.deepEqual(
    reorderSemesters(fixture(), 1, 1).map((s) => s.id),
    [0, 1, 2],
  ); // same
});

// ── Mark components (#500) ───────────────────────────────────────────────────

const comp = (name, weight, score, outOf) => ({ name, weight, score, outOf });

test('setCourseMarks attaches components to one course immutably', () => {
  const before = fixture();
  const marks = [comp('Midterm', 25, 18, 25)];
  const after = setCourseMarks(before, 2, 0, marks);

  assert.deepEqual(after[2].courses[0].marks, marks);
  assert.equal(before[2].courses[0].marks, undefined, 'original untouched');
  assert.equal(after[2].courses[1].marks, undefined, 'sibling course untouched');
  assert.equal(after[1].courses[0].marks, undefined, 'other semester untouched');
});

test('setCourseMarks copies the components rather than aliasing the caller', () => {
  const marks = [comp('Midterm', 25, 18, 25)];
  const after = setCourseMarks(fixture(), 2, 0, marks);
  marks[0].score = 99;
  assert.equal(after[2].courses[0].marks[0].score, 18, 'stored marks must not alias');
});

test('clearing the last component removes the key, not just its contents', () => {
  // A course nobody tracked has to stay byte-identical to a pre-#500 course, so
  // an emptied tracker must leave nothing behind in the saved document.
  const tracked = setCourseMarks(fixture(), 2, 0, [comp('Midterm', 25, 18, 25)]);
  const cleared = setCourseMarks(tracked, 2, 0, []);

  assert.ok(!('marks' in cleared[2].courses[0]), 'the marks key must be gone');
  assert.deepEqual(cleared[2].courses[0], fixture()[2].courses[0]);
});

test('clearing a course that never tracked marks leaves it untouched', () => {
  const before = fixture();
  const after = setCourseMarks(before, 2, 0, []);
  assert.equal(after[2].courses[0], before[2].courses[0], 'no needless copy');
});

test('setCourseMarks ignores an unknown semester or course index', () => {
  const before = fixture();
  assert.deepEqual(setCourseMarks(before, 99, 0, [comp('X', 10, 5, 10)]), before);
  assert.deepEqual(setCourseMarks(before, 2, 99, [comp('X', 10, 5, 10)]), before);
});
