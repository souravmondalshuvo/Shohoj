// tests/userSync.test.js — parity tests for the typed user-sync helpers
// (#333) against the legacy js/auth/user-sync-service.js behavior.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDataFingerprint as legacyFingerprint,
  parseStoredState as legacyParse,
} from '../js/auth/user-sync-service.js';
import {
  getDataFingerprint,
  parseStoredState,
} from '../src/services/storage/userSync.ts';

const SNAP = { semesters: [{ id: 1 }], currentDept: 'CSE', updatedAt: 111, _serverTimestamp: 'x' };

test('parseStoredState: valid JSON, invalid JSON, empty — legacy parity', () => {
  const raw = JSON.stringify(SNAP);
  assert.deepEqual(parseStoredState(raw), legacyParse(raw));
  assert.equal(parseStoredState('{nope'), null);
  assert.equal(legacyParse('{nope'), null);
  assert.equal(parseStoredState(''), null);
  assert.equal(parseStoredState(null), null);
});

test('getDataFingerprint strips sync metadata only — legacy parity', () => {
  const raw = JSON.stringify(SNAP);
  assert.equal(getDataFingerprint(raw), legacyFingerprint(raw));
  // Metadata-only difference → same fingerprint.
  const other = JSON.stringify({ ...SNAP, updatedAt: 999 });
  assert.equal(getDataFingerprint(raw), getDataFingerprint(other));
  // Data difference → different fingerprint.
  const changed = JSON.stringify({ ...SNAP, currentDept: 'EEE' });
  assert.notEqual(getDataFingerprint(raw), getDataFingerprint(changed));
  // Objects work too (the realtime path passes parsed cloud data).
  assert.equal(getDataFingerprint(SNAP), getDataFingerprint(raw));
});

test('getDataFingerprint fallbacks: empty and unparseable input — legacy parity', () => {
  assert.equal(getDataFingerprint(''), legacyFingerprint(''));
  assert.equal(getDataFingerprint(null), '');
  assert.equal(getDataFingerprint('not json'), legacyFingerprint('not json'));
  assert.equal(getDataFingerprint('not json'), 'not json');
});
