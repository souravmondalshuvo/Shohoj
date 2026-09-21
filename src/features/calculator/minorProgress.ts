// src/features/calculator/minorProgress.ts
//
// Pure minor-progress model (#731): given a student's semesters and a minor
// program, which requirements are discharged, how many elective credits are
// banked, and what is left.
//
// The credit-earning rules are deliberately the SAME rules the degree tracker
// uses (semesterCredits in degreeProgress.ts): a course in a running semester
// is in progress, and a course in a completed semester counts only when it
// carries a grade that is passing and is not P, I or F(NT). Two trackers on one
// page that disagreed about whether a course had been earned would be worse
// than either of them alone, so the rule is stated once here in the same shape
// and the divergence is a test away from being caught.
//
// No React, no DOM, no ambient clock — unlike degreeProgress this model needs
// no clock at all, because a minor has no projection: it asks only what has
// been earned, never when the rest will be.

import { parseReviewableCode } from './reviewableCourse.ts';
import { isElectiveCode, type MinorProgram, type MinorRequirement } from './minors.ts';
import type { SemesterEntry } from '../../core/types.ts';
import { UNIVERSITIES, type GradeScale } from '../../core/university.ts';

/** How a student stands on one requirement or elective slot. */
export type RequirementStatus = 'earned' | 'in-progress' | 'unmet';

/** A single course of the student's, reduced to what this model needs. */
export interface TakenCourse {
  readonly code: string;
  /** The course name as the student entered it. */
  readonly name: string;
  /**
   * The name with its trailing code parenthetical removed — "Optimization" from
   * "Optimization (CSE402)" — so a row that already prints the code does not
   * print it twice. Falls back to the raw name when stripping would leave
   * nothing, as it does for a course entered as bare "CSE402".
   */
  readonly title: string;
  readonly credits: number;
  /** '' for a running course with no grade yet. */
  readonly grade: string;
  readonly running: boolean;
}

export interface RequirementProgress {
  readonly requirement: MinorRequirement;
  readonly status: RequirementStatus;
  /** The course that earned it, or the one in progress; null when unmet. */
  readonly match: TakenCourse | null;
}

export interface ElectiveProgress {
  readonly creditsRequired: number;
  readonly creditsEarned: number;
  readonly creditsInProgress: number;
  /** Completed, passing courses counted toward the elective requirement. */
  readonly earnedCourses: readonly TakenCourse[];
  /** Running courses that will count once they are graded. */
  readonly inProgressCourses: readonly TakenCourse[];
}

export interface MinorProgress {
  readonly program: MinorProgram;
  readonly core: readonly RequirementProgress[];
  readonly electives: ElectiveProgress;
  readonly totalRequired: number;
  readonly creditsEarned: number;
  readonly creditsInProgress: number;
  readonly creditsRemaining: number;
  readonly progressPct: number;
  /** Core requirements fully discharged. */
  readonly coreEarned: number;
  readonly complete: boolean;
}

/**
 * Whether a completed-semester course counts as earned credit.
 * Mirrors the per-course test inside semesterCredits (degreeProgress.ts).
 */
function isPassingGrade(grade: string, scale: GradeScale): boolean {
  if (!grade || grade === 'P' || grade === 'I' || grade === 'F(NT)') return false;
  const gp = Object.prototype.hasOwnProperty.call(scale.points, grade)
    ? scale.points[grade as keyof typeof scale.points]
    : undefined;
  return gp !== undefined && gp !== null && gp > 0;
}

/** "Optimization (CSE402)" → "Optimization"; "" when the name is only a code. */
function stripCodeSuffix(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^[A-Z]{2,4}\d{3}[A-Z]?\b\s*[-–:]?\s*/i, '')
    .trim();
}

/**
 * Flatten the semesters into coded courses. Courses whose name yields no course
 * code are dropped: a minor requirement is stated in codes, so a line typed as
 * "calc 2" can satisfy nothing, and guessing from the title would be worse than
 * leaving the requirement visibly unmet.
 *
 * Summary blocks are skipped. A summary carries a credit total and a CGPA over
 * an unnamed set of past courses — it cannot say whether MAT 111 is among them,
 * and crediting a requirement from it would be an invention.
 */
