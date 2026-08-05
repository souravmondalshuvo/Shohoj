// src/features/calculator/results.ts
//
// Phase 5D: the pure CGPA results model. Everything recalc() in js/main.js
// derives before writing to the DOM — headline CGPA + label, credit totals,
// meter percent/status, incomplete-grades count, academic standing — computed
// in one place from the typed GPA core. The React results islands and the
// shell /calculator route both consume this model, so the threshold logic that
// was previously duplicated (recalc(), CgpaSummary, CgpaMeter) has exactly one
// definition. Values and cutoffs are copied verbatim from recalc(); presentation
// (colors, copy, emoji) stays in the components.

import { calculateCgpaTotals } from '../../core/gpa.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import { standingTierFor } from './milestones.ts';
import type { StandingTier } from './milestones.ts';

/** Structural twin of CalculatorInputs (calculatorBridge.ts) — kept separate so
 * this module never imports React through the bridge. */
export interface ResultsInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: SemesterSeason | '';
  readonly startYear: string;
}

/** Meter status message families, mirroring the recalc() branch order. The
 * `cgpa` carried alongside is the figure that branch interpolates: the
 * completed CGPA for the graded tiers, the projected CGPA for
 * 'projected-only' and 'recovery' (recalc() uses the projected figure in its
 * recovery copy even though the tier is chosen by the completed one). */
export type MeterStatusKind =
  | 'empty'
  | 'projected-only'
  | 'no-completed'
  | 'outstanding'
  | 'excellent'
  | 'good'
  | 'push'
  | 'recovery';

export interface MeterStatus {
  readonly kind: MeterStatusKind;
  readonly cgpa: number | null;
}

/** BRACU standing tiers by completed CGPA (recalc() standing box, Summer 2022+
 * probation policy). Defined with the thresholds in milestones.ts so the
 * cutoffs have exactly one definition. */
export type { StandingTier } from './milestones.ts';

export interface CalculatorResults {
  /** Projected CGPA — includes running semesters (the headline figure). */
  readonly cgpa: number | null;
  /** Completed CGPA — excludes running semesters (meter + standing figure). */
  readonly completedCgpa: number | null;
  readonly hasRunning: boolean;
  readonly headlineLabel: 'Projected CGPA' | 'Current CGPA';
  readonly attemptedCredits: number;
  readonly earnedCredits: number;
  /** Completed, non-summary semesters with a named course missing its grade. */
  readonly incompleteSemesters: number;
  /** Meter fill 0–100, from the completed CGPA out of 4. */
  readonly meterPercent: number;
  /** Meter header label: one-decimal percent, or '0%' with no completed CGPA. */
  readonly meterPercentLabel: string;
  readonly meterStatus: MeterStatus;
  readonly standing: StandingTier | null;
}

/** Credit total display format shared with the legacy fmtCr(): whole numbers
 * bare, fractional totals to one decimal. */
export function formatCredits(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function meterStatusFor(
  cgpa: number | null,
  completedCgpa: number | null,
  hasRunning: boolean,
): MeterStatus {
  if (cgpa === null) return { kind: 'empty', cgpa: null };
  if (completedCgpa === null) {
    return hasRunning ? { kind: 'projected-only', cgpa } : { kind: 'no-completed', cgpa: null };
  }
  if (completedCgpa >= 3.75) return { kind: 'outstanding', cgpa: completedCgpa };
  if (completedCgpa >= 3.5) return { kind: 'excellent', cgpa: completedCgpa };
  if (completedCgpa >= 3.0) return { kind: 'good', cgpa: completedCgpa };
  if (completedCgpa >= 2.5) return { kind: 'push', cgpa: completedCgpa };
  return { kind: 'recovery', cgpa };
}

const standingFor = standingTierFor;

function isIncomplete(semester: SemesterEntry): boolean {
  return (
    !semester.running &&
    !semester.summary &&
    semester.courses.some((course) => course.name.trim() !== '' && !course.grade)
  );
}

export function computeCalculatorResults(inputs: ResultsInputs): CalculatorResults {
  const options = {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
  };
  const projected = calculateCgpaTotals(inputs.semesters, {
    ...options,
    includeRunning: true,
    includeSummary: true,
  });
  const completed = calculateCgpaTotals(inputs.semesters, {
    ...options,
    includeRunning: false,
    includeSummary: true,
  });

  const hasRunning = inputs.semesters.some((semester) => semester.running);
  const meterPercent = completed.cgpa !== null ? Math.min((completed.cgpa / 4) * 100, 100) : 0;

  return {
    cgpa: projected.cgpa,
    completedCgpa: completed.cgpa,
    hasRunning,
    headlineLabel: hasRunning ? 'Projected CGPA' : 'Current CGPA',
    attemptedCredits: projected.attemptedCredits,
    earnedCredits: projected.earnedCredits,
    incompleteSemesters: inputs.semesters.filter(isIncomplete).length,
    meterPercent,
    meterPercentLabel: completed.cgpa !== null ? `${meterPercent.toFixed(1)}%` : '0%',
    meterStatus: meterStatusFor(projected.cgpa, completed.cgpa, hasRunning),
    standing: standingFor(completed.cgpa),
  };
}
