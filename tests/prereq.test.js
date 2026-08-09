// tests/prereq.test.js — prerequisite expressions and the unlock map (#478).
//
// The expressions here are the real shapes from the CONNECT feed, including the
// nested OR-of-AND that makes a naive split-on-AND parser wrong.
//
// The rule under most of these tests: a parser bug must never tell a student
// they are ineligible. Unreadable input fails open and gets counted.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUnlockMap,
  completedCodes,
  evaluatePrerequisites,
  gradeSatisfiesPrereq,
  parsePrerequisites,
  prereqCodes,
} from '../src/core/prereq.ts';

const set = (...codes) => new Set(codes);

// ── Parsing ──────────────────────────────────────────────────────────────────

test('the single-course case the feed uses most', () => {
  const parsed = parsePrerequisites('(CSE221)');
  assert.equal(parsed.status, 'parsed');
  assert.deepEqual(parsed.node, { kind: 'course', code: 'CSE221' });
});

test('parses an OR of ANDs without flattening it', () => {
  // EEE101 → (PHY111 AND MAT110) OR (MAT105 AND PHY110). Flattening this to a
  // list of four codes would demand all four.
  const parsed = parsePrerequisites('(PHY111 AND MAT110) OR (MAT105 AND PHY110)');
  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.node.kind, 'or');
  assert.equal(parsed.node.children.length, 2);
  assert.equal(parsed.node.children[0].kind, 'and');
  assert.deepEqual(prereqCodes(parsed.node), ['PHY111', 'MAT110', 'MAT105', 'PHY110']);
});

test('parses the three-deep chains', () => {
  const raw = '(CSE340 AND CSE321 AND CSE331) OR (EEE410 AND CSE321 AND CSE331)';
  const parsed = parsePrerequisites(raw);
  assert.equal(parsed.status, 'parsed');
  assert.equal(parsed.node.children[0].children.length, 3);
});

test('AND binds tighter than OR, as the expressions assume', () => {
  // A AND B OR C must read as (A AND B) OR C, not A AND (B OR C).
  const parsed = parsePrerequisites('CSE110 AND CSE111 OR CSE221');
  assert.equal(parsed.node.kind, 'or');
  assert.equal(parsed.node.children[0].kind, 'and');
  assert.deepEqual(parsed.node.children[1], { kind: 'course', code: 'CSE221' });
});

test('course codes with a trailing letter parse', () => {
  assert.equal(parsePrerequisites('(EEE101L)').status, 'parsed');
  assert.equal(parsePrerequisites('(CSE110)').status, 'parsed');
});

test('nothing declared is not the same as unparseable', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(parsePrerequisites(empty).status, 'none', `${empty} should be none`);
  }
});

test('malformed expressions are reported, not guessed at', () => {
  const bad = [
    '(CSE221', // unclosed
    'CSE221)', // unopened
    'CSE221 AND', // dangling operator
    'AND CSE221', // leading operator
    'CSE221 CSE110', // missing operator
    'NOT CSE221', // unsupported operator
    'see advisor', // prose
    '()', // empty group
  ];
  for (const raw of bad) {
    assert.equal(parsePrerequisites(raw).status, 'unparseable', `${raw} should be unparseable`);
  }
});

// ── Failing open ─────────────────────────────────────────────────────────────

test('an unreadable expression never blocks a student', () => {
  const result = evaluatePrerequisites('see advisor', set());
  assert.equal(result.satisfied, true, 'a parser bug must not report ineligible');
  assert.equal(result.failedOpen, true, 'but it must be visible, not swallowed');
  assert.deepEqual(result.missing, []);
});

test('a course with no prerequisites is open without failing open', () => {
  const result = evaluatePrerequisites('', set());
  assert.equal(result.satisfied, true);
  assert.equal(result.failedOpen, false, 'no prerequisite is not a parse failure');
});

// ── Evaluation ───────────────────────────────────────────────────────────────

