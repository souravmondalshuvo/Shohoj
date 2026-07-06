// tests/reviewsDirectory.test.js — the pure directory search filter (#345).

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterDirectory } from '../src/features/calculator/reviewsDirectory.ts';

const entry = (facultyInitials, count) => ({
  facultyInitials,
  count,
  ratings: { teaching: null, marking: null, behavior: null, difficulty: null, workload: null },
  overall: null,
});

const DIR = [entry('ABC', 3), entry('MNR', 5), entry('ABM', 2)];

test('an empty query returns the whole directory (copy, not the same ref)', () => {
  const out = filterDirectory(DIR, '   ');
  assert.deepEqual(out.map((e) => e.facultyInitials), ['ABC', 'MNR', 'ABM']);
  assert.notEqual(out, DIR);
});

test('filters by case-insensitive initials substring', () => {
  assert.deepEqual(filterDirectory(DIR, 'ab').map((e) => e.facultyInitials), ['ABC', 'ABM']);
  assert.deepEqual(filterDirectory(DIR, 'mnr').map((e) => e.facultyInitials), ['MNR']);
});

test('a non-matching query yields an empty list', () => {
  assert.deepEqual(filterDirectory(DIR, 'ZZZ'), []);
});
