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
  planCourses: [],
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

test('setDept updates the department code (#313)', () => {
  const s = calculatorReducer(EMPTY_CALCULATOR_STATE, { type: 'setDept', currentDept: 'CSE' });
  assert.equal(s.currentDept, 'CSE');
  assert.equal(EMPTY_CALCULATOR_STATE.currentDept, '');
});

test('currentDept round-trips through persistence (#313)', () => {
  const store = new MemoryKeyValueStore();
  persistCalculatorState(store, { ...base(), currentDept: 'PHR' });
  const loaded = loadCalculatorState(store);
  assert.equal(loaded.state.currentDept, 'PHR');
});

test('persist preserves stored fields the calculator does not own (#313)', () => {
  const store = new MemoryKeyValueStore();
  // A legacy-style snapshot with planner + forward-compat data.
  store.setItem('shohoj_cgpa_v1', JSON.stringify({
    semesters: [{ id: 1, name: 'Spring 2023', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] }],
    startSeason: 'Spring',
    startYear: '2023',
    currentDept: 'CSE',
    planCourses: ['CSE220', 'CSE221'],
    semesterCounter: 7,
    futureField: { keep: true },
  }));

  const loaded = loadCalculatorState(store);
  const mutated = calculatorReducer(loaded.state, { type: 'addSemester', name: 'Summer 2023' });
  persistCalculatorState(store, mutated, loaded.stored);

  const raw = JSON.parse(store.getItem('shohoj_cgpa_v1'));
  assert.deepEqual(raw.planCourses, ['CSE220', 'CSE221']);
  assert.equal(raw.semesterCounter, 7);
  assert.deepEqual(raw.futureField, { keep: true });
  assert.equal(raw.semesters.length, 2); // the live fields still win
  assert.equal(raw.currentDept, 'CSE');
});

console.log('calculator state container tests passed');

// ── Plan state (#327) ─────────────────────────────────────────────────────────

test('addPlanCourse appends and dedupes; empty codes are ignored (#327)', () => {
  let s = calculatorReducer(EMPTY_CALCULATOR_STATE, { type: 'addPlanCourse', code: 'CSE220' });
  s = calculatorReducer(s, { type: 'addPlanCourse', code: 'CSE221' });
  s = calculatorReducer(s, { type: 'addPlanCourse', code: 'CSE220' }); // dupe
  s = calculatorReducer(s, { type: 'addPlanCourse', code: '' });
  assert.deepEqual(s.planCourses, ['CSE220', 'CSE221']);
});

test('removePlanCourse and clearPlan (#327)', () => {
  let s = { ...EMPTY_CALCULATOR_STATE, planCourses: ['CSE220', 'CSE221'] };
  s = calculatorReducer(s, { type: 'removePlanCourse', code: 'CSE220' });
  assert.deepEqual(s.planCourses, ['CSE221']);
  s = calculatorReducer(s, { type: 'clearPlan' });
  assert.deepEqual(s.planCourses, []);
});

test('promotePlan replaces the running semester and empties the plan (#327)', () => {
  const start = {
    ...EMPTY_CALCULATOR_STATE,
    semesters: [
      { id: 1, name: 'Fall 2024', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] },
      { id: 2, name: 'Old Running', running: true, courses: [{ name: '', credits: 0, grade: '' }] },
    ],
    planCourses: ['CSE220'],
  };
  const courses = [{ name: 'Data Structures (CSE220)', credits: 3, grade: '', gradePoint: '' }];
  const s = calculatorReducer(start, { type: 'promotePlan', name: 'Summer 2025 (Running)', courses });
  assert.equal(s.semesters.filter(x => x.running).length, 1);
  assert.equal(s.semesters.find(x => x.running).name, 'Summer 2025 (Running)');
  assert.deepEqual(s.semesters.find(x => x.running).courses, courses);
  assert.deepEqual(s.planCourses, []);
  // An empty prefill is a no-op (legacy guard).
  assert.equal(calculatorReducer(start, { type: 'promotePlan', name: 'X', courses: [] }), start);
});

test('setDept clears the plan; clearing the dept keeps it (#327)', () => {
  const s = { ...EMPTY_CALCULATOR_STATE, planCourses: ['CSE220'] };
  assert.deepEqual(calculatorReducer(s, { type: 'setDept', currentDept: 'EEE' }).planCourses, []);
  assert.deepEqual(calculatorReducer(s, { type: 'setDept', currentDept: '' }).planCourses, ['CSE220']);
});

test('planCourses round-trip through persistence, junk filtered on load (#327)', () => {
  const store = new MemoryKeyValueStore();
  persistCalculatorState(store, { ...EMPTY_CALCULATOR_STATE, planCourses: ['CSE220', 'MAT120'] });
  assert.deepEqual(loadCalculatorState(store).state.planCourses, ['CSE220', 'MAT120']);

  store.setItem('shohoj_cgpa_v1', JSON.stringify({ semesters: [], planCourses: ['CSE220', 7, '', null] }));
  assert.deepEqual(loadCalculatorState(store).state.planCourses, ['CSE220']);
});
