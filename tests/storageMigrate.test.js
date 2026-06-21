// tests/storageMigrate.test.js — versioned state migration, validation, backup.
// Uses realistic legacy `shohoj_cgpa_v1` fixtures.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectStoredVersion,
  migrateStoredState,
  parseAndMigrate,
} from '../src/services/storage/migrate.ts';
import { backupLegacyStateOnce, readLegacyBackup } from '../src/services/storage/backup.ts';
import { MemoryKeyValueStore } from '../src/services/storage/keyValueStore.ts';
import { CURRENT_SCHEMA_VERSION, LEGACY_BACKUP_KEY, STORAGE_KEY } from '../src/core/types/storage.ts';

// A realistic legacy (un-versioned) snapshot as written by js/core/state.js.
function legacyV1Fixture() {
  return {
    currentDept: 'CSE',
    semesterCounter: 2,
    startSeason: 'Spring',
    startYear: '2022',
    planCourses: ['CSE220', 'MAT216'],
    semesters: [
      {
        id: 1,
        name: 'Spring 2022',
        courses: [
          { name: 'Introduction to Computer Science', credits: 3, grade: 'A', gradePoint: 4 },
          { name: 'Calculus', credits: 3, grade: 'A-', gradePoint: '3.7' },
        ],
      },
      {
        id: 2,
        summary: true,
        summaryCGPA: 3.85,
        summaryCredits: 30,
        summaryAttempted: 30,
        summarySemesters: 2,
      },
    ],
  };
}

test('detectStoredVersion: legacy snapshot → 1, versioned → 2', () => {
  assert.equal(detectStoredVersion(legacyV1Fixture()), 1);
  assert.equal(detectStoredVersion({ ...legacyV1Fixture(), version: CURRENT_SCHEMA_VERSION }), 2);
  assert.equal(detectStoredVersion(null), 1);
  assert.equal(detectStoredVersion('garbage'), 1);
});

test('scenario 9 — legacy V1 migrates to V2 preserving all data', () => {
  const res = migrateStoredState(legacyV1Fixture());
  assert.equal(res.ok, true);
  const { state, fromVersion, droppedSemesters } = res.value;
  assert.equal(fromVersion, 1);
  assert.equal(droppedSemesters, 0);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(state.currentDept, 'CSE');
  assert.equal(state.semesterCounter, 2);
  assert.equal(state.startSeason, 'Spring');
  assert.equal(state.startYear, '2022');
  assert.deepEqual(state.planCourses, ['CSE220', 'MAT216']);
  assert.equal(state.semesters.length, 2);
  assert.equal(state.semesters[0].courses.length, 2);
  // Summary block preserved.
  assert.equal(state.semesters[1].summary, true);
  assert.equal(state.semesters[1].summaryCGPA, 3.85);
});

test('already-V2 input is revalidated and passes through (idempotent)', () => {
  const v2 = { ...legacyV1Fixture(), version: CURRENT_SCHEMA_VERSION };
  const res = migrateStoredState(v2);
  assert.equal(res.ok, true);
  assert.equal(res.value.fromVersion, 2);
  assert.equal(res.value.state.version, CURRENT_SCHEMA_VERSION);
  // Migrating the migrated output again is stable.
  const again = migrateStoredState(res.value.state);
  assert.equal(again.ok, true);
  assert.equal(again.value.state.semesters.length, res.value.state.semesters.length);
});

test('unknown top-level fields are preserved, not silently dropped', () => {
  const withExtra = { ...legacyV1Fixture(), futureFeatureFlag: { enabled: true } };
  const res = migrateStoredState(withExtra);
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.state.futureFeatureFlag, { enabled: true });
});

test('malformed semesters are dropped but reported in droppedSemesters', () => {
  const fixture = legacyV1Fixture();
  fixture.semesters.push({ id: 'not-a-number', courses: [] }); // invalid id
  fixture.semesters.push(null); // invalid entry
  const res = migrateStoredState(fixture);
  assert.equal(res.ok, true);
  assert.equal(res.value.droppedSemesters, 2);
  assert.equal(res.value.state.semesters.length, 2); // the two valid ones remain
});

test('scenario 8 — fundamentally unusable input yields a typed ValidationError', () => {
  const notObject = migrateStoredState(42);
  assert.equal(notObject.ok, false);
  assert.equal(notObject.error.code, 'validation');

  const noSemesters = migrateStoredState({ currentDept: 'CSE' });
  assert.equal(noSemesters.ok, false);
  assert.equal(noSemesters.error.code, 'validation');
  // userMessage is safe and mentions the backup.
  assert.match(noSemesters.error.userMessage, /backup/i);
});

test('parseAndMigrate: null/empty slot → Ok(null), not an error', () => {
  assert.deepEqual(parseAndMigrate(null), { ok: true, value: null });
  assert.deepEqual(parseAndMigrate(''), { ok: true, value: null });
});

test('scenario 8 — corrupt JSON string → typed ValidationError', () => {
  const res = parseAndMigrate('{ this is not json ');
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'validation');
  assert.match(res.error.userMessage, /corrupt|read/i);
});

test('parseAndMigrate round-trips a serialized legacy snapshot', () => {
  const raw = JSON.stringify(legacyV1Fixture());
  const res = parseAndMigrate(raw);
  assert.equal(res.ok, true);
  assert.equal(res.value.state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(res.value.fromVersion, 1);
});

// ── Backup ──────────────────────────────────────────────────────────────────

test('backupLegacyStateOnce writes a one-time backup before migration', () => {
  const store = new MemoryKeyValueStore();
  const raw = JSON.stringify(legacyV1Fixture());
  store.setItem(STORAGE_KEY, raw);

  const first = backupLegacyStateOnce(store);
  assert.equal(first.ok, true);
  assert.equal(first.value.backedUp, true);
  assert.equal(readLegacyBackup(store), raw);
  assert.equal(store.getItem(LEGACY_BACKUP_KEY), raw);
});

test('backup never overwrites an existing (oldest) backup', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(STORAGE_KEY, 'OLD');
  backupLegacyStateOnce(store);
  store.setItem(STORAGE_KEY, 'NEW');
  const second = backupLegacyStateOnce(store);
  assert.equal(second.ok, true);
  assert.equal(second.value.backedUp, false);
  assert.equal(second.value.reason, 'already-exists');
  assert.equal(readLegacyBackup(store), 'OLD'); // oldest preserved
});

test('backup is a no-op when there is nothing stored', () => {
  const store = new MemoryKeyValueStore();
  const res = backupLegacyStateOnce(store);
  assert.equal(res.ok, true);
  assert.equal(res.value.backedUp, false);
  assert.equal(res.value.reason, 'nothing-to-back-up');
});

test('backup surfaces storage failures as a typed StorageError', () => {
  const throwingStore = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('quota exceeded');
    },
    removeItem() {},
  };
  // getItem(backup)=null, getItem(source) must return something to reach setItem.
  throwingStore.getItem = (key) => (key === STORAGE_KEY ? 'data' : null);
  const res = backupLegacyStateOnce(throwingStore);
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'storage');
});
