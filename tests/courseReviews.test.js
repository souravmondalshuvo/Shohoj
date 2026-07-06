// tests/courseReviews.test.js — the pure course-reviews grouping model (#343).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SNIPPETS,
  SNIPPET_MAX,
  buildCourseReviewGroups,
} from '../src/features/calculator/courseReviews.ts';

const rev = (facultyInitials, over, text) => ({
  facultyInitials,
  ratings: { teaching: over, marking: over, behavior: over, difficulty: 3, workload: 3 },
  text,
});

test('empty input yields no groups', () => {
  assert.deepEqual(buildCourseReviewGroups([]), []);
});

test('groups by faculty (count desc) with overall + dimension averages', () => {
  const groups = buildCourseReviewGroups([
    rev('GHI', 4, 'a'),
    rev('ABC', 5, 'b'),
    rev('GHI', 4, 'c'),
  ]);
  assert.deepEqual(groups.map((g) => g.facultyInitials), ['GHI', 'ABC']); // GHI has 2
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].overall, 4);
  assert.equal(groups[0].ratings.teaching, 4);
});

test('attaches up to MAX_SNIPPETS latest non-empty texts per faculty', () => {
  const groups = buildCourseReviewGroups([
    rev('GHI', 4, 'first'),
    rev('GHI', 4, ''), //     empty text skipped
    rev('GHI', 4, 'second'),
    rev('GHI', 4, 'third'), // beyond the cap
  ]);
  assert.equal(groups[0].snippets.length, MAX_SNIPPETS);
  assert.deepEqual(groups[0].snippets, ['first', 'second']);
});

test('clamps long snippets to SNIPPET_MAX with an ellipsis', () => {
  const long = 'x'.repeat(SNIPPET_MAX + 50);
  const [g] = buildCourseReviewGroups([rev('GHI', 4, long)]);
  assert.equal(g.snippets[0].length, SNIPPET_MAX + 1); // +1 for the ellipsis
  assert.ok(g.snippets[0].endsWith('…'));
});

test('a faculty with no texts gets an empty snippet list', () => {
  const [g] = buildCourseReviewGroups([rev('GHI', 4, ''), rev('GHI', 4, undefined)]);
  assert.deepEqual(g.snippets, []);
});
