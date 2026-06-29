// tests/academicStateStore.test.js
//
// Safety tests for the composed academic-state load/save service
// (src/services/storage/academicStateStore.ts). The properties here are the
// Phase 4 guardrails against silent academic-data loss (risk R3): back up before
// migrating, never overwrite stored state on load or on corruption, recover
// gracefully, and stamp the schema version on save.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadAcademicState,
  saveAcademicState,
} from '../src/services/storage/academicStateStore.ts';
import { MemoryKeyValueStore } from '../src/services/storage/keyValueStore.ts';
import { isErr } from '../src/core/result.ts';
import { StorageError } from '../src/core/errors.ts';

const KEY = 'shohoj_cgpa_v1';
const BACKUP_KEY = 'shohoj_cgpa_backup_v1';

function legacyV1Raw() {
  return JSON.stringify({
    currentDept: 'CSE',
    semesters: [{ id: 1, name: 'Spring 2023', courses: [] }],
    planCourses: ['CSE220'],
  });
}

test('legacy V1 loads, migrates to V2 in memory, backs up, and does NOT rewrite storage', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(KEY, legacyV1Raw());

  const result = loadAcademicState(store);

  assert.equal(result.status, 'loaded');
  assert.equal(result.state.version, 2);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.backedUp, true);
  // load must NOT have written the migrated value back to the live key.
  assert.equal(store.getItem(KEY), legacyV1Raw());
  // backup holds the exact original raw.
  assert.equal(store.getItem(BACKUP_KEY), legacyV1Raw());
});

test('empty slot → empty status, nothing backed up', () => {
  const store = new MemoryKeyValueStore();
  const result = loadAcademicState(store);
  assert.equal(result.status, 'empty');
  assert.equal(result.state, null);
  assert.equal(result.backedUp, false);
  assert.equal(store.getItem(BACKUP_KEY), null);
});

test('corrupt JSON → corrupt status, raw is preserved (never overwritten) and backed up', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(KEY, '{ this is not json');

  const result = loadAcademicState(store);

  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
  assert.ok(result.error);
  assert.match(result.error.userMessage, /backup was kept/i);
  // The corrupt raw is left exactly as-is for recovery.
  assert.equal(store.getItem(KEY), '{ this is not json');
  assert.equal(store.getItem(BACKUP_KEY), '{ this is not json');
});

test('valid JSON but unusable shape → corrupt, raw untouched', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(KEY, JSON.stringify({ notSemesters: true }));
  const result = loadAcademicState(store);
  assert.equal(result.status, 'corrupt');
  assert.equal(store.getItem(KEY), JSON.stringify({ notSemesters: true }));
});

test('backup is taken once — a second load never overwrites the oldest backup', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(KEY, legacyV1Raw());

  const first = loadAcademicState(store);
  assert.equal(first.backedUp, true);

  // Simulate the live key changing after the first backup.
  store.setItem(KEY, JSON.stringify({ semesters: [] }));
  const second = loadAcademicState(store);

  assert.equal(second.backedUp, false); // already backed up
  assert.equal(store.getItem(BACKUP_KEY), legacyV1Raw()); // oldest preserved
});

test('dropped (malformed) semesters are reported, not hidden', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(
    KEY,
    JSON.stringify({ semesters: [{ id: 1, courses: [] }, { id: 'bad' }, null] }),
  );
  const result = loadAcademicState(store);
  assert.equal(result.status, 'loaded');
  assert.equal(result.droppedSemesters, 2);
});

test('save stamps the current schema version and round-trips through load', () => {
  const store = new MemoryKeyValueStore();
  const res = saveAcademicState(store, { semesters: [{ id: 1, name: 'X', courses: [] }] });
  assert.ok(!isErr(res));
  const stored = JSON.parse(store.getItem(KEY));
  assert.equal(stored.version, 2);
  assert.equal(loadAcademicState(store).status, 'loaded');
});

test('save surfaces storage failure as a typed StorageError (no throw)', () => {
  const throwingStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
    removeItem: () => {},
  };
  const res = saveAcademicState(throwingStore, { semesters: [] });
  assert.ok(isErr(res));
  assert.ok(res.error instanceof StorageError);
});

test('load tolerates a store whose getItem throws — corrupt, never throws', () => {
  const throwingStore = {
    getItem: (k) => {
      if (k === BACKUP_KEY) return null; // let backup probe run
      throw new Error('SecurityError');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  const result = loadAcademicState(throwingStore);
  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
});

console.log('academic-state store safety tests passed');
