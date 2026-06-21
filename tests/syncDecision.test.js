// tests/syncDecision.test.js — cloud-sync conflict resolution (pure extraction
// of js/auth/firebase.js). Covers the Phase 2 required scenarios: first sign-in,
// same-data, newer-local, newer-cloud, pending debounced save, offline edits,
// multi-device, and the just-applied echo guards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideSignInSync,
  resolveMigrationChoice,
  decideRealtimeSnapshot,
  decideCloudSave,
} from '../src/services/storage/syncDecision.ts';

const LOCAL_WRITE_GRACE_MS = 5000;

function signIn(overrides) {
  return {
    hasLocal: false,
    hasCloud: false,
    localSemesterCount: 0,
    cloudSemesterCount: 0,
    cloudAppliedFlag: false,
    fingerprintsEqual: false,
    ...overrides,
  };
}

// ── Sign-in conflict resolution ───────────────────────────────────────────────

test('scenario 1 — first sign-in, no data anywhere → mark-synced-empty', () => {
  assert.equal(decideSignInSync(signIn({ hasLocal: false, hasCloud: false })), 'mark-synced-empty');
});

test('scenario 1 — first sign-in, local only → upload-local', () => {
  assert.equal(
    decideSignInSync(signIn({ hasLocal: true, hasCloud: false, localSemesterCount: 3 })),
    'upload-local',
  );
});

test('first sign-in, cloud only → apply-cloud', () => {
  assert.equal(
    decideSignInSync(signIn({ hasLocal: false, hasCloud: true, cloudSemesterCount: 4 })),
    'apply-cloud',
  );
});

test('scenario 2 — same-data sign-in (both, identical) → mark-synced-equal, no skip armed', () => {
  assert.equal(
    decideSignInSync(
      signIn({
        hasLocal: true,
        hasCloud: true,
        localSemesterCount: 3,
        cloudSemesterCount: 3,
        cloudAppliedFlag: false,
        fingerprintsEqual: true,
      }),
    ),
    'mark-synced-equal',
  );
});

test('scenario 3 — newer/different local data → prompt-migration, then keep local uploads', () => {
  const action = decideSignInSync(
    signIn({
      hasLocal: true,
      hasCloud: true,
      localSemesterCount: 5,
      cloudSemesterCount: 3,
      fingerprintsEqual: false,
    }),
  );
  assert.equal(action, 'prompt-migration');
  assert.equal(resolveMigrationChoice('local'), 'upload-local');
});

test('scenario 4 — newer/different cloud data → prompt-migration, then keep cloud applies', () => {
  const action = decideSignInSync(
    signIn({
      hasLocal: true,
      hasCloud: true,
      localSemesterCount: 3,
      cloudSemesterCount: 5,
      fingerprintsEqual: false,
    }),
  );
  assert.equal(action, 'prompt-migration');
  assert.equal(resolveMigrationChoice('cloud'), 'apply-cloud');
});

test('scenario 4 — local empty but cloud has data → apply-cloud without prompting', () => {
  assert.equal(
    decideSignInSync(
      signIn({
        hasLocal: true,
        hasCloud: true,
        localSemesterCount: 0,
        cloudSemesterCount: 5,
      }),
    ),
    'apply-cloud',
  );
});

test('just-applied cloud (both exist, flag set) → skip-echo (arms skip_first_save)', () => {
  assert.equal(
    decideSignInSync(
      signIn({
        hasLocal: true,
        hasCloud: true,
        localSemesterCount: 3,
        cloudSemesterCount: 3,
        cloudAppliedFlag: true,
      }),
    ),
    'skip-echo',
  );
});

test('decideSignInSync is deterministic for identical input', () => {
  const input = signIn({ hasLocal: true, hasCloud: true, localSemesterCount: 2, cloudSemesterCount: 9 });
  assert.equal(decideSignInSync(input), decideSignInSync(input));
});

// ── Real-time multi-device listener ───────────────────────────────────────────

function realtime(overrides) {
  return {
    isFirstSnapshot: false,
    msSinceLocalWrite: 60_000,
    localWriteGraceMs: LOCAL_WRITE_GRACE_MS,
    hasPendingLocalSave: false,
    snapshotExists: true,
    hasData: true,
    fingerprintsEqual: false,
    ...overrides,
  };
}

test('realtime: first snapshot is always ignored', () => {
  assert.equal(decideRealtimeSnapshot(realtime({ isFirstSnapshot: true })), 'ignore-first');
});

test('realtime: own write within the grace window is ignored', () => {
  assert.equal(decideRealtimeSnapshot(realtime({ msSinceLocalWrite: 1000 })), 'ignore-own-write');
});

test('scenario 5/6 — pending local save (debounced/offline) is not clobbered', () => {
  assert.equal(
    decideRealtimeSnapshot(realtime({ hasPendingLocalSave: true })),
    'ignore-pending-local',
  );
});

test('realtime: identical cloud data is ignored', () => {
  assert.equal(decideRealtimeSnapshot(realtime({ fingerprintsEqual: true })), 'ignore-identical');
});

test('realtime: missing/empty doc is ignored', () => {
  assert.equal(decideRealtimeSnapshot(realtime({ snapshotExists: false })), 'ignore-nonexistent');
  assert.equal(decideRealtimeSnapshot(realtime({ hasData: false })), 'ignore-nonexistent');
});

test('scenario 7 — genuine other-device update applies remote', () => {
  assert.equal(decideRealtimeSnapshot(realtime({ fingerprintsEqual: false })), 'apply-remote');
});

test('realtime guards take priority over apply-remote (order matters)', () => {
  // Even with differing data, an own-write/pending guard wins.
  assert.equal(
    decideRealtimeSnapshot(realtime({ msSinceLocalWrite: 10, fingerprintsEqual: false })),
    'ignore-own-write',
  );
});

// ── Debounced save echo-skip ──────────────────────────────────────────────────

test('cloud save: signed out → noop', () => {
  assert.equal(
    decideCloudSave({ signedIn: false, immediate: false, skipFirstSaveFlag: false }),
    'noop-signed-out',
  );
});

test('cloud save: first debounced save after cloud-apply is skipped (echo)', () => {
  assert.equal(
    decideCloudSave({ signedIn: true, immediate: false, skipFirstSaveFlag: true }),
    'skip-echo',
  );
});

test('cloud save: immediate uploads are never skipped, even with the flag set', () => {
  assert.equal(
    decideCloudSave({ signedIn: true, immediate: true, skipFirstSaveFlag: true }),
    'persist-immediate',
  );
});

test('scenario 5/6 — normal edits queue a debounced save', () => {
  assert.equal(
    decideCloudSave({ signedIn: true, immediate: false, skipFirstSaveFlag: false }),
    'queue-debounced',
  );
});
