// tests/simulator.test.js — unit tests for the pure CGPA-goal simulator model
// (#317). Parity target: runSimulator + buildRetakeSuggestions in
// js/ui/simulator.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRetakeCandidates,
  computeRetakeImpact,
  computeSimulation,
  gpaLetterRange,
  isSummaryOnly,
  simulatorTotals,
} from '../src/features/calculator/simulator.ts';

let nextId = 1;

function semester(name, courses, opts = {}) {
  return { id: nextId++, name, running: opts.running ?? false, summary: opts.summary ?? false, ...opts, courses };
}

function course(name, grade, credits = 3) {
  return { name, grade, credits };
}

function inputs(semesters) {
  return { semesters, startSeason: '', startYear: '' };
}

// A 60-credit 3.00 base: points 180.
const BASE = { cgpa: 3.0, points: 180, cgpaCredits: 60 };

// ── Outcome branches ─────────────────────────────────────────────────────────

test('missing inputs or no CGPA → prompt', () => {
  assert.equal(computeSimulation(BASE, '', '30').kind, 'prompt');
  assert.equal(computeSimulation(BASE, '3.5', '').kind, 'prompt');
  assert.equal(computeSimulation({ cgpa: null, points: 0, cgpaCredits: 0 }, '3.5', '30').kind, 'prompt');
});

test('validation order and bounds mirror runSimulator', () => {
  assert.equal(computeSimulation(BASE, '4.5', '30').kind, 'invalid-target');
  assert.equal(computeSimulation(BASE, '-1', '30').kind, 'invalid-target');
  assert.equal(computeSimulation(BASE, '3.5', '-5').kind, 'invalid-remaining');
});

test('zero remaining splits into secured vs no-credits', () => {
  assert.equal(computeSimulation(BASE, '3.0', '0').kind, 'secured');
  assert.equal(computeSimulation(BASE, '2.5', '0').kind, 'secured');
  assert.equal(computeSimulation(BASE, '3.5', '0').kind, 'no-credits');
});

test('plan branch: formula, difficulty, insight, letters, plan rows', () => {
  // target 3.5 over 60+30: needed = (3.5*90 − 180)/30 = 4.5 → unreachable.
  // target 3.25: needed = (3.25*90 − 180)/30 = 3.75 → plan.
  const r = computeSimulation(BASE, '3.25', '30');
  assert.equal(r.kind, 'plan');
  assert.equal(r.neededGpa.toFixed(2), '3.75');
  assert.equal(r.difficulty, 'medium'); // 3.2 ≤ 3.75 < 3.8
  assert.equal(r.insight, 'challenging'); // 3.5 ≤ 3.75 < 3.9
  assert.equal(r.difficultyPct, Math.round((3.75 / 4) * 100));
  assert.equal(r.letterRange, 'A / A-'); // 3.5 ≤ 3.75 < 3.85
  assert.deepEqual(r.plans, [
    { creditsPerSem: 9, semesters: 4 },
    { creditsPerSem: 12, semesters: 3 },
    { creditsPerSem: 15, semesters: 2 },
  ]);
  assert.equal(r.delta.toFixed(2), '0.25');
});

test('difficulty boundaries at 3.2 and 3.8', () => {
  // needed = (t*90 − 180)/30 → t = (needed*30 + 180)/90.
  const targetFor = needed => String((needed * 30 + 180) / 90);
  assert.equal(computeSimulation(BASE, targetFor(3.8), '30').difficulty, 'hard');
  assert.equal(computeSimulation(BASE, targetFor(3.79), '30').difficulty, 'medium');
  assert.equal(computeSimulation(BASE, targetFor(3.2), '30').difficulty, 'medium');
  assert.equal(computeSimulation(BASE, targetFor(3.19), '30').difficulty, 'easy');
});

test('unreachable target reports the all-A ceiling', () => {
  const r = computeSimulation(BASE, '3.5', '30');
  assert.equal(r.kind, 'unreachable');
  // ceiling = (4*30 + 180) / 90 = 3.3333…
  assert.equal(r.ceiling.toFixed(2), '3.33');
});

test('a target below what the credits force → achieved', () => {
  // target 1.0: needed = (1.0*90 − 180)/30 = −3 → achieved.
  assert.equal(computeSimulation(BASE, '1.0', '30').kind, 'achieved');
});

test('gpaLetterRange covers all seven tiers', () => {
  assert.equal(gpaLetterRange(3.9), 'All A');
  assert.equal(gpaLetterRange(3.6), 'A / A-');
  assert.equal(gpaLetterRange(3.2), 'B+ / A-');
  assert.equal(gpaLetterRange(2.9), 'B / B+');
  assert.equal(gpaLetterRange(2.6), 'B- / B');
  assert.equal(gpaLetterRange(2.2), 'C+ / B-');
  assert.equal(gpaLetterRange(2.0), 'C / C+');
});