test('satisfies an OR through either branch', () => {
  const raw = '(PHY111 AND MAT110) OR (MAT105 AND PHY110)';
  assert.equal(evaluatePrerequisites(raw, set('PHY111', 'MAT110')).satisfied, true);
  assert.equal(evaluatePrerequisites(raw, set('MAT105', 'PHY110')).satisfied, true);
  assert.equal(evaluatePrerequisites(raw, set('PHY111', 'PHY110')).satisfied, false);
});

test('missing names the cheapest way in, not every alternative', () => {
  // One course from the first branch, nothing from the second. The useful
  // answer is "you need MAT110", not all four codes.
  const result = evaluatePrerequisites('(PHY111 AND MAT110) OR (MAT105 AND PHY110)', set('PHY111'));
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.missing, ['MAT110']);
});

test('an AND reports every missing course', () => {
  const result = evaluatePrerequisites('CSE340 AND CSE321 AND CSE331', set('CSE321'));
  assert.deepEqual(result.missing, ['CSE340', 'CSE331']);
});

// ── Which grades count ───────────────────────────────────────────────────────

test('a pass at any level clears the prerequisite', () => {
  for (const grade of ['A+', 'A', 'B', 'C-', 'D', 'D-', 'P']) {
    assert.equal(gradeSatisfiesPrereq(grade), true, `${grade} should satisfy`);
  }
});

test('a fail, a withdrawal, an incomplete and a blank do not', () => {
  for (const grade of ['F', 'F(NT)', 'W', 'I', '', '   ']) {
    assert.equal(gradeSatisfiesPrereq(grade), false, `${grade} should not satisfy`);
  }
});

test('completedCodes keeps only passed courses, by code', () => {
  const extract = (name) => name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/)?.[1] ?? null;
  const codes = completedCodes(
    [
      { name: 'Data Structures (CSE220)', grade: 'A' },
      { name: 'Physics (PHY111)', grade: 'F' },
      { name: 'Chemistry (CHE110)', grade: 'W' },
      { name: 'Viva (CSE400)', grade: 'P' },
      { name: 'Uncatalogued course', grade: 'A' },
    ],
    extract,
  );
  assert.deepEqual([...codes].sort(), ['CSE220', 'CSE400']);
});

// ── The unlock map ───────────────────────────────────────────────────────────

const offered = [
  {
    courseCode: 'CSE110',
    courseName: 'Programming Language I',
    credits: 3,
    prerequisiteCourses: '',
  },
  {
    courseCode: 'CSE111',
    courseName: 'Programming Language II',
    credits: 3,
    prerequisiteCourses: '(CSE110)',
  },
  {
    courseCode: 'CSE220',
    courseName: 'Data Structures',
    credits: 3,
    prerequisiteCourses: '(CSE111)',
  },
  { courseCode: 'CSE221', courseName: 'Algorithms', credits: 3, prerequisiteCourses: '(CSE220)' },
  {
    courseCode: 'CSE321',
    courseName: 'Operating Systems',
    credits: 3,
    prerequisiteCourses: '(CSE221)',
  },
  { courseCode: 'MAT110', courseName: 'Calculus', credits: 3, prerequisiteCourses: '' },
];

test('unlocked lists what is takeable and not already passed', () => {
  const map = buildUnlockMap(offered, set('CSE110'));
  const codes = map.unlocked.map((c) => c.code).sort();
  assert.deepEqual(codes, ['CSE111', 'MAT110']);
  assert.ok(!codes.includes('CSE110'), 'a passed course is not something to register for');
});

test('one-away names the single missing prerequisite', () => {
  const map = buildUnlockMap(offered, set('CSE110'));
  const oneAway = map.oneAway.find((c) => c.code === 'CSE220');
  assert.ok(oneAway, 'CSE220 is one course away');
  assert.deepEqual(oneAway.missing, ['CSE111']);

  // CSE321 has exactly one missing immediate prerequisite (CSE221) — but CSE221
  // is itself locked, so "one course away" would be advice the student cannot
  // act on. Only genuinely takeable next steps belong here.
  assert.ok(!map.oneAway.some((c) => c.code === 'CSE321'));
  assert.ok(!map.oneAway.some((c) => c.code === 'CSE221'), 'CSE221 needs CSE220 first');
});

