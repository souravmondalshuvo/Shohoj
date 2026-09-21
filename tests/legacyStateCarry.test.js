// tests/legacyStateCarry.test.js — legacy saveState must carry through the
// shell-owned fields it knows nothing about (#731).
//
// saveState rebuilds the whole snapshot on every call, so any field it does not
// name is dropped. That is the right default for fields legacy could corrupt,
// and the wrong one for `currentMinor`, which is set on the shell's
// /degree-progress and only needs legacy to leave it alone. Without the
// passthrough, editing one grade on the legacy page silently clears a student's
// minor — the kind of loss nothing else in the app would report.

import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #map = new Map();
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null;
  }
  setItem(k, v) {
    this.#map.set(k, String(v));
  }
  removeItem(k) {
    this.#map.delete(k);
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.document = { getElementById: () => null };
globalThis.window = globalThis;

const { saveState, state, STORAGE_KEY } = await import('../js/core/state.js');

function stored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

test('a legacy save preserves a minor the shell selected', () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ semesters: [], currentDept: 'CSE', currentMinor: 'MATH' }),
  );
  state.currentDept = 'CSE';
  state.semesters = [{ id: 1, name: 'Spring 2026', courses: [] }];

  saveState();

  assert.equal(stored().currentMinor, 'MATH');
  assert.equal(stored().currentDept, 'CSE', 'legacy still owns the fields it owns');
  assert.equal(stored().semesters.length, 1);
});

test('no stored minor stays absent rather than becoming empty noise', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ semesters: [], currentDept: 'CSE' }));
  saveState();
  assert.ok(!('currentMinor' in stored()));
});

test('a non-string minor is dropped, not carried', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ semesters: [], currentMinor: 7 }));
  saveState();
  assert.ok(!('currentMinor' in stored()));
});

test('corrupt storage does not stop the save', () => {
  localStorage.setItem(STORAGE_KEY, '{ not json');
  saveState();
  assert.equal(stored().currentDept, 'CSE');
});
