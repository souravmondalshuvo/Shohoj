// tests/pdfReport.test.js — unit tests for the pure PDF report model (#325),
// the typed mirror of exportPDF's pre-draw computations (js/ui/modals.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPdfReport } from '../src/features/calculator/pdfReport.ts';

const NOW = new Date(2026, 6, 3, 19, 45); // Jul 3 2026, 7:45 PM

const course = (name, credits, grade, extra = {}) => ({ name, credits, grade, ...extra });

function state(overrides = {}) {
  return {
    semesters: [
      {
        id: 1,
        name: 'Fall 2024 (1st Semester)',
        running: false,
        courses: [
          course('Programming Language I (CSE110)', 3, 'A'),
          course('Fundamentals of English (ENG101)', 3, 'B+'),
        ],
      },
      {
        id: 2,
        name: 'Spring 2025',
        running: false,
        courses: [course('Data Structures (CSE220)', 3, 'F')],
      },
    ],
    startSeason: 'Fall',
    startYear: '2024',
    currentDept: 'CSE',
    ...overrides,
  };
}

test('header: dept label, CGPA display and tier, legacy filename + date format', () => {
  const report = buildPdfReport(state(), NOW);
  assert.equal(report.deptLabel, 'B.Sc. in Computer Science and Engineering (CSE)');
  // (4.0×3 + 3.3×3 + 0×3) / 9 = 2.43
  assert.equal(report.cgpaDisplay, '2.43');
  assert.equal(report.cgpaTier, 'red');
  assert.equal(report.filename, 'BRACU_CGPA_Report_Shohoj.pdf');
  // \s tolerates both a plain space and ICU's narrow no-break space before PM.
  assert.match(report.dateDisplay, /^03 Jul 2026, 7:45\sPM$/);
});

test('no department falls back to the university label', () => {
  const report = buildPdfReport(state({ currentDept: '' }), NOW);
  assert.equal(report.deptLabel, 'BRAC University');
});

test('stats: retake-aware totals, semester count, standing string + tier', () => {
  const report = buildPdfReport(state(), NOW);
  assert.equal(report.stats.attempted, '9');
  assert.equal(report.stats.earned, '6'); // the F earns nothing
  assert.equal(report.stats.semesters, '2');
  assert.equal(report.stats.standing, 'Needs Improvement');
  assert.equal(report.stats.standingTier, 'low');
});

test('standing strings hit the legacy cutoffs', () => {
  const forCgpa = (grade, gradePoint) =>
    buildPdfReport(
      state({
        semesters: [
          { id: 1, name: 'Fall 2024', running: false, courses: [course('X (CSE110)', 3, grade, { gradePoint })] },
        ],
      }),
      NOW,
    ).stats.standing;
  assert.equal(forCgpa('A', 4.0), 'Perfect');
  assert.equal(forCgpa('A-', 3.7), 'Higher Distinction');
  assert.equal(forCgpa('B+', 3.3), 'Good Standing');
  assert.equal(forCgpa('C+', 2.3), 'Needs Improvement');
  assert.equal(forCgpa('F', 0), 'Probation');
  // No graded data at all → '---'.
  const empty = buildPdfReport(state({ semesters: [] }), NOW);
  assert.equal(empty.stats.standing, '---');
  assert.equal(empty.cgpaDisplay, null);
});

test('a summary block adds its card and the estimated semesters', () => {
  const withSummary = state({
    semesters: [
      {
        id: 0,
        name: 'Past Semesters',
        summary: true,
        summaryCGPA: 3.5,
        summaryCredits: 30,
        summaryAttempted: 33,
        courses: [],
        running: false,
      },
      ...state().semesters,
    ],
    // Start Fall 2024; by Jul 2026 (mid-Summer) the last completed semester is
    // Spring 2026: Fall24, Spring25, Summer25, Fall25, Spring26 = 5 → +5.
  });
  const report = buildPdfReport(withSummary, NOW);
  const summary = report.sections[0];
  assert.equal(summary.kind, 'summary');
  assert.equal(summary.cgpaDisplay, '3.50');
  assert.equal(summary.earnedDisplay, '30');
  assert.equal(summary.attemptedDisplay, '33');
  assert.equal(report.stats.semesters, String(2 + 5));
  // Without the summary block the estimate is not added (exportPDF's gate).
  assert.equal(buildPdfReport(state(), NOW).stats.semesters, '2');
});

test('semester sections: cleaned names, running suffix, GPA pill tiers', () => {
  const s = state({
    semesters: [
      ...state().semesters,
      { id: 3, name: 'Summer 2025 (Running)', running: true, courses: [course('Algorithms (CSE221)', 3, 'A-')] },
    ],
  });
  const report = buildPdfReport(s, NOW);
  const [first, , running] = report.sections;
  assert.equal(first.name, 'Fall 2024 | 1st Semester'); // ordinal piped
  assert.equal(first.gpaDisplay, '3.65');
  assert.equal(first.gpaTier, 'good');
  assert.equal(running.name, 'Summer 2025 (Running) [Running]');
  assert.equal(report.sections[1].gpaTier, 'low'); // the all-F semester
});

test('rows: GP display, notes, retaken italics flag, truncation, blanks skipped', () => {
  const s = state({
    semesters: [
      {
        id: 1,
        name: 'Fall 2024',
        running: false,
        courses: [
          course('Data Structures (CSE220)', 3, 'F'), // superseded by the retake below
          course('X'.repeat(80) + ' (CSE999)', 3, 'B'),
          course('Thesis (CSE400)', 0, ''), // no name trim? named but ungraded → kept
          course('', 0, ''), // fully blank → skipped
          course('Transfer (CSE101)', 3, 'F(NT)'),
          course('Lab (CSE110L)', 1, 'P'),
        ],
      },
      { id: 2, name: 'Spring 2025', running: false, courses: [course('Data Structures (CSE220)', 3, 'A')] },
    ],
  });
  const report = buildPdfReport(s, NOW);
  const rows = report.sections[0].rows;
  assert.equal(rows.length, 5); // the blank row is gone

  const retakenRow = rows[0];
  assert.equal(retakenRow.retaken, true);
  assert.equal(retakenRow.note, 'Retaken');
  assert.equal(retakenRow.gpDisplay, '0.00');

  assert.equal(rows[1].name.length, 68);
  assert.ok(rows[1].name.endsWith('...'));

  assert.equal(rows[2].gpDisplay, '--'); // ungraded
  assert.equal(rows[2].note, '');

  assert.equal(rows[3].note, 'No Transfer');
  assert.equal(rows[3].gpDisplay, '0.00'); // the F(NT) special case

  assert.equal(rows[4].note, 'Pass');
});

test('the per-semester footer excludes P/I from attempted and F from earned', () => {
  const s = state({
    semesters: [
      {
        id: 1,
        name: 'Fall 2024',
        running: false,
        courses: [
          course('A (CSE110)', 3, 'A'),
          course('B (CSE111)', 3, 'F'),
          course('Lab (CSE110L)', 1, 'P'),
        ],
      },
    ],
  });
  const report = buildPdfReport(s, NOW);
  assert.equal(
    report.sections[0].footer,
    'Credits Attempted: 6   ·   Credits Earned: 3   ·   Semester GPA: 2.00',
  );
});
