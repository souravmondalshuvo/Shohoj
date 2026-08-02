// src/features/calculator/milestones.ts
//
// The BRACU standing thresholds, in one place (#502).
//
// These numbers previously existed twice — standingFor() in results.ts and the
// standing box in js/main.js — and were used only to label where a student
// already is. This module makes them the single source for that labelling and
// adds the forward-looking half: given remaining credits, which milestones are
// still reachable, which are already locked in, and which have quietly become
// impossible.
//
// Presentation (copy, colours, which rows to show) stays in the component.

/** BRACU standing tiers by completed CGPA (Summer 2022+ probation policy). */
export type StandingTier =
  | 'perfect'
  | 'higher-distinction'
  | 'distinction'
  | 'good'
  | 'satisfactory'
  | 'needs-improvement'
  | 'probation';

export interface MilestoneTier {
  readonly id: StandingTier;
  /** Label for the standing a student currently holds. */
  readonly standingLabel: string;
  /** Label for the same tier framed as something to aim at. */
  readonly goalLabel: string;
  /** Minimum completed CGPA for this tier. */
  readonly threshold: number;
}

/**
 * Every tier, highest first. `probation` is the floor rather than a goal, so it
 * carries a threshold of 0 and is excluded from the ladder by `isGoal`.
 */
export const MILESTONE_TIERS: readonly MilestoneTier[] = [
  {
    id: 'perfect',
    standingLabel: 'Perfect Standing',
    goalLabel: 'Perfect Standing',
    threshold: 3.97,
  },
  {
    id: 'higher-distinction',
    standingLabel: 'Higher Distinction',
    goalLabel: 'Higher Distinction',
    threshold: 3.65,
  },
  { id: 'distinction', standingLabel: 'Distinction', goalLabel: 'Distinction', threshold: 3.5 },
  { id: 'good', standingLabel: 'Good Standing', goalLabel: 'Good Standing', threshold: 3.0 },
  { id: 'satisfactory', standingLabel: 'Satisfactory', goalLabel: 'Satisfactory', threshold: 2.5 },
  {
    id: 'needs-improvement',
    standingLabel: 'Needs Improvement',
    goalLabel: 'Off academic probation',
    threshold: 2.0,
  },
  { id: 'probation', standingLabel: 'Academic Probation', goalLabel: '', threshold: 0 },
];

/** A tier a student can aim at — everything except the probation floor. */
export function isGoal(tier: MilestoneTier): boolean {
  return tier.id !== 'probation';
}

/** The tier a completed CGPA currently sits in. */
export function standingTierFor(completedCgpa: number | null): StandingTier | null {
  if (completedCgpa === null) return null;
  for (const tier of MILESTONE_TIERS) {
    if (completedCgpa >= tier.threshold) return tier.id;
  }
  return 'probation';
}

export type MilestoneState = 'secured' | 'reachable' | 'out-of-reach';

export interface MilestoneRow {
  readonly tier: MilestoneTier;
  readonly state: MilestoneState;
  /**
   * Average GPA needed across the remaining credits to land it. Present only
   * when `state` is 'reachable' — a secured tier needs nothing, and an
   * out-of-reach one has no answer above 4.0 worth printing.
   */
  readonly neededGpa: number | null;
}

export interface MilestoneLadder {
  /** Every goal tier, highest threshold first. */
  readonly rows: readonly MilestoneRow[];
  /** Best CGPA still attainable — every remaining credit at 4.0. */
  readonly ceiling: number;
  /** Worst CGPA still possible — every remaining credit at 0.0. */
  readonly floor: number;
}

export interface MilestoneInputs {
  /** Grade points earned so far. */
  readonly points: number;
  /** Credits those points are spread over. */
  readonly cgpaCredits: number;
  /** Credits left to take. Zero is valid: it freezes the record. */
  readonly remaining: number;
}

/**
 * Classify every goal tier against what is still arithmetically possible.
 *
 * 'secured' is deliberately the *worst* case — the CGPA that results if every
 * remaining credit scores 0.0 — not the current average. A tier that today's
 * average would hold is not actually locked in; one that survives a total
 * collapse is. Calling the weaker thing "secured" would be the kind of
 * false reassurance this feature exists to remove.
 */
export function computeMilestoneLadder(inputs: MilestoneInputs): MilestoneLadder | null {
  const { points, cgpaCredits, remaining } = inputs;
  const totalCredits = cgpaCredits + remaining;
  if (totalCredits <= 0 || remaining < 0) return null;

  const ceiling = (4.0 * remaining + points) / totalCredits;
  const floor = points / totalCredits;

  const rows = MILESTONE_TIERS.filter(isGoal).map((tier): MilestoneRow => {
    if (floor >= tier.threshold) return { tier, state: 'secured', neededGpa: null };
    if (ceiling < tier.threshold) return { tier, state: 'out-of-reach', neededGpa: null };
    return {
      tier,
      state: 'reachable',
      // remaining > 0 here: with remaining === 0, floor and ceiling both equal
      // the current CGPA, so every tier lands in secured or out-of-reach above.
      neededGpa: (tier.threshold * totalCredits - points) / remaining,
    };
  });

  return { rows, ceiling, floor };
}
