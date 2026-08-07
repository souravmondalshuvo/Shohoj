// src/features/calculator/simulator.ts
//
// Pure CGPA-goal simulator model for the shell (#317), mirroring runSimulator
// + buildRetakeSuggestions in js/ui/simulator.js exactly: the validation
// order, the remaining=0 secured/no-credits split, the needed-GPA formula,
// difficulty cutoffs and insight tiers, the 7-tier letter mapping, the
// 9/12/15 cr/sem plan rows, the all-A ceiling, the retake/repeat candidate
// rules (gp < 3.0, not retake-superseded, top 6) and the stacked-selection
// impact math. Presentation (copy, colors, markup) stays in the component.
//
// Diverges from the legacy order deliberately (#501): candidates now rank by
// CGPA gain per credit spent rather than raw boost, since `boostToB` carries
// credits in its numerator and so structurally favoured the most expensive
// retakes. The legacy order remains available as the 'boost' ranking.

import {
  calculateCgpaTotals,
  gpaCoreGetImprovementStrategy,
  gpaCoreGetRetakenKeys,
  type ImprovementStrategy,
} from '../../core/gpa.ts';
import { GRADES } from '../../core/grades.ts';
import type { SemesterEntry } from '../../core/types.ts';

export interface SimulatorInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: string;
  readonly startYear: string;
}

/** The projected totals runSimulator receives from recalc(). */
export interface SimulatorTotals {
  readonly cgpa: number | null;
  readonly points: number;
  readonly cgpaCredits: number;
}

export function simulatorTotals(inputs: SimulatorInputs): SimulatorTotals {
  const totals = calculateCgpaTotals(inputs.semesters, {
    startSeason: inputs.startSeason as never,
    startYear: inputs.startYear,
    includeRunning: true,
    includeSummary: true,
  });
  return { cgpa: totals.cgpa, points: totals.points, cgpaCredits: totals.cgpaCredits };
}

export type SimulatorDifficulty = 'easy' | 'medium' | 'hard';
export type SimulatorInsight = 'near-perfect' | 'challenging' | 'realistic' | 'great-shape';

export interface SimulatorPlanRow {
  readonly creditsPerSem: number;
  readonly semesters: number;
}

export type SimulatorOutcome =
  | { readonly kind: 'prompt' }
  | { readonly kind: 'invalid-target' }
  | { readonly kind: 'invalid-remaining' }
  | { readonly kind: 'secured'; readonly cgpa: number; readonly target: number }
  | { readonly kind: 'no-credits'; readonly cgpa: number; readonly target: number }
  | {
      readonly kind: 'plan';
      readonly cgpa: number;
      readonly target: number;
      readonly remaining: number;
      readonly neededGpa: number;
      readonly difficulty: SimulatorDifficulty;
      readonly difficultyPct: number;
      readonly insight: SimulatorInsight;
      readonly letterRange: string;
      readonly plans: readonly SimulatorPlanRow[];
      readonly delta: number;
    }
  | {
      readonly kind: 'unreachable';
      readonly cgpa: number;
      readonly target: number;
      readonly remaining: number;
      readonly ceiling: number;
    }
  | { readonly kind: 'achieved'; readonly cgpa: number; readonly target: number };

/** The 7-tier needed-GPA → letter-range mapping (gpToLetter in simulator.js). */
export function gpaLetterRange(gp: number): string {
  if (gp >= 3.85) return 'All A';
  if (gp >= 3.5) return 'A / A-';
  if (gp >= 3.15) return 'B+ / A-';
  if (gp >= 2.85) return 'B / B+';
  if (gp >= 2.5) return 'B- / B';
  if (gp >= 2.15) return 'C+ / B-';
  return 'C / C+';
}

