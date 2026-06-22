// tests/reviewableCourse.test.js — unit tests for the reviewable-course-code
// parse + validation extracted from js/ui/render.js (Phase 5B).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReviewableCourseCode,
  parseReviewableCode,
} from '../src/features/calculator/reviewableCourse.ts';

test('parseReviewableCode pulls the code from the three legacy patterns', () => {
  assert.equal(parseReviewableCode('Data Structures (CSE220)'), 'CSE220');
  assert.equal(parseReviewableCode('CSE220'), 'CSE220');
  assert.equal(parseReviewableCode('CSE220 Data Structures'), 'CSE220');
  assert.equal(parseReviewableCode('phy111'), 'PHY111'); // uppercased
  assert.equal(parseReviewableCode('Lab Course (CSE110L)'), 'CSE110L'); // optional trailing letter
});

test('parseReviewableCode returns empty for no recognizable code', () => {
  assert.equal(parseReviewableCode('Independent Study'), '');
  assert.equal(parseReviewableCode(''), '');
  assert.equal(parseReviewableCode(null), '');
  assert.equal(parseReviewableCode(undefined), '');
});

test('getReviewableCourseCode requires the code to be in the catalog', () => {
  const known = new Set(['CSE220', 'PHY111']);
  const isKnown = (c) => known.has(c);
  assert.equal(getReviewableCourseCode('Data Structures (CSE220)', isKnown), 'CSE220');
  assert.equal(getReviewableCourseCode('phy111', isKnown), 'PHY111');
  assert.equal(getReviewableCourseCode('Made Up (ZZZ999)', isKnown), ''); // parsed but unknown
  assert.equal(getReviewableCourseCode('Independent Study', isKnown), ''); // unparseable
});
