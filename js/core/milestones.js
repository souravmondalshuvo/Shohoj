// Twin of src/features/calculator/milestones.ts — hand-maintained, not generated.
// src/features/calculator/milestones.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// The BRACU standing thresholds live here once, for both the standing box in
// main.js and the goal ladder in ui/simulator.js (#502).

/**
 * Every tier, highest first. `probation` is the floor rather than a goal, so it
 * carries a threshold of 0 and is excluded from the ladder by isGoal().
 */
export const MILESTONE_TIERS = [
  { id: 'perfect', standingLabel: 'Perfect Standing', goalLabel: 'Perfect Standing', threshold: 3.97 },
  { id: 'higher-distinction', standingLabel: 'Higher Distinction', goalLabel: 'Higher Distinction', threshold: 3.65 },
  { id: 'distinction', standingLabel: 'Distinction', goalLabel: 'Distinction', threshold: 3.50 },
  { id: 'good', standingLabel: 'Good Standing', goalLabel: 'Good Standing', threshold: 3.00 },
  { id: 'satisfactory', standingLabel: 'Satisfactory', goalLabel: 'Satisfactory', threshold: 2.50 },
  { id: 'needs-improvement', standingLabel: 'Needs Improvement', goalLabel: 'Off academic probation', threshold: 2.00 },
  { id: 'probation', standingLabel: 'Academic Probation', goalLabel: '', threshold: 0 },
];

/** A tier a student can aim at — everything except the probation floor. */
export function isGoal(tier) {
  return tier.id !== 'probation';
}

/** The tier a completed CGPA currently sits in. */
export function standingTierFor(completedCgpa) {
  if (completedCgpa === null || completedCgpa === undefined) return null;
  for (const tier of MILESTONE_TIERS) {
    if (completedCgpa >= tier.threshold) return tier.id;
  }
  return 'probation';
}

/**
 * Classify every goal tier against what is still arithmetically possible.
 *
 * 'secured' is deliberately the *worst* case — the CGPA that results if every
 * remaining credit scores 0.0 — not the current average. A tier that today's
 * average would hold is not actually locked in; one that survives a total
 * collapse is.
 */
export function computeMilestoneLadder({ points, cgpaCredits, remaining }) {
  const totalCredits = cgpaCredits + remaining;
  if (totalCredits <= 0 || remaining < 0) return null;

  const ceiling = (4.0 * remaining + points) / totalCredits;
  const floor = points / totalCredits;

  const rows = MILESTONE_TIERS.filter(isGoal).map(tier => {
    if (floor >= tier.threshold) return { tier, state: 'secured', neededGpa: null };
    if (ceiling < tier.threshold) return { tier, state: 'out-of-reach', neededGpa: null };
    return {
      tier,
      state: 'reachable',
      neededGpa: (tier.threshold * totalCredits - points) / remaining,
    };
  });

  return { rows, ceiling, floor };
}

/**
 * The rows worth showing: every tier not already locked in, plus the single
 * highest one that is.
 *
 * Curation only ever trims the *bottom* — listing "Satisfactory (2.50)" as an
 * aspiration to someone at 3.80 is noise. Nothing above the student's position
 * is suppressed, so an out-of-reach tier always survives; hiding those is the
 * omission this feature exists to fix.
 *
 * Shared by both front ends so the shell and the legacy page cannot drift.
 */
export function visibleMilestoneRows(ladder) {
  const firstSecured = ladder.rows.findIndex(r => r.state === 'secured');
  return firstSecured === -1 ? ladder.rows : ladder.rows.slice(0, firstSecured + 1);
}
