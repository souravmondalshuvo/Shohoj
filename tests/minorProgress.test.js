// tests/minorProgress.test.js — unit tests for the pure minor-progress model
// and the minor table (#731).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMinorProgress,
  collectTakenCourses,
} from '../src/features/calculator/minorProgress.ts';
import {
  MINOR_PROGRAMS,
  getMinorProgram,
  isElectiveCode,
  matchesPattern,
} from '../src/features/calculator/minors.ts';
import { UNIVERSITIES } from '../src/core/university.ts';

const SCALE = UNIVERSITIES.bracu.grades;
const MATH = getMinorProgram('MATH');

let nextId = 1;

/** courses: [name, grade, credits?] */
function semester(courses, opts = {}) {
  return {
    id: nextId++,
    name: opts.name ?? 'Semester',
    running: opts.running ?? false,
    summary: opts.summary ?? false,
    ...(opts.summaryCredits === undefined ? {} : { summaryCredits: opts.summaryCredits }),
    courses: courses.map(([name, grade, credits = 3]) => ({ name, grade, credits })),
  };
}

/** The seven core courses, all passed. */
function allCore(grade = 'A') {
  return semester([
    [`Principles of Mathematics (MAT111)`, grade],
    [`Calculus I (MAT123)`, grade],
    [`Real Analysis I (MAT221)`, grade],
    [`Differential Equations I (MAT222)`, grade],
    [`Numerical Analysis I (MAT223)`, grade],
    [`Abstract Algebra (MAT311)`, grade],
    [`Operations Research I (MAT316)`, grade],
  ]);
}

// ── The table ────────────────────────────────────────────────────────────────

test('the Math minor survives validation with the published totals', () => {
  assert.ok(MATH, 'MATH program is present');
  assert.equal(MATH.totalCredits, 27);
  assert.equal(MATH.core.length, 7);
  assert.equal(
    MATH.core.reduce((s, r) => s + r.credits, 0),
    21,
  );
  assert.equal(MATH.electives.credits, 6);
  assert.ok(MATH.source.length > 0, 'provenance is recorded');
});

test('lookup is case-insensitive and rejects unknown codes', () => {
  assert.equal(getMinorProgram('math')?.code, 'MATH');
  assert.equal(getMinorProgram(' math '), MATH);
  assert.equal(getMinorProgram('PHYSICS'), null);
  assert.equal(getMinorProgram(''), null);
});

test('the table is frozen', () => {
  assert.throws(() => MINOR_PROGRAMS.push({}), TypeError);
});

// ── Elective patterns ────────────────────────────────────────────────────────

test('MAT 3XX/4XX pattern matches only that subject and those levels', () => {
  const pattern = { subject: 'MAT', levels: [3, 4] };
  assert.equal(matchesPattern('MAT312', pattern), true);
  assert.equal(matchesPattern('MAT432', pattern), true);
  assert.equal(matchesPattern('MAT221', pattern), false, '2XX is below the pattern');
  assert.equal(matchesPattern('CSE330', pattern), false, 'wrong subject');
  assert.equal(matchesPattern('not a code', pattern), false);
});

test('the elective pool takes the listed codes and the pattern, nothing else', () => {
  assert.equal(isElectiveCode('STA301', MATH.electives), true);
  assert.equal(isElectiveCode('CSE402', MATH.electives), true);
  assert.equal(isElectiveCode('MAT314', MATH.electives), true, 'MAT 3XX by pattern');
  assert.equal(isElectiveCode('CSE421', MATH.electives), false);
  assert.equal(isElectiveCode('MAT110', MATH.electives), false);
});

test('CSE490 counts under either spelling, but other special topics do not', () => {
  assert.equal(isElectiveCode('CSE490', MATH.electives), true);
  assert.equal(isElectiveCode('CSE490C', MATH.electives), true, 'Quantum Computing');
  assert.equal(isElectiveCode('CSE490B', MATH.electives), false, 'Cybersecurity is not listed');
});

// ── Collecting courses ───────────────────────────────────────────────────────

