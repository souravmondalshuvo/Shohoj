/**
 * worker/test/priority.test.js
 *
 * The automatic priority score (#721) — worker/priority.js.
 *
 * Shohoj ranks a student's work, which is a claim about their life. These tests
 * are the argument for it: the brief's own worked example, each factor in
 * isolation, and the four properties the engine promised — deterministic, no
 * magic, configurable, manual priority survives.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WEIGHTS,
  byPriorityScore,
  importanceFactor,
  scoreTask,
  scoreTasks,
  urgencyFactor,
  weightFactor,
  workloadFactor,
} from '../priority.js';

const NOW = Date.parse('2026-10-05T10:00:00Z');
const inDays = (days) => new Date(NOW + days * 86_400_000).toISOString();

const task = (over = {}) => ({
  id: 'tsk_a',
  dueAt: null,
  priority: 'MEDIUM',
  estimatedMinutes: null,
  ...over,
});

const score = (t, assessment = null, weights) =>
  scoreTask(t, { assessment, nowMs: NOW, ...(weights ? { weights } : {}) }).score;

// ── The brief's worked example ──────────────────────────────────────────────

test("the brief's example: a weighted final beats an optional reading, substantially", () => {
  // "Final exam in 2 days, weight = 40%, estimated workload = high should rank
  //  substantially above optional reading due next week, weight = 0%."
  const final = score(
    task({ id: 'final', dueAt: inDays(2), priority: 'HIGH', estimatedMinutes: 420 }),
    { weightPercent: 40 },
  );
  const reading = score(
    task({ id: 'reading', dueAt: inDays(7), priority: 'LOW', estimatedMinutes: 40 }),
    null,
  );

  assert.ok(final > reading, `final ${final} should outrank reading ${reading}`);
  // "Substantially" made concrete: not a hair's breadth, a clear separation.
  assert.ok(
    final - reading > 30,
    `expected a wide gap, got ${final} vs ${reading} (${(final - reading).toFixed(1)})`,
  );
});

test('a quiz tomorrow outranks a bigger exam a fortnight away', () => {
  // Urgency dominates, and it should: a deadline is the one factor that is not
  // a matter of opinion.
  const tomorrow = score(task({ dueAt: inDays(1) }), { weightPercent: 10 });
  const later = score(task({ dueAt: inDays(14) }), { weightPercent: 40 });
  assert.ok(tomorrow > later, `${tomorrow} vs ${later}`);
});

test('past the horizon, weight decides', () => {
  // Beyond a fortnight urgency is 0 for everything, so what the grade rides on
  // is what separates them — which is the point of the horizon.
  const heavy = score(task({ dueAt: inDays(40) }), { weightPercent: 40 });
  const light = score(task({ dueAt: inDays(20) }), { weightPercent: 5 });
  assert.ok(heavy > light, `${heavy} vs ${light}`);
});

// ── Factors in isolation ────────────────────────────────────────────────────

test('urgency is 1 when overdue and stays there', () => {
  // There is no "more overdue". Something a week late is not more urgent than
  // something a day late, and scaling past 1 would let ancient forgotten work
  // outrank tomorrow's final.
  assert.equal(urgencyFactor(NOW - 1000, NOW), 1);
  assert.equal(urgencyFactor(NOW - 30 * 86_400_000, NOW), 1);
  assert.equal(urgencyFactor(NOW, NOW), 1, 'due exactly now counts as due');
});

test('urgency decays linearly to zero at the horizon', () => {
  const sevenDays = urgencyFactor(NOW + 7 * 86_400_000, NOW);
  assert.ok(Math.abs(sevenDays - 0.5) < 1e-9, `half the fortnight is half the urgency: ${sevenDays}`);
  assert.equal(urgencyFactor(NOW + 14 * 86_400_000, NOW), 0);
  assert.equal(urgencyFactor(NOW + 90 * 86_400_000, NOW), 0);
});

test('an undated task has zero urgency, not low urgency', () => {
  // The alternative — treating null as "far away" — would quietly place undated
  // work ahead of anything past the horizon.
  assert.equal(urgencyFactor(null, NOW), 0);
  assert.equal(urgencyFactor(undefined, NOW), 0);
  assert.equal(urgencyFactor(NaN, NOW), 0);
});

test('assessment weight maps percent onto the scale, and clamps a typo', () => {
  assert.equal(weightFactor(40), 0.4);
  assert.equal(weightFactor(100), 1);
  assert.equal(weightFactor(400), 1, 'a mistyped 400 must not dwarf every other task');
  assert.equal(weightFactor(0), 0);
  assert.equal(weightFactor(undefined), 0, 'no assessment contributes nothing');
  assert.equal(weightFactor('40'), 0);
});

test('workload saturates at a full day', () => {
  assert.equal(workloadFactor(240), 0.5);
  assert.equal(workloadFactor(480), 1);
  assert.equal(workloadFactor(1200), 1, 'a 20-hour project is big, not urgent');
  assert.equal(workloadFactor(null), 0);
});

test('manual priority is evenly spaced, and an unknown value reads as medium', () => {
  assert.equal(importanceFactor('LOW'), 0);
  assert.equal(importanceFactor('CRITICAL'), 1);
  assert.ok(importanceFactor('HIGH') > importanceFactor('MEDIUM'));
  assert.equal(importanceFactor('WHATEVER'), importanceFactor('MEDIUM'));
});

// ── The four promises ───────────────────────────────────────────────────────

test('deterministic: the same inputs give the same score', () => {
  const t = task({ dueAt: inDays(3), priority: 'HIGH', estimatedMinutes: 120 });
  const a = scoreTask(t, { assessment: { weightPercent: 20 }, nowMs: NOW });
  const b = scoreTask(t, { assessment: { weightPercent: 20 }, nowMs: NOW });
  assert.deepEqual(a, b);
});

test('explainable: the breakdown accounts for the whole score', () => {
  // A ranking a student cannot interrogate is a ranking they will not trust,
  // so the parts must actually add up to the total.
  const result = scoreTask(task({ dueAt: inDays(2), priority: 'HIGH', estimatedMinutes: 420 }), {
    assessment: { weightPercent: 40 },
    nowMs: NOW,
  });
  const summed = result.factors.reduce((total, f) => total + f.points, 0);
  assert.ok(Math.abs(summed - result.score) < 0.05, `${summed} vs ${result.score}`);
  assert.deepEqual(
    result.factors.map((f) => f.name),
    ['urgency', 'weight', 'workload', 'importance'],
  );
  for (const factor of result.factors) {
    assert.ok(factor.value >= 0 && factor.value <= 1, `${factor.name} normalised`);
    assert.equal(factor.weight, DEFAULT_WEIGHTS[factor.name]);
  }
});

test('configurable: changing the weights changes the ranking', () => {
  // Nominally configurable is not configurable. Under the default the urgent
  // task wins; under an importance-dominant set the CRITICAL one does.
  const urgent = task({ id: 'urgent', dueAt: inDays(1), priority: 'LOW' });
  const important = task({ id: 'important', dueAt: inDays(10), priority: 'CRITICAL' });

  assert.ok(score(urgent) > score(important), 'default: urgency wins');

  const importanceFirst = { urgency: 0.1, weight: 0.1, workload: 0.1, importance: 0.7 };
  assert.ok(
    score(important, null, importanceFirst) > score(urgent, null, importanceFirst),
    'reweighted: the student’s own call wins',
  );
});

test('weights that do not sum to 1 are refused, not silently rescaled', () => {
  // A set summing to anything else changes the scale of every score, so the
  // numbers stop being comparable with everything else in the product.
  assert.throws(
    () => scoreTask(task(), { nowMs: NOW, weights: { urgency: 1, weight: 1, workload: 1, importance: 1 } }),
    /sum to 1/,
  );
});

test('manual priority is an input and is never written back', () => {
  const original = task({ dueAt: inDays(1), priority: 'LOW' });
  const frozen = JSON.stringify(original);
  const [scoredTask] = scoreTasks([original], { nowMs: NOW });

  assert.equal(scoredTask.priority, 'LOW', 'the score does not overwrite the student’s pick');
  assert.equal(JSON.stringify(original), frozen, 'the input is not mutated');
  assert.equal(typeof scoredTask.priorityScore, 'number');
  assert.ok(Array.isArray(scoredTask.priorityFactors));
});

// ── Lists ───────────────────────────────────────────────────────────────────

test('scoring a list joins each task to its own assessment', () => {
  const scored = scoreTasks(
    [task({ id: 'a', dueAt: inDays(2) }), task({ id: 'b', dueAt: inDays(2) })],
    { assessmentsByTaskId: { a: { weightPercent: 50 } }, nowMs: NOW },
  );
  const [a, b] = scored;
  assert.ok(a.priorityScore > b.priorityScore, 'the weighted one ranks higher');
  assert.equal(b.priorityFactors.find((f) => f.name === 'weight').points, 0);
});

test('the sort is total and stable', () => {
  // Two tasks that genuinely tie must not swap between requests — a list that
  // appears to shuffle itself reads as broken.
  const tasks = scoreTasks(
    [
      task({ id: 'tsk_b', dueAt: inDays(3) }),
      task({ id: 'tsk_a', dueAt: inDays(3) }),
      task({ id: 'tsk_c', dueAt: inDays(1) }),
    ],
    { nowMs: NOW },
  );
  const once = [...tasks].sort(byPriorityScore).map((t) => t.id);
  const twice = [...tasks].reverse().sort(byPriorityScore).map((t) => t.id);
  assert.deepEqual(once, twice, 'the order must not depend on the input order');
  assert.equal(once[0], 'tsk_c', 'soonest first');
  assert.deepEqual(once.slice(1), ['tsk_a', 'tsk_b'], 'ties break on id, deterministically');
});

test('an undated task sorts below anything with a deadline', () => {
  const tasks = scoreTasks(
    [task({ id: 'undated', dueAt: null }), task({ id: 'far', dueAt: inDays(30) })],
    { nowMs: NOW },
  );
  const order = [...tasks].sort(byPriorityScore).map((t) => t.id);
  assert.deepEqual(order, ['far', 'undated']);
});
