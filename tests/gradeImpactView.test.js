/**
 * tests/gradeImpactView.test.js
 *
 * What to SAY about a grade picture (#723).
 *
 * The arithmetic is settled elsewhere. This is about phrasing, which turns out
 * to be consequential: the same numbers read as "you need 97.5% on the final"
 * or as "an A is basically gone", and only one of those is a fact.
 *
 * Built on the brief's MAT215: 51 of 60 in hand, a 40% final still to come.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { gradeImpactView, paceText } from '../src/features/tasks/gradeImpactView.ts';

const task = (id, title) => ({
  id: `tsk_${String(id).padStart(32, '0')}`,
  enrollmentId: null,
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
  createdAt: '',
  updatedAt: '',
  completedAt: null,
});

const assessment = (over) => ({
  taskId: 'x',
  totalMarks: 100,
  earnedMarks: null,
  weightPercent: 0,
  syllabus: null,
  location: null,
  notes: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

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

test('the view reports what is in hand and what is left', () => {
  const view = gradeImpactView(MAT215);
  assert.equal(view.inHandPercent, 85);
  assert.equal(view.remainingWeight, 40);
  assert.equal(view.partial, false);
});

test('the floor line is the one a student would not work out under pressure', () => {
  // 51 banked, D- starts at 50. "Even with nothing more, this is a pass" is the
  // sentence that stops somebody writing a course off.
  const view = gradeImpactView(MAT215);
  assert.match(view.floorText, /Even with nothing more/);
  assert.match(view.floorText, /D-/);
});

test('a finished course states its result rather than a hypothetical', () => {
  const done = [
    {
      task: task(1, 'Everything'),
      assessment: assessment({ weightPercent: 100, totalMarks: 100, earnedMarks: 78 }),
    },
  ];
  const view = gradeImpactView(done);
  assert.match(view.floorText, /^Final result/);
  assert.equal(paceText(view), null, 'nothing left to pace');
});

test('the pace line always carries its own assumption', () => {
  // "On pace for an A-" is a claim about the future, and the assumption behind
  // it is exactly what makes it wrong when it is wrong.
  const text = paceText(gradeImpactView(MAT215));
  assert.match(text, /A-/);
  assert.match(text, /if the rest goes like the marked work/);
});

test('there is no pace while nothing is marked', () => {
  const untouched = [
    {
      task: task(1, 'Final'),
      assessment: assessment({ weightPercent: 100, totalMarks: 100, earnedMarks: null }),
    },
  ];
  assert.equal(paceText(gradeImpactView(untouched)), null);
});

test('targets round UP what is needed', () => {
  // Needing 97.5% means 98 marks will do and 97 will not. Rounding down would
  // tell a student they are safe at a mark that misses.
  const view = gradeImpactView(MAT215);
  const a = view.targets.find((t) => t.letter === 'A');
  assert.equal(a.state, 'reachable');
  assert.match(a.text, /98% on what is left/);
});

test('an unreachable target says so instead of printing a number nobody can use', () => {
  const view = gradeImpactView(MAT215);
  const aPlus = view.targets.find((t) => t.letter === 'A+');
  assert.equal(aPlus.state, 'unreachable');
  assert.equal(aPlus.neededPercent, null);
  assert.match(aPlus.text, /no longer reachable/);
});

test('the target list is short — the useful band, not all eleven letters', () => {
  // BRACU's scale has eleven letters. Listing every one turns a useful answer
  // into a wall.
  const view = gradeImpactView(MAT215);
  assert.ok(view.targets.length <= 3, `expected a short list, got ${view.targets.length}`);
  assert.ok(view.targets.some((t) => t.state === 'reachable'), 'and it includes what is still on');
});

test('a partial syllabus is flagged rather than presented as the whole picture', () => {
  const partial = [
    {
      task: task(1, 'Quiz 1'),
      assessment: assessment({ weightPercent: 10, totalMarks: 10, earnedMarks: 8 }),
    },
  ];
  const view = gradeImpactView(partial);
  assert.equal(view.partial, true);
});

test('nothing to say returns null, so the panel renders nothing', () => {
  assert.equal(gradeImpactView([]), null);
});
