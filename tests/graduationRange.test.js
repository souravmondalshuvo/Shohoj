// tests/graduationRange.test.js — the graduation estimate as a range rather
// than a point (#503).
//
// The tracker printed a single date derived from a flat average, with no
// indication of how soft it was, and fell back to a hardcoded DEFAULT_PACE of
// 12 without ever saying so.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDegreeProgress,
  observedPace as tsObservedPace,
} from '../src/features/calculator/degreeProgress.ts';
import { observedPace, semesterLabelAfter } from '../js/ui/tracker.js';

const CSE = {
  code: 'CSE',
  label: 'B.Sc. in CSE',
  totalCredits: 136,
  seasons: ['Spring', 'Summer', 'Fall'],
};
const NOW = new Date(2026, 6, 2);

let nextId = 1;

/** A completed semester carrying `credits` worth of passing A grades. */
function semester(name, credits) {
  const courses = [];
  let left = credits;
  let i = 0;
  while (left > 0) {
    const c = Math.min(3, left);
    courses.push({ name: `Course ${nextId}-${i} (CSE${100 + i})`, grade: 'A', credits: c });
    left -= c;
    i++;
  }
  if (!courses.length) {
    // A semester that cleared nothing — withdrawn from everything.
    courses.push({ name: `Course ${nextId}-0 (CSE100)`, grade: 'W', credits: 3 });
  }
  return { id: nextId++, name, running: false, summary: false, courses };
}

function progressFor(semesters, earned) {
  return computeDegreeProgress(
    { semesters, startSeason: 'Fall', startYear: '2022' },
    CSE,
    earned,
    NOW,
  );
}

// ── The pace model ───────────────────────────────────────────────────────────

test('a steady pace produces a tight range', () => {
  const loads = [15, 15, 15].map((c) => ({ credits: c }));
  assert.deepEqual(observedPace(loads), { fast: 15, slow: 15 });
});

test('an erratic pace produces a wide one', () => {
  const loads = [6, 24, 15].map((c) => ({ credits: c }));
  assert.deepEqual(observedPace(loads), { fast: 24, slow: 6 });
});

test('four or more observations drop the single slowest and fastest', () => {
  // Same mean as [12,12,12,12] but with one disastrous and one heroic term.
  const loads = [3, 12, 12, 21].map((c) => ({ credits: c }));
  assert.deepEqual(observedPace(loads), { fast: 12, slow: 12 }, 'outliers trimmed away');
});

test('a semester that cleared nothing is not a pace observation', () => {
  // Without the filter the slow end is 0 and the latest estimate divides by it.
  const loads = [0, 12, 15].map((c) => ({ credits: c }));
  assert.deepEqual(observedPace(loads), { fast: 15, slow: 12 });
});

test('fewer than two observations has no range', () => {
  assert.equal(observedPace([]), null);
  assert.equal(observedPace([{ credits: 15 }]), null);
  assert.equal(observedPace([{ credits: 0 }, { credits: 15 }]), null, 'zeros do not count');
});

test('the js/ twin computes the same pace (#484)', () => {
  const cases = [
    [15, 15, 15],
    [6, 24, 15],
    [3, 12, 12, 21],
    [0, 12, 15],
    [12],
    [],
    [0, 0],
    [1, 2, 3, 4, 5, 6],
  ];
  for (const loads of cases) {
    const input = loads.map((c) => ({ credits: c }));
    assert.deepEqual(
      observedPace(input),
      tsObservedPace(input),
      `twins disagree for [${loads.join(', ')}]`,
    );
  }
});

// ── The label walk ───────────────────────────────────────────────────────────

test('semesterLabelAfter walks the department calendar', () => {
  const seasons = ['Spring', 'Summer', 'Fall'];
  assert.equal(semesterLabelAfter('Fall', 2022, seasons, 1), "Fall '22");
  assert.equal(semesterLabelAfter('Fall', 2022, seasons, 2), "Spring '23");
  assert.equal(semesterLabelAfter('Fall', 2022, seasons, 4), "Fall '23");
  assert.equal(semesterLabelAfter('', 2022, seasons, 4), '—');
  assert.equal(semesterLabelAfter('Fall', 0, seasons, 4), '—');
});

