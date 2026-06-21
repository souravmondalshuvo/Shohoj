// src/services/storage/syncDecision.ts
//
// Pure extraction of Shohoj's cloud-sync conflict-resolution rules from
// js/auth/firebase.js. The legacy logic is tangled with Firebase I/O and DOM
// modals, so it has never been unit-testable. These functions reproduce the
// *decisions* faithfully (line citations below) with no Firebase/DOM/storage
// dependency, so every conflict scenario can be tested. Phase 5G/6 wires the
// Firebase service to call these instead of inlining the branches.
//
// IMPORTANT: this preserves the *existing* behavior exactly. Conflicts are
// resolved by fingerprint + an explicit user choice (the migration modal), NOT
// by an automatic "newest timestamp wins" rule. Signing in never overwrites
// differing local data with cloud data without asking the user.

// ── Sign-in decision (firebase.js initAuth → onAuthStateChanged, L738–L799) ───

export interface SignInSyncInput {
  readonly hasLocal: boolean;
  readonly hasCloud: boolean;
  readonly localSemesterCount: number;
  readonly cloudSemesterCount: number;
  /** sessionStorage `shohoj_cloud_applied` was set (cloud was just applied). */
  readonly cloudAppliedFlag: boolean;
  /** Whether local and cloud carry identical data (ignoring sync metadata). */
  readonly fingerprintsEqual: boolean;
}

export type SignInSyncAction =
  | 'mark-synced-empty' // L745: neither local nor cloud exists
  | 'apply-cloud' // L749 / L773 / L797: adopt cloud (applyCloudData)
  | 'upload-local' // L750 / L792: push local to cloud immediately
  | 'skip-echo' // L763: just applied cloud → arm shohoj_skip_first_save
  | 'mark-synced-equal' // L779: identical data → mark applied, do NOT arm skip
  | 'prompt-migration'; // L788: both exist and differ → ask the user

export function decideSignInSync(input: SignInSyncInput): SignInSyncAction {
  const { hasLocal, hasCloud } = input;

  if (!hasLocal && !hasCloud) return 'mark-synced-empty'; // L745
  if (!hasLocal && hasCloud) return 'apply-cloud'; // L749
  if (hasLocal && !hasCloud) return 'upload-local'; // L750

  // Both local and cloud exist (L762+).
  if (input.cloudAppliedFlag) return 'skip-echo'; // L763–L767
  if (input.localSemesterCount === 0) return 'apply-cloud'; // L772–L774
  if (input.fingerprintsEqual) return 'mark-synced-equal'; // L779–L786
  return 'prompt-migration'; // L788
}

// ── Migration-modal follow-up (firebase.js L788–L798) ─────────────────────────

export type MigrationChoice = 'local' | 'cloud';
export type MigrationResolution = 'upload-local' | 'apply-cloud';

export function resolveMigrationChoice(choice: MigrationChoice): MigrationResolution {
  return choice === 'local' ? 'upload-local' : 'apply-cloud'; // L790 / L797
}

// ── Real-time listener (firebase.js startRealtimeSync, L189–L237) ─────────────

export interface RealtimeSnapshotInput {
  /** First snapshot after subscribing is always the current state. */
  readonly isFirstSnapshot: boolean;
  /** Date.now() − _localWriteAt. */
  readonly msSinceLocalWrite: number;
  /** LOCAL_WRITE_GRACE_MS (5000). */
  readonly localWriteGraceMs: number;
  /** A debounced local save is queued (_cloudSaveTimer || _queuedCloudSnap). */
  readonly hasPendingLocalSave: boolean;
  readonly snapshotExists: boolean;
  readonly hasData: boolean;
  readonly fingerprintsEqual: boolean;
}

export type RealtimeSnapshotAction =
  | 'ignore-first' // L191: skip the initial snapshot
  | 'ignore-own-write' // L198: within the local-write grace window
  | 'ignore-pending-local' // L207: local is ahead of cloud, don't clobber
  | 'ignore-nonexistent' // L212–L214: doc missing or empty
  | 'ignore-identical' // L223: same data as local
  | 'apply-remote'; // L229–L233: genuine other-device update → write local + reload

export function decideRealtimeSnapshot(input: RealtimeSnapshotInput): RealtimeSnapshotAction {
  if (input.isFirstSnapshot) return 'ignore-first'; // L191
  if (input.msSinceLocalWrite < input.localWriteGraceMs) return 'ignore-own-write'; // L198
  if (input.hasPendingLocalSave) return 'ignore-pending-local'; // L207
  if (!input.snapshotExists || !input.hasData) return 'ignore-nonexistent'; // L212–L214
  if (input.fingerprintsEqual) return 'ignore-identical'; // L223
  return 'apply-remote'; // L229
}

// ── Debounced save echo-skip (firebase.js saveToCloud, L112–L165) ─────────────

export interface CloudSaveInput {
  readonly signedIn: boolean;
  readonly immediate: boolean;
  /** sessionStorage `shohoj_skip_first_save` was set by a prior cloud apply. */
  readonly skipFirstSaveFlag: boolean;
}

export type CloudSaveAction =
  | 'noop-signed-out' // L113
  | 'skip-echo' // L124: consume skip_first_save and skip the echo-back write
  | 'persist-immediate' // L132: explicit immediate upload
  | 'queue-debounced'; // L144: normal 700ms-debounced save

export function decideCloudSave(input: CloudSaveInput): CloudSaveAction {
  if (!input.signedIn) return 'noop-signed-out'; // L113
  // immediate=true uploads are never skipped (L121).
  if (!input.immediate && input.skipFirstSaveFlag) return 'skip-echo'; // L121–L129
  if (input.immediate) return 'persist-immediate'; // L132
  return 'queue-debounced'; // L144
}
