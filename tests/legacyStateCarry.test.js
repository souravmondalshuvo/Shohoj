// tests/legacyStateCarry.test.js — legacy saveState must carry through the
// shell-owned fields it knows nothing about (#731).
//
// saveState rebuilds the whole snapshot on every call, so any field it does not
// name is dropped. That is the right default for fields legacy could corrupt,
// and the wrong one for `currentMinor`, which is set on the shell's
// /degree-progress and only needs legacy to leave it alone. Without the
// passthrough, editing one grade on the legacy page silently clears a student's
// minor — the kind of loss nothing else in the app would report.
//
// Legacy now picks minors too (#766). Once it has read the stored value,
// `state.currentMinor` is a string and legacy's own choice is what gets saved;
// until then it is null and the passthrough above still applies.

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

// These run last: they move state.currentMinor off null, which the passthrough
// tests above depend on.
test('a minor picked on legacy is saved over the stored one', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ semesters: [], currentMinor: 'MATH' }));
  state.currentMinor = 'PHY';
  saveState();
  assert.equal(stored().currentMinor, 'PHY');
});

test('clearing the minor on legacy saves an empty selection, not the old one', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ semesters: [], currentMinor: 'MATH' }));
  state.currentMinor = '';
  saveState();
  assert.equal(stored().currentMinor, '');
});
