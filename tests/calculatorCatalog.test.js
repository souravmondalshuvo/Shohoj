// tests/calculatorCatalog.test.js — the typed BRACU catalogue adapter (Phase 5C).
// Verifies the shell path reads the SAME data the legacy bundle ships (imported
// through js/core/catalog.d.ts), adapted into well-formed, frozen suggestions.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../src/features/calculator/catalog.ts';
import { searchCourses } from '../src/features/calculator/courseSearch.ts';

test('the catalogue is a non-empty, frozen list', () => {
  assert.ok(BRACU_COURSE_CATALOG.length > 100, 'real BRACU catalogue is large');
  assert.ok(Object.isFrozen(BRACU_COURSE_CATALOG), 'frozen so callers cannot mutate it');
});

test('every entry is a well-formed CourseSuggestion', () => {
  for (const c of BRACU_COURSE_CATALOG) {
    assert.equal(typeof c.code, 'string');
    assert.ok(c.code.trim().length > 0, 'non-empty code');
    assert.equal(typeof c.name, 'string');
    assert.ok(c.name.length > 0, 'non-empty name');
    assert.equal(typeof c.full, 'string');
    assert.ok(c.full.length > 0, 'non-empty display name');
    assert.equal(typeof c.credits, 'number');
    assert.ok(Number.isFinite(c.credits), 'finite credits');
  }
});

test('course codes are unique', () => {
  const codes = BRACU_COURSE_CATALOG.map((c) => c.code.toUpperCase());
  assert.equal(new Set(codes).size, codes.length);
});

test('isKnownCourseCode recognises real codes, rejects junk, ignores case/space', () => {
  const sample = BRACU_COURSE_CATALOG[0].code;
  assert.equal(isKnownCourseCode(sample), true);
  assert.equal(isKnownCourseCode(sample.toLowerCase()), true);
  assert.equal(isKnownCourseCode(`  ${sample}  `), true);
  assert.equal(isKnownCourseCode('ZZZ999'), false);
  assert.equal(isKnownCourseCode(''), false);
});

test('a known course is searchable with its canonical credits', () => {
  // CSE110 is a stable, well-known BRACU course (Programming Language I, 3 cr).
  assert.equal(isKnownCourseCode('CSE110'), true);
  const [hit] = searchCourses('CSE110', BRACU_COURSE_CATALOG);
  assert.equal(hit.code, 'CSE110');
  assert.equal(hit.credits, 3);
  assert.ok(hit.full.includes('CSE110'));
});
