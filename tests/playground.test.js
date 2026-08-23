// tests/playground.test.js — unit tests for the CGPA Playground core (#592),
// the pure port of the grade changer and reverse solver in js/ui/playground.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  courseSignature,
  gradeOptions,
  gradedCourses,
  solveForCourse,
  whatIfTotals,
} from '../src/features/calculator/playground.ts';
import { getPlannerTotals } from '../src/features/calculator/plannerTotals.ts';
import { UNIVERSITIES } from '../src/core/university.ts';

const course = (name, credits, grade) => ({ name, credits, grade });
const inputs = (semesters) => ({ semesters, startSeason: 'Fall', startYear: '2024' });

// Two 3-credit A courses: 24 points over 6 credits, CGPA 4.00.
const twoAs = () => [
  { id: 1, name: 'Fall 2024 (1st Semester)', courses: [course('Prog (CSE110)', 3, 'A'), course('Math (MAT110)', 3, 'A')] },
];

test('graded courses exclude ungraded, point-less and unnamed rows', () => {
  const list = gradedCourses(
    inputs([
      {
        id: 1,
        name: 'Fall 2024 (1st Semester)',
        courses: [
          course('Prog (CSE110)', 3, 'A'),
          course('Untitled', 3, ''),        // no grade
          course('', 3, 'A'),               // no name
          course('Pass (CSE111)', 3, 'P'),  // carries no point
          course('Dropped (CSE112)', 3, 'W'),
        ],
      },
    ]),
  );
  assert.deepEqual(list.map((c) => c.name), ['Prog (CSE110)']);
});

test('the semester label drops its ordinal suffix', () => {
  const [only] = gradedCourses(inputs(twoAs()));
  assert.equal(only.sem, 'Fall 2024');
  assert.equal(only.key, '1-0');
});

test('a retaken attempt is not offered — changing it would move nothing', () => {
  const list = gradedCourses(
    inputs([
      { id: 1, name: 'Fall 2024', courses: [course('Prog (CSE110)', 3, 'D')] },
      { id: 2, name: 'Spring 2025', courses: [course('Prog (CSE110)', 3, 'A')] },
    ]),
  );
  // Only the counted attempt survives; the superseded D is gone.
  assert.deepEqual(list.map((c) => c.grade), ['A']);
});

test('what-if applies each change against a fixed credit base', () => {
  const semesters = twoAs();
  const totals = getPlannerTotals(inputs(semesters));
  const courses = gradedCourses(inputs(semesters));
  const result = whatIfTotals(totals, courses, { '1-0': 'B' });

  // One 3-credit A (4.0) becomes a B (3.0): 24 -> 21 points over 6 credits.
  assert.equal(result.cgpa, 3.5);
  assert.equal(result.delta, -0.5);
  assert.equal(result.changes[0].impact, -0.5);
  assert.equal(result.changes[0].newGrade, 'B');
});

test('a change naming a course that is gone is ignored', () => {
  const semesters = twoAs();
  const totals = getPlannerTotals(inputs(semesters));
  const courses = gradedCourses(inputs(semesters));
  const result = whatIfTotals(totals, courses, { '9-9': 'F' });
  assert.equal(result.changes.length, 0);
  assert.equal(result.cgpa, 4);
});

test('the signature changes when the course underneath it is edited', () => {
  const [before] = gradedCourses(inputs(twoAs()));
  const renamed = twoAs();
  renamed[0].courses[0].name = 'Programming I (CSE110)';
  const [after] = gradedCourses(inputs(renamed));
  assert.notEqual(courseSignature(before), courseSignature(after));
});

test('the solver names the weakest grade that still reaches the target', () => {
  // Three courses, 9 credits: A, A, F -> (4+4+0)*3 = 24 points, CGPA 2.67.
  const semesters = [
    {
      id: 1,
      name: 'Fall 2024',
      courses: [course('One (CSE110)', 3, 'A'), course('Two (MAT110)', 3, 'A'), course('Three (PHY111)', 3, 'F')],
    },
  ];
  const totals = getPlannerTotals(inputs(semesters));
  const courses = gradedCourses(inputs(semesters));
  const target = courses.find((c) => c.grade === 'F');

  const result = solveForCourse(totals, target, 3.0);
  assert.equal(result.kind, 'found');
  // Needs (3.0*9 - 24 + 0)/3 = 1.0 GP, so the weakest grade at or above 1.0.
  assert.ok(result.gp >= 1);
  assert.ok(result.newCgpa > totals.cgpa);
  assert.equal(result.delta, result.newCgpa - totals.cgpa);
});

test('an unreachable target reports the best the course alone can do', () => {
  const semesters = [
    { id: 1, name: 'Fall 2024', courses: [course('One (CSE110)', 3, 'F'), course('Two (MAT110)', 3, 'F')] },
  ];
  const totals = getPlannerTotals(inputs(semesters));
  const [first] = gradedCourses(inputs(semesters));

  const result = solveForCourse(totals, first, 3.5);
  assert.equal(result.kind, 'impossible');
  // Even an A here is only 12 points over 6 credits.
  assert.equal(result.bestPossible, 2);
  assert.equal(result.target, 3.5);
});

test('a target already met needs nothing from the course', () => {
  const semesters = twoAs();
  const totals = getPlannerTotals(inputs(semesters));
  const [first] = gradedCourses(inputs(semesters));
  assert.equal(solveForCourse(totals, first, 2.0).kind, 'reached');
});

test('the solver declines unanswerable questions instead of guessing', () => {
  const semesters = twoAs();
  const totals = getPlannerTotals(inputs(semesters));
  const [first] = gradedCourses(inputs(semesters));

  assert.equal(solveForCourse(totals, undefined, 3.5), null, 'no course chosen');
  assert.equal(solveForCourse(totals, first, Number.NaN), null, 'no target typed');
  assert.equal(solveForCourse(totals, first, 4.5), null, 'target above the scale');
  assert.equal(solveForCourse(totals, first, -1), null, 'target below zero');
});

test('grade options are weakest-first and carry no point-less grades', () => {
  const options = gradeOptions(UNIVERSITIES.bracu.grades);
  const points = options.map((o) => o.gp);
  assert.deepEqual(points, [...points].sort((a, b) => a - b));
  assert.equal(options.some((o) => ['P', 'I', 'W', 'F(NT)'].includes(o.grade)), false);
});
