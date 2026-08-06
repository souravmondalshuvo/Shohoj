// tests/courseMarksState.test.js — persistence of course mark components (#500).
//
// sanitizeRestoredState rebuilds every course from an explicit allowlist, so a
// new field is dropped on reload unless it is added there. It is also the single
// validation boundary for both localStorage restore and the cloud document
// (services/storage/migrate.ts routes through it), which is why the round-trip
// and the hostile-input cases live in one place.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MARK_COMPONENTS,
  sanitizeMarkComponents,
  sanitizeRestoredState,
} from '../src/core/helpers.ts';
import {
  MAX_MARK_COMPONENTS as LEGACY_MAX,
  sanitizeMarkComponents as legacySanitize,
} from '../js/core/helpers.js';
import { migrateStoredState } from '../src/services/storage/migrate.ts';

const comp = (over = {}) => ({ name: 'Midterm', weight: 25, score: 18, outOf: 25, ...over });

const stateWith = (marks) => ({
  semesters: [
    {
      id: 1,
      name: 'Fall 2026',
      running: true,
      courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: '', marks }],
    },
  ],
});

const restoredMarks = (marks) =>
  sanitizeRestoredState(stateWith(marks)).semesters[0].courses[0].marks;

// ── The round trip ───────────────────────────────────────────────────────────

test('marks survive a save/restore cycle', () => {
  const marks = [comp(), comp({ name: 'Quizzes', weight: 15, score: 8, outOf: 10 })];
  const restored = restoredMarks(JSON.parse(JSON.stringify(marks)));
  assert.deepEqual(restored, marks);
});

test('a course that never tracked marks stays byte-identical', () => {
  // undefined rather than [] matters: an empty array would show up as a diff in
  // the cloud-sync fingerprint on every save for every untouched course.
  const course = sanitizeRestoredState(stateWith(undefined)).semesters[0].courses[0];
  assert.ok(!('marks' in course), 'no marks key should be introduced');
  assert.equal(sanitizeMarkComponents(undefined), undefined);
  assert.equal(sanitizeMarkComponents([]), undefined);
  assert.equal(sanitizeMarkComponents('nonsense'), undefined);
});

// ── Rejecting what cannot mean anything ──────────────────────────────────────

test('components without weight or denominator are dropped, not stored broken', () => {
  const kept = sanitizeMarkComponents([
    comp(),
    comp({ name: 'No weight', weight: 0 }),
    comp({ name: 'Negative weight', weight: -10 }),
    comp({ name: 'No denominator', outOf: 0 }),
    comp({ name: 'NaN weight', weight: NaN }),
    comp({ name: 'Infinite', outOf: Infinity }),
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, 'Midterm');
});

test('an ungraded component is kept with a null score', () => {
  const kept = sanitizeMarkComponents([comp({ score: null })]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].score, null, 'not graded is not the same as zero');

  // Anything non-numeric collapses to "not graded" rather than to 0, which
  // would silently invent a failing mark.
  for (const bad of ['18', undefined, {}, NaN, Infinity]) {
    assert.equal(sanitizeMarkComponents([comp({ score: bad })])[0].score, null, String(bad));
  }
});

test('a negative score is floored at zero', () => {
  assert.equal(sanitizeMarkComponents([comp({ score: -5 })])[0].score, 0);
});

test('weight is capped at 100', () => {
  assert.equal(sanitizeMarkComponents([comp({ weight: 400 })])[0].weight, 100);
});

// ── Hostile input ────────────────────────────────────────────────────────────

test('component names are tag-stripped and length-capped', () => {
  const kept = sanitizeMarkComponents([comp({ name: '<img src=x onerror=alert(1)>Mid' })]);
  assert.ok(!kept[0].name.includes('<'), `tags survived: ${kept[0].name}`);

  const long = sanitizeMarkComponents([comp({ name: 'x'.repeat(500) })]);
  assert.equal(long[0].name.length, 40);
});

test('a non-string name becomes empty rather than leaking an object', () => {
  for (const bad of [{ toString: () => 'evil' }, 42, null, undefined]) {
    assert.equal(sanitizeMarkComponents([comp({ name: bad })])[0].name, '');
  }
});

test('the component count is bounded', () => {
  const many = Array.from({ length: 500 }, (_, i) => comp({ name: `C${i}` }));
  assert.equal(sanitizeMarkComponents(many).length, MAX_MARK_COMPONENTS);
});

test('non-object entries are skipped without derailing the rest', () => {
  const kept = sanitizeMarkComponents([null, 'string', 42, comp(), undefined, comp({ name: 'Q' })]);
  assert.equal(kept.length, 2);
});

test('restore still rejects the states it rejected before', () => {
  assert.equal(sanitizeRestoredState(null), null);
  assert.equal(sanitizeRestoredState({}), null);
  assert.equal(sanitizeRestoredState({ semesters: 'no' }), null);
});

test('marks on a course do not disturb the fields already sanitised', () => {
  const restored = sanitizeRestoredState({
    semesters: [
      {
        id: 1,
        running: true,
        courses: [
          {
            name: 'Algorithms (CSE221)',
            credits: 3,
            grade: 'A',
            faculty: 'abcdefgh',
            marks: [comp()],
          },
        ],
      },
    ],
  }).semesters[0].courses[0];

  assert.equal(restored.faculty, 'ABCDEF', 'faculty is still upper-cased and capped');
  assert.equal(restored.credits, 3);
  assert.equal(restored.grade, 'A');
  assert.equal(restored.marks.length, 1);
});

// ── The cloud path ───────────────────────────────────────────────────────────

test('marks survive the migrate path the cloud document uses', () => {
  const marks = [comp(), comp({ name: 'Quizzes', weight: 15, score: 8, outOf: 10 })];
  const result = migrateStoredState(stateWith(structuredClone(marks)));

  assert.ok(result.ok, 'a snapshot carrying marks must still validate');
  assert.deepEqual(result.value.state.semesters[0].courses[0].marks, marks);
});

test('a hostile cloud document cannot smuggle marks past validation', () => {
  const result = migrateStoredState(
    stateWith([
      { name: '<script>x</script>Mid', weight: 1e9, score: -3, outOf: 25 },
      { name: 'no denominator', weight: 25, score: 5, outOf: 0 },
    ]),
  );

  const kept = result.value.state.semesters[0].courses[0].marks;
  assert.equal(kept.length, 1);
  assert.ok(!kept[0].name.includes('<'));
  assert.equal(kept[0].weight, 100);
  assert.equal(kept[0].score, 0);
});

// ── Twin parity ──────────────────────────────────────────────────────────────

test('the js/ twin sanitises identically', () => {
  assert.equal(LEGACY_MAX, MAX_MARK_COMPONENTS);

  const cases = [
    undefined,
    [],
    'nonsense',
    [comp()],
    [comp({ score: null }), comp({ weight: 0 }), comp({ outOf: 0 })],
    [comp({ name: '<b>x</b>' }), comp({ name: 'y'.repeat(100) })],
    [comp({ score: -5 }), comp({ weight: 400 })],
    [null, 'x', 42, comp()],
    Array.from({ length: 40 }, (_, i) => comp({ name: `C${i}` })),
  ];

  for (const input of cases) {
    assert.deepEqual(
      legacySanitize(structuredClone(input)),
      sanitizeMarkComponents(structuredClone(input)),
      `twins disagree for ${JSON.stringify(input)?.slice(0, 80)}`,
    );
  }
});
