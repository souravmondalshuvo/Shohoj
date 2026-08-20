// tests/calculatorResults.test.js — unit tests for the pure CGPA results model
// (Phase 5D). Verifies the model mirrors recalc() in js/main.js exactly:
// headline label, meter tiers + interpolated figure, standing cutoffs,
// incomplete-semester counting, credit totals and formatting.

import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIVERSITIES } from '../src/core/university.ts';

import { computeCalculatorResults, formatCredits } from '../src/features/calculator/results.ts';

let nextId = 1;

function course(name, grade, credits = 3) {
  return { name, grade, credits, gp: '', pf: false };
}

function semester(courses, { running = false, name = `Sem ${nextId}` } = {}) {
  return { id: nextId++, name, running, summary: false, courses };
}

function summaryBlock(cgpa, credits, attempted = credits) {
  return {
    id: nextId++,
    name: 'Summary',
    running: false,
    summary: true,
    summaryCGPA: cgpa,
    summaryCredits: credits,
    summaryAttempted: attempted,
    courses: [],
  };
}

// BRACU explicitly: every expectation below is a BRACU number, and pinning the
// campus here is what makes this suite a parity guard rather than a test of
// whatever the default happens to be.
function compute(semesters, university = UNIVERSITIES.bracu) {
  return computeCalculatorResults({ semesters, startSeason: '', startYear: '' }, university);
}

// ── Empty / headline ─────────────────────────────────────────────────────────

test('no semesters → null CGPAs, empty meter, no standing', () => {
  const r = compute([]);
  assert.equal(r.cgpa, null);
  assert.equal(r.completedCgpa, null);
  assert.equal(r.headlineLabel, 'Current CGPA');
  assert.equal(r.meterPercent, 0);
  assert.equal(r.meterPercentLabel, '0%');
  assert.deepEqual(r.meterStatus, { kind: 'empty', cgpa: null });
  assert.equal(r.standing, null);
  assert.equal(r.incompleteSemesters, 0);
});

test('completed semester → Current CGPA headline and matching figures', () => {
  const r = compute([semester([course('CSE110', 'A'), course('MAT110', 'B+')])]);
  // A=4.0, B+=3.3 → (4.0*3 + 3.3*3) / 6 = 3.65
  assert.equal(r.cgpa.toFixed(2), '3.65');
  assert.equal(r.completedCgpa.toFixed(2), '3.65');
  assert.equal(r.headlineLabel, 'Current CGPA');
  assert.equal(r.hasRunning, false);
});

test('running semester flips the headline to Projected CGPA', () => {
  const r = compute([
    semester([course('CSE110', 'A')]),
    semester([course('CSE111', 'A')], { running: true }),
  ]);
  assert.equal(r.headlineLabel, 'Projected CGPA');
  assert.equal(r.hasRunning, true);
  // Projected includes the running course; completed excludes it.
  assert.equal(r.cgpa, 4);
  assert.equal(r.completedCgpa, 4);
});

// ── Meter ────────────────────────────────────────────────────────────────────

test('meter percent and label come from the completed CGPA out of 4', () => {
  const r = compute([semester([course('CSE110', 'B')])]); // 3.0
  assert.equal(r.meterPercent, 75);
  assert.equal(r.meterPercentLabel, '75.0%');
});

test('only running courses → projected-only meter status with the projected figure', () => {
  const r = compute([semester([course('CSE110', 'A')], { running: true })]);
  assert.equal(r.completedCgpa, null);
  assert.deepEqual(r.meterStatus, { kind: 'projected-only', cgpa: 4 });
  assert.equal(r.meterPercent, 0);
  assert.equal(r.meterPercentLabel, '0%');
});

test('graded meter tiers follow the recalc() cutoffs', () => {
  // Single-course semesters, so the completed CGPA equals the grade point:
  // A 4.0 ≥ 3.75 · A- 3.7 ≥ 3.5 · B+ 3.3 ≥ 3.0 · B- 2.7 ≥ 2.5 · C+ 2.3 below.
  const byGrade = (grade) => compute([semester([course('CSE110', grade)])]).meterStatus.kind;
  assert.equal(byGrade('A'), 'outstanding');
  assert.equal(byGrade('A-'), 'excellent');
  assert.equal(byGrade('B+'), 'good');
  assert.equal(byGrade('B-'), 'push');
  assert.equal(byGrade('C+'), 'recovery');
});

test('recovery status interpolates the projected CGPA like recalc() does', () => {
  const r = compute([
    semester([course('CSE110', 'D')]), // completed 1.0 → recovery tier
    semester([course('CSE111', 'A')], { running: true }), // lifts projected
  ]);
  assert.equal(r.meterStatus.kind, 'recovery');
  assert.equal(r.meterStatus.cgpa, r.cgpa);
  assert.notEqual(r.meterStatus.cgpa, r.completedCgpa);
});

// ── Standing ─────────────────────────────────────────────────────────────────

test('standing tiers follow the BRACU cutoffs on the completed CGPA', () => {
  // 1 summary credit keeps points/credits division exact (cgpa*1/1), so the
  // boundary values compare exactly against the cutoffs.
  const withSummary = (cgpa) => compute([summaryBlock(cgpa, 1)]).standing;
  assert.equal(withSummary(4.0), 'perfect');
  assert.equal(withSummary(3.97), 'perfect');
  assert.equal(withSummary(3.96), 'higher-distinction');
  assert.equal(withSummary(3.65), 'higher-distinction');
  assert.equal(withSummary(3.64), 'distinction');
  assert.equal(withSummary(3.5), 'distinction');
  assert.equal(withSummary(3.49), 'good');
  assert.equal(withSummary(3.0), 'good');
  assert.equal(withSummary(2.99), 'satisfactory');
  assert.equal(withSummary(2.5), 'satisfactory');
  assert.equal(withSummary(2.49), 'needs-improvement');
  assert.equal(withSummary(2.0), 'needs-improvement');
  assert.equal(withSummary(1.99), 'probation');
});

test('running-only input has no standing (nothing completed)', () => {
  const r = compute([semester([course('CSE110', 'A')], { running: true })]);
  assert.equal(r.standing, null);
});

// ── Incomplete semesters ─────────────────────────────────────────────────────

test('counts completed semesters that have a named course without a grade', () => {
  const r = compute([
    semester([course('CSE110', 'A'), course('MAT110', '')]), // incomplete
    semester([course('CSE111', '')]), // incomplete
    semester([course('', '')]), // blank name — not incomplete
    semester([course('CSE220', '')], { running: true }), // running — exempt
    summaryBlock(3.5, 30), // summary — exempt
  ]);
  assert.equal(r.incompleteSemesters, 2);
});

// ── Credits ──────────────────────────────────────────────────────────────────

test('credit totals include the summary block and skip running attempts', () => {
  const r = compute([
    summaryBlock(3.5, 30, 33),
    semester([course('CSE110', 'A')]),
    semester([course('CSE111', 'A')], { running: true }),
  ]);
  // Attempted: 33 (summary) + 3 (completed course); running never counts.
  assert.equal(r.attemptedCredits, 36);
  // Earned: 30 (summary) + 3 (completed passing course).
  assert.equal(r.earnedCredits, 33);
});

test('formatCredits matches the legacy fmtCr display', () => {
  assert.equal(formatCredits(0), '0');
  assert.equal(formatCredits(36), '36');
  assert.equal(formatCredits(37.5), '37.5');
  assert.equal(formatCredits(1.25), '1.3');
});