// ── Totals ───────────────────────────────────────────────────────────────────

test('simulatorTotals mirrors the projected recalc totals', () => {
  const t = simulatorTotals(inputs([semester('Fall 2024', [course('CSE110 (CSE110)', 'A'), course('MAT110 (MAT110)', 'B')])]));
  assert.equal(t.cgpaCredits, 6);
  assert.equal(t.points, 21); // 4×3 + 3×3
  assert.equal(t.cgpa, 3.5);
});

// ── Retake candidates ────────────────────────────────────────────────────────

// With every course at the same credit value both rankings agree, so this case
// pins the candidate rules themselves. Ranking divergence is covered below.
test('candidates: sub-B only, top 6, with strategies', () => {
  const sems = [
    semester('Fall 2024 (1st Semester)', [
      course('Algebra (MAT110)', 'A'), // ≥ 3.0 → excluded
      course('Physics (PHY111)', 'C'), // 2.0 → repeat
      course('Chemistry (CHE101)', 'F'), // 0 → retake, biggest boost
      course('Biology (BIO101)', 'B-'), // 2.7 → repeat, smallest boost
    ]),
  ];
  const t = simulatorTotals(inputs(sems));
  const cands = computeRetakeCandidates(inputs(sems), t);
  assert.deepEqual(cands.map(c => c.name), ['Chemistry (CHE101)', 'Physics (PHY111)', 'Biology (BIO101)']);
  assert.equal(cands[0].strategy, 'retake'); // F → full retake
  assert.equal(cands[1].strategy, 'repeat'); // below B, non-F → special exam
  assert.equal(cands[0].semLabel, 'Fall 2024');
  // boostToB for F: 3×(3−0)/12 = 0.75; cgpaIfB capped at 4.
  assert.equal(cands[0].boostToB.toFixed(2), '0.75');
  assert.ok(cands[0].cgpaIfB <= 4);
});

test('retake-superseded attempts and running/summary semesters are excluded', () => {
  const sems = [
    semester('Fall 2024', [course('Physics (PHY111)', 'F')]),
    semester('Spring 2025', [course('Physics (PHY111)', 'B+')]), // supersedes the F
    semester('Running', [course('Chemistry (CHE101)', 'D')], { running: true }),
  ];
  const t = simulatorTotals(inputs(sems));
  const cands = computeRetakeCandidates(inputs(sems), t);
  assert.deepEqual(cands, []);
});

// ── Retake ranking (#501) ────────────────────────────────────────────────────

test('efficiency ranks the cheaper lift first; boost ranks the bigger one first', () => {
  // A 1-credit D buys (3−1)=2 grade points per credit spent; a 3-credit C buys
  // (3−2)=1. But the 3-credit C moves the CGPA more in absolute terms, which is
  // what the legacy sort — credits in the numerator — always preferred.
  const sems = [
    semester('Fall 2024', [
      course('Lab (CSE110L)', 'D', 1),
      course('Physics (PHY111)', 'C', 3),
    ]),
  ];
  const t = simulatorTotals(inputs(sems));

  const byEfficiency = computeRetakeCandidates(inputs(sems), t, 'efficiency');
  assert.deepEqual(
    byEfficiency.map((c) => c.name),
    ['Lab (CSE110L)', 'Physics (PHY111)'],
  );

  const byBoost = computeRetakeCandidates(inputs(sems), t, 'boost');
  assert.deepEqual(
    byBoost.map((c) => c.name),
    ['Physics (PHY111)', 'Lab (CSE110L)'],
  );

  // The absolute boost really is larger for the more expensive course.
  const c = byBoost[0];
  const lab = byBoost[1];
  assert.ok(c.boostToB > lab.boostToB);
  assert.ok(lab.boostPerCredit > c.boostPerCredit);
});

test('efficiency is the default ranking', () => {
  const sems = [
    semester('Fall 2024', [
      course('Lab (CSE110L)', 'D', 1),
      course('Physics (PHY111)', 'C', 3),
    ]),
  ];
  const t = simulatorTotals(inputs(sems));
  assert.deepEqual(
    computeRetakeCandidates(inputs(sems), t).map((c) => c.name),
    computeRetakeCandidates(inputs(sems), t, 'efficiency').map((c) => c.name),
  );
});

test('boostPerCredit is the gain per credit spent', () => {
  const sems = [semester('Fall 2024', [course('Physics (PHY111)', 'C', 3)])];
  const t = simulatorTotals(inputs(sems));
  const [c] = computeRetakeCandidates(inputs(sems), t);
  assert.equal(c.boostPerCredit, c.boostToB / c.credits);
});

