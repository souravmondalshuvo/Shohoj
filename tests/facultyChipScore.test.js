// tests/facultyChipScore.test.js — the pure faculty-chip score model (#337),
// parity with render.js _populateFacultyChips / _applyChipScore.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHIP_HIDE_UNDER,
  CHIP_PLACEHOLDER,
  chipScoreLabel,
  computeChipAggregate,
} from '../src/features/calculator/facultyChipScore.ts';

const r = (teaching, marking, behavior) => ({ ratings: { teaching, marking, behavior } });

test('computeChipAggregate: empty list has no overall', () => {
  assert.deepEqual(computeChipAggregate([]), { overall: null, count: 0 });
});

test('computeChipAggregate: overall is the mean of the first three dimensions', () => {
  // per-dim averages: teaching 4, marking 3, behavior 5 → overall (4+3+5)/3 = 4
  const agg = computeChipAggregate([r(5, 2, 5), r(3, 4, 5)]);
  assert.equal(agg.count, 2);
  assert.ok(Math.abs(agg.overall - 4) < 1e-9);
});

test('computeChipAggregate: difficulty/workload never affect overall', () => {
  const withExtras = [
    { ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 1, workload: 1 } },
    { ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 5, workload: 5 } },
  ];
  assert.equal(computeChipAggregate(withExtras).overall, 4);
});

test('computeChipAggregate: count is the number of reviews, not rated dims', () => {
  const agg = computeChipAggregate([r(5, 5, 5), { ratings: {} }, r(1, 1, 1)]);
  assert.equal(agg.count, 3);
});

test('chipScoreLabel: hidden until CHIP_HIDE_UNDER reviews, then one decimal', () => {
  assert.equal(chipScoreLabel(4.25, CHIP_HIDE_UNDER - 1), CHIP_PLACEHOLDER);
  assert.equal(chipScoreLabel(null, 10), CHIP_PLACEHOLDER);
  assert.equal(chipScoreLabel(4.25, CHIP_HIDE_UNDER), '4.3'); // toFixed rounding
  assert.equal(chipScoreLabel(3.999, 5), '4.0');
});
