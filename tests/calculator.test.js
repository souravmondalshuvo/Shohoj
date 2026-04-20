/**
 * tests/calculator.test.js
 * Tests for Shohoj's GPA/CGPA calculation engine.
 * Imports directly from source modules so tests track implementation drift.
 */

import { GRADES, detectGrade } from '../js/core/grades.js';
import {
  calcSemGPA,
  isRepeatEligible,
  getImprovementStrategy,
  getRetakenKeys,
  normalizeGradePoint,
} from '../js/core/calculator.js';

// CGPA across semesters — not exported from source (test-only helper).
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
      if (!actual.has?.(item) && !actual.includes?.(item)) {
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
  expect(detectGrade('2.50')).toBe('');
});

// ── SEMESTER GPA ─────────────────────────────────────────────────────────────
console.log('\nSemester GPA calculation:');

test('calculates GPA for a standard semester', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'MAT110', credits: 3, grade: 'B+' },
      { name: 'ENG101', credits: 3, grade: 'B' },
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(3.43);
});

test('ignores Pass/Fail courses in GPA calculation', () => {
  const sem = {
    courses: [
      { name: 'MAT092', credits: 0, grade: 'P' },
      { name: 'CSE110', credits: 3, grade: 'A' },
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(4.0);
});

test('ignores Incomplete grades', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'CSE111', credits: 3, grade: 'I' },
    ]
  };
  expect(calcSemGPA(sem)).toBeCloseTo(4.0);
});

test('counts F(NT) credits in denominator but not in points', () => {
  const sem = {
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'CSE111', credits: 3, grade: 'F(NT)' },
    ]
  };
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
    { id: 1, courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'MAT110', credits: 3, grade: 'B' },
    ]},
    { id: 2, courses: [
      { name: 'CSE111', credits: 3, grade: 'A-' },
      { name: 'MAT120', credits: 3, grade: 'B+' },
    ]}
  ];
  expect(calcCGPA(semesters)).toBeCloseTo(3.5);
});

test('CGPA caps at 4.0 for all-A performance', () => {
  const semesters = [
    { id: 1, courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'MAT110', credits: 3, grade: 'A' },
      { name: 'ENG101', credits: 3, grade: 'A' },
    ]}
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
    { id: 1, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'C' }] },
    { id: 2, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'B+' }] }
  ];
  const retakenKeys = getRetakenKeys(semesters, { bestGrade: true });
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

test('keeps better grade even when it appears first chronologically', () => {
  const semesters = [
    { id: 1, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'B+' }] },
    { id: 2, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'C' }] }
  ];
  const retakenKeys = getRetakenKeys(semesters, { bestGrade: true });
  expect(retakenKeys).toContain('2-0');
  expect(retakenKeys).notToContain('1-0');
});

test('no retaken keys for unique courses', () => {
  const semesters = [
    { id: 1, courses: [
      { name: 'Data Structures (CSE220)', credits: 3, grade: 'B' },
      { name: 'Algorithms (CSE221)',       credits: 3, grade: 'A' },
    ]}
  ];
  const retakenKeys = getRetakenKeys(semesters, { bestGrade: true });
  expect(retakenKeys.size).toBe(0);
});

// ── RETAKE POLICY — LATEST GRADE (Fall 2024 onwards) ────────────────────────
console.log('\nRetake policy — latest grade (≥ Fall 2024):');

test('keeps latest grade under Fall 2024+ policy', () => {
  const semesters = [
    { id: 1, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'B+' }] },
    { id: 2, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'C' }] }
  ];
  const retakenKeys = getRetakenKeys(semesters, { bestGrade: false });
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

test('latest grade policy keeps last even if it is worse', () => {
  const semesters = [
    { id: 1, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'A' }] },
    { id: 2, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'D' }] }
  ];
  const retakenKeys = getRetakenKeys(semesters, { bestGrade: false });
  expect(retakenKeys).toContain('1-0');
  expect(retakenKeys).notToContain('2-0');
});

// ── REPEAT POLICY ────────────────────────────────────────────────────────────
console.log('\nRepeat policy — eligibility:');

test('B- is eligible for repeat', () => {
  expect(isRepeatEligible('B-')).toBeTrue();
});

test('C+ is eligible for repeat', () => {
  expect(isRepeatEligible('C+')).toBeTrue();
});

test('C is eligible for repeat', () => {
  expect(isRepeatEligible('C')).toBeTrue();
});

test('C- is eligible for repeat', () => {
  expect(isRepeatEligible('C-')).toBeTrue();
});

test('D+ is eligible for repeat', () => {
  expect(isRepeatEligible('D+')).toBeTrue();
});

test('D is eligible for repeat', () => {
  expect(isRepeatEligible('D')).toBeTrue();
});

test('D- is eligible for repeat', () => {
  expect(isRepeatEligible('D-')).toBeTrue();
});

test('B is NOT eligible for repeat (threshold is below B)', () => {
  expect(isRepeatEligible('B')).toBeFalse();
});

test('B+ is NOT eligible for repeat', () => {
  expect(isRepeatEligible('B+')).toBeFalse();
});

test('A is NOT eligible for repeat', () => {
  expect(isRepeatEligible('A')).toBeFalse();
});

test('F is NOT eligible for repeat — requires Retake instead', () => {
  expect(isRepeatEligible('F')).toBeFalse();
});

test('F(NT) is NOT eligible for repeat — requires Retake instead', () => {
  expect(isRepeatEligible('F(NT)')).toBeFalse();
});

test('P (Pass) is not eligible for repeat', () => {
  expect(isRepeatEligible('P')).toBeFalse();
});

test('I (Incomplete) is not eligible for repeat', () => {
  expect(isRepeatEligible('I')).toBeFalse();
});

test('empty string is not eligible for repeat', () => {
  expect(isRepeatEligible('')).toBeFalse();
});

// ── IMPROVEMENT STRATEGY ─────────────────────────────────────────────────────
console.log('\nImprovement strategy routing:');

test('F grade routes to retake strategy', () => {
  expect(getImprovementStrategy('F')).toBe('retake');
});

test('F(NT) grade routes to retake strategy', () => {
  expect(getImprovementStrategy('F(NT)')).toBe('retake');
});

test('B- grade routes to repeat strategy', () => {
  expect(getImprovementStrategy('B-')).toBe('repeat');
});

test('C grade routes to repeat strategy', () => {
  expect(getImprovementStrategy('C')).toBe('repeat');
});

test('D grade routes to repeat strategy', () => {
  expect(getImprovementStrategy('D')).toBe('repeat');
});

test('B grade returns null — no improvement mechanism', () => {
  expect(getImprovementStrategy('B')).toBeNull();
});

test('A grade returns null — no improvement mechanism', () => {
  expect(getImprovementStrategy('A')).toBeNull();
});

// ── GRADE POINT NORMALIZATION ────────────────────────────────────────────────
console.log('\nGrade point shorthand normalization:');

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
