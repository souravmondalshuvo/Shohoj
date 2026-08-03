// tests/milestones.test.js — the shared BRACU standing thresholds and the
// forward-looking goal ladder (#502).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MILESTONE_TIERS,
  computeMilestoneLadder,
  isGoal,
  standingTierFor,
  visibleMilestoneRows,
} from '../src/features/calculator/milestones.ts';

import { MILESTONE_TIERS as LEGACY_TIERS } from '../js/core/milestones.js';
import {
  computeMilestoneLadder as legacyLadder,
  standingTierFor as legacyStandingTierFor,
  visibleMilestoneRows as legacyVisibleRows,
} from '../js/core/milestones.js';

const rowFor = (ladder, id) => ladder.rows.find((r) => r.tier.id === id);

// ── The tier table ───────────────────────────────────────────────────────────

test('tiers are ordered high to low and cover the documented cutoffs', () => {
  const thresholds = MILESTONE_TIERS.map((t) => t.threshold);
  assert.deepEqual(thresholds, [3.97, 3.65, 3.5, 3.0, 2.5, 2.0, 0]);
  for (let i = 1; i < thresholds.length; i++) {
    assert.ok(thresholds[i] < thresholds[i - 1], 'thresholds must strictly descend');
  }
});

test('probation is the floor, not a goal', () => {
  assert.equal(MILESTONE_TIERS.filter(isGoal).length, MILESTONE_TIERS.length - 1);
  assert.ok(!isGoal(MILESTONE_TIERS[MILESTONE_TIERS.length - 1]));
});

test('standingTierFor reproduces the legacy standing box branches', () => {
  assert.equal(standingTierFor(4.0), 'perfect');
  assert.equal(standingTierFor(3.97), 'perfect');
  assert.equal(standingTierFor(3.96), 'higher-distinction');
  assert.equal(standingTierFor(3.65), 'higher-distinction');
  assert.equal(standingTierFor(3.5), 'distinction');
  assert.equal(standingTierFor(3.0), 'good');
  assert.equal(standingTierFor(2.5), 'satisfactory');
  assert.equal(standingTierFor(2.0), 'needs-improvement');
  assert.equal(standingTierFor(1.99), 'probation');
  assert.equal(standingTierFor(0), 'probation');
  assert.equal(standingTierFor(null), null);
});

test('a straight-4.0 record lands in the perfect tier despite float division', () => {
  // 4.0 accumulated as points/credits rather than written literally — the
  // >= 3.97 comparison must not be defeated by the division.
  const cgpa = (4.0 * 3 + 4.0 * 3 + 4.0 * 4) / 10;
  assert.equal(standingTierFor(cgpa), 'perfect');
});

// ── The ladder ───────────────────────────────────────────────────────────────

test('secured means secured under a total collapse, not under the current average', () => {
  // 60 credits at 3.60 (216 points), 60 credits remaining.
  // floor = 216/120 = 1.80 → only the 'off probation' 2.00 tier is NOT secured
  // by the floor... and in fact nothing is: 1.80 secures nothing.
  const ladder = computeMilestoneLadder({ points: 216, cgpaCredits: 60, remaining: 60 });
  assert.equal(ladder.floor.toFixed(2), '1.80');
  assert.ok(
    ladder.rows.every((r) => r.state !== 'secured'),
    'a 3.60 average secures nothing while 60 credits can still go to zero',
  );

  // With no credits left the same record locks in everything up to its tier.
  const frozen = computeMilestoneLadder({ points: 216, cgpaCredits: 60, remaining: 0 });
  assert.equal(rowFor(frozen, 'distinction').state, 'secured'); // 3.60 ≥ 3.50
  assert.equal(rowFor(frozen, 'higher-distinction').state, 'out-of-reach'); // 3.60 < 3.65
});

test('a tier that has just become unreachable is reported, not hidden', () => {
  // 90 credits at 2.00 (180 points), 30 credits left.
  // ceiling = (4×30 + 180)/120 = 2.50 exactly.
  const ladder = computeMilestoneLadder({ points: 180, cgpaCredits: 90, remaining: 30 });
  assert.equal(ladder.ceiling.toFixed(2), '2.50');

  assert.equal(rowFor(ladder, 'satisfactory').state, 'reachable'); // 2.50 ≤ ceiling
  assert.equal(rowFor(ladder, 'good').state, 'out-of-reach'); // 3.00 > ceiling
  assert.equal(rowFor(ladder, 'distinction').state, 'out-of-reach');

  // Out-of-reach rows are present in the output — the component decides how to
  // show them, but the model must not drop them.
  const unreachable = ladder.rows.filter((r) => r.state === 'out-of-reach');
  assert.ok(unreachable.length >= 3);
  assert.ok(unreachable.every((r) => r.neededGpa === null));
});

