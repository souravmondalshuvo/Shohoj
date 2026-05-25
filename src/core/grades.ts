export type GradeLetter =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'F' | 'F(NT)' | 'P' | 'I';

export type GradePoint = number | null;

export const GRADES: Record<GradeLetter, GradePoint> = {
  'A+': 4.00,
  A: 4.00,
  'A-': 3.70,
  'B+': 3.30,
  B: 3.00,
  'B-': 2.70,
  'C+': 2.30,
  C: 2.00,
  'C-': 1.70,
  'D+': 1.30,
  D: 1.00,
  'D-': 0.70,
  F: 0.00,
  'F(NT)': 0.00,
  P: null,
  I: null,
};

export const POINTS_TO_GRADE = [
  [4.00, 'A'],
  [3.70, 'A-'],
  [3.30, 'B+'],
  [3.00, 'B'],
  [2.70, 'B-'],
  [2.30, 'C+'],
  [2.00, 'C'],
  [1.70, 'C-'],
  [1.30, 'D+'],
  [1.00, 'D'],
  [0.70, 'D-'],
  [0.00, 'F'],
] as const satisfies readonly (readonly [number, GradeLetter])[];

export function detectGrade(value: string | number): GradeLetter | '' {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return '';

  for (const [point, letter] of POINTS_TO_GRADE) {
    if (Math.abs(n - point) < 0.01) return letter;
  }

  let closest: GradeLetter | '' = '';
  let minDiff = Number.POSITIVE_INFINITY;
  for (const [point, letter] of POINTS_TO_GRADE) {
    const diff = Math.abs(n - point);
    if (diff < minDiff) {
      minDiff = diff;
      closest = letter;
    }
  }

  return minDiff <= 0.20 ? closest : '';
}