export function computeSimulation(
  totals: SimulatorTotals,
  targetRaw: string,
  remainingRaw: string,
): SimulatorOutcome {
  const target = parseFloat(targetRaw);
  const remaining = parseFloat(remainingRaw);

  if (Number.isNaN(target) || Number.isNaN(remaining) || totals.cgpa === null) {
    return { kind: 'prompt' };
  }
  if (target > 4.0 || target < 0) return { kind: 'invalid-target' };
  if (remaining < 0) return { kind: 'invalid-remaining' };
  if (remaining === 0) {
    return target <= totals.cgpa
      ? { kind: 'secured', cgpa: totals.cgpa, target }
      : { kind: 'no-credits', cgpa: totals.cgpa, target };
  }

  const totalCredits = totals.cgpaCredits + remaining;
  const neededGpa = (target * totalCredits - totals.points) / remaining;

  if (neededGpa > 4.0) {
    return {
      kind: 'unreachable',
      cgpa: totals.cgpa,
      target,
      remaining,
      ceiling: (4.0 * remaining + totals.points) / totalCredits,
    };
  }
  if (neededGpa < 0) return { kind: 'achieved', cgpa: totals.cgpa, target };

  const difficulty: SimulatorDifficulty =
    neededGpa >= 3.8 ? 'hard' : neededGpa >= 3.2 ? 'medium' : 'easy';
  const insight: SimulatorInsight =
    neededGpa >= 3.9
      ? 'near-perfect'
      : neededGpa >= 3.5
        ? 'challenging'
        : neededGpa >= 3.0
          ? 'realistic'
          : 'great-shape';

  return {
    kind: 'plan',
    cgpa: totals.cgpa,
    target,
    remaining,
    neededGpa,
    difficulty,
    difficultyPct: Math.min(100, Math.round((neededGpa / 4.0) * 100)),
    insight,
    letterRange: gpaLetterRange(neededGpa),
    plans: [9, 12, 15].map((creditsPerSem) => ({
      creditsPerSem,
      semesters: Math.ceil(remaining / creditsPerSem),
    })),
    delta: Math.max(0, target - totals.cgpa),
  };
}

// ── Smart Retake & Repeat strategy ───────────────────────────────────────────

/**
 * How the candidate list is ordered before the top-6 cut.
 *
 * 'efficiency' — CGPA gain per credit spent. A retake costs tuition and a seat
 *   in a credit load the student still has to plan around, so the cheapest lift
 *   is usually the one worth taking first.
 * 'boost' — raw CGPA gain, the legacy order. Still the right question for a
 *   student sitting just under a threshold, who wants the biggest single jump
 *   regardless of what it costs.
 */
export type RetakeRanking = 'efficiency' | 'boost';

export interface RetakeCandidate {
  readonly key: string;
  readonly name: string;
  readonly grade: string;
  /** Grade point being improved on — `null` for a withdrawal, which has none. */
  readonly gp: number | null;
  readonly credits: number;
  readonly semLabel: string;
  /**
   * The row is a withdrawal (#499). It earns its place in the list by being a
   * course the student still owes, but the arithmetic is not the same: there is
   * no grade to replace, so taking it again *adds* credits to the CGPA divisor
   * instead of re-scoring credits already counted. That makes the boost
   * genuinely negative for a student above the target grade — sitting a course
   * fresh for a B drags a 3.8 down — and saying so is the point.
   */
  readonly isWithdrawal: boolean;
  /** CGPA gain if raised to B (3.0) / to A (4.0). Negative is meaningful. */
  readonly boostToB: number;
  readonly boostToA: number;
  /**
   * CGPA gain per credit spent, raising to B — `boostToB / credits`.
   *
   * For a graded retake `boostToB` carries credits in its numerator, so this
   * reduces to `(3.0 - gp) / cgpaCredits`: ranking by it is ranking by how far
   * below B the grade sits, independent of course size. That is the point: a
   * 1-credit D buys more lift per credit than a 3-credit C, while the raw boost
   * says the opposite. A withdrawal does not reduce that way — its boost is the
   * full recomputation — but dividing by credits still expresses the same
   * question, so the two rank on one scale.
   */
  readonly boostPerCredit: number;
  readonly cgpaIfB: number;
  readonly cgpaIfA: number;
  readonly strategy: ImprovementStrategy;
}

/** Legacy nudge rule: a summary block with no detailed graded courses. */
export function isSummaryOnly(semesters: readonly SemesterEntry[]): boolean {
  const hasSummary = semesters.some((s) => s.summary);
  const hasDetailed = semesters.some(
    (s) => !s.summary && !s.running && s.courses.some((c) => c.name.trim() && c.grade),
  );
  return hasSummary && !hasDetailed;
}

