// tests/calculatorState.test.js
//
// Covers the calculator feature-state container (src/features/calculator/
// calculatorState.ts): the pure reducer and load/persist through the Phase 4
// safe persistence engine.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatorReducer,
  loadCalculatorState,
  persistCalculatorState,
  EMPTY_CALCULATOR_STATE,
} from '../src/features/calculator/calculatorState.ts';
import { MemoryKeyValueStore } from '../src/services/storage/keyValueStore.ts';
import { isErr } from '../src/core/result.ts';

const base = () => ({
  semesters: [{ id: 1, name: 'Spring 2023', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] }],
  startSeason: 'Spring',
  startYear: '2023',
});

test('addSemester appends a semester with a fresh id and one blank course', () => {
  const next = calculatorReducer(base(), { type: 'addSemester' });
  assert.equal(next.semesters.length, 2);
  assert.equal(next.semesters[1].id, 2);
  assert.equal(next.semesters[1].courses.length, 1);
  assert.equal(next.semesters[1].courses[0].name, '');
});

test('addSemester carries the computed name onto the new semester', () => {
  const next = calculatorReducer(base(), { type: 'addSemester', name: 'Summer 2023 (2nd Semester)' });
  assert.equal(next.semesters[1].name, 'Summer 2023 (2nd Semester)');
  assert.ok(!next.semesters[1].running);
});

test('addRunningSemester adds one named running semester, second is a no-op', () => {
  const one = calculatorReducer(base(), { type: 'addRunningSemester', name: 'Fall 2023 (Running)' });
  assert.equal(one.semesters.length, 2);
  assert.equal(one.semesters[1].name, 'Fall 2023 (Running)');
  assert.equal(one.semesters[1].running, true);
  assert.equal(one.semesters[1].courses.length, 1);

  const two = calculatorReducer(one, { type: 'addRunningSemester', name: 'Spring 2024 (Running)' });
  assert.equal(two, one); // unchanged state reference — a true no-op
});

test('addCourse / removeCourse (keeps the last) / updateCourse', () => {
  let s = calculatorReducer(base(), { type: 'addCourse', semId: 1 });
  assert.equal(s.semesters[0].courses.length, 2);
  s = calculatorReducer(s, { type: 'updateCourse', semId: 1, index: 1, patch: { name: 'CSE111', credits: 3 } });
  assert.equal(s.semesters[0].courses[1].name, 'CSE111');
  s = calculatorReducer(s, { type: 'removeCourse', semId: 1, index: 1 });
  assert.equal(s.semesters[0].courses.length, 1);
  // never removes the last row
  s = calculatorReducer(s, { type: 'removeCourse', semId: 1, index: 0 });
  assert.equal(s.semesters[0].courses.length, 1);
});

test('removeSemester and reorderSemesters', () => {
  const two = calculatorReducer(base(), { type: 'addSemester' });
  const reordered = calculatorReducer(two, { type: 'reorderSemesters', srcId: 2, tgtId: 1 });
  assert.deepEqual(reordered.semesters.map((x) => x.id), [2, 1]);
  const removed = calculatorReducer(two, { type: 'removeSemester', id: 1 });
  assert.deepEqual(removed.semesters.map((x) => x.id), [2]);
});

test('setStart and replace', () => {
  const s = calculatorReducer(EMPTY_CALCULATOR_STATE, { type: 'setStart', startSeason: 'Fall', startYear: '2021' });
  assert.equal(s.startSeason, 'Fall');
  assert.equal(s.startYear, '2021');
  const r = calculatorReducer(s, { type: 'replace', state: base() });
  assert.equal(r.semesters.length, 1);
});

test('reducer is immutable — the input state is not mutated', () => {
  const original = base();
  const snapshot = JSON.stringify(original);
  calculatorReducer(original, { type: 'addCourse', semId: 1 });
  assert.equal(JSON.stringify(original), snapshot);
});

test('persist then load round-trips through the Phase 4 engine', () => {
  const store = new MemoryKeyValueStore();
  const res = persistCalculatorState(store, base());
  assert.ok(!isErr(res));
  const loaded = loadCalculatorState(store);
  assert.equal(loaded.status, 'loaded');
  assert.equal(loaded.state.semesters.length, 1);
  assert.equal(loaded.state.startYear, '2023');
});

test('load on an empty store yields empty state, status empty', () => {
  const loaded = loadCalculatorState(new MemoryKeyValueStore());
  assert.equal(loaded.status, 'empty');
  assert.deepEqual(loaded.state, EMPTY_CALCULATOR_STATE);
});

test('load on corrupt storage yields empty state (status corrupt), raw preserved', () => {
  const store = new MemoryKeyValueStore();
  store.setItem('shohoj_cgpa_v1', '{ not json');
  const loaded = loadCalculatorState(store);
  assert.equal(loaded.status, 'corrupt');
  assert.deepEqual(loaded.state, EMPTY_CALCULATOR_STATE);
  assert.equal(store.getItem('shohoj_cgpa_v1'), '{ not json'); // never overwritten
});

console.log('calculator state container tests passed');
