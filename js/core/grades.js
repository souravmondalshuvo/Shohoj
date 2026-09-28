export const GRADES = {
  'A+': 4.00, 'A':  4.00, 'A-': 3.70,
  'B+': 3.30, 'B':  3.00, 'B-': 2.70,
  'C+': 2.30, 'C':  2.00, 'C-': 1.70,
  'D+': 1.30, 'D':  1.00, 'D-': 0.70,
  'F':  0.00, 'F(NT)': 0, 'P':  null, 'I': null,
  // A withdrawal carries no grade point, but unlike P/I it still consumed an
  // attempt: calculateCgpaTotals counts it toward attempted credits and nothing
  // else. See getRetakenKeys for why it never supersedes a grade.
  'W': null
};

export const POINTS_TO_GRADE = [
  [4.00, 'A'],  [3.70, 'A-'],
  [3.30, 'B+'], [3.00, 'B'],  [2.70, 'B-'],
  [2.30, 'C+'], [2.00, 'C'],  [1.70, 'C-'],
  [1.30, 'D+'], [1.00, 'D'],  [0.70, 'D-'],
  [0.00, 'F'],
];

// `pointsToGrade` mirrors src/core/grades.ts: the caller passes its campus's
// table (getActiveCampus().grades.pointsToGrade); BRACU's is the default.
export function detectGrade(val, pointsToGrade = POINTS_TO_GRADE) {
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  for (const [pt, letter] of pointsToGrade) {
    if (Math.abs(n - pt) < 0.01) return letter;
  }
  let closest = null, minDiff = Infinity;
  for (const [pt, letter] of pointsToGrade) {
    const diff = Math.abs(n - pt);
    if (diff < minDiff) { minDiff = diff; closest = letter; }
  }
  return minDiff <= 0.20 ? closest : '';
}