// tests/withdrawnGrade.test.js — a withdrawn (W) course must be excluded from
// CGPA, counted as attempted-not-earned, and must never supersede a real grade
// under either retake policy. Part of #499.
//
// Before W existed in GRADES, `gradePointFor('W')` returned undefined and the
// course was dropped one line above the attemptedCredits accumulator in
// src/core/gpa.ts — silently, with no badge and no note.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GRADES } from '../src/core/grades.ts';
import { calculateCgpaTotals, calcSemesterGpa, getRetakenKeys } from '../src/core/gpa.ts';
import { computeDegreeProgress } from '../src/features/calculator/degreeProgress.ts';

import { GRADES as LEGACY_GRADES } from '../js/core/grades.js';
import { getRetakenKeys as legacyGetRetakenKeys } from '../js/core/gpa-core.js';

const CSE = {
  code: 'CSE',
  label: 'B.Sc. in CSE',
  totalCredits: 136,
  seasons: ['Spring', 'Summer', 'Fall'],
};
const NOW = new Date(2026, 6, 2);

let nextId = 1;

function semester(name, courses, opts = {}) {
  return {
    id: nextId++,
    name,
    running: opts.running ?? false,
    summary: opts.summary ?? false,
    courses,
  };
}

function course(name, grade, credits = 3) {
  return { name, grade, credits };
}

// ── The grade table ──────────────────────────────────────────────────────────

test('W carries no grade point', () => {
  assert.equal(GRADES.W, null);
});

// ── CGPA, attempted, earned ──────────────────────────────────────────────────

test('W leaves CGPA untouched but still consumes attempted credits', () => {
  const withoutW = [semester('Fall 2025', [course('Algorithms (CSE221)', 'A')])];
  const withW = [
    semester('Fall 2025', [
      course('Algorithms (CSE221)', 'A'),
      course('Physics I (PHY111)', 'W', 4),
    ]),
  ];

  const a = calculateCgpaTotals(withoutW, {});
  const b = calculateCgpaTotals(withW, {});

  assert.equal(a.cgpa, b.cgpa, 'CGPA must not move');
  assert.equal(a.cgpaCredits, b.cgpaCredits, 'W must not enter the CGPA denominator');
  assert.equal(a.earnedCredits, b.earnedCredits, 'W earns nothing');
  assert.equal(
    b.attemptedCredits - a.attemptedCredits,
    4,
    'W must count toward attempted credits — this is the regression',
  );
});

test('a semester of nothing but W has no GPA', () => {
  const sem = semester('Summer 2025', [course('Physics I (PHY111)', 'W')]);
  assert.equal(calcSemesterGpa(sem), null);
});

test('W does not drag semester GPA toward zero', () => {
  const sem = semester('Fall 2025', [
    course('Algorithms (CSE221)', 'A'),
    course('Physics I (PHY111)', 'W'),
  ]);
  assert.equal(calcSemesterGpa(sem), 4.0);
});

// ── Supersession ─────────────────────────────────────────────────────────────

test('withdrawing from a retake leaves the earlier grade standing (latest-attempt policy)', () => {
  const semesters = [
    semester('Fall 2025', [course('Data Structures (CSE220)', 'C')]),
    semester('Spring 2026', [course('Data Structures (CSE220)', 'W')]),
  ];

  const retaken = getRetakenKeys(semesters, { bestGrade: false });
  assert.equal(retaken.size, 0, 'a W must not supersede a real grade');

  const totals = calculateCgpaTotals(semesters, { bestGrade: false });
  assert.equal(totals.cgpa, 2.0, 'the C still counts');
  assert.equal(totals.cgpaCredits, 3);
});

test('withdrawing from a retake leaves the earlier grade standing (best-grade policy)', () => {
  const semesters = [
    semester('Fall 2023', [course('Data Structures (CSE220)', 'C')]),
    semester('Spring 2024', [course('Data Structures (CSE220)', 'W')]),
  ];

  const totals = calculateCgpaTotals(semesters, { bestGrade: true });
  assert.equal(totals.cgpa, 2.0);
});