test('the top-6 cut is applied after the active sort, not before it', () => {
  // Seven candidates. Six fat 3-credit courses at C- (absolute boost 3×1.3 =
  // 3.9 credit-points each), plus one 1-credit F (absolute 1×3 = 3.0, but 3.0
  // per credit — the best value on the board). Cutting before sorting would
  // drop the F under the efficiency ranking, which is the exact candidate that
  // ranking exists to surface.
  const sems = [
    semester('Fall 2024', [
      course('C1 (CSE101)', 'C-', 3),
      course('C2 (CSE102)', 'C-', 3),
      course('C3 (CSE103)', 'C-', 3),
      course('C4 (CSE104)', 'C-', 3),
      course('C5 (CSE105)', 'C-', 3),
      course('C6 (CSE106)', 'C-', 3),
      course('Lab (CSE110L)', 'F', 1),
    ]),
  ];
  const t = simulatorTotals(inputs(sems));

  const byEfficiency = computeRetakeCandidates(inputs(sems), t, 'efficiency');
  assert.equal(byEfficiency.length, 6);
  assert.equal(byEfficiency[0].name, 'Lab (CSE110L)');

  // Under the absolute ranking the 1-credit F is genuinely the weakest, so it
  // falls off the list — that is the ranking answering a different question.
  const byBoost = computeRetakeCandidates(inputs(sems), t, 'boost');
  assert.equal(byBoost.length, 6);
  assert.ok(!byBoost.some((c) => c.name === 'Lab (CSE110L)'));
});

test('ties break deterministically', () => {
  const sems = [
    semester('Fall 2024', [course('Beta (CSE102)', 'C', 3), course('Alpha (CSE101)', 'C', 3)]),
  ];
  const t = simulatorTotals(inputs(sems));
  for (const ranking of ['efficiency', 'boost']) {
    assert.deepEqual(
      computeRetakeCandidates(inputs(sems), t, ranking).map((c) => c.name),
      ['Alpha (CSE101)', 'Beta (CSE102)'],
      `unstable order under ${ranking}`,
    );
  }
});

test('stacked impact is unaffected by the ranking', () => {
  const sems = [
    semester('Fall 2024', [
      course('Lab (CSE110L)', 'D', 1),
      course('Physics (PHY111)', 'C', 3),
    ]),
  ];
  const t = simulatorTotals(inputs(sems));
  const all = (list) => new Set(list.map((c) => c.key));

  const eff = computeRetakeCandidates(inputs(sems), t, 'efficiency');
  const boost = computeRetakeCandidates(inputs(sems), t, 'boost');

  const a = computeRetakeImpact(eff, all(eff), t, '3.0', '30');
  const b = computeRetakeImpact(boost, all(boost), t, '3.0', '30');
  assert.equal(a.cumBoost.toFixed(6), b.cumBoost.toFixed(6));
  assert.equal(a.cgpaAfter.toFixed(6), b.cgpaAfter.toFixed(6));
  assert.equal(a.checkedCount, b.checkedCount);
});

test('summary-only data triggers the nudge rule', () => {
  const summaryOnly = [semester('Summary', [], { summary: true, summaryCGPA: 3, summaryCredits: 30 })];
  assert.equal(isSummaryOnly(summaryOnly), true);
  assert.equal(isSummaryOnly([...summaryOnly, semester('Fall 2024', [course('X (CSE110)', 'A')])]), false);
});

// ── Selection impact ─────────────────────────────────────────────────────────

test('stacking selections accumulates boosts and recomputes the target need', () => {
  const sems = [
    semester('Fall 2024', [course('Physics (PHY111)', 'F'), course('Chem (CHE101)', 'D'), course('Alg (MAT110)', 'A')]),
  ];
  const t = simulatorTotals(inputs(sems)); // credits 9, points 0+1+4 ×3 = 15, cgpa 1.667
  const cands = computeRetakeCandidates(inputs(sems), t);

  const none = computeRetakeImpact(cands, new Set(), t, '3.0', '30');
  assert.equal(none.checkedCount, 0);
  assert.equal(none.targetLine, null);

  const one = computeRetakeImpact(cands, new Set([cands[0].key]), t, '3.0', '30');
  assert.equal(one.checkedCount, 1);
  assert.equal(one.cumBoost.toFixed(2), cands[0].boostToB.toFixed(2));
  // ptsAfter = 15 + 3×3 = 24 → needed = (3×39 − 24)/30 = 3.1.
  assert.equal(one.targetLine.kind, 'need');
  assert.equal(one.targetLine.neededGpa.toFixed(2), '3.10');

  const impossible = computeRetakeImpact(cands, new Set([cands[0].key]), t, '4.0', '3');
  assert.equal(impossible.targetLine.kind, 'over-perfect');
});