test('only coded, passing courses are collected from completed semesters', () => {
  const taken = collectTakenCourses(
    [
      semester([
        ['Principles of Mathematics (MAT111)', 'A'],
        ['Calculus I (MAT123)', 'F'],
        ['Real Analysis I (MAT221)', 'P'],
        ['Differential Equations I (MAT222)', 'F(NT)'],
        ['Abstract Algebra (MAT311)', 'I'],
        ['some untitled thing', 'A'],
        ['', 'A'],
      ]),
    ],
    SCALE,
  );
  assert.deepEqual(
    taken.map((c) => c.code),
    ['MAT111'],
  );
});

test('running-semester courses are collected ungraded', () => {
  const taken = collectTakenCourses([semester([['Calculus I (MAT123)', '']], { running: true })], SCALE);
  assert.equal(taken.length, 1);
  assert.equal(taken[0].running, true);
});

test('summary blocks contribute nothing — they name no courses', () => {
  const taken = collectTakenCourses(
    [semester([['Principles of Mathematics (MAT111)', 'A']], { summary: true, summaryCredits: 60 })],
    SCALE,
  );
  assert.deepEqual(taken, []);
});

// ── Core requirements ────────────────────────────────────────────────────────

test('no program selected means no progress to report', () => {
  assert.equal(computeMinorProgress([allCore()], null, SCALE), null);
});

test('an empty record leaves every requirement unmet', () => {
  const progress = computeMinorProgress([], MATH, SCALE);
  assert.equal(progress.coreEarned, 0);
  assert.equal(progress.creditsEarned, 0);
  assert.equal(progress.creditsRemaining, 27);
  assert.equal(progress.progressPct, 0);
  assert.ok(progress.core.every((r) => r.status === 'unmet' && r.match === null));
});

test('all seven core courses earn 21 of the 27 credits', () => {
  const progress = computeMinorProgress([allCore()], MATH, SCALE);
  assert.equal(progress.coreEarned, 7);
  assert.equal(progress.creditsEarned, 21);
  assert.equal(progress.creditsRemaining, 6);
  assert.equal(progress.complete, false);
});

test('a requirement names the course and grade that satisfied it', () => {
  const progress = computeMinorProgress([allCore('B+')], MATH, SCALE);
  const analysis = progress.core.find((r) => r.requirement.id === 'mat221');
  assert.equal(analysis.status, 'earned');
  assert.equal(analysis.match.code, 'MAT221');
  assert.equal(analysis.match.grade, 'B+');
});

test('CSE 330 discharges the MAT 223 requirement (the published alternative)', () => {
  const progress = computeMinorProgress(
    [semester([['Numerical Methods (CSE330)', 'A-']])],
    MATH,
    SCALE,
  );
  const numerical = progress.core.find((r) => r.requirement.id === 'mat223');
  assert.equal(numerical.status, 'earned');
  assert.equal(numerical.match.code, 'CSE330');
  assert.equal(progress.creditsEarned, 3);
});

test('a running core course is in progress, not earned', () => {
  const progress = computeMinorProgress(
    [semester([['Calculus I (MAT123)', '']], { running: true })],
    MATH,
    SCALE,
  );
  const calc = progress.core.find((r) => r.requirement.id === 'mat123');
  assert.equal(calc.status, 'in-progress');
  assert.equal(progress.creditsEarned, 0);
  assert.equal(progress.creditsInProgress, 3);
});

test('a passed course outranks a retake in progress', () => {
  const progress = computeMinorProgress(
    [
      semester([['Calculus I (MAT123)', 'C']]),
      semester([['Calculus I (MAT123)', '']], { running: true }),
    ],
    MATH,
    SCALE,
  );
  const calc = progress.core.find((r) => r.requirement.id === 'mat123');
  assert.equal(calc.status, 'earned');
  assert.equal(calc.match.grade, 'C');
});

test('a failed core course leaves the requirement unmet', () => {
  const progress = computeMinorProgress([semester([['Calculus I (MAT123)', 'F']])], MATH, SCALE);
  assert.equal(progress.core.find((r) => r.requirement.id === 'mat123').status, 'unmet');
});