// ── The tracker output ───────────────────────────────────────────────────────

test('a steady student gets a range that brackets the point estimate', () => {
  const sems = [semester('Fall 2022', 15), semester('Spring 2023', 15), semester('Summer 2023', 12)];
  const progress = progressFor(sems, 42);

  assert.equal(progress.paceAssumed, false);
  assert.equal(progress.paceObservations, 3);
  assert.ok(progress.gradRange, 'a range is offered');
  assert.equal(progress.gradRange.fastPace, 15);
  assert.equal(progress.gradRange.slowPace, 12);
  // Faster pace finishes no later than the slower one.
  assert.ok(progress.gradRange.earliestSems <= progress.gradRange.latestSems);
  assert.ok(progress.semsRemaining >= progress.gradRange.earliestSems);
  assert.ok(progress.semsRemaining <= progress.gradRange.latestSems);
});

test('an erratic student gets a wider range than a steady one', () => {
  const steady = progressFor(
    [semester('Fall 2022', 12), semester('Spring 2023', 12), semester('Summer 2023', 12)],
    36,
  );
  const erratic = progressFor(
    [semester('Fall 2022', 6), semester('Spring 2023', 24), semester('Summer 2023', 6)],
    36,
  );

  const spread = (p) => p.gradRange.latestSems - p.gradRange.earliestSems;
  assert.equal(spread(steady), 0, 'a flat history admits one answer');
  assert.ok(spread(erratic) > spread(steady), 'a lumpy history must not look precise');
});

test('too little history is labelled an assumption instead of a range', () => {
  const one = progressFor([semester('Fall 2022', 15)], 15);
  assert.equal(one.paceAssumed, true);
  assert.equal(one.paceObservations, 1);
  assert.equal(one.gradRange, null, 'no range invented from a single point');
  assert.notEqual(one.gradEstimate, '—', 'the point estimate is still offered');
});

test('a record of nothing but a withdrawal reports no observations', () => {
  const sems = [semester('Fall 2022', 15), semester('Spring 2023', 0)];
  const progress = progressFor(sems, 15);
  assert.equal(progress.paceObservations, 1, 'the withdrawn term is not a rate observation');
  assert.equal(progress.paceAssumed, true);
  assert.equal(progress.gradRange, null);
  assert.equal(progress.totalCompletedCount, 2, 'but the term was still used up');
});

test('a summary block never contributes an observation', () => {
  // Its credits sit over an *estimated* semester count, so treating them as
  // observed data is exactly the overconfidence this replaces.
  const sems = [
    { id: 900, name: 'Summary', running: false, summary: true, summaryCGPA: 3.4, summaryCredits: 60 },
    semester('Fall 2025', 15),
  ];
  const progress = progressFor(sems, 75);
  assert.equal(progress.paceObservations, 1);
  assert.equal(progress.gradRange, null, 'one real semester is not a range');
});

test('a graduating student still resolves to complete, with no range', () => {
  const sems = [semester('Fall 2022', 15), semester('Spring 2023', 15)];
  const progress = progressFor(sems, 136);

  assert.equal(progress.creditsRemaining, 0);
  assert.equal(progress.gradRange, null, 'nothing left to take, nothing to bracket');
  assert.ok(progress.graduation);
  assert.equal(progress.graduation.complete, true);
});

test('the projected nodes still follow the likely case, not the range', () => {
  const sems = [semester('Fall 2022', 6), semester('Spring 2023', 24), semester('Summer 2023', 6)];
  const progress = progressFor(sems, 36);

  // The tracker draws at most 4 projected nodes plus "+N more"; those counts
  // must add up to semsRemaining (the avgCredits answer), not to either edge.
  assert.equal(
    progress.projectedLabels.length + progress.projectedMore,
    progress.semsRemaining,
    'projected nodes must not drift from the date they illustrate',
  );
  assert.equal(progress.graduation.estimate, progress.gradEstimate);
});
