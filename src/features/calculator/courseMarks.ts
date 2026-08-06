// src/features/calculator/courseMarks.ts
//
// Course-level marks model (#500).
//
// Every other projection in Shohoj works at semester granularity: the goal
// simulator's best answer is "you need a 3.70 across your remaining 45
// credits", which is true and useless on a Tuesday in week 9. The question
// students actually ask is course-level — "I got 18/25 on the mid and 8/10 on
// quizzes, what do I need on the final for an A-?" — and BRACU's absolute
// grading scale makes it exact arithmetic rather than estimation.
//
// This module is the arithmetic only. Presentation, persistence and the UI that
// collects components live elsewhere; the model lands and is tested first.
//
// Vocabulary is deliberately shared with milestones.ts: a target is 'secured'
// (held even if everything remaining scores zero), 'reachable' (with the mark
// needed) or 'unreachable'. Same honesty rule as #502 — "secured" means secured
// under the worst case, not under the current average.

import { GRADES, type GradeLetter } from '../../core/grades.ts';

/**
 * BRACU's absolute mark → letter scale, highest first.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VERIFY BEFORE RELYING ON THIS. These cutoffs are the commonly published │
 * │ BRACU scale, but they are not sourced from a document in this repo and  │
 * │ the university has revised grading policy before. Confirm against the   │
 * │ current official Grading Policy and correct here — this table is the    │
 * │ single definition, so a fix is one edit and the tests re-pin it.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `min` is inclusive: a mark of exactly 85.0 is an A-, not a B+.
 */
export const MARK_SCALE: readonly { readonly letter: GradeLetter; readonly min: number }[] = [
  { letter: 'A+', min: 97 },
  { letter: 'A', min: 90 },
  { letter: 'A-', min: 85 },
  { letter: 'B+', min: 80 },
  { letter: 'B', min: 75 },
  { letter: 'B-', min: 70 },
  { letter: 'C+', min: 65 },
  { letter: 'C', min: 60 },
  { letter: 'C-', min: 57 },
  { letter: 'D+', min: 55 },
  { letter: 'D', min: 52 },
  { letter: 'D-', min: 50 },
  { letter: 'F', min: 0 },
];

/** The letter an overall course mark earns. */
export function letterForMark(mark: number): GradeLetter {
  for (const tier of MARK_SCALE) {
    if (mark >= tier.min) return tier.letter;
  }
  return 'F';
}

/**
 * One graded component of a course — a midterm, a quiz set, an assignment.
 *
 * `weight` is the component's share of the final course mark, in percent.
 * `score`/`outOf` are the raw marks as the student received them ("18 out of
 * 25"), which is how they think about it; converting to a percentage is this
 * module's job, not theirs. A null `score` means "not graded yet".
 */
export interface MarkComponent {
  readonly name: string;
  readonly weight: number;
  readonly score: number | null;
  readonly outOf: number;
}

export type TargetState = 'secured' | 'reachable' | 'unreachable';

export interface MarkTarget {
  readonly letter: GradeLetter;
  readonly gradePoint: number;
  readonly cutoff: number;
  /**
   * Average percentage needed across the *ungraded* weight to land this letter.
   * Present only when `state` is 'reachable'; a secured target needs nothing and
   * an unreachable one has no answer under 100 worth printing.
   */
  readonly neededOnRemaining: number | null;
  readonly state: TargetState;
}

export interface CourseMarks {
  /** Declared weight across all components. 100 in a fully-known course. */
  readonly totalWeight: number;
  /** Weight that has a score entered. */
  readonly gradedWeight: number;
  /** Weight still to come — `totalWeight - gradedWeight`. */
  readonly remainingWeight: number;
  /**
   * False when the declared weights do not total 100, which usually means the
   * student has only entered the components they have been told about. Every
   * figure here is still computed; it just describes a partial syllabus, and
   * the UI should say so rather than imply the course is fully modelled.
   */
  readonly weightsComplete: boolean;
  /**
   * Weighted average across the graded components only, in percent — "marks in
   * hand". Null when nothing is graded yet.
   */
  readonly inHandPercent: number | null;
  /** Course mark if every remaining component scores full marks. */
  readonly ceiling: number;
  /** Course mark if every remaining component scores zero. */
  readonly floor: number;
  readonly bestLetter: GradeLetter;
  readonly worstLetter: GradeLetter;
  /** Every letter above F, highest first. */
  readonly targets: readonly MarkTarget[];
}

function gradePointOf(letter: GradeLetter): number {
  const gp = GRADES[letter];
  return typeof gp === 'number' ? gp : 0;
}

/** A component counts toward the graded total only if it can be scored. */
function isGraded(c: MarkComponent): boolean {
  return c.score !== null && Number.isFinite(c.score) && c.outOf > 0;
}

function isUsable(c: MarkComponent): boolean {
  return Number.isFinite(c.weight) && c.weight > 0;
}

/**
 * Grade points earned so far, expressed on the course's own weight scale: a
 * component worth 25 with 18/25 contributes 18.
 */
function earnedWeight(components: readonly MarkComponent[]): number {
  return components.reduce((sum, c) => {
    if (!isUsable(c) || !isGraded(c)) return sum;
    const ratio = Math.max(0, (c.score as number) / c.outOf);
    return sum + c.weight * ratio;
  }, 0);
}

/**
 * Answer the course-level question from whatever the student has entered.
 *
 * Returns null only when there is nothing to compute from — no component
 * carries usable weight. A partial syllabus is not a refusal case: it is the
 * normal one.
 */
export function computeCourseMarks(components: readonly MarkComponent[]): CourseMarks | null {
  const usable = components.filter(isUsable);
  const totalWeight = usable.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return null;

  const gradedWeight = usable.filter(isGraded).reduce((s, c) => s + c.weight, 0);
  const remainingWeight = Math.max(0, totalWeight - gradedWeight);
  const earned = earnedWeight(usable);

  // Course marks are out of the declared total, not out of 100 — a half-known
  // syllabus should not silently report a mark out of a whole it cannot see.
  const floor = (earned / totalWeight) * 100;
  const ceiling = ((earned + remainingWeight) / totalWeight) * 100;

  const targets = MARK_SCALE.filter((tier) => tier.letter !== 'F').map((tier): MarkTarget => {
    const base = {
      letter: tier.letter,
      gradePoint: gradePointOf(tier.letter),
      cutoff: tier.min,
    };
    if (floor >= tier.min) return { ...base, neededOnRemaining: null, state: 'secured' };
    if (ceiling < tier.min) return { ...base, neededOnRemaining: null, state: 'unreachable' };
    return {
      ...base,
      // remainingWeight > 0 here: at zero, floor and ceiling are equal, so every
      // tier is decided by the two branches above.
      neededOnRemaining: ((tier.min / 100) * totalWeight - earned) / (remainingWeight / 100),
      state: 'reachable',
    };
  });

  return {
    totalWeight,
    gradedWeight,
    remainingWeight,
    weightsComplete: Math.abs(totalWeight - 100) < 1e-9,
    inHandPercent: gradedWeight > 0 ? (earned / gradedWeight) * 100 : null,
    ceiling,
    floor,
    bestLetter: letterForMark(ceiling),
    worstLetter: letterForMark(floor),
    targets,
  };
}