test('a one-away course becomes takeable once its blocker is passed', () => {
  // The chain walks forward: with CSE111 done, CSE220 moves from one-away to
  // unlocked and CSE221 takes its place as the next step.
  const map = buildUnlockMap(offered, set('CSE110', 'CSE111'));
  assert.ok(map.unlocked.some((c) => c.code === 'CSE220'));
  assert.deepEqual(
    map.oneAway.map((c) => c.code),
    ['CSE221'],
  );
});

test('highest leverage is the course that opens the most doors', () => {
  const map = buildUnlockMap(offered, set('CSE110'));
  // Passing CSE111 unlocks CSE220 this term; MAT110 unlocks nothing.
  assert.equal(map.highestLeverage.code, 'CSE111');
  assert.equal(map.highestLeverage.unlockCount, 1);
  assert.equal(map.unlocked.find((c) => c.code === 'MAT110').unlockCount, 0);
});

test('no leverage anywhere reports null rather than an arbitrary pick', () => {
  const flat = [
    { courseCode: 'MAT110', courseName: 'Calculus', credits: 3, prerequisiteCourses: '' },
    { courseCode: 'ENG101', courseName: 'English', credits: 3, prerequisiteCourses: '' },
  ];
  const map = buildUnlockMap(flat, set());
  assert.equal(map.highestLeverage, null);
  assert.equal(map.unlocked.length, 2);
});

test('the feed’s many sections per course collapse to one entry', () => {
  const sections = [
    {
      courseCode: 'CSE220',
      courseName: 'Data Structures',
      credits: 3,
      prerequisiteCourses: '(CSE111)',
    },
    {
      courseCode: 'CSE220',
      courseName: 'Data Structures',
      credits: 3,
      prerequisiteCourses: '(CSE111)',
    },
    {
      courseCode: 'CSE220',
      courseName: 'Data Structures',
      credits: 3,
      prerequisiteCourses: '(CSE111)',
    },
  ];
  const map = buildUnlockMap(sections, set('CSE111'));
  assert.equal(map.unlocked.length, 1, 'three sections are one course');
});

test('a section missing the prerequisite string does not widen eligibility', () => {
  // Same course, one row blank. Taking the blank row would make CSE220 look
  // open to everybody.
  const sections = [
    { courseCode: 'CSE220', courseName: 'Data Structures', credits: 3, prerequisiteCourses: '' },
    {
      courseCode: 'CSE220',
      courseName: 'Data Structures',
      credits: 3,
      prerequisiteCourses: '(CSE111)',
    },
  ];
  const map = buildUnlockMap(sections, set());
  assert.equal(map.unlocked.length, 0, 'the prerequisite-bearing row must win');
  assert.deepEqual(evaluatePrerequisites('(CSE111)', set()).missing, ['CSE111']);

  // CSE111 is not on offer here, so CSE220 is not a verifiable next step either
  // — the map declines to promise a step it cannot check.
  assert.equal(map.oneAway.length, 0);
});

test('fail-open courses are counted and still offered', () => {
  const withJunk = [
    ...offered,
    {
      courseCode: 'CSE499',
      courseName: 'Thesis',
      credits: 6,
      prerequisiteCourses: 'consult advisor',
    },
  ];
  const map = buildUnlockMap(withJunk, set('CSE110'));
  assert.equal(map.failedOpenCount, 1);
  assert.ok(
    map.unlocked.some((c) => c.code === 'CSE499'),
    'still offered, never hidden',
  );
});

test('a feed with no prerequisite data at all says so', () => {
  const bare = [{ courseCode: 'MAT110', courseName: 'Calculus', credits: 3 }];
  const map = buildUnlockMap(bare, set());
  assert.equal(map.hasPrereqData, false, 'so the UI can say why the map is empty');
  assert.equal(map.unlocked.length, 1);
});

test('ordering is deterministic', () => {
  const a = buildUnlockMap(offered, set('CSE110'));
  const b = buildUnlockMap([...offered].reverse(), set('CSE110'));
  assert.deepEqual(
    a.unlocked.map((c) => c.code),
    b.unlocked.map((c) => c.code),
  );
});