export function collectTakenCourses(
  semesters: readonly SemesterEntry[],
  scale: GradeScale,
): readonly TakenCourse[] {
  const out: TakenCourse[] = [];
  for (const semester of semesters) {
    if (semester.summary) continue;
    const running = !!semester.running;
    for (const course of semester.courses) {
      const name = String(course.name ?? '').trim();
      if (!name) continue;
      const code = parseReviewableCode(name);
      if (!code) continue;
      const grade = String(course.grade ?? '');
      if (!running && !isPassingGrade(grade, scale)) continue;
      out.push({
        code,
        name,
        title: stripCodeSuffix(name) || name,
        credits: typeof course.credits === 'number' ? course.credits : 0,
        grade,
        running,
      });
    }
  }
  return out;
}

/**
 * Pick the course that discharges a requirement. A completed, passing course
 * always beats one in progress — a retake or a second alternative should not
 * demote a requirement the student has already cleared. Among equals the first
 * entered wins, which is the order the semesters were added in.
 */
function matchRequirement(
  requirement: MinorRequirement,
  taken: readonly TakenCourse[],
): RequirementProgress {
  const candidates = taken.filter((c) => requirement.codes.includes(c.code));
  const earned = candidates.find((c) => !c.running);
  if (earned) return { requirement, status: 'earned', match: earned };
  const inProgress = candidates.find((c) => c.running);
  if (inProgress) return { requirement, status: 'in-progress', match: inProgress };
  return { requirement, status: 'unmet', match: null };
}

/**
 * Minor progress for one program, or null when no program is selected.
 *
 * Credits are counted against the REQUIREMENT, not against the course: a
 * 3-credit requirement discharged by a 4-credit course still advances the minor
 * by 3, because that is what the program asks for. Electives are the other way
 * round — there the student's own credit values are what accumulate, capped at
 * the published elective total so an extra course cannot inflate the bar past
 * 100%.
 */
export function computeMinorProgress(
  semesters: readonly SemesterEntry[],
  program: MinorProgram | null,
  scale: GradeScale = UNIVERSITIES.bracu.grades,
): MinorProgress | null {
  if (!program) return null;

  const taken = collectTakenCourses(semesters, scale);
  const core = program.core.map((requirement) => matchRequirement(requirement, taken));

  // Every course already spoken for by a core requirement — including one that
  // is merely in progress, so a course does not count twice by being counted
  // early. Keyed by code: the same code appearing twice is a retake of the one
  // course, not two courses.
  const spent = new Set(core.map((r) => r.match?.code).filter((c): c is string => !!c));

  const electiveCandidates = taken.filter(
    (c) => !spent.has(c.code) && isElectiveCode(c.code, program.electives),
  );
  // A retaken elective is one course: its credits must not be banked twice.
  const seenElective = new Set<string>();
  const earnedCourses: TakenCourse[] = [];
  const inProgressCourses: TakenCourse[] = [];
  for (const course of electiveCandidates) {
    if (seenElective.has(course.code)) continue;
    seenElective.add(course.code);
    if (course.running) inProgressCourses.push(course);
    else earnedCourses.push(course);
  }

  const rawElectiveEarned = earnedCourses.reduce((sum, c) => sum + c.credits, 0);
  const electiveEarned = Math.min(rawElectiveEarned, program.electives.credits);
  const electiveInProgress = Math.min(
    inProgressCourses.reduce((sum, c) => sum + c.credits, 0),
    Math.max(0, program.electives.credits - electiveEarned),
  );

  const coreEarnedCredits = core
    .filter((r) => r.status === 'earned')
    .reduce((sum, r) => sum + r.requirement.credits, 0);
  const coreInProgressCredits = core
    .filter((r) => r.status === 'in-progress')
    .reduce((sum, r) => sum + r.requirement.credits, 0);

  const creditsEarned = coreEarnedCredits + electiveEarned;
  const creditsInProgress = coreInProgressCredits + electiveInProgress;

  return {
    program,
    core,
    electives: {
      creditsRequired: program.electives.credits,
      creditsEarned: electiveEarned,
      creditsInProgress: electiveInProgress,
      earnedCourses,
      inProgressCourses,
    },
    totalRequired: program.totalCredits,
    creditsEarned,
    creditsInProgress,
    creditsRemaining: Math.max(0, program.totalCredits - creditsEarned),
    progressPct: Math.min((creditsEarned / program.totalCredits) * 100, 100),
    coreEarned: core.filter((r) => r.status === 'earned').length,
    complete: creditsEarned >= program.totalCredits,
  };
}