export function computeRetakeCandidates(
  inputs: SimulatorInputs,
  totals: SimulatorTotals,
  ranking: RetakeRanking = 'efficiency',
): readonly RetakeCandidate[] {
  if (totals.cgpa === null || !inputs.semesters.length || totals.cgpaCredits <= 0) return [];

  const retakenKeys = gpaCoreGetRetakenKeys(inputs.semesters, {
    startSeason: inputs.startSeason as never,
    startYear: inputs.startYear,
  });

  const candidates: RetakeCandidate[] = [];
  for (const sem of inputs.semesters) {
    if (sem.running || sem.summary) continue;
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.credits) return;
      const isWithdrawal = c.grade === 'W';
      const gp = GRADES[c.grade as keyof typeof GRADES];
      // W is the one null-grade-point row that belongs here: it is a course
      // still owed, not an outcome to leave alone (#499). Every other
      // null/unknown grade — P, I, blank — has nothing to act on.
      if (!isWithdrawal && (gp === undefined || gp === null)) return;
      if (retakenKeys.has(`${sem.id}-${i}`)) return;
      if (!isWithdrawal && (gp as number) >= 3.0) return; // B and above — no improvement mechanism

      const semLabel = (sem.name ?? '').replace(/\s*\(.*\)$/, '');
      const cgpa = totals.cgpa as number;

      // A retake re-scores credits already in the divisor; a withdrawal adds
      // its credits to it. Those are different sums, so the two are computed
      // apart and only the resulting deltas are compared.
      const cgpaAtTarget = (target: number) =>
        (totals.points + c.credits * target) / (totals.cgpaCredits + c.credits);
      const boostToB = isWithdrawal
        ? cgpaAtTarget(3.0) - cgpa
        : (c.credits * (3.0 - (gp as number))) / totals.cgpaCredits;
      const boostToA = isWithdrawal
        ? cgpaAtTarget(4.0) - cgpa
        : (c.credits * (4.0 - (gp as number))) / totals.cgpaCredits;

      candidates.push({
        key: `${c.name}||${semLabel}`,
        name: c.name,
        grade: c.grade,
        gp: isWithdrawal ? null : (gp as number),
        credits: c.credits,
        semLabel,
        isWithdrawal,
        boostToB,
        boostToA,
        boostPerCredit: boostToB / c.credits,
        cgpaIfB: Math.min(4.0, cgpa + boostToB),
        cgpaIfA: Math.min(4.0, cgpa + boostToA),
        strategy: gpaCoreGetImprovementStrategy(c.grade),
      });
    });
  }

  // Sort first, cut second. Cutting by one order and then re-sorting would hide
  // the candidates the other ranking exists to surface.
  candidates.sort(rankingComparator(ranking));
  return candidates.slice(0, 6);
}

function rankingComparator(
  ranking: RetakeRanking,
): (a: RetakeCandidate, b: RetakeCandidate) => number {
  return (a, b) => {
    const primary =
      ranking === 'efficiency' ? b.boostPerCredit - a.boostPerCredit : b.boostToB - a.boostToB;
    if (primary !== 0) return primary;
    // Deterministic tie-break so the list does not reshuffle between renders:
    // the other measure, then the key.
    const secondary =
      ranking === 'efficiency' ? b.boostToB - a.boostToB : b.boostPerCredit - a.boostPerCredit;
    if (secondary !== 0) return secondary;
    return a.key.localeCompare(b.key);
  };
}

export interface RetakeImpact {
  readonly checkedCount: number;
  readonly cumBoost: number;
  readonly cgpaAfter: number;
  /** Post-improvement requirement toward the target, when one is set:
   * 'over-perfect' (needs > 4.0), 'exceeds' (already ≤ 0) or the needed avg. */
  readonly targetLine:
    | { readonly kind: 'over-perfect' }
    | { readonly kind: 'exceeds' }
    | { readonly kind: 'need'; readonly neededGpa: number }
    | null;
}

export function computeRetakeImpact(
  candidates: readonly RetakeCandidate[],
  selectedKeys: ReadonlySet<string>,
  totals: SimulatorTotals,
  targetRaw: string,
  remainingRaw: string,
): RetakeImpact {
  const cgpa = totals.cgpa ?? 0;
  let ptsAfter = totals.points;
  let creditsAfter = totals.cgpaCredits;
  for (const c of candidates) {
    if (!selectedKeys.has(c.key)) continue;
    if (c.isWithdrawal) {
      // No grade to replace — the course joins the CGPA for the first time,
      // so both sides of the ratio move.
      ptsAfter += c.credits * 3.0;
      creditsAfter += c.credits;
    } else {
      ptsAfter += c.credits * (3.0 - (c.gp as number));
    }
  }
  const checkedCount = [...selectedKeys].filter((k) => candidates.some((c) => c.key === k)).length;
  const cgpaAfter = Math.min(4.0, creditsAfter > 0 ? ptsAfter / creditsAfter : cgpa);
  // Derived from the recomputed CGPA rather than summed from the per-row
  // boosts: summing is exact only while the divisor holds still, which a
  // selected withdrawal breaks. For an all-retake selection the two agree.
  const cumBoost = cgpaAfter - cgpa;

  const target = parseFloat(targetRaw);
  const remaining = parseFloat(remainingRaw) || 0;
  let targetLine: RetakeImpact['targetLine'] = null;
  if (checkedCount > 0 && !Number.isNaN(target) && target > 0 && remaining > 0) {
    const neededGpa = (target * (creditsAfter + remaining) - ptsAfter) / remaining;
    targetLine =
      neededGpa > 4.0
        ? { kind: 'over-perfect' }
        : neededGpa <= 0
          ? { kind: 'exceeds' }
          : { kind: 'need', neededGpa };
  }

  return { checkedCount, cumBoost, cgpaAfter, targetLine };
}
