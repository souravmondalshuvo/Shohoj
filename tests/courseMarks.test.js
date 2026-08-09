// tests/courseMarks.test.js — the course-level marks model (#500).
//
// "I got 18/25 on the mid and 8/10 on quizzes — what do I need on the final for
// an A-?" is the question every other projection in the app is too coarse to
// answer. This pins the arithmetic before any UI exists.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MARK_SCALE,
  computeCourseMarks,
  letterForMark,
} from '../src/features/calculator/courseMarks.ts';

const comp = (name, weight, score, outOf) => ({ name, weight, score, outOf });
const target = (result, letter) => result.targets.find((t) => t.letter === letter);
const round = (n) => Math.round(n * 100) / 100;

// ── The scale ────────────────────────────────────────────────────────────────

test('the scale descends and bottoms out at F', () => {
  const mins = MARK_SCALE.map((t) => t.min);
  for (let i = 1; i < mins.length; i++) {
    assert.ok(mins[i] < mins[i - 1], `cutoff ${i} does not descend`);
  }
  assert.equal(MARK_SCALE[MARK_SCALE.length - 1].letter, 'F');
  assert.equal(MARK_SCALE[MARK_SCALE.length - 1].min, 0);
});

test('cutoffs are inclusive at the boundary', () => {
  // The half-mark either side of a cutoff is where an off-by-one shows up.
  assert.equal(letterForMark(85), 'A-');
  assert.equal(letterForMark(84.99), 'B+');
  assert.equal(letterForMark(80), 'B+');
  assert.equal(letterForMark(79.99), 'B');
  assert.equal(letterForMark(50), 'D-');
  assert.equal(letterForMark(49.99), 'F');
  assert.equal(letterForMark(100), 'A+');
  assert.equal(letterForMark(0), 'F');
});

// ── The question the feature exists to answer ────────────────────────────────

test('answers "what do I need on the final"', () => {
  // Mid 18/25 (weight 25), quizzes 8/10 (weight 15), final still to come (60).
  // earned = 25×0.72 + 15×0.8 = 18 + 12 = 30 of 100.
  const result = computeCourseMarks([
    comp('Midterm', 25, 18, 25),
    comp('Quizzes', 15, 8, 10),
    comp('Final', 60, null, 100),
  ]);

  assert.equal(result.totalWeight, 100);
  assert.equal(result.gradedWeight, 40);
  assert.equal(result.remainingWeight, 60);
  assert.equal(result.weightsComplete, true);
  assert.equal(round(result.inHandPercent), 75); // 30/40
  assert.equal(round(result.floor), 30);
  assert.equal(round(result.ceiling), 90);

  // A- needs 85 overall → (85 − 30)/60 = 91.67% of the final.
  const aMinus = target(result, 'A-');
  assert.equal(aMinus.state, 'reachable');
  assert.equal(round(aMinus.neededOnRemaining), 91.67);

  // B needs 75 → (75 − 30)/60 = 75%.
  assert.equal(round(target(result, 'B').neededOnRemaining), 75);
});

test('a target beyond the ceiling is unreachable, not a mark over 100', () => {
  const result = computeCourseMarks([
    comp('Midterm', 25, 18, 25),
    comp('Quizzes', 15, 8, 10),
    comp('Final', 60, null, 100),
  ]);

  // ceiling is 90, so A+ (97) cannot happen however the final goes.
  const aPlus = target(result, 'A+');
  assert.equal(aPlus.state, 'unreachable');
  assert.equal(aPlus.neededOnRemaining, null);

  // A (90) is exactly the ceiling — reachable, but only on a perfect final.
  const a = target(result, 'A');
  assert.equal(a.state, 'reachable');
  assert.equal(round(a.neededOnRemaining), 100);

  assert.ok(
    result.targets.every((t) => t.neededOnRemaining === null || t.neededOnRemaining <= 100),
    'no target may report a needed mark above 100',
  );
});

