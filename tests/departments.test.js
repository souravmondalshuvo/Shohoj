// tests/departments.test.js — unit tests for the typed department adapter
// (#313): parity with js/core/departments.js, validation/freezing, and the
// season-calendar lookup the naming logic depends on.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEPARTMENTS } from '../js/core/departments.js';
import {
  DEFAULT_DEPT_SEASONS,
  DEPARTMENT_LIST,
  deptSeasonsFor,
  getDepartment,
} from '../src/features/calculator/departments.ts';

test('adapts every authored department (none are malformed today)', () => {
  assert.equal(DEPARTMENT_LIST.length, Object.keys(DEPARTMENTS).length);
  const cse = DEPARTMENT_LIST.find(d => d.code === 'CSE');
  assert.equal(cse.label, DEPARTMENTS.CSE.label);
  assert.equal(cse.totalCredits, 136);
  assert.deepEqual([...cse.seasons], ['Spring', 'Summer', 'Fall']);
});

test('the adapted list and its entries are frozen', () => {
  assert.ok(Object.isFrozen(DEPARTMENT_LIST));
  assert.ok(Object.isFrozen(DEPARTMENT_LIST[0].seasons));
});

test('getDepartment is case/whitespace tolerant and null for unknowns', () => {
  assert.equal(getDepartment(' cse ').code, 'CSE');
  assert.equal(getDepartment('NOPE'), null);
  assert.equal(getDepartment(''), null);
});

test('deptSeasonsFor honours non-default calendars and falls back', () => {
  assert.deepEqual([...deptSeasonsFor('PHR')], ['Spring', 'Summer']);
  assert.deepEqual([...deptSeasonsFor('LAW')], ['Spring', 'Fall']);
  assert.equal(deptSeasonsFor(''), DEFAULT_DEPT_SEASONS);
  assert.equal(deptSeasonsFor('NOPE'), DEFAULT_DEPT_SEASONS);
});
