/**
 * tests/calculator.test.js
 * Tests for Shohoj's GPA/CGPA calculation engine.
 * These functions are pure — no DOM, no Firebase, no side effects.
 */

// ── Inline the core logic (mirrors js/core/grades.js + js/core/calculator.js)
// We duplicate the minimal logic here so tests run without a bundler.
// When migrating to React/Vite, import directly from the source modules.

const GRADES = {
  'A+': 4.00, 'A':  4.00, 'A-': 3.70,
  'B+': 3.30, 'B':  3.00, 'B-': 2.70,
  'C+': 2.30, 'C':  2.00, 'C-': 1.70,
  'D+': 1.30, 'D':  1.00, 'D-': 0.70,
  'F':  0.00, 'F(NT)': 0, 'P': null, 'I': null
};

const POINTS_TO_GRADE = [
  [4.00, 'A'],  [3.70, 'A-'],
  [3.30, 'B+'], [3.00, 'B'],  [2.70, 'B-'],
  [2.30, 'C+'], [2.00, 'C'],  [1.70, 'C-'],
  [1.30, 'D+'], [1.00, 'D'],  [0.70, 'D-'],
  [0.00, 'F'],
];

function detectGrade(val) {
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

function calcSemGPA(sem) {
  let pts = 0, creds = 0;
  sem.courses.forEach(c => {
    const gp = GRADES[c.grade];
    if (gp === undefined || !c.credits) return;
    if (c.grade === 'P' || c.grade === 'I') return;
    if (c.grade === 'F(NT)') { creds += c.credits; return; }
    if (gp === null) return;
    pts += gp * c.credits;
    creds += c.credits;
  });
  return creds > 0 ? pts / creds : null;
}

function calcCGPA(semesters) {
  let pts = 0, cr = 0;
  semesters.forEach(sem => {
    sem.courses.forEach(c => {
      const gp = GRADES[c.grade];
      if (gp === undefined || gp === null || !c.credits) return;
      if (c.grade === 'P' || c.grade === 'I') return;
      pts += gp * c.credits;
      cr  += c.credits;
    });
  });
  return cr > 0 ? pts / cr : null;
}

// BRACU best-grade retake policy helper (mirrors calculator.js logic)
function getRetakenKeys(semesters, bestGradePolicy = true) {
  const all = [];
  semesters.forEach(sem => {
    sem.courses.forEach((c, i) => {
      if (!c.name.trim()) return;
      const codeMatch = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      const code = codeMatch ? codeMatch[1] : null;
      const baseName = c.name.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase();
      const gp = (c.grade && c.grade !== 'F(NT)') ? (GRADES[c.grade] ?? -1) : -1;
      all.push({ semId: sem.id, idx: i, code, baseName, key: `${sem.id}-${i}`, gp });
    });
  });

  const groups = {};
  all.forEach(entry => {
    const groupKey = entry.code || entry.baseName;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(entry);
  });

  const retakenKeys = new Set();
  Object.values(groups).forEach(group => {
    if (group.length < 2) return;
    if (bestGradePolicy) {
      const best = group.reduce((a, b) => a.gp >= b.gp ? a : b);
      group.forEach(e => { if (e.key !== best.key) retakenKeys.add(e.key); });
    } else {
      group.slice(0, -1).forEach(e => retakenKeys.add(e.key));
    }
  });
  return retakenKeys;
}

// ── Minimal test runner (no dependencies) ────────────────────────────────────
let passed = 0, failed = 0, total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${description}`);
    console.error(`    → ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const factor = Math.pow(10, precision);
      const a = Math.round(actual * factor) / factor;
      const e = Math.round(expected * factor) / factor;
      if (a !== e) {
        throw new Error(`Expected ~${expected} (±${1/factor}), got ${actual}`);
      }
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeTrue() {
      if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
    },
    toBeFalse() {
      if (actual !== false) throw new Error(`Expected false, got ${JSON.stringify(actual)}`);
    },
    toContain(item) {
      if (!actual.has(item) && !actual.includes?.(item)) {
        throw new Error(`Expected collection to contain ${JSON.stringify(item)}`);
      }
    },
    notToContain(item) {
      if (actual.has?.(item) || actual.includes?.(item)) {
        throw new Error(`Expected collection NOT to contain ${JSON.stringify(item)}`);
      }
    },
  };
}