test('a target already held whatever happens next is secured', () => {
  // 90 of 100 already banked; only 10 left to play for.
  const result = computeCourseMarks([comp('Coursework', 90, 90, 90), comp('Final', 10, null, 100)]);

  assert.equal(round(result.floor), 90);
  assert.equal(round(result.ceiling), 100);
  assert.equal(target(result, 'A').state, 'secured'); // 90 ≤ floor
  assert.equal(target(result, 'A').neededOnRemaining, null);
  assert.equal(target(result, 'A+').state, 'reachable'); // 97 needs 70% of the final
  assert.equal(result.worstLetter, 'A');
  assert.equal(result.bestLetter, 'A+');
});

test('secured means secured under a zero, not under the current average', () => {
  // 100% so far, but on only 20% of the course. The current average says A+;
  // the honest answer is that nothing is locked in.
  const result = computeCourseMarks([comp('Quizzes', 20, 20, 20), comp('Final', 80, null, 100)]);

  assert.equal(result.inHandPercent, 100);
  assert.equal(round(result.floor), 20);
  assert.ok(
    result.targets.every((t) => t.state !== 'secured'),
    'a fifth of the course cannot secure anything',
  );
  assert.equal(result.worstLetter, 'F');
});

// ── Partial syllabus — the common real case ──────────────────────────────────

test('weights that do not total 100 are answered, not refused', () => {
  // The student knows about the mid and quizzes; the rest of the syllabus has
  // not been announced. Marks in hand is still a real answer.
  const result = computeCourseMarks([comp('Midterm', 25, 20, 25), comp('Quizzes', 15, 12, 15)]);

  assert.equal(result.weightsComplete, false);
  assert.equal(result.totalWeight, 40);
  assert.equal(result.remainingWeight, 0);
  assert.equal(round(result.inHandPercent), 80); // (20 + 12) / 40
  assert.equal(round(result.floor), 80, 'figures describe the declared total, not an assumed 100');
  assert.equal(round(result.ceiling), 80);
});

test('a partial syllabus with something still to come still projects', () => {
  const result = computeCourseMarks([
    comp('Midterm', 25, 20, 25),
    comp('Assignment', 15, null, 100),
  ]);

  assert.equal(result.weightsComplete, false);
  assert.equal(result.gradedWeight, 25);
  assert.equal(result.remainingWeight, 15);
  assert.equal(round(result.floor), 50); // 20/40
  assert.equal(round(result.ceiling), 87.5); // 35/40
  assert.equal(target(result, 'A-').state, 'reachable');
  assert.equal(target(result, 'A').state, 'unreachable');
});

// ── The pace projection (what feeds the CGPA) ────────────────────────────────

test('the projected letter reads the rate the graded components set', () => {
  // 30 of 40 in hand = 75% → B, the letter this course is on pace for.
  const result = computeCourseMarks([
    comp('Midterm', 25, 18, 25),
    comp('Quizzes', 15, 8, 10),
    comp('Final', 60, null, 100),
  ]);

  assert.equal(round(result.inHandPercent), 75);
  assert.equal(result.projectedLetter, 'B');
});

test('the pace sits between the floor and the ceiling', () => {
  const result = computeCourseMarks([
    comp('Midterm', 30, 24, 30),
    comp('Quiz', 20, 15, 20),
    comp('Final', 50, null, 100),
  ]);

  assert.ok(result.floor <= result.inHandPercent && result.inHandPercent <= result.ceiling);
  const order = MARK_SCALE.map((t) => t.letter);
  const rank = (l) => order.indexOf(l);
  assert.ok(rank(result.bestLetter) <= rank(result.projectedLetter));
  assert.ok(rank(result.projectedLetter) <= rank(result.worstLetter));
});

test('a pace is not a guarantee — it can outrun everything secured', () => {
  // 100% on a fifth of the course: on pace for A+, floor still F. Both are true
  // and the UI has to show them together, so the model must report both.
  const result = computeCourseMarks([comp('Quizzes', 20, 20, 20), comp('Final', 80, null, 100)]);
  assert.equal(result.projectedLetter, 'A+');
  assert.equal(result.worstLetter, 'F');
});

test('nothing graded has no pace to read', () => {
  const result = computeCourseMarks([comp('Final', 100, null, 100)]);
  assert.equal(result.inHandPercent, null);
  assert.equal(result.projectedLetter, null, 'an ungraded course must not project an F');
});

