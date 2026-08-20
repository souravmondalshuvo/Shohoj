// tests/demoData.test.js — unit tests for the shell demo dataset (#309).
// Parity with getRecruiterDemoSemesters()/loadSampleData() in js/ui/render.js,
// plus the aliasing and results-model integration guarantees the reducer
// relies on.

import test from 'node:test';
import assert from 'node:assert/strict';

import { demoCalculatorState } from '../src/features/calculator/demoData.ts';
import { computeCalculatorResults } from '../src/features/calculator/results.ts';
import { UNIVERSITIES } from '../src/core/university.ts';
import { nextCompletedSemesterName } from '../src/features/calculator/semesterNaming.ts';

test('demo state mirrors the legacy recruiter dataset', () => {
  const state = demoCalculatorState();
  assert.equal(state.semesters.length, 2);
  assert.deepEqual(
    state.semesters.map((s) => s.name),
    ['Fall 2024', 'Spring 2025'],
  );
  assert.equal(state.startSeason, 'Fall');
  assert.equal(state.startYear, '2024');
  assert.equal(state.currentDept, 'CSE'); // loadSampleData() parity (#313)

  const fall = state.semesters[0];
  assert.deepEqual(
    fall.courses.map((c) => [c.name, c.grade, c.credits]),
    [
      ['Programming Language I (CSE110)', 'A-', 3],
      ['Fundamentals of English (ENG101)', 'A', 3],
      ['Principles of Physics I (PHY111)', 'B+', 3],
    ],
  );
  assert.equal(state.semesters[1].courses.length, 3);
});

test('every call returns a fresh, non-aliased object graph', () => {
  const a = demoCalculatorState();
  const b = demoCalculatorState();
  assert.notEqual(a, b);
  assert.notEqual(a.semesters, b.semesters);
  assert.notEqual(a.semesters[0].courses[0], b.semesters[0].courses[0]);
  a.semesters[0].courses[0].grade = 'F';
  assert.equal(b.semesters[0].courses[0].grade, 'A-');
});

test('demo data computes the expected results through the shared model', () => {
  const state = demoCalculatorState();
  const results = computeCalculatorResults(state, UNIVERSITIES.bracu);
  // 6 courses × 3 credits: (3.7+4.0+3.3+3.3+3.7+3.0)×3 / 18 = 3.50 exactly.
  assert.equal(results.cgpa.toFixed(2), '3.50');
  assert.equal(results.standing, 'distinction');
  assert.equal(results.headlineLabel, 'Current CGPA');
  assert.equal(results.attemptedCredits, 18);
  assert.equal(results.earnedCredits, 18);
  assert.equal(results.incompleteSemesters, 0);
});

test('the next added semester continues the demo calendar with an ordinal', () => {
  const name = nextCompletedSemesterName(demoCalculatorState(), new Date(2026, 6, 2));
  assert.equal(name, 'Summer 2025 (3rd Semester)');
});

test('demo seeds the legacy DEMO_PLAN_COURSES (#327)', () => {
  assert.deepEqual(demoCalculatorState().planCourses, ['CSE221', 'MAT120', 'PHY112']);
});
