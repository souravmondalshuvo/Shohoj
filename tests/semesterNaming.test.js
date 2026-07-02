// tests/semesterNaming.test.js — unit tests for the pure semester-naming
// logic behind the shell's add-semester / running-semester actions. Verifies
// parity with addSemester / addRunningSemester / generateNextSemesterName in
// js/ui/render.js across every branch: start-driven ordinal names, empty-start
// fallbacks, the summary-continuation branch, year wrapping, the (Running)
// suffix, and the single source of the current real-world semester (injected
// clock, never Date.now()).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextCompletedSemesterName,
  nextRunningSemesterName,
} from '../src/features/calculator/semesterNaming.ts';

let nextId = 1;

function semester(name, { running = false, summary = false } = {}) {
  return { id: nextId++, name, running, summary, courses: [] };
}

function inputs(semesters, startSeason = '', startYear = '') {
  return { semesters, startSeason, startYear };
}

// A fixed clock: 2026-07-02 → month 7 → Summer 2026.
const NOW = new Date(2026, 6, 2);

// ── Completed semesters, start known ─────────────────────────────────────────

test('first semester takes the start season/year with a 1st ordinal', () => {
  const name = nextCompletedSemesterName(inputs([], 'Spring', '2025'), NOW);
  assert.equal(name, 'Spring 2025 (1st Semester)');
});

test('subsequent semesters advance the calendar and wrap the year', () => {
  const sems = [
    semester('Spring 2025 (1st Semester)'),
    semester('Summer 2025 (2nd Semester)'),
    semester('Fall 2025 (3rd Semester)'),
  ];
  const name = nextCompletedSemesterName(inputs(sems, 'Spring', '2025'), NOW);
  assert.equal(name, 'Spring 2026 (4th Semester)');
});

test('running semesters do not consume a completed slot', () => {
  const sems = [
    semester('Spring 2025 (1st Semester)'),
    semester('Current Semester (Running)', { running: true }),
  ];
  const name = nextCompletedSemesterName(inputs(sems, 'Spring', '2025'), NOW);
  assert.equal(name, 'Summer 2025 (2nd Semester)');
});

// ── Completed semesters, no start set (shell fallback) ───────────────────────

test('without a start semester the name falls back to Semester N', () => {
  assert.equal(nextCompletedSemesterName(inputs([]), NOW), 'Semester 1');
  const sems = [semester('Semester 1'), semester('Semester 2')];
  assert.equal(nextCompletedSemesterName(inputs(sems), NOW), 'Semester 3');
});

// ── Summary-continuation branch ───────────────────────────────────────────────

test('with only a summary block the next name is the current real-world semester', () => {
  const sems = [semester('Summary', { summary: true })];
  // No start → no ordinal; clock says Summer 2026.
  assert.equal(nextCompletedSemesterName(inputs(sems), NOW), 'Summer 2026');
});

test('after a summary block, continuation steps past the last named semester', () => {
  const sems = [
    semester('Summary', { summary: true }),
    semester('Fall 2026 (7th Semester)'),
  ];
  // Start known → ordinal computed along the default calendar.
  const name = nextCompletedSemesterName(inputs(sems, 'Spring', '2024'), NOW);
  assert.equal(name, 'Spring 2027 (10th Semester)');
});

test('summary continuation with an unparseable last name uses the clock', () => {
  const sems = [
    semester('Summary', { summary: true }),
    semester('My weird semester'),
  ];
  assert.equal(nextCompletedSemesterName(inputs(sems), NOW), 'Summer 2026');
});

// ── Running semester names ────────────────────────────────────────────────────

test('running name steps past the last completed semester, no ordinal', () => {
  const sems = [semester('Fall 2025 (3rd Semester)')];
  const name = nextRunningSemesterName(inputs(sems, 'Spring', '2025'), NOW);
  assert.equal(name, 'Spring 2026 (Running)');
});

test('running name with no completed semesters is Current Semester', () => {
  assert.equal(nextRunningSemesterName(inputs([]), NOW), 'Current Semester (Running)');
});

test('running name with an unparseable last name is Current Semester', () => {
  const sems = [semester('Semester 1')];
  assert.equal(nextRunningSemesterName(inputs(sems), NOW), 'Current Semester (Running)');
});

test('running name after a summary block keeps the ordinal form', () => {
  const sems = [semester('Summary', { summary: true })];
  const name = nextRunningSemesterName(inputs(sems, 'Spring', '2026'), NOW);
  // Clock: Summer 2026; start Spring 2026 → Summer 2026 is the 2nd semester.
  assert.equal(name, 'Summer 2026 (2nd Semester) (Running)');
});
