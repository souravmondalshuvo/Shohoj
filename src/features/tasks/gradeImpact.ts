// src/features/tasks/gradeImpact.ts
//
// What a task is worth to a grade (#721).
//
// THIS FILE DELIBERATELY CONTAINS NO GRADE ARITHMETIC.
//
// `computeCourseMarks` (src/features/calculator/courseMarks.ts) already answers
// the question the Tasks brief asks — "MAT215, 51 marks in hand, final worth
// 40%, target A: what do I need, and is it still possible?" It does it against
// the campus's own mark cutoffs, with secured / reachable / unreachable states,
// and it is the engine the calculator's course-marks panel already ships.
//
// So this module is a BRIDGE, not an implementation: it turns a set of task
// assessments into the `MarkComponent[]` that engine consumes, and hands the
// answer back. Writing a second grade calculation here would mean two
// definitions of the most consequential arithmetic in the product, drifting
// apart the first time either changed.
//
// Pure — no React, no network.

import {
  type CourseMarks,
  type MarkComponent,
  type MarkTarget,
  computeCourseMarks,
} from '../calculator/courseMarks.ts';
import type { MarkTier } from '../../core/university.ts';
import type { Assessment, Task } from '../../platform/api/tasks.ts';
import type { GradeLetter } from '../../core/grades.ts';

/** A task and its assessment, as the screens hold them. */
export interface AssessedTask {
  readonly task: Task;
  readonly assessment: Assessment;
}

/**
 * Turn assessed tasks into the mark components the calculator's engine reads.
 *
 * The task's title becomes the component name, so the engine's output is
 * already labelled with what the student called it — "Final Exam", not
 * "component 3".
 *
 * `earnedMarks === null` passes straight through as `score: null`. That is the
 * whole reason the field is nullable: the engine distinguishes "not marked yet"
 * from "scored zero", and collapsing them here would make every ungraded course
 * look failed.
 */
export function toMarkComponents(assessed: readonly AssessedTask[]): MarkComponent[] {
  return assessed.map(({ task, assessment }) => ({
    name: task.title,
    weight: assessment.weightPercent,
    score: assessment.earnedMarks,
    outOf: assessment.totalMarks,
  }));
}

/**
 * The grade picture for one course, from its assessed tasks.
 *
 * Null when there is nothing to compute from — no assessment carries usable
 * weight. A PARTIAL syllabus is not that case: it is the normal one, and
 * `weightsComplete` on the result says whether the weights add to 100 so the UI
 * can caveat rather than refuse.
 */
export function gradeImpactFor(
  assessed: readonly AssessedTask[],
  marks?: readonly MarkTier[],
): CourseMarks | null {
  const components = toMarkComponents(assessed);
  return marks === undefined
    ? computeCourseMarks(components)
    : computeCourseMarks(components, marks);
}

/**
 * What one task still has to score for a target letter to stay possible.
 *
 * The question a student actually asks about an upcoming exam: *this* one, not
 * the remaining weight in aggregate. Returned as a percentage of that task's
 * own marks, so it reads as "you need 72% on the final" rather than a figure
 * over some other whole.
 *
 * Returns null when the question does not apply — the target is already
 * secured, already impossible, or this task is not among the ungraded work the
 * answer depends on.
 *
 * Note this is only the whole answer when the task is the ONLY ungraded
 * component. With more than one still to come, it is what this task needs *if
 * the rest score at the same rate*, which is the assumption the engine's
 * `neededOnRemaining` already makes and the UI must repeat rather than hide.
 */
export function neededOnTask(
  assessed: readonly AssessedTask[],
  taskId: string,
  target: GradeLetter,
  marks?: readonly MarkTier[],
): number | null {
  const impact = gradeImpactFor(assessed, marks);
  if (impact === null) return null;

  const entry = assessed.find(({ task }) => task.id === taskId);
  if (entry === undefined) return null;
  // Already marked: there is nothing left to need on it.
  if (entry.assessment.earnedMarks !== null) return null;

  const tier = impact.targets.find((t: MarkTarget) => t.letter === target);
  if (tier === undefined || tier.state !== 'reachable') return null;
  return tier.neededOnRemaining;
}

/**
 * The best letter still reachable, and the worst still possible.
 *
 * A two-line summary for a course card: "still on for an A-, cannot fall below
 * a B". Both come from the engine; nothing is recomputed.
 */
export interface GradeWindow {
  readonly best: GradeLetter;
  readonly worst: GradeLetter;
  /** The letter the course lands on at the current pace, or null while ungraded. */
  readonly projected: GradeLetter | null;
  /** False when the declared weights do not total 100 — the UI must say so. */
  readonly weightsComplete: boolean;
}

export function gradeWindow(
  assessed: readonly AssessedTask[],
  marks?: readonly MarkTier[],
): GradeWindow | null {
  const impact = gradeImpactFor(assessed, marks);
  if (impact === null) return null;
  return {
    best: impact.bestLetter,
    worst: impact.worstLetter,
    projected: impact.projectedLetter,
    weightsComplete: impact.weightsComplete,
  };
}
