// tests/transcriptImport.test.js — unit tests for the pure transcript-import
// model (#323): the typed port of importTranscriptPDF + applyImport's
// orchestration (blob-fallback rule, catalogue cleanup, state mapping).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  importedCalculatorState,
  parseTranscriptForImport,
} from '../src/features/calculator/transcriptImport.ts';

const CATALOG = {
  CSE110: { full: 'Programming Language I (CSE110)', credits: 3 },
  CSE111: { full: 'Programming Language II (CSE111)', credits: 3 },
  MAT110: { full: 'Mathematics I: Differential Calculus & Co-ordinate Geometry (MAT110)', credits: 3 },
};
const lookup = (code) => CATALOG[code] ?? null;

const LINE_TRANSCRIPT = `
PROGRAM: B.Sc. in Computer Science and Engineering
STUDENT ID: 21101234
NAME: Test Student PROGRAM
SEMESTER: FALL 2022
CSE110 Programming Language I 3.00 A 4.00
MAT110 Differential Calculus 3.00 B+ 3.30
SEMESTER: SPRING 2023
CSE111 Programming Language II 3.00 B 3.00
`;

test('line-parser path: semesters, catalogue cleanup, summary counts', () => {
  const parsed = parseTranscriptForImport(LINE_TRANSCRIPT, lookup);

  assert.equal(parsed.summary.semesterCount, 2);
  assert.equal(parsed.summary.courseCount, 3);
  assert.deepEqual(parsed.summary.gradedPerSemester, [2, 1]);
  assert.equal(parsed.semesters[0].name, 'Fall 2022');
  assert.equal(parsed.semesters[1].name, 'Spring 2023');

  // Catalogue cleanup replaces names with the canonical display form.
  assert.equal(parsed.semesters[0].courses[0].name, 'Programming Language I (CSE110)');
  assert.equal(
    parsed.semesters[0].courses[1].name,
    'Mathematics I: Differential Calculus & Co-ordinate Geometry (MAT110)',
  );
  assert.equal(parsed.semesters[0].courses[0].grade, 'A');
  assert.equal(parsed.semesters[0].courses[0].credits, 3);

  assert.equal(parsed.detectedDept, 'B.Sc. in Computer Science and Engineering (CSE)');
  assert.equal(parsed.identity.studentId, '21101234');
  assert.equal(parsed.identity.studentName, 'Test Student');
});

test('blob fallback engages when the line parser under-delivers', () => {
  // The glued multi-course line defeats the line parser (2 courses across 2
  // semesters → 2 < 2×2); the blob regex finds 4 → the blob result wins.
  const text = `
SEMESTER: FALL 2022
CSE110 Programming Language I 3.00 A 4.00
SEMESTER: SPRING 2023
CSE111 Programming Language II 3.00 B 3.00 MAT110 Differential Calculus 3.00 B+ 3.30 PHY111 Principles of Physics 3.00 A- 3.70
`;
  const parsed = parseTranscriptForImport(text, lookup);
  assert.equal(parsed.summary.semesterCount, 2);
  assert.equal(parsed.summary.courseCount, 4);
  assert.deepEqual(parsed.summary.gradedPerSemester, [1, 3]);
});

test('unknown F(NT) 100+ level codes default to 3 credits', () => {
  const text = `
SEMESTER: FALL 2022
CSE110 Programming Language I 3.00 A 4.00
ZZZ310 F(NT)
`;
  const parsed = parseTranscriptForImport(text, lookup);
  const fnt = parsed.semesters[0].courses.find((c) => c.grade === 'F(NT)');
  assert.ok(fnt);
  assert.equal(fnt.credits, 3); // unknown in catalogue, level 310 ≥ 100
  // Not counted as graded? F(NT) is a grade ≠ P/I with credits > 0 → counted.
  assert.deepEqual(parsed.summary.gradedPerSemester, [2]);
});

test('importedCalculatorState maps ids, dept, start fields and course defaults', () => {
  const state = importedCalculatorState(parseTranscriptForImport(LINE_TRANSCRIPT, lookup));

  assert.deepEqual(state.semesters.map((s) => s.id), [1, 2]);
  assert.equal(state.semesters.every((s) => s.running === false), true);
  assert.equal(state.currentDept, 'CSE');
  assert.equal(state.startSeason, 'Fall'); // CSE calendar offers Fall
  assert.equal(state.startYear, '2022');
  assert.equal(state.semesters[1].courses[0].gradePoint, 3);
});

test('a department whose calendar lacks the first season keeps year only', () => {
  const text = `
PROGRAM: B.Sc. in Pharmacy
SEMESTER: FALL 2022
CSE110 Programming Language I 3.00 A 4.00
`;
  const state = importedCalculatorState(parseTranscriptForImport(text, lookup));
  assert.equal(state.currentDept, 'PHR');
  assert.equal(state.startSeason, ''); // PHR runs Spring/Summer — Fall not offered
  assert.equal(state.startYear, '2022');
});

test('no detected department: dept empty, default calendar gates the season', () => {
  const text = `
SEMESTER: SUMMER 2023
CSE110 Programming Language I 3.00 A 4.00
`;
  const state = importedCalculatorState(parseTranscriptForImport(text, lookup));
  assert.equal(state.currentDept, '');
  assert.equal(state.startSeason, 'Summer');
  assert.equal(state.startYear, '2023');
});

test('an unparseable transcript yields an empty result, not a throw', () => {
  const parsed = parseTranscriptForImport('Random text with no semesters at all', lookup);
  assert.equal(parsed.summary.semesterCount, 0);
  assert.equal(parsed.summary.courseCount, 0);
  const state = importedCalculatorState(parsed);
  assert.deepEqual(state.semesters, []);
  assert.equal(state.startSeason, '');
  assert.equal(state.startYear, '');
});

test('an import always resets the plan (legacy resetPlanner parity, #327)', () => {
  const state = importedCalculatorState(parseTranscriptForImport(LINE_TRANSCRIPT, lookup));
  assert.deepEqual(state.planCourses, []);
});