// ── GRADE DETECTION ──────────────────────────────────────────────────────────
console.log('\nGrade detection:');

test('detects A from 4.0', () => {
  expect(detectGrade('4.0')).toBe('A');
});

test('detects A from 4.00', () => {
  expect(detectGrade('4.00')).toBe('A');
});

test('detects A- from 3.70', () => {
  expect(detectGrade('3.70')).toBe('A-');
});

test('detects B+ from 3.30', () => {
  expect(detectGrade('3.30')).toBe('B+');
});

test('detects B from 3.0', () => {
  expect(detectGrade('3.0')).toBe('B');
});

test('detects F from 0.0', () => {
  expect(detectGrade('0.0')).toBe('F');
});

test('detects F from 0.00', () => {
  expect(detectGrade('0.00')).toBe('F');
});

test('returns empty string for non-numeric input', () => {
  expect(detectGrade('xyz')).toBe('');
});

test('returns empty string for out-of-range value 5.0', () => {
  expect(detectGrade('5.0')).toBe('');
});

test('snaps 3.28 to nearest grade B+ (3.30)', () => {
  expect(detectGrade('3.28')).toBe('B+');
});

test('does not snap value too far from any grade point (e.g. 2.50)', () => {
  // 2.50 is 0.20 from both C+ (2.30) and B- (2.70) — outside 0.20 tolerance
  expect(detectGrade('2.50')).toBe('');
});

// ── SEMESTER GPA ─────────────────────────────────────────────────────────────
console.log('\nSemester GPA calculation:');

test('calculates GPA for a standard semester', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },   // 4.0 × 3 = 12
      { name: 'MAT110', credits: 3, grade: 'B+' },  // 3.3 × 3 = 9.9
      { name: 'ENG101', credits: 3, grade: 'B' },   // 3.0 × 3 = 9.0
    ]
  };
  // (12 + 9.9 + 9.0) / 9 = 30.9 / 9 = 3.4333...
  expect(calcSemGPA(sem)).toBeCloseTo(3.43);
});

test('ignores Pass/Fail courses in GPA calculation', () => {
  const sem = {
    courses: [
      { name: 'MAT092', credits: 0, grade: 'P' },  // P — should be ignored
      { name: 'CSE110', credits: 3, grade: 'A' },  // 4.0 × 3 = 12
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(4.0);
});

test('ignores Incomplete grades', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'CSE111', credits: 3, grade: 'I' },  // Incomplete — ignored
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(4.0);
});

test('counts F(NT) credits in denominator but not in points', () => {
  // F(NT) = No Transfer: credits count against you, 0 grade points
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },    // 4.0 × 3 = 12
      { name: 'CSE111', credits: 3, grade: 'F(NT)' }, // 0 pts, 3 cr
    ]
  };
  // 12 / 6 = 2.0
  expect(calcSemGPA(sem)).toBeCloseTo(2.0);
});

test('returns null for semester with no graded courses', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: '' },
      { name: 'MAT092', credits: 0, grade: 'P' },
    ]
  };
  expect(calcSemGPA(sem)).toBeNull();
});

test('returns null for empty semester', () => {
  const sem = { courses: [] };
  expect(calcSemGPA(sem)).toBeNull();
});

test('handles all-F semester', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'F' },
      { name: 'MAT110', credits: 3, grade: 'F' },
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(0.0);
});

// ── CGPA ACROSS SEMESTERS ────────────────────────────────────────────────────
console.log('\nCGPA calculation:');

test('calculates correct CGPA across two semesters', () => {
  const semesters = [
    {
      id: 1,
      courses: [
        { name: 'CSE110', credits: 3, grade: 'A' },  // 12
        { name: 'MAT110', credits: 3, grade: 'B' },  // 9
      ]
    },
    {
      id: 2,
      courses: [
        { name: 'CSE111', credits: 3, grade: 'A-' }, // 11.1
        { name: 'MAT120', credits: 3, grade: 'B+' }, // 9.9
      ]
    }
  ];
  // (12 + 9 + 11.1 + 9.9) / 12 = 42 / 12 = 3.5
  expect(calcCGPA(semesters)).toBeCloseTo(3.5);
});

