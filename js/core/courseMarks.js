// Twin of src/features/calculator/courseMarks.ts — hand-maintained, not generated.
// src/features/calculator/courseMarks.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Course-level marks model (#500): given the components a student has been
// graded on, what do they need on what is left.

import { GRADES } from './grades.js';

/**
 * BRACU's absolute mark → letter scale, highest first.
 *
 * VERIFY BEFORE RELYING ON THIS. These cutoffs are the commonly published BRACU
 * scale, but they are not sourced from a document in this repo and the
 * university has revised grading policy before. Confirm against the current
 * official Grading Policy and correct here and in the typed twin.
 *
 * `min` is inclusive: a mark of exactly 85.0 is an A-, not a B+.
 */
export const MARK_SCALE = [
  { letter: 'A+', min: 97 },
  { letter: 'A',  min: 90 },
  { letter: 'A-', min: 85 },
  { letter: 'B+', min: 80 },
  { letter: 'B',  min: 75 },
  { letter: 'B-', min: 70 },
  { letter: 'C+', min: 65 },
  { letter: 'C',  min: 60 },
  { letter: 'C-', min: 57 },
  { letter: 'D+', min: 55 },
  { letter: 'D',  min: 52 },
  { letter: 'D-', min: 50 },
  { letter: 'F',  min: 0 },
];

/** The letter an overall course mark earns. */
export function letterForMark(mark) {
  for (const tier of MARK_SCALE) {
    if (mark >= tier.min) return tier.letter;
  }
  return 'F';
}

function gradePointOf(letter) {
  const gp = GRADES[letter];
  return typeof gp === 'number' ? gp : 0;
}

function isGraded(c) {
  return c.score !== null && c.score !== undefined && Number.isFinite(c.score) && c.outOf > 0;
}

function isUsable(c) {
  return Number.isFinite(c.weight) && c.weight > 0;
}

function earnedWeight(components) {
  return components.reduce((sum, c) => {
    if (!isUsable(c) || !isGraded(c)) return sum;
    const ratio = Math.max(0, c.score / c.outOf);
    return sum + c.weight * ratio;
  }, 0);
}

/**
 * Answer the course-level question from whatever the student has entered.
 * Returns null only when no component carries usable weight — a partial
 * syllabus is the normal case, not a refusal case.
 */
export function computeCourseMarks(components) {
  const usable = components.filter(isUsable);
  const totalWeight = usable.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return null;

  const gradedWeight = usable.filter(isGraded).reduce((s, c) => s + c.weight, 0);
  const remainingWeight = Math.max(0, totalWeight - gradedWeight);
  const earned = earnedWeight(usable);

  const floor = (earned / totalWeight) * 100;
  const ceiling = ((earned + remainingWeight) / totalWeight) * 100;

  const targets = MARK_SCALE.filter(tier => tier.letter !== 'F').map(tier => {
    const base = { letter: tier.letter, gradePoint: gradePointOf(tier.letter), cutoff: tier.min };
    if (floor >= tier.min) return { ...base, neededOnRemaining: null, state: 'secured' };
    if (ceiling < tier.min) return { ...base, neededOnRemaining: null, state: 'unreachable' };
    return {
      ...base,
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