test('a reachable tier reports the average needed over the remaining credits', () => {
  // 60 credits at 3.00 (180 points), 60 remaining, targeting 3.50:
  // needed = (3.50×120 − 180)/60 = 4.00 — reachable, but only exactly.
  const ladder = computeMilestoneLadder({ points: 180, cgpaCredits: 60, remaining: 60 });
  const distinction = rowFor(ladder, 'distinction');
  assert.equal(distinction.state, 'reachable');
  assert.equal(distinction.neededGpa.toFixed(2), '4.00');

  // And the tier above it is genuinely gone.
  assert.equal(rowFor(ladder, 'higher-distinction').state, 'out-of-reach');
});

test('with no credits left every tier is secured or out of reach', () => {
  const ladder = computeMilestoneLadder({ points: 210, cgpaCredits: 60, remaining: 0 });
  assert.equal(ladder.ceiling, ladder.floor, 'a frozen record has no range');
  assert.ok(
    ladder.rows.every((r) => r.state !== 'reachable'),
    'nothing is "reachable" when nothing is left to take',
  );
  assert.ok(ladder.rows.every((r) => r.neededGpa === null));
});

test('an empty record has no ladder', () => {
  assert.equal(computeMilestoneLadder({ points: 0, cgpaCredits: 0, remaining: 0 }), null);
  assert.equal(computeMilestoneLadder({ points: 0, cgpaCredits: 10, remaining: -1 }), null);
});

test('a fresh student with everything ahead can still reach the top', () => {
  const ladder = computeMilestoneLadder({ points: 0, cgpaCredits: 0, remaining: 136 });
  assert.equal(ladder.ceiling, 4.0);
  assert.equal(ladder.floor, 0);
  assert.ok(ladder.rows.every((r) => r.state === 'reachable'));
});

// ── Row curation ─────────────────────────────────────────────────────────────

test('curation trims below the highest locked-in tier only', () => {
  // 3.80 over 100 credits (380 points), 4 credits left.
  // floor = 380/104 = 3.65 → higher-distinction and everything under it secured.
  const ladder = computeMilestoneLadder({ points: 380, cgpaCredits: 100, remaining: 4 });
  const visible = visibleMilestoneRows(ladder);

  assert.deepEqual(
    visible.map((r) => r.tier.id),
    ['perfect', 'higher-distinction'],
    'stops at the first secured tier, dropping the noise beneath it',
  );
  assert.equal(visible[visible.length - 1].state, 'secured');
});

test('curation never drops an out-of-reach tier', () => {
  // Nothing secured, top tiers gone: every row must survive.
  const ladder = computeMilestoneLadder({ points: 180, cgpaCredits: 90, remaining: 30 });
  const visible = visibleMilestoneRows(ladder);
  assert.equal(visible.length, ladder.rows.length);
  assert.ok(visible.some((r) => r.state === 'out-of-reach'));
});

test('the js/ twin curates identically', () => {
  for (const input of [
    { points: 380, cgpaCredits: 100, remaining: 4 },
    { points: 180, cgpaCredits: 90, remaining: 30 },
    { points: 210, cgpaCredits: 60, remaining: 0 },
  ]) {
    assert.deepEqual(
      legacyVisibleRows(legacyLadder(input)).map((r) => [r.tier.id, r.state]),
      visibleMilestoneRows(computeMilestoneLadder(input)).map((r) => [r.tier.id, r.state]),
      `twins curate differently for ${JSON.stringify(input)}`,
    );
  }
});

// ── Twin parity (#484) ───────────────────────────────────────────────────────

test('the js/ twin carries the same thresholds and labels', () => {
  assert.deepEqual(
    LEGACY_TIERS.map((t) => [t.id, t.threshold, t.standingLabel, t.goalLabel]),
    MILESTONE_TIERS.map((t) => [t.id, t.threshold, t.standingLabel, t.goalLabel]),
  );
});

test('the js/ twin classifies the ladder identically', () => {
  const cases = [
    { points: 216, cgpaCredits: 60, remaining: 60 },
    { points: 180, cgpaCredits: 90, remaining: 30 },
    { points: 210, cgpaCredits: 60, remaining: 0 },
    { points: 0, cgpaCredits: 0, remaining: 136 },
  ];
  for (const input of cases) {
    const mine = computeMilestoneLadder(input);
    const theirs = legacyLadder(input);
    assert.deepEqual(
      theirs.rows.map((r) => [r.tier.id, r.state, r.neededGpa]),
      mine.rows.map((r) => [r.tier.id, r.state, r.neededGpa]),
      `twins disagree for ${JSON.stringify(input)}`,
    );
    assert.equal(theirs.ceiling, mine.ceiling);
    assert.equal(theirs.floor, mine.floor);
  }
});

test('the js/ twin agrees on standing tiers', () => {
  for (const cgpa of [4.0, 3.97, 3.96, 3.65, 3.5, 3.0, 2.5, 2.0, 1.99, 0, null]) {
    assert.equal(legacyStandingTierFor(cgpa), standingTierFor(cgpa), `disagreed at ${cgpa}`);
  }
});
