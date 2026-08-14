// src/features/calculator/plannerTotals.ts
//
// Pure port of getCurrentTotals (js/ui/playground.js) for the planner's CGPA
// impact preview (#327). Deliberately NOT calculateCgpaTotals: this base
// includes graded courses in RUNNING semesters, skips F(NT) entirely (the
// core counts it as attempted 0-point credits), and ignores the summary
// block's attempted figure — the exact base projectCGPA has always used.

import { gpaCoreGetRetakenKeys } from '../../core/gpa.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import { UNIVERSITIES } from '../../core/university.ts';
import type { GradeScale } from '../../core/university.ts';

export interface PlannerTotals {
  readonly pts: number;
  readonly cr: number;
  readonly cgpa: number | null;
}

export interface PlannerTotalsInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: SemesterSeason | '';
  readonly startYear: string;
  /** Campus grading scale. Defaults to BRACU's. */
  readonly scale?: GradeScale;
}

/** Grade points + credits backing the impact projection (playground parity). */
export function getPlannerTotals(inputs: PlannerTotalsInputs): PlannerTotals {
  const scale = inputs.scale ?? UNIVERSITIES.bracu.grades;
  const retakenKeys = gpaCoreGetRetakenKeys(inputs.semesters, {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
    scale: inputs.scale,
  });
  let pts = 0;
  let cr = 0;

  const summaryBlock = inputs.semesters.find((sem) => sem.summary);
  if (summaryBlock?.summaryCGPA !== undefined && summaryBlock.summaryCredits !== undefined) {
    pts += summaryBlock.summaryCGPA * summaryBlock.summaryCredits;
    cr += summaryBlock.summaryCredits;
  }

  for (const sem of inputs.semesters) {
    if (sem.summary) continue;
    sem.courses.forEach((course, index) => {
      const gp = Object.prototype.hasOwnProperty.call(scale.points, course.grade)
        ? scale.points[course.grade as keyof typeof scale.points]
        : undefined;
      if (gp === undefined || gp === null || !course.credits) return;
      if (course.grade === 'P' || course.grade === 'I' || course.grade === 'F(NT)') return;
      if (retakenKeys.has(`${sem.id}-${index}`)) return;
      pts += gp * course.credits;
      cr += course.credits;
    });
  }

  return { pts, cr, cgpa: cr > 0 ? pts / cr : null };
}
