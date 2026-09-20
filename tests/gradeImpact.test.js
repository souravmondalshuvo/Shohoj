/**
 * tests/gradeImpact.test.js
 *
 * The bridge from task assessments to the calculator's grade engine (#721) —
 * src/features/tasks/gradeImpact.ts.
 *
 * The point of this module is that it contains NO grade arithmetic: it turns
 * assessments into the components `computeCourseMarks` already reads. So these
 * tests mostly assert that the bridge preserves meaning — especially the
 * difference between "not marked yet" and "scored zero", which every projection
 * downstream depends on.
 *
 * The worked example is the brief's own: MAT215, marks in hand, a 40% final,
 * and "is an A still possible".
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gradeImpactFor,
  gradeWindow,
  neededOnTask,
  toMarkComponents,
} from '../src/features/tasks/gradeImpact.ts';

const task = (id, title) => ({
  id: `tsk_${String(id).padStart(32, '0')}`,
  enrollmentId: 'enr_' + 'a'.repeat(32),
  title,
  description: null,
  type: 'EXAM',
  status: 'TODO',
  priority: 'MEDIUM',
  priorityScore: null,
  dueAt: null,
  startAt: null,
  estimatedMinutes: null,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
});

const assessment = (over) => ({
  taskId: 'tsk_x',
  totalMarks: 100,
  earnedMarks: null,
  weightPercent: 0,
  syllabus: null,
  location: null,
  notes: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

/**
 * The brief's MAT215: 60% already marked at 51/60, a 40% final still to come.
 */
const MAT215 = [
  {
    task: task(1, 'Midterm + quizzes'),
    assessment: assessment({ weightPercent: 60, totalMarks: 60, earnedMarks: 51 }),
  },
  {
    task: task(2, 'Final Exam'),
    assessment: assessment({ weightPercent: 40, totalMarks: 40, earnedMarks: null }),
  },
];

// ── The bridge ──────────────────────────────────────────────────────────────

test('assessments become mark components, labelled with the task title', () => {
  const components = toMarkComponents(MAT215);
  assert.deepEqual(components, [
    { name: 'Midterm + quizzes', weight: 60, score: 51, outOf: 60 },
    { name: 'Final Exam', weight: 40, score: null, outOf: 40 },
  ]);
});

test('ungraded passes through as null, not as zero', () => {
  // THE distinction this bridge exists to preserve. Collapsing it would make
  // every ungraded course look failed.
  const [, final] = toMarkComponents(MAT215);
  assert.equal(final.score, null);

  const zeroed = toMarkComponents([
    { task: task(3, 'Missed quiz'), assessment: assessment({ weightPercent: 10, totalMarks: 10, earnedMarks: 0 }) },
  ]);
  assert.equal(zeroed[0].score, 0, 'a real zero stays zero');
});

// ── The worked example ──────────────────────────────────────────────────────

test('the brief’s question: what does the final need for an A?', () => {
  const impact = gradeImpactFor(MAT215);
  assert.notEqual(impact, null);

  // 51 of 60 in hand; the remaining 40 is the final.
  assert.equal(impact.gradedWeight, 60);
  assert.equal(impact.remainingWeight, 40);
  assert.equal(impact.weightsComplete, true);
  assert.equal(impact.floor, 51, 'if the final scores nothing');
  assert.equal(impact.ceiling, 91, 'if the final is perfect');

  const a = impact.targets.find((t) => t.letter === 'A');
  assert.equal(a.state, 'reachable', 'an A is still on');
  // BRACU's A cutoff is 90: needs 90 - 51 = 39 of the final's 40 marks.
  assert.ok(
    Math.abs(a.neededOnRemaining - 97.5) < 1e-9,
    `expected 97.5% of the final, got ${a.neededOnRemaining}`,
  );
});

test('a target beyond the ceiling is reported unreachable, not as a number', () => {
  // The honest answer to "can I still get an A+" when the arithmetic says no.
  const impact = gradeImpactFor(MAT215);
  const aPlus = impact.targets.find((t) => t.letter === 'A+');
  assert.equal(aPlus.state, 'unreachable');
  assert.equal(aPlus.neededOnRemaining, null, 'no number is worth printing here');
});

test('a target already banked is secured', () => {
  const impact = gradeImpactFor(MAT215);
  // Floor is 51, which already clears BRACU's D and C bands.
  const secured = impact.targets.filter((t) => t.state === 'secured');
  assert.ok(secured.length > 0, 'something must already be locked in at 51 in hand');
  for (const target of secured) assert.equal(target.neededOnRemaining, null);
});

// ── neededOnTask ────────────────────────────────────────────────────────────

test('neededOnTask answers for the one task a student is asking about', () => {
  const finalId = MAT215[1].task.id;
  const needed = neededOnTask(MAT215, finalId, 'A');
  assert.ok(Math.abs(needed - 97.5) < 1e-9);
});

test('neededOnTask is null when the question does not apply', () => {
  const finalId = MAT215[1].task.id;
  const gradedId = MAT215[0].task.id;

  assert.equal(neededOnTask(MAT215, gradedId, 'A'), null, 'already marked — nothing to need');
  assert.equal(neededOnTask(MAT215, finalId, 'A+'), null, 'unreachable');
  assert.equal(neededOnTask(MAT215, 'tsk_nope', 'A'), null, 'not a task in this course');
});

// ── Partial syllabuses ──────────────────────────────────────────────────────

test('a partial syllabus still computes, and says it is partial', () => {
  // The normal case, not a refusal case: a student usually enters only the
  // components they have been told about.
  const partial = [
    {
      task: task(1, 'Quiz 1'),
      assessment: assessment({ weightPercent: 10, totalMarks: 10, earnedMarks: 8 }),
    },
  ];
  const impact = gradeImpactFor(partial);
  assert.notEqual(impact, null);
  assert.equal(impact.weightsComplete, false, 'the UI must caveat rather than imply completeness');
  assert.equal(impact.totalWeight, 10);
});

test('nothing to compute from returns null rather than a fabricated answer', () => {
  assert.equal(gradeImpactFor([]), null);
  assert.equal(
    gradeImpactFor([{ task: task(1, 'x'), assessment: assessment({ weightPercent: 0 }) }]),
    null,
  );
});

// ── The window ──────────────────────────────────────────────────────────────

test('the grade window summarises best, worst and pace', () => {
  const window = gradeWindow(MAT215);
  assert.equal(window.weightsComplete, true);
  // 91 ceiling, 51 floor, 85% pace on the graded part.
  assert.equal(window.best, 'A');
  // NOT F: 51 marks are already banked and BRACU's D- band starts at 50, so
  // even a blank final leaves a pass. Exactly the kind of thing a student wants
  // to know and would not work out under exam stress.
  assert.equal(window.worst, 'D-');
  assert.equal(window.projected, 'A-', 'pace is 51/60 = 85%, which is BRACU’s A- cutoff');
});

test('the window is null when there is nothing to say', () => {
  assert.equal(gradeWindow([]), null);
});

test('the projected letter is null while nothing is marked', () => {
  const untouched = [
    {
      task: task(1, 'Final'),
      assessment: assessment({ weightPercent: 100, totalMarks: 100, earnedMarks: null }),
    },
  ];
  assert.equal(gradeWindow(untouched).projected, null, 'a pace needs at least one result');
});
