// tests/courseSearch.test.js — unit tests for the typed, deterministic course
// search (Phase 5C, extending the Phase 5B port of js/ui/suggestions.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareCatalog,
  resolveExactCourse,
  searchCourses,
  searchCoursesRanked,
} from '../src/features/calculator/courseSearch.ts';

const CATALOG = [
  { code: 'CSE110', name: 'Programming Language I', full: 'Programming Language I (CSE110)', credits: 3 },
  { code: 'CSE111', name: 'Programming Language II', full: 'Programming Language II (CSE111)', credits: 3 },
  { code: 'CSE220', name: 'Data Structures', full: 'Data Structures (CSE220)', credits: 3 },
  { code: 'MAT110', name: 'Calculus and Programming intro', full: 'Calculus and Programming intro (MAT110)', credits: 3 },
];

const codesOf = (q, cat = CATALOG) => searchCourses(q, cat).map((c) => c.code);

// ── Empty / whitespace ──────────────────────────────────────────────────────
test('empty and whitespace-only queries return no matches', () => {
  assert.deepEqual(searchCourses('', CATALOG), []);
  assert.deepEqual(searchCourses('   ', CATALOG), []);
  assert.deepEqual(searchCourses('\t \n', CATALOG), []);
});

// ── Code matching: exact, prefix, substring, case, spaces ───────────────────
test('exact code match ranks first, case-insensitively', () => {
  assert.equal(codesOf('CSE110')[0], 'CSE110');
  assert.equal(codesOf('cse110')[0], 'CSE110');
});

test('code prefix returns all prefix matches in a stable order', () => {
  assert.deepEqual(codesOf('cse'), ['CSE110', 'CSE111', 'CSE220']);
  assert.deepEqual(codesOf('CSE'), ['CSE110', 'CSE111', 'CSE220']);
});

test('leading/trailing and repeated spaces are normalised', () => {
  assert.equal(codesOf('  cse110  ')[0], 'CSE110');
  assert.deepEqual(codesOf('   cse   '), ['CSE110', 'CSE111', 'CSE220']);
});

test('a space inside a typed code still matches the spaceless catalog code', () => {
  assert.equal(codesOf('cse 110')[0], 'CSE110');
});

test('code substring matches when not a prefix', () => {
  // "110" is a substring of CSE110 and MAT110 but a prefix of neither.
  assert.deepEqual(codesOf('110').sort(), ['CSE110', 'MAT110']);
});

// ── Title matching: exact, prefix, substring, case ──────────────────────────
test('exact title outranks title prefix and substring', () => {
  const results = searchCoursesRanked(prepareCatalog(CATALOG), 'data structures');
  assert.equal(results[0].course.code, 'CSE220');
  assert.equal(results[0].matchKind, 'exact-title');
});

test('title prefix outranks title substring', () => {
  // "programming" → CSE110/CSE111 are title-prefix; MAT110 is title-substring.
  const ranked = searchCoursesRanked(prepareCatalog(CATALOG), 'programming');
  assert.deepEqual(ranked.map((r) => r.course.code), ['CSE110', 'CSE111', 'MAT110']);
  assert.equal(ranked.at(-1).matchKind, 'title-substring');
});

test('title matching is case-insensitive', () => {
  assert.deepEqual(codesOf('DATA'), ['CSE220']);
  assert.deepEqual(codesOf('Data Structures'), ['CSE220']);
});

test('code matches always outrank title matches', () => {
  const cat = [
    ...CATALOG,
    { code: 'PRG101', name: 'Intro to CSE topics', full: 'Intro to CSE topics (PRG101)', credits: 3 },
  ];
  // "cse" is a code-prefix for CSE* and only a title-substring for PRG101.
  const ranked = searchCoursesRanked(prepareCatalog(cat), 'cse');
  assert.equal(ranked.at(-1).course.code, 'PRG101');
  assert.equal(ranked.at(-1).matchKind, 'title-substring');
});

// ── Determinism, de-dup, limit, mutation safety ─────────────────────────────
test('results are deterministic across repeated runs', () => {
  const a = codesOf('c');
  const b = codesOf('c');
  assert.deepEqual(a, b);
});

test('a course matching multiple tiers appears only once', () => {
  // CSE220's name contains "structures"; ensure no duplicate when both could match.
  const ranked = searchCoursesRanked(prepareCatalog(CATALOG), 'structures');
  assert.equal(ranked.filter((r) => r.course.code === 'CSE220').length, 1);
});

test('duplicate catalog records are collapsed to one', () => {
  const dupes = [...CATALOG, { ...CATALOG[0] }];
  assert.equal(codesOf('cse110', dupes).filter((c) => c === 'CSE110').length, 1);
});

test('results are capped at the default limit of 8', () => {
  const big = Array.from({ length: 20 }, (_, i) => {
    const code = `CSE${String(100 + i).padStart(3, '0')}`;
    return { code, name: `Course ${i}`, full: `Course ${i} (${code})`, credits: 3 };
  });
  assert.equal(searchCourses('cse', big).length, 8);
});

test('an explicit limit is honoured', () => {
  assert.equal(searchCoursesRanked(prepareCatalog(CATALOG), 'cse', { limit: 2 }).length, 2);
});

test('search does not mutate the catalog or its records', () => {
  const snapshot = JSON.parse(JSON.stringify(CATALOG));
  searchCourses('cse', CATALOG);
  searchCoursesRanked(prepareCatalog(CATALOG), 'data structures');
  assert.deepEqual(CATALOG, snapshot);
});

test('returned records preserve canonical credits and identity', () => {
  const [hit] = searchCourses('cse220', CATALOG);
  assert.equal(hit.code, 'CSE220');
  assert.equal(hit.credits, 3);
  assert.equal(hit.full, 'Data Structures (CSE220)');
});

// ── Malformed / unknown input ───────────────────────────────────────────────
test('unknown input yields no matches without throwing', () => {
  assert.deepEqual(searchCourses('zzz999', CATALOG), []);
  assert.deepEqual(searchCourses('not a real course', CATALOG), []);
});

test('special characters are treated as plain text', () => {
  assert.deepEqual(searchCourses('(', CATALOG), []);
  assert.deepEqual(searchCourses('.*', CATALOG), []);
  assert.deepEqual(searchCourses('cse[110]', CATALOG), []);
});

test('prepareCatalog drops blank-coded records', () => {
  const cat = [...CATALOG, { code: '   ', name: 'Ghost', full: 'Ghost', credits: 3 }];
  assert.equal(prepareCatalog(cat).length, CATALOG.length);
});

// ── resolveExactCourse (blur) ───────────────────────────────────────────────
test('resolveExactCourse matches by code, full name, or name', () => {
  assert.equal(resolveExactCourse('cse220', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('Data Structures (CSE220)', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('data structures', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('nonexistent', CATALOG), null);
  assert.equal(resolveExactCourse('', CATALOG), null);
});

test('resolveExactCourse tolerates spacing and case', () => {
  assert.equal(resolveExactCourse('  cse 220 ', CATALOG)?.code, 'CSE220');
  assert.equal(resolveExactCourse('DATA   STRUCTURES', CATALOG)?.code, 'CSE220');
});