test('the requirement credit is what counts, not the course credit', () => {
  const progress = computeMinorProgress(
    [semester([['Principles of Mathematics (MAT111)', 'A', 4]])],
    MATH,
    SCALE,
  );
  assert.equal(progress.creditsEarned, 3, 'a 4-credit course still advances a 3-credit slot by 3');
});

// ── Electives ────────────────────────────────────────────────────────────────

test('two listed electives fill the six-credit pool and complete the minor', () => {
  const progress = computeMinorProgress(
    [
      allCore(),
      semester([
        ['Modern Probability Theory (STA301)', 'A'],
        ['Optimization (CSE402)', 'B'],
      ]),
    ],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsEarned, 6);
  assert.equal(progress.creditsEarned, 27);
  assert.equal(progress.creditsRemaining, 0);
  assert.equal(progress.progressPct, 100);
  assert.equal(progress.complete, true);
});

test('a core course is never also counted as an elective', () => {
  // MAT311 and MAT316 are core AND match the MAT 3XX elective pattern.
  const progress = computeMinorProgress([allCore()], MATH, SCALE);
  assert.equal(progress.electives.creditsEarned, 0);
  assert.equal(progress.creditsEarned, 21, 'not 27 — core courses are spent once');
});

test('a core course in progress is still spent, and cannot leak into electives', () => {
  const progress = computeMinorProgress(
    [semester([['Abstract Algebra (MAT311)', '']], { running: true })],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsInProgress, 0);
  assert.equal(progress.creditsInProgress, 3, 'counted once, as a core requirement');
});

test('an extra MAT 3XX beyond the core does count as an elective', () => {
  const progress = computeMinorProgress(
    [allCore(), semester([['Complex Variables (MAT312)', 'A']])],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsEarned, 3);
  assert.deepEqual(
    progress.electives.earnedCourses.map((c) => c.code),
    ['MAT312'],
  );
});

test('elective credits are capped at the published total', () => {
  const progress = computeMinorProgress(
    [
      allCore(),
      semester([
        ['Modern Probability Theory (STA301)', 'A'],
        ['Optimization (CSE402)', 'A'],
        ['Complex Variables (MAT312)', 'A'],
      ]),
    ],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsEarned, 6, 'nine credits taken, six credited');
  assert.equal(progress.progressPct, 100);
});

test('a retaken elective banks its credits once', () => {
  const progress = computeMinorProgress(
    [
      semester([['Optimization (CSE402)', 'D']]),
      semester([['Optimization (CSE402)', 'A']]),
    ],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsEarned, 3);
});

test('in-progress electives cannot overflow past what is left of the pool', () => {
  const progress = computeMinorProgress(
    [
      semester([['Modern Probability Theory (STA301)', 'A']]),
      semester(
        [
          ['Optimization (CSE402)', ''],
          ['Complex Variables (MAT312)', ''],
        ],
        { running: true },
      ),
    ],
    MATH,
    SCALE,
  );
  assert.equal(progress.electives.creditsEarned, 3);
  assert.equal(progress.electives.creditsInProgress, 3, 'six taken, three slots left');
});

test('course codes resolve from a bare code and a leading code, not just a suffix', () => {
  const progress = computeMinorProgress(
    [semester([['MAT111', 'A'], ['MAT123 Calculus I', 'A']])],
    MATH,
    SCALE,
  );
  assert.equal(progress.coreEarned, 2);
});

test('an elective title drops the code so a row does not print it twice', () => {
  const progress = computeMinorProgress(
    [
      semester([
        ['Optimization (CSE402)', 'A'],
        ['STA301 Modern Probability Theory', 'A'],
      ]),
    ],
    MATH,
    SCALE,
  );
  assert.deepEqual(
    progress.electives.earnedCourses.map((c) => c.title),
    ['Optimization', 'Modern Probability Theory'],
  );
});

test('a bare code keeps its own name as the title rather than going blank', () => {
  const progress = computeMinorProgress([semester([['CSE402', 'A']])], MATH, SCALE);
  assert.equal(progress.electives.earnedCourses[0].title, 'CSE402');
});