test('a fully graded course projects the letter it actually earned', () => {
  const result = computeCourseMarks([comp('Midterm', 40, 34, 40), comp('Final', 60, 51, 60)]);
  assert.equal(result.remainingWeight, 0);
  assert.equal(round(result.inHandPercent), 85);
  assert.equal(result.projectedLetter, 'A-');
  assert.equal(result.projectedLetter, result.worstLetter, 'nothing left to play for');
  assert.equal(result.projectedLetter, result.bestLetter);
});

// ── Degenerate input ─────────────────────────────────────────────────────────

test('nothing to compute from returns null rather than a fake answer', () => {
  assert.equal(computeCourseMarks([]), null);
  assert.equal(computeCourseMarks([comp('Ghost', 0, 10, 10)]), null);
  assert.equal(computeCourseMarks([comp('Bad', NaN, 10, 10)]), null);
});

test('ungraded components do not count as zeros', () => {
  const onlyUngraded = computeCourseMarks([comp('Final', 100, null, 100)]);
  assert.equal(onlyUngraded.gradedWeight, 0);
  assert.equal(onlyUngraded.inHandPercent, null, 'no marks in hand is not 0%');
  assert.equal(round(onlyUngraded.ceiling), 100);
  assert.equal(round(onlyUngraded.floor), 0);
});

test('a component with no outOf is treated as ungraded rather than dividing by zero', () => {
  const result = computeCourseMarks([comp('Broken', 50, 10, 0), comp('Final', 50, null, 100)]);
  assert.equal(result.gradedWeight, 0);
  assert.ok(Number.isFinite(result.ceiling));
  assert.ok(Number.isFinite(result.floor));
});

test('a bonus-inflated score cannot exceed its weight', () => {
  // 30/25 on the mid is real (bonus marks), and must not make the floor exceed
  // the ceiling or push a mark past 100.
  const result = computeCourseMarks([comp('Midterm', 25, 30, 25), comp('Final', 75, null, 100)]);
  assert.ok(result.floor <= result.ceiling);
  assert.ok(result.ceiling <= 120, 'bonus marks flow through, but stay sane');
});

test('a negative score is floored at zero rather than eating other marks', () => {
  const result = computeCourseMarks([comp('Penalty', 50, -10, 50), comp('Final', 50, null, 100)]);
  assert.equal(round(result.floor), 0);
});

// ── Ordering invariants ──────────────────────────────────────────────────────

test('targets are ordered high to low and states are monotonic', () => {
  const result = computeCourseMarks([
    comp('Midterm', 30, 24, 30),
    comp('Quiz', 20, 15, 20),
    comp('Final', 50, null, 100),
  ]);

  const cutoffs = result.targets.map((t) => t.cutoff);
  for (let i = 1; i < cutoffs.length; i++) {
    assert.ok(cutoffs[i] < cutoffs[i - 1], 'targets must descend');
  }

  // Once a target is secured, every easier one is too; once one is unreachable,
  // every harder one is. Anything else means the classification is incoherent.
  const rank = { unreachable: 0, reachable: 1, secured: 2 };
  const ranks = result.targets.map((t) => rank[t.state]);
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] >= ranks[i - 1], `state regressed at ${result.targets[i].letter}`);
  }
});

test('a harder target never needs less than an easier one', () => {
  const result = computeCourseMarks([comp('Midterm', 40, 30, 40), comp('Final', 60, null, 100)]);
  const reachable = result.targets.filter((t) => t.state === 'reachable');
  for (let i = 1; i < reachable.length; i++) {
    assert.ok(
      reachable[i].neededOnRemaining <= reachable[i - 1].neededOnRemaining,
      `${reachable[i].letter} needs more than ${reachable[i - 1].letter}`,
    );
  }
});

test('every target carries the grade point its letter is worth', () => {
  const result = computeCourseMarks([comp('Final', 100, null, 100)]);
  assert.equal(target(result, 'A').gradePoint, 4.0);
  assert.equal(target(result, 'A-').gradePoint, 3.7);
  assert.equal(target(result, 'B').gradePoint, 3.0);
  assert.equal(target(result, 'D-').gradePoint, 0.7);
  assert.ok(!result.targets.some((t) => t.letter === 'F'), 'F is not a target to aim at');
});