test('CGPA caps at 4.0 for all-A performance', () => {
  const semesters = [
    {
      id: 1,
      courses: [
        { name: 'CSE110', credits: 3, grade: 'A' },
        { name: 'MAT110', credits: 3, grade: 'A' },
        { name: 'ENG101', credits: 3, grade: 'A' },
      ]
    }
  ];
  expect(calcCGPA(semesters)).toBeCloseTo(4.0);
});

test('returns null for no graded courses', () => {
  const semesters = [
    { id: 1, courses: [{ name: '', credits: 0, grade: '' }] }
  ];
  expect(calcCGPA(semesters)).toBeNull();
});

// ── RETAKE POLICY — BEST GRADE (Spring 2024 and earlier) ────────────────────
console.log('\nRetake policy — best grade (≤ Spring 2024):');

test('keeps best grade when course is retaken', () => {
  const semesters = [
    {
      id: 1,
      courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'C' }]
    },
    {
      id: 2,
      courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'B+' }]
    }
  ];
  const retakenKeys = getRetakenKeys(semesters, true);
  // C grade (sem 1) should be marked retaken — B+ is better
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

test('keeps better grade even when it appears first chronologically', () => {
  const semesters = [
    {
      id: 1,
      courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'B+' }]
    },
    {
      id: 2,
      courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'C' }]
    }
  ];
  const retakenKeys = getRetakenKeys(semesters, true);
  // C grade (sem 2) should be retaken — B+ is better
  expect(retakenKeys).toContain('2-0');
  expect(retakenKeys).notToContain('1-0');
});

test('no retaken keys for unique courses', () => {
  const semesters = [
    {
      id: 1,
      courses: [
        { name: 'Data Structures (CSE220)', credits: 3, grade: 'B' },
        { name: 'Algorithms (CSE221)',       credits: 3, grade: 'A' },
      ]
    }
  ];
  const retakenKeys = getRetakenKeys(semesters, true);
  expect(retakenKeys.size).toBe(0);
});

// ── RETAKE POLICY — LATEST GRADE (Fall 2024 onwards) ────────────────────────
console.log('\nRetake policy — latest grade (≥ Fall 2024):');

test('keeps latest grade under Fall 2024+ policy', () => {
  const semesters = [
    {
      id: 1,
      courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'B+' }]
    },
    {
      id: 2,
      courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'C' }]
    }
  ];
  const retakenKeys = getRetakenKeys(semesters, false);
  // Latest = sem 2, so sem 1 is retaken regardless of grade
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

test('latest grade policy keeps last even if it is worse', () => {
  const semesters = [
    {
      id: 1,
      courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'A' }]
    },
    {
      id: 2,
      courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'D' }]
    }
  ];
  const retakenKeys = getRetakenKeys(semesters, false);
  // D is the latest — A should be marked retaken
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

// ── GRADE POINT NORMALIZATION ────────────────────────────────────────────────
console.log('\nGrade point shorthand normalization:');

function normalizeGradePoint(raw, mode) {
  const trimmed = raw.trim();
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;
  if (trimmed.includes('.')) return trimmed;
  if (/^[0-4]\d$/.test(trimmed)) return trimmed[0] + '.' + trimmed[1];
  if (mode === 'blur' && /^[0-4]$/.test(trimmed)) return trimmed + '.0';
  return trimmed;
}

test('expands "33" shorthand to "3.3"', () => {
  expect(normalizeGradePoint('33', 'input')).toBe('3.3');
});

test('expands "40" shorthand to "4.0"', () => {
  expect(normalizeGradePoint('40', 'input')).toBe('4.0');
});

test('expands "27" shorthand to "2.7"', () => {
  expect(normalizeGradePoint('27', 'input')).toBe('2.7');
});

test('expands single digit "3" to "3.0" on blur', () => {
  expect(normalizeGradePoint('3', 'blur')).toBe('3.0');
});

test('does NOT expand single digit on input (user still typing)', () => {
  expect(normalizeGradePoint('3', 'input')).toBe('3');
});

test('passes "NT" through untouched', () => {
  expect(normalizeGradePoint('NT', 'input')).toBe('NT');
});

test('passes "3.30" through untouched (already has decimal)', () => {
  expect(normalizeGradePoint('3.30', 'input')).toBe('3.30');
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed ✓');
  process.exit(0);
}