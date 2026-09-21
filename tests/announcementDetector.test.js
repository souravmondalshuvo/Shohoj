/**
 * tests/announcementDetector.test.js
 *
 * Reading deadlines out of pasted text (#735) —
 * src/features/tasks/detection/announcementDetector.ts.
 *
 * The rule the module is written to is that an invented deadline is worse
 * than an absent one, so most of what is pinned here is what it REFUSES.
 * A detector that guesses well on the happy path and quietly fabricates a
 * date on the rest is the version a student stops trusting after one bad
 * proposal — and there is no undo for a deadline you believed.
 *
 * `now` is fixed at 21 September 2026 throughout. Dates are asserted in the
 * runner's local zone, because that is the zone the detector builds them in:
 * "25 September" means the 25th where the student is, not in UTC.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  announcementDetector,
  detectFromText,
} from '../src/features/tasks/detection/announcementDetector.ts';

const NOW = new Date(2026, 8, 21, 10, 0, 0);
const CTX = { now: NOW, knownCourseCodes: ['MAT215', 'CSE110'] };

/** Local-calendar reading of an ISO instant, so assertions are zone-proof. */
function localParts(iso) {
  const d = new Date(iso);
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    h: d.getHours(),
    min: d.getMinutes(),
  };
}

function only(text, context = CTX) {
  const result = detectFromText(text, context);
  assert.equal(result.detected.length, 1, `expected exactly one detection from: ${text}`);
  return result.detected[0];
}

test('the brief’s own example proposes a quiz, on 25 September, with the syllabus hint', () => {
  const task = only('Quiz 3 will be held on 25 September and covers chapters 4-6.');

  assert.equal(task.title, 'Quiz 3');
  assert.equal(task.type, 'QUIZ');
  assert.equal(task.syllabus, 'chapters 4-6');

  const due = localParts(task.dueAt);
  assert.equal(due.m, 9);
  assert.equal(due.d, 25);
  assert.equal(due.y, 2026);
});

test('a proposal carries the source text behind each field', () => {
  const task = only('MAT215 Quiz 3 on 25 September, chapters 4-6.');

  // Evidence is what lets a student check a proposal instead of trusting it.
  assert.equal(task.evidence.courseCode.text, 'MAT215');
  assert.equal(task.evidence.dueAt.text, '25 September');
  assert.equal(task.evidence.syllabus.text, 'chapters 4-6');
  assert.ok(task.evidence.type.text.length > 0);
});

test('nothing a detector returns is a task — it has no id and no status', () => {
  const task = only('Quiz 3 on 25 September.');

  // The Detect → Suggest → Confirm → Create rule is structural, not a
  // convention: there is no id here to write to, so nothing downstream can
  // mistake a proposal for a stored task.
  assert.equal(task.id, undefined);
  assert.equal(task.status, undefined);
  assert.equal(announcementDetector.source, 'PASTE');
});

// ── What it refuses ─────────────────────────────────────────────────────────

test('text with no event proposes nothing, rather than a task named after line one', () => {
  const result = detectFromText(
    'Hello everyone,\n\nHope your week is going well. See you in class on campus.',
    CTX,
  );

  assert.deepEqual(result.detected, []);
  // Reported, not dropped: "I read this and found nothing" tells a student the
  // paste worked, which is different from silence.
  assert.ok(result.unrecognised.length > 0);
});

test('a bare number after the date is not a time', () => {
  // "Quiz 3" has a 3 in it and the text has no am/pm and no colon. Reading an
  // hour here would put a 25 September deadline at 3am.
  const task = only('Quiz 3 on 25 September.');
  const due = localParts(task.dueAt);

  assert.equal(due.h, 23);
  assert.equal(due.min, 59);
  assert.equal(task.confidence, 'medium', 'no time given, so not a high-confidence read');
});

test('an explicit time is used, and raises confidence', () => {
  const task = only('MAT215 Quiz 3 on 25 September at 9:30 am.');
  const due = localParts(task.dueAt);

  assert.equal(due.h, 9);
  assert.equal(due.min, 30);
  assert.equal(task.confidence, 'high');
});