test('a real retake after a withdrawal still supersedes the original grade', () => {
  const semesters = [
    semester('Fall 2025', [course('Data Structures (CSE220)', 'D')]),
    semester('Spring 2026', [course('Data Structures (CSE220)', 'W')]),
    semester('Summer 2026', [course('Data Structures (CSE220)', 'A')]),
  ];

  const totals = calculateCgpaTotals(semesters, { bestGrade: false });
  assert.equal(totals.cgpa, 4.0, 'the W must not break the D → A supersession chain');
  assert.equal(totals.cgpaCredits, 3);
});

// ── Regression guards on the grades that share the null grade point ──────────

test('P is still excluded from attempted credits', () => {
  const withoutP = [semester('Fall 2025', [course('Algorithms (CSE221)', 'A')])];
  const withP = [
    semester('Fall 2025', [course('Algorithms (CSE221)', 'A'), course('Seminar (CSE400)', 'P')]),
  ];

  assert.equal(
    calculateCgpaTotals(withP, {}).attemptedCredits,
    calculateCgpaTotals(withoutP, {}).attemptedCredits,
    'W changing behaviour must not have changed P',
  );
});

test('I is still excluded from attempted credits', () => {
  const withoutI = [semester('Fall 2025', [course('Algorithms (CSE221)', 'A')])];
  const withI = [
    semester('Fall 2025', [course('Algorithms (CSE221)', 'A'), course('Thesis (CSE499)', 'I')]),
  ];

  assert.equal(
    calculateCgpaTotals(withI, {}).attemptedCredits,
    calculateCgpaTotals(withoutI, {}).attemptedCredits,
  );
});

// ── Degree progress ──────────────────────────────────────────────────────────

test('a record of nothing but withdrawals is not a graded record', () => {
  // Adding W to GRADES made `GRADES[grade] !== undefined` true for it, which
  // would otherwise have promoted a withdrawal into the graded-semester gate
  // and rendered a whole degree tracker off a student who has completed nothing.
  const progress = computeDegreeProgress(
    {
      semesters: [semester('Spring 2026', [course('Physics I (PHY111)', 'W')])],
      startSeason: 'Spring',
      startYear: '2026',
    },
    CSE,
    0,
    NOW,
  );

  assert.equal(progress, null);
});

test('a withdrawal earns no credits toward the degree', () => {
  const progress = computeDegreeProgress(
    {
      semesters: [
        semester('Fall 2025', [
          course('Algorithms (CSE221)', 'A'),
          course('Physics I (PHY111)', 'W', 4),
        ]),
      ],
      startSeason: 'Fall',
      startYear: '2025',
    },
    CSE,
    3,
    NOW,
  );

  assert.equal(progress.semesters[0].credits, 3, 'only the A counts');
});

// NOTE: how a withdrawn-only semester should affect the *credit pace* (and so
// the graduation estimate) is deliberately not pinned here — that computation
// is what #503 replaces with a range, and pinning today's flat-average
// behaviour would only make that change harder.

// ── Twin parity (#484) ───────────────────────────────────────────────────────
// This change lands in both src/core and its generated js/ twin, and nothing
// yet enforces that the two agree. Pin the behaviour that would silently drift.

test('the js/ twin carries the same W grade point', () => {
  assert.equal(LEGACY_GRADES.W, GRADES.W);
});

test('the js/ twin agrees on withdrawal supersession', () => {
  const semesters = [
    semester('Fall 2025', [course('Data Structures (CSE220)', 'C')]),
    semester('Spring 2026', [course('Data Structures (CSE220)', 'W')]),
    semester('Summer 2026', [course('Data Structures (CSE220)', 'A')]),
  ];

  for (const bestGrade of [true, false]) {
    assert.deepEqual(
      [...legacyGetRetakenKeys(semesters, { bestGrade })].sort(),
      [...getRetakenKeys(semesters, { bestGrade })].sort(),
      `twins disagree under bestGrade=${bestGrade}`,
    );
  }
});
