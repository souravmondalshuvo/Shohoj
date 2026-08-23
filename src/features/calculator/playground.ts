// src/features/calculator/playground.ts
//
// Pure port of the two tools in js/ui/playground.js — the grade changer and the
// reverse solver. The legacy module interleaves the arithmetic with innerHTML
// strings and a module-level mutable `pg` object; this is the arithmetic on its
// own, so the route can hold the selection state in React and the maths can be
// tested without a DOM.
//
// Campus note: legacy hardcodes 4.0 as the ceiling. Everything here reads
// `scale.max` instead, so a campus whose scale tops out elsewhere gets a solver
// that answers on its own scale rather than BRACU's (#556 tenancy).

import { gpaCoreGetRetakenKeys } from '../../core/gpa.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import { UNIVERSITIES } from '../../core/university.ts';
import type { GradeScale } from '../../core/university.ts';
import type { PlannerTotals } from './plannerTotals.ts';

/** Grades the playground will not offer or reason about.
 *
 * P/I/F(NT) carry no grade point. W joins them because the question the tools
 * ask is "what if this grade were X", and a withdrawal is not a grade a course
 * can be changed *to* (js/ui/playground.js:28). */
const EXCLUDED = new Set(['P', 'I', 'F(NT)', 'W']);

export interface PlaygroundCourse {
  /** `${semesterId}-${indexInSemester}` — legacy's identity for a course row. */
  readonly key: string;
  readonly name: string;
  readonly credits: number;
  readonly grade: string;
  readonly gp: number;
  /** Semester name with its trailing "(Nth Semester)" suffix stripped. */
  readonly sem: string;
  readonly running: boolean;
}

export interface PlaygroundInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: SemesterSeason | '';
  readonly startYear: string;
  readonly scale?: GradeScale;
}

/** Letter grades the changer offers, weakest first. */
export function gradeOptions(scale: GradeScale): readonly { grade: string; gp: number }[] {
  return Object.entries(scale.points)
    .filter(([letter, gp]) => !EXCLUDED.has(letter) && gp !== null && gp !== undefined)
    .map(([grade, gp]) => ({ grade, gp: gp as number }))
    .sort((a, b) => a.gp - b.gp);
}

/**
 * The courses either tool can act on: graded, point-carrying, and still
 * counting — a retaken attempt is excluded because changing a grade the CGPA
 * already ignores would move nothing.
 */
export function gradedCourses(inputs: PlaygroundInputs): readonly PlaygroundCourse[] {
  const scale = inputs.scale ?? UNIVERSITIES.bracu.grades;
  const retakenKeys = gpaCoreGetRetakenKeys(inputs.semesters, {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
    scale: inputs.scale,
  });

  const out: PlaygroundCourse[] = [];
  for (const sem of inputs.semesters) {
    if (sem.summary) continue;
    sem.courses.forEach((course, index) => {
      if (!course.name.trim() || !course.grade) return;
      if (EXCLUDED.has(course.grade)) return;
      const gp = Object.prototype.hasOwnProperty.call(scale.points, course.grade)
        ? scale.points[course.grade as keyof typeof scale.points]
        : undefined;
      if (gp === undefined || gp === null) return;
      if (retakenKeys.has(`${sem.id}-${index}`)) return;
      out.push({
        key: `${sem.id}-${index}`,
        name: course.name,
        credits: course.credits,
        grade: course.grade,
        gp,
        sem: (sem.name ?? '').replace(/\s*\(.*\)$/, ''),
        running: !!sem.running,
      });
    });
  }
  return out;
}

/**
 * A course's identity, so a pending change can be dropped when the course it
 * referred to has been edited underneath it (js/ui/playground.js:46). Without
 * this, renaming a course silently re-points its what-if grade at whatever now
 * occupies that row.
 */
export function courseSignature(course: PlaygroundCourse | undefined): string {
  return [
    course?.name ?? '',
    course?.credits ?? 0,
    course?.grade ?? '',
    course?.sem ?? '',
    course?.running ? '1' : '0',
  ].join('|');
}

export interface ChangeImpact extends PlaygroundCourse {
  readonly newGrade: string;
  readonly newGp: number;
  /** This change's own contribution to the CGPA move, in CGPA points. */
  readonly impact: number;
}

export interface WhatIfResult {
  readonly cgpa: number | null;
  readonly delta: number;
  readonly changes: readonly ChangeImpact[];
}

/**
 * Apply a set of pretend grades to the totals.
 *
 * Credits do not move — the courses are already counted, only their points
 * change — so the divisor stays `totals.cr` throughout.
 */
export function whatIfTotals(
  totals: PlannerTotals,
  courses: readonly PlaygroundCourse[],
  changes: Readonly<Record<string, string>>,
  scale: GradeScale = UNIVERSITIES.bracu.grades,
): WhatIfResult {
  let newPts = totals.pts;
  const applied: ChangeImpact[] = [];

  for (const [key, newGrade] of Object.entries(changes)) {
    const course = courses.find((c) => c.key === key);
    if (!course) continue;
    const newGp = Object.prototype.hasOwnProperty.call(scale.points, newGrade)
      ? scale.points[newGrade as keyof typeof scale.points]
      : undefined;
    if (newGp === undefined || newGp === null) continue;
    const delta = course.credits * (newGp - course.gp);
    newPts += delta;
    applied.push({
      ...course,
      newGrade,
      newGp,
      impact: totals.cr > 0 ? delta / totals.cr : 0,
    });
  }

  const cgpa = totals.cr > 0 ? newPts / totals.cr : null;
  return {
    cgpa,
    delta: totals.cgpa !== null && cgpa !== null ? cgpa - totals.cgpa : 0,
    changes: applied,
  };
}

export type SolverResult =
  /** Not reachable through this one course, even at the scale's ceiling. */
  | { readonly kind: 'impossible'; readonly bestPossible: number; readonly target: number }
  /** Already at or above the target — any grade holds it. */
  | { readonly kind: 'reached'; readonly target: number }
  | {
      readonly kind: 'found';
      readonly grade: string;
      readonly gp: number;
      readonly newCgpa: number;
      readonly delta: number;
    };

/**
 * The weakest grade in `course` that still reaches `target`.
 *
 * Returns null when the question is unanswerable rather than guessing: no
 * course chosen, no target typed, a target outside the scale, or no credits to
 * divide by.
 */
export function solveForCourse(
  totals: PlannerTotals,
  course: PlaygroundCourse | undefined,
  target: number,
  scale: GradeScale = UNIVERSITIES.bracu.grades,
): SolverResult | null {
  if (!course || !Number.isFinite(target)) return null;
  if (target < 0 || target > scale.max) return null;
  if (totals.cr <= 0 || course.credits <= 0 || totals.cgpa === null) return null;

  // Points the course must carry for the whole CGPA to land on target, with its
  // current contribution taken back out first.
  const neededGp = (target * totals.cr - totals.pts + course.credits * course.gp) / course.credits;

  if (neededGp > scale.max) {
    const bestPossible =
      (totals.pts - course.credits * course.gp + course.credits * scale.max) / totals.cr;
    return { kind: 'impossible', bestPossible, target };
  }
  if (neededGp <= 0) return { kind: 'reached', target };

  const minGrade = gradeOptions(scale).find((g) => g.gp >= neededGp);
  if (!minGrade) return null;

  const newCgpa =
    (totals.pts - course.credits * course.gp + course.credits * minGrade.gp) / totals.cr;
  return {
    kind: 'found',
    grade: minGrade.grade,
    gp: minGrade.gp,
    newCgpa,
    delta: newCgpa - totals.cgpa,
  };
}
