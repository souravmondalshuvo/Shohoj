export const GRADES = {
  'A':  4.00, 'A-': 3.70,
  'B+': 3.30, 'B':  3.00, 'B-': 2.70,
  'C+': 2.30, 'C':  2.00, 'C-': 1.70,
  'D+': 1.30, 'D':  1.00,
  'F':  0.00, 'F(NT)': null, 'P':  null, 'I': null
};

export const POINTS_TO_GRADE = [
  [4.00, 'A'],  [3.70, 'A-'],
  [3.30, 'B+'], [3.00, 'B'],  [2.70, 'B-'],
  [2.30, 'C+'], [2.00, 'C'],  [1.70, 'C-'],
  [1.30, 'D+'], [1.00, 'D'],
  [0.00, 'F'],
];

export function detectGrade(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  for (const [pt, letter] of POINTS_TO_GRADE) {
    if (Math.abs(n - pt) < 0.01) return letter;
  }
  let closest = null, minDiff = Infinity;
  for (const [pt, letter] of POINTS_TO_GRADE) {
    const diff = Math.abs(n - pt);
    if (diff < minDiff) { minDiff = diff; closest = letter; }
  }
  return minDiff <= 0.20 ? closest : '';
}
