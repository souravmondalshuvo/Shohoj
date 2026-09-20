/**
 * tests/priorityExplainer.test.js
 *
 * Why a task ranks where it does, in words (#723).
 *
 * The API returns a factor breakdown so a student can interrogate the ranking;
 * four numbers are not an interrogation. These tests are about the WORDING as
 * much as the logic, which is why the wording lives in a pure module instead of
 * inside JSX where it could not be asserted.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIORITY_BAND_LABELS,
  priorityBand,
  priorityReasons,
  prioritySummary,
} from '../src/features/tasks/priorityExplainer.ts';

const NOW = new Date('2026-10-05T12:00:00');
const inHours = (h) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const task = (over = {}) => ({
  id: 'tsk_' + '0'.repeat(32),
  enrollmentId: null,
  title: 'A task',
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'MEDIUM',
  priorityScore: 50,
  dueAt: null,
  startAt: null,
  estimatedMinutes: null,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
  ...over,
});

const factors = (over = {}) => [
  { name: 'urgency', value: 0.8, weight: 0.45, points: over.urgency ?? 36 },
  { name: 'weight', value: 0.4, weight: 0.25, points: over.weight ?? 10 },
  { name: 'workload', value: 0.5, weight: 0.15, points: over.workload ?? 7.5 },
  { name: 'importance', value: 0.33, weight: 0.15, points: over.importance ?? 5 },
];

// ── Wording ─────────────────────────────────────────────────────────────────

test('a deadline reads in hours up close and days further out', () => {
  // The difference between tonight and tomorrow morning is the whole point up
  // close; "in 2.4 days" is precision nobody asked for further out.
  const at = (hours) =>
    priorityReasons(task({ dueAt: inHours(hours), priorityFactors: factors() }), { now: NOW })[0]
      .text;

  assert.match(at(0.5), /within the hour/i);
  assert.equal(at(5), 'Due in 5 hours');
  assert.equal(at(1), 'Due in 1 hour', 'singular');
  assert.equal(at(72), 'Due in 3 days');
  assert.match(at(-4), /overdue/i);
});

test('the wording describes the task, never the student', () => {
  // A tool that judges is a tool people stop opening.
  const overdue = priorityReasons(
    task({ dueAt: inHours(-48), priorityFactors: factors() }),
    { now: NOW },
  );
  const text = overdue.map((r) => r.text).join(' ');
  assert.doesNotMatch(text, /you (left|forgot|should|failed)/i);
  assert.match(text, /overdue/i);
});

test('assessment weight is named when it is known, and hedged when it is not', () => {
  const withWeight = priorityReasons(task({ priorityFactors: factors() }), {
    assessmentWeight: 40,
    now: NOW,
  });
  assert.equal(withWeight.find((r) => r.name === 'weight').text, 'Worth 40% of the course');

  const withoutWeight = priorityReasons(task({ priorityFactors: factors() }), { now: NOW });
  assert.equal(
    withoutWeight.find((r) => r.name === 'weight').text,
    'Counts toward your grade',
    'no number is invented when none is known',
  );
});

test('a fractional weight keeps its decimal, a whole one does not gain a .0', () => {
  const at = (weight) =>
    priorityReasons(task({ priorityFactors: factors() }), { assessmentWeight: weight, now: NOW })
      .find((r) => r.name === 'weight').text;
  assert.match(at(40), /40%/);
  assert.doesNotMatch(at(40), /40\.0/);
  assert.match(at(12.5), /12\.5%/);
});

test('workload reads in minutes when small and hours when not', () => {
  const at = (minutes) =>
    priorityReasons(task({ estimatedMinutes: minutes, priorityFactors: factors() }), { now: NOW })
      .find((r) => r.name === 'workload').text;
  assert.match(at(45), /45 minutes/);
  assert.match(at(420), /about 7 hours/);
});

// ── Selection ───────────────────────────────────────────────────────────────

test('only the factors that contributed are reasons', () => {
  // Listing the things that did NOT matter pads an explanation into noise.
  const reasons = priorityReasons(
    task({ dueAt: inHours(10), priorityFactors: factors({ weight: 0, workload: 0 }) }),
    { now: NOW },
  );
  assert.deepEqual(reasons.map((r) => r.name), ['urgency', 'importance']);
});

test('reasons come biggest first, with a share that sums to one', () => {
  const reasons = priorityReasons(task({ dueAt: inHours(10), priorityFactors: factors() }), {
    now: NOW,
  });
  const points = reasons.map((r) => r.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  const shares = reasons.reduce((sum, r) => sum + r.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9, `shares should sum to 1, got ${shares}`);
});

test('a task with no breakdown has no reasons rather than an empty box', () => {
  assert.deepEqual(priorityReasons(task(), { now: NOW }), []);
  assert.deepEqual(priorityReasons(task({ priorityFactors: [] }), { now: NOW }), []);
});

// ── Summary ─────────────────────────────────────────────────────────────────

test('the summary names the dominant reason, and a second only if it earns it', () => {
  // The 20% floor stops a trivial contributor being promoted just for being
  // second; the full breakdown is one tap away anyway.
  const dominant = priorityReasons(
    task({ dueAt: inHours(3), priorityFactors: factors({ urgency: 44, weight: 1, workload: 0.5, importance: 0.5 }) }),
    { now: NOW },
  );
  assert.equal(prioritySummary(dominant), 'Due in 3 hours', 'one reason when it dominates');

  const shared = priorityReasons(
    task({ dueAt: inHours(3), priorityFactors: factors({ urgency: 30, weight: 20 }) }),
    { assessmentWeight: 40, now: NOW },
  );
  assert.equal(prioritySummary(shared), 'Due in 3 hours · Worth 40% of the course');
});

test('no reasons means no summary', () => {
  assert.equal(prioritySummary([]), null);
});

// ── Bands ───────────────────────────────────────────────────────────────────

test('a score becomes a band, because 71.7 means nothing on its own', () => {
  // Showing the raw number invites comparing two scores digit by digit, which
  // implies a precision the model does not have.
  assert.equal(priorityBand(85), 'urgent');
  assert.equal(priorityBand(60), 'urgent');
  assert.equal(priorityBand(45), 'high');
  assert.equal(priorityBand(25), 'normal');
  assert.equal(priorityBand(5), 'low');
  assert.equal(priorityBand(null), null, 'an unscored task gets no band');
});

test('every band has a label, and none of them scolds', () => {
  for (const band of ['urgent', 'high', 'normal', 'low']) {
    const label = PRIORITY_BAND_LABELS[band];
    assert.equal(typeof label, 'string');
    assert.doesNotMatch(label, /late|behind|failing/i);
  }
});
