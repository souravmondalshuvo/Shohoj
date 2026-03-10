// ── GRADES & GRADE POINT MAPS ────────────────────────
// Single source of truth for all grade lookups.

// ── GPA DATA ─────────────────────────────────────────
    const GRADES = {
      'A':  4.00, 'A-': 3.70,
      'B+': 3.30, 'B':  3.00, 'B-': 2.70,
      'C+': 2.30, 'C':  2.00, 'C-': 1.70,
      'D+': 1.30, 'D':  1.00,
      'F':  0.00, 'F(NT)': null, 'P':  null, 'I': null
    };

    const POINTS_TO_GRADE = [
      [4.00, 'A'],  [3.70, 'A-'],
      [3.30, 'B+'], [3.00, 'B'],  [2.70, 'B-'],
      [2.30, 'C+'], [2.00, 'C'],  [1.70, 'C-'],
      [1.30, 'D+'], [1.00, 'D'],
      [0.00, 'F'],
    ];

export { GRADES, POINTS_TO_GRADE };