test('the day number of the date is not read as the hour', () => {
  // The time search starts after the date text. Starting at its beginning
  // reads "25" out of "25 September" and calls it 25 o'clock — or worse,
  // silently clamps it.
  const task = only('Quiz 3 on 25 September.');
  assert.equal(localParts(task.dueAt).h, 23);
});

test('a room number is not a course code', () => {
  const task = only('Quiz 3 in ROOM 301 on 25 September.');
  assert.equal(task.courseCode, null);
});

test('a real course is recognised even when the student is not enrolled in it', () => {
  // Enrolment raises preference, it is not a gate: a student can paste an
  // announcement for a course they are about to add.
  const task = only('CSE220 assignment due 30 September.');
  assert.equal(task.courseCode, 'CSE220');
});

test('a date that does not exist is refused, not rolled forward', () => {
  // 31 September is 1 October to a Date constructor. Proposing a deadline on
  // a day the announcement did not name is exactly the invented deadline.
  const task = only('Quiz 2 on 31 September.');
  assert.equal(task.dueAt, null);
  assert.equal(task.confidence, 'low');
});

test('a numbered title stops short of a date’s day number', () => {
  const task = only('Final exam 25/12/2026.');

  assert.equal(task.title, 'Final Exam');
  assert.equal(task.type, 'EXAM');
  const due = localParts(task.dueAt);
  assert.equal(due.d, 25);
  assert.equal(due.m, 12);
});

// ── Dates ───────────────────────────────────────────────────────────────────

test('a date with no year resolves forward rather than landing in the past', () => {
  // January, read in September, means next January.
  const task = only('Quiz 1 on 5 January.');
  assert.equal(localParts(task.dueAt).y, 2027);
});

test('a date a few weeks back still reads as this year', () => {
  // A student pasting a slightly old email should not have it flung a year out.
  const task = only('Quiz 1 was on 10 September.');
  assert.equal(localParts(task.dueAt).y, 2026);
});

test('numeric dates are read day-first, the way Bangladesh writes them', () => {
  const task = only('Assignment 2 due 05/10/2026.');
  const due = localParts(task.dueAt);

  assert.equal(due.d, 5);
  assert.equal(due.m, 10);
});

test('“the 25th of September” is the same date as “25 September”', () => {
  const task = only('Quiz 3 is on the 25th of September.');
  const due = localParts(task.dueAt);

  assert.equal(due.d, 25);
  assert.equal(due.m, 9);
});

test('a day with no month is left undated rather than guessed', () => {
  // Guessing a year is a small step; guessing a month is not. The proposal
  // still surfaces — the student can supply the date — but the detector
  // does not supply one for them.
  const task = only('Quiz 3 is on the 25th.');
  assert.equal(task.dueAt, null);
  assert.equal(task.confidence, 'low');
});

// ── Splitting a paste ───────────────────────────────────────────────────────

test('two announcements in one paste come back as two proposals', () => {
  const result = detectFromText('Quiz 3 is on 24 September. Assignment 2 is due 30 September.', CTX);

  assert.equal(result.detected.length, 2);
  assert.equal(result.detected[0].title, 'Quiz 3');
  assert.equal(result.detected[1].title, 'Assignment 2');
  assert.equal(localParts(result.detected[0].dueAt).d, 24);
  assert.equal(localParts(result.detected[1].dueAt).d, 30);
});

test('blank-line blocks are split before sentences, because that is how notices are written', () => {
  const result = detectFromText(
    'CSE110 Quiz 4 on 26 September.\n\nMAT215 Assignment 1 due 28 September.',
    CTX,
  );

  assert.equal(result.detected.length, 2);
  assert.deepEqual(
    result.detected.map((t) => t.courseCode),
    ['CSE110', 'MAT215'],
  );
});

test('an empty paste is not an error', () => {
  const result = detectFromText('   \n\n  ', CTX);
  assert.deepEqual(result.detected, []);
});

test('detection is a pure function of its input and its injected clock', () => {
  const text = 'Quiz 3 on 25 September.';
  const a = detectFromText(text, { now: NOW });
  const b = detectFromText(text, { now: NOW });

  assert.deepEqual(a, b);
});
