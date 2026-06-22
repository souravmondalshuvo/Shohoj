// tests/courseSearch.test.js — unit tests for the typed course-autocomplete
// matching extracted from js/ui/suggestions.js (Phase 5B).

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveExactCourse, searchCourses } from '../src/features/calculator/courseSearch.ts';

const CATALOG = [
  { code: 'CSE110', name: 'Programming Language I', full: 'Programming Language I (CSE110)', credits: 3 },
  { code: 'CSE111', name: 'Programming Language II', full: 'Programming Language II (CSE111)', credits: 3 },
  { code: 'CSE220', name: 'Data Structures', full: 'Data Structures (CSE220)', credits: 3 },
  { code: 'MAT110', name: 'Calculus and Programming intro', full: 'Calculus and Programming intro (MAT110)', credits: 3 },
];

test('searchCourses returns [] for an empty query', () => {
  assert.deepEqual(searchCourses('', CATALOG), []);
  assert.deepEqual(searchCourses('   ', CATALOG), []);
});

test('searchCourses ranks exact code first, then prefix, then substrings', () => {
  const codes = searchCourses('CSE110', CATALOG).map((c) => c.code);
  assert.equal(codes[0], 'CSE110', 'exact code wins');

  const prefix = searchCourses('cse', CATALOG).map((c) => c.code);
  assert.deepEqual(prefix, ['CSE110', 'CSE111', 'CSE220'], 'all code-prefix matches');
});

test('searchCourses matches by name substring as the last tier', () => {
  const byName = searchCourses('data', CATALOG).map((c) => c.code);
  assert.deepEqual(byName, ['CSE220']);
});

test('searchCourses de-dupes across tiers and caps at 8', () => {
  // "programming" appears in two course names; neither is a code match.
  const byName = searchCourses('programming', CATALOG).map((c) => c.code).sort();
  assert.deepEqual(byName, ['CSE110', 'CSE111', 'MAT110']);
  assert.ok(searchCourses('c', CATALOG).length <= 8);
});

test('resolveExactCourse matches by code, full name, or name', () => {
  assert.equal(resolveExactCourse('cse220', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('Data Structures (CSE220)', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('data structures', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('nonexistent', CATALOG), null);
  assert.equal(resolveExactCourse('', CATALOG), null);
});
