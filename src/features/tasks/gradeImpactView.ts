// src/features/tasks/gradeImpactView.ts
//
// The grade picture, in words (#723).
//
// `gradeImpactFor` answers the arithmetic. This decides what to SAY about it,
// which is a separate and surprisingly consequential job: the same numbers can
// be phrased as "you need 97.5% on the final" or "an A is basically gone", and
// only one of those is a fact.
//
// Two rules hold throughout:
//
//   1. Never imply certainty the model does not have. A projection assumes the
//      remaining work scores at the current pace; every line built on that
//      assumption says so.
//   2. Never editorialise about the student. Report the arithmetic and let them
//      decide how to feel about it.
//
// Pure. No React, no network.

import type { CourseMarks } from '../calculator/courseMarks.ts';
import type { GradeLetter } from '../../core/grades.ts';
import { type AssessedTask, gradeImpactFor } from './gradeImpact.ts';

/** How a target reads on screen. */
export interface TargetLine {
  readonly letter: GradeLetter;
  readonly state: 'secured' | 'reachable' | 'unreachable';
  /** What the remaining work needs, as a percentage. Null unless reachable. */
  readonly neededPercent: number | null;
  readonly text: string;
}

/**
 * The targets worth putting on screen.
 *
 * Not all of them. A student looking at MAT215 does not need to be told that a
 * D is secured — BRACU's scale has eleven letters and listing every one turns a
 * useful answer into a wall. So: the best letter still reachable, the ones just
 * above and below it, and nothing else.
 *
 * `roundedNeeded` is ceil, not round. Needing 97.2% means 98 marks out of 100
 * will do and 97 will not; rounding down would tell a student they are safe at
 * a mark that misses.
 */
export function targetLines(impact: CourseMarks, limit = 3): readonly TargetLine[] {
  const reachable = impact.targets.filter((target) => target.state === 'reachable');
  const best = reachable[0];

  const chosen =
    best === undefined
      ? impact.targets.filter((target) => target.state === 'secured').slice(0, 1)
      : impact.targets.slice(
          Math.max(0, impact.targets.indexOf(best) - 1),
          Math.max(0, impact.targets.indexOf(best) - 1) + limit,
        );

  return chosen.map((target): TargetLine => {
    if (target.state === 'secured') {
      return {
        letter: target.letter,
        state: 'secured',
        neededPercent: null,
        text: `${target.letter} is already secured`,
      };
    }
    if (target.state === 'unreachable') {
      return {
        letter: target.letter,
        state: 'unreachable',
        neededPercent: null,
        text: `${target.letter} is no longer reachable`,
      };
    }
    const needed = Math.ceil(target.neededOnRemaining ?? 0);
    return {
      letter: target.letter,
      state: 'reachable',
      neededPercent: target.neededOnRemaining,
      text: `${target.letter} needs ${needed}% on what is left`,
    };
  });
}

export interface GradeImpactView {
  /** Weighted average across marked work, or null while nothing is marked. */
  readonly inHandPercent: number | null;
  /** Percentage of the course still ungraded. */
  readonly remainingWeight: number;
  readonly bestLetter: GradeLetter;
  readonly worstLetter: GradeLetter;
  readonly projectedLetter: GradeLetter | null;
  readonly targets: readonly TargetLine[];
  /**
   * True when the declared weights do not total 100 — the student has entered
   * only part of the syllabus. Every figure is still computed; the UI must say
   * it describes a partial picture rather than implying the course is fully
   * modelled.
   */
  readonly partial: boolean;
  /** The floor line: what happens if nothing else is scored at all. */
  readonly floorText: string;
}

/**
 * Everything a course card needs, or null when there is nothing to say.
 *
 * The floor line is the one most worth having and the least likely to be
 * worked out under pressure: "even with zero on everything left, this is still
 * a D-" is the sentence that stops a student writing a course off.
 */
export function gradeImpactView(
  assessed: readonly AssessedTask[],
  limit?: number,
): GradeImpactView | null {
  const impact = gradeImpactFor(assessed);
  if (impact === null) return null;

  return {
    inHandPercent: impact.inHandPercent,
    remainingWeight: impact.remainingWeight,
    bestLetter: impact.bestLetter,
    worstLetter: impact.worstLetter,
    projectedLetter: impact.projectedLetter,
    targets: targetLines(impact, limit),
    partial: !impact.weightsComplete,
    floorText:
      impact.remainingWeight <= 0
        ? `Final result: ${impact.worstLetter}`
        : `Even with nothing more, this course lands on ${impact.worstLetter}`,
  };
}

/**
 * The pace line, which always carries its own assumption.
 *
 * "On pace for an A-" is a claim about the future, and the assumption behind it
 * — that the remaining work scores like the marked work — is exactly what makes
 * it wrong when it is wrong. It is stated every time rather than in a footnote.
 */
export function paceText(view: GradeImpactView): string | null {
  if (view.projectedLetter === null) return null;
  if (view.remainingWeight <= 0) return null;
  return `On pace for ${view.projectedLetter}, if the rest goes like the marked work`;
}
