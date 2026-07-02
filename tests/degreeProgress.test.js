// tests/degreeProgress.test.js — unit tests for the pure degree-progress
// model (#315). Parity target: renderDegreeTracker +
// estimateSummaryCompletedSemesters in js/ui/tracker.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDegreeProgress } from '../src/features/calculator/degreeProgress.ts';

const CSE = {
  code: 'CSE',
  label: 'B.Sc. in CSE',
  totalCredits: 136,
  seasons: ['Spring', 'Summer', 'Fall'],
};

// Fixed clock: 2026-07-02 → Summer 2026 (last completed: Spring 2026).
const NOW = new Date(2026, 6, 2);

let nextId = 1;

function semester(name, grades, opts = {}) {
  return {
    id: nextId++,
    name,
    running: opts.running ?? false,
    summary: opts.summary ?? false,
    summaryCGPA: opts.summaryCGPA,
    summaryCredits: opts.summaryCredits,
    courses: grades.map((grade, i) => ({ name: `Course ${i} (CSE11${i})`, grade, credits: 3 })),
  };
}

function inputs(semesters, startSeason = 'Spring', startYear = '2025') {
  return { semesters, startSeason, startYear };
}

// ── Visibility ───────────────────────────────────────────────────────────────

test('hidden without a department (no totalCredits)', () => {
  const r = computeDegreeProgress(inputs([semester('Spring 2025', ['A'])]), null, 3, NOW);
  assert.equal(r, null);
});

test('hidden with neither graded semesters nor a summary block', () => {
  assert.equal(computeDegreeProgress(inputs([]), CSE, 0, NOW), null);
  const ungraded = semester('Spring 2025', ['']);
  assert.equal(computeDegreeProgress(inputs([ungraded]), CSE, 0, NOW), null);
});

// ── Core stats ───────────────────────────────────────────────────────────────

test('stats mirror the tracker formulas', () => {
  const sems = [
    semester('Spring 2025 (1st Semester)', ['A', 'A', 'A', 'A']), // 12 cr
    semester('Summer 2025 (2nd Semester)', ['B', 'B', 'B', 'B']), // 12 cr
  ];
  const r = computeDegreeProgress(inputs(sems), CSE, 24, NOW);
  assert.equal(r.totalRequired, 136);
  assert.equal(r.creditsRemaining, 112);
  assert.equal(r.totalCompletedCount, 2);
  assert.equal(r.avgCredits, 12);
  assert.equal(r.semsRemaining, Math.ceil(112 / 12)); // 10
  // Ordinal suffix dropped in node labels.
  assert.deepEqual(r.semesters.map(s => s.label), ['Spring 2025', 'Summer 2025']);
  assert.equal(r.semesters[0].gpa, 4);
  assert.equal(r.semesters[0].credits, 12);
  assert.equal(r.semesters[0].courseCount, 4);
  // Grad estimate: 12 sems total from Spring 2025 → Fall '28 (walk 11 steps).
  assert.equal(r.gradEstimate, "Fall '28");
  assert.equal(r.graduation.complete, false);
});

test('running semesters count all credited named courses and are flagged', () => {
  const sems = [
    semester('Spring 2025', ['A']),
    semester('Summer 2025 (Running)', ['', ''], { running: true }),
  ];
  const r = computeDegreeProgress(inputs(sems), CSE, 3, NOW);
  const running = r.semesters.find(s => s.running);
  assert.equal(running.credits, 6); // ungraded but named + credited
  assert.equal(r.totalCompletedCount, 1); // running not counted
});

// ── Summary-block estimation ─────────────────────────────────────────────────

test('summary block estimates elapsed semesters from start to the clock', () => {
  const sems = [semester('Summary', [], { summary: true, summaryCGPA: 3.5, summaryCredits: 60 })];
  // Start Spring 2025; last completed before Summer 2026 is Spring 2026 →
  // Spring'25..Spring'26 inclusive = 4 semesters, none entered explicitly.
  const r = computeDegreeProgress(inputs(sems), CSE, 60, NOW);
  assert.equal(r.totalCompletedCount, 4);
  assert.equal(r.avgCredits, 15); // 60 / 4
  assert.deepEqual(r.summaryNode, { cgpa: 3.5, credits: 60 });
});

// ── Projected nodes ──────────────────────────────────────────────────────────

test('projected labels continue the last semester and cap at 4 + more-count', () => {
  const sems = [
    semester('Spring 2025 (1st Semester)', ['A', 'A', 'A', 'A']),
    semester('Summer 2025 (2nd Semester)', ['B', 'B', 'B', 'B']),
  ];
  const r = computeDegreeProgress(inputs(sems), CSE, 24, NOW); // 10 remaining
  assert.deepEqual(r.projectedLabels, ["Fall '25", "Spring '26", "Summer '26", "Fall '26"]);
  assert.equal(r.projectedMore, 6);
});

test('graduation completes when no credits remain', () => {
  const sems = [semester('Spring 2025', ['A'])];
  const r = computeDegreeProgress(inputs(sems), CSE, 136, NOW);
  assert.equal(r.creditsRemaining, 0);
  assert.equal(r.semsRemaining, 0);
  assert.deepEqual(r.projectedLabels, []);
  assert.equal(r.graduation.complete, true);
  assert.equal(r.progressPct, 100);
});

test('no start semester → Semester-N projected labels and a dash estimate', () => {
  const sems = [semester(undefined, ['A'])]; // unnamed → label "Semester"
  const r = computeDegreeProgress(inputs(sems, '', ''), CSE, 3, NOW);
  assert.equal(r.gradEstimate, '—');
  assert.equal(r.projectedLabels.length, 4);
  assert.ok(r.projectedLabels[0].startsWith('Semester '));
});
