export type GradeLetter =
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'
  | 'F'
  | 'F(NT)'
  | 'P'
  | 'I'
  | 'W';

export type GradePoint = number | null;

export const GRADES: Record<GradeLetter, GradePoint> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0.0,
  'F(NT)': 0.0,
  P: null,
  I: null,
  // A withdrawal carries no grade point, but unlike P/I it still consumed an
  // attempt: calculateCgpaTotals counts it toward attempted credits and nothing
  // else. See gpaCoreGetRetakenKeysImpl for why it never supersedes a grade.
  W: null,
};

export const POINTS_TO_GRADE = [
  [4.0, 'A'],
  [3.7, 'A-'],
  [3.3, 'B+'],
  [3.0, 'B'],
  [2.7, 'B-'],
  [2.3, 'C+'],
  [2.0, 'C'],
  [1.7, 'C-'],
  [1.3, 'D+'],
  [1.0, 'D'],
  [0.7, 'D-'],
  [0.0, 'F'],
] as const satisfies readonly (readonly [number, GradeLetter])[];

/**
 * Map a numeric grade point back to the nearest letter.
 *
 * Takes the point→letter table rather than a UniversityProfile on purpose:
 * university.ts imports this module, so importing it back would be a cycle.
 * Callers with a profile pass `profile.grades.pointsToGrade`; the default is
 * BRACU's table, which is what every existing caller already assumed.
 */
export function detectGrade(
  value: string | number,
  pointsToGrade: readonly (readonly [number, GradeLetter])[] = POINTS_TO_GRADE,
): GradeLetter | '' {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return '';

  for (const [point, letter] of pointsToGrade) {
    if (Math.abs(n - point) < 0.01) return letter;
  }

  let closest: GradeLetter | '' = '';
  let minDiff = Number.POSITIVE_INFINITY;
  for (const [point, letter] of pointsToGrade) {
    const diff = Math.abs(n - point);
    if (diff < minDiff) {
      minDiff = diff;
      closest = letter;
    }
  }

  return minDiff <= 0.2 ? closest : '';
}
