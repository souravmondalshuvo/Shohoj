// src/services/cloudSync/cloudSyncEngine.ts
//
// The cloud-sync orchestrator for the shell (#333): the I/O half of
// js/auth/firebase.js's sync flow, driven entirely by the pure decision
// functions in syncDecision.ts (which cite the legacy lines) — this module
// adds only the bookkeeping those decisions need (debounce/queue, the
// own-write grace clock, the session flags) and executes the chosen actions
// through injected ports. Nothing here invents policy: conflicts resolve by
// fingerprint + the user's explicit migration choice, never newest-wins.
//
// Ports: the user-doc repo, the local + session key/value stores, the forced
// -choice migration prompt, a notifier (legacy toast copy), applyRemote
// (write-then-reload — the legacy pre-boot fallback path; the shell's routes
// re-load state on boot), and clock/online probes. All injectable, so every
// legacy scenario runs against fakes.

import type { KeyValueStore } from '../storage/keyValueStore.ts';
import {
  decideCloudSave,
  decideRealtimeSnapshot,
  decideSignInSync,
  resolveMigrationChoice,
  type MigrationChoice,
} from '../storage/syncDecision.ts';
import { getDataFingerprint, parseStoredState } from '../storage/userSync.ts';
import type { UserDocRepo } from '../../platform/firebase/userDocRepo.ts';

export const STORAGE_KEY = 'shohoj_cgpa_v1';
export const LAST_SYNC_KEY = 'shohoj_last_sync';
export const CLOUD_APPLIED_FLAG = 'shohoj_cloud_applied';
export const SKIP_FIRST_SAVE_FLAG = 'shohoj_skip_first_save';

export const CLOUD_SAVE_DEBOUNCE_MS = 700;
export const LOCAL_WRITE_GRACE_MS = 5000;
export const REMOTE_APPLY_DELAY_MS = 1500;

export const UPLOADED_MESSAGE = 'Data uploaded to your cloud account ✓';
export const MIGRATED_LOCAL_MESSAGE = 'Local data saved to cloud ✓';
export const REMOTE_UPDATE_MESSAGE = '📡 Data updated from another device — reloading…';
export const SAVE_FAILED_MESSAGE = '⚠ Cloud save failed — data saved locally';

export interface CloudSyncPorts {
  readonly repo: UserDocRepo;
  /** The store holding shohoj_cgpa_v1 (localStorage in the shell). */
  readonly local: KeyValueStore;
  /** Session-scoped flags (sessionStorage in the shell). */
  readonly session: KeyValueStore;
  /** The forced-choice migration modal (no dismiss — legacy parity). */
  promptMigration(localSemesters: number, cloudSemesters: number): Promise<MigrationChoice>;
  notify(kind: 'success' | 'error' | 'info', message: string): void;
  /** Apply an adopted cloud snapshot: the store is already written; reload. */
  applyRemote(): void;
  isOnline(): boolean;
  now(): number;
  /** Test seams; production uses the legacy constants. */
  readonly debounceMs?: number;
  readonly graceMs?: number;
  readonly remoteApplyDelayMs?: number;
}

export interface CloudSyncEngine {
  /** Run the sign-in sync flow for `uid`, then keep the realtime listener. */
  start(uid: string): Promise<void>;
  /** Signed-out cleanup: listener, queued saves, the session applied-flag. */
  stop(): void;
  /** A local save happened — queue the debounced cloud write (legacy path). */
  queueSave(snapshotJson: string): void;
  /** Immediate upload (sign-in flows); resolves false when skipped/offline. */
  saveNow(snapshotJson: string): Promise<boolean>;
  /** Does the account hold what this device holds? Gates the sign-out wipe (#627). */
  isCloudCurrent(): Promise<boolean>;
}

interface SemesterishSnapshot {
  semesters?: unknown[];
}

function semesterCount(parsed: unknown): number {
  const semesters = (parsed as SemesterishSnapshot | null)?.semesters;
  return Array.isArray(semesters) ? semesters.length : 0;
}

export function createCloudSyncEngine(ports: CloudSyncPorts): CloudSyncEngine {
  const debounceMs = ports.debounceMs ?? CLOUD_SAVE_DEBOUNCE_MS;
  const graceMs = ports.graceMs ?? LOCAL_WRITE_GRACE_MS;
  const remoteApplyDelayMs = ports.remoteApplyDelayMs ?? REMOTE_APPLY_DELAY_MS;

  let uid: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedSnapshot: string | null = null;
  let localWriteAt = 0;
  let activeSave: Promise<boolean> = Promise.resolve(true);

  const hasPendingLocalSave = () => saveTimer !== null || queuedSnapshot !== null;

  const clearQueued = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    queuedSnapshot = null;
  };

  // persistCloudState parity: offline skips the write (data stays local), the
  // own-write clock arms before the write and resets on failure.
  const persist = async (snapshotJson: string): Promise<boolean> => {
    if (uid === null) return false;
    if (!ports.isOnline()) return false;
    localWriteAt = ports.now();
    try {
      await ports.repo.save(uid, snapshotJson);
      ports.local.setItem(LAST_SYNC_KEY, String(ports.now()));
      return true;
    } catch {
      localWriteAt = 0;
      ports.notify('error', SAVE_FAILED_MESSAGE);
      return false;
    }
  };

  const persistSerial = (snapshotJson: string): Promise<boolean> => {
    activeSave = activeSave.then(() => persist(snapshotJson));
    return activeSave;
  };

  // startRealtimeSync parity, decisions via decideRealtimeSnapshot.
  const subscribeRealtime = (activeUid: string) => {
    unsubscribe?.();
    let isFirstSnapshot = true;
    unsubscribe = ports.repo.subscribe(activeUid, (data, exists) => {
      const action = decideRealtimeSnapshot({
        isFirstSnapshot,
        msSinceLocalWrite: ports.now() - localWriteAt,
        localWriteGraceMs: graceMs,
        hasPendingLocalSave: hasPendingLocalSave(),
        snapshotExists: exists,
        hasData: data !== null,
        fingerprintsEqual:
          data !== null &&
          getDataFingerprint(ports.local.getItem(STORAGE_KEY) ?? '') === getDataFingerprint(data),
      });
      isFirstSnapshot = false;
      if (action !== 'apply-remote' || data === null) return;

      ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
      ports.local.setItem(STORAGE_KEY, data);
      ports.notify('info', REMOTE_UPDATE_MESSAGE);
      setTimeout(() => ports.applyRemote(), remoteApplyDelayMs);
    });
  };

  // applyCloudData parity: flags, local write, then reload (the legacy
  // pre-boot fallback; the shell's routes rebuild from storage on boot).
  const adoptCloud = (cloudParsed: unknown) => {
    ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
    ports.session.setItem(SKIP_FIRST_SAVE_FLAG, '1');
    ports.local.setItem(STORAGE_KEY, JSON.stringify(cloudParsed));
    ports.applyRemote();
  };

  const runSignInFlow = async (activeUid: string) => {
    const cloudRaw = await ports.repo.load(activeUid);
    const cloudParsed = parseStoredState(cloudRaw);
    const localRaw = ports.local.getItem(STORAGE_KEY);
    const localParsed = parseStoredState(localRaw);

    const action = decideSignInSync({
      hasLocal: localParsed !== null,
      hasCloud: cloudParsed !== null,
      localSemesterCount: semesterCount(localParsed),
      cloudSemesterCount: semesterCount(cloudParsed),
      cloudAppliedFlag: ports.session.getItem(CLOUD_APPLIED_FLAG) !== null,
      // Legacy compares fingerprint(localRaw) to fingerprint(stringify(cloudData)).
      fingerprintsEqual:
        getDataFingerprint(localRaw ?? '') === getDataFingerprint(JSON.stringify(cloudParsed)),
    });

    switch (action) {
      case 'mark-synced-empty':
      case 'mark-synced-equal':
        ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
        break;
      case 'skip-echo':
        ports.session.setItem(SKIP_FIRST_SAVE_FLAG, '1');
        break;
      case 'apply-cloud':
        adoptCloud(cloudParsed);
        return; // reloading — no listener this page
      case 'upload-local': {
        await persistSerial(JSON.stringify(localParsed));
        ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
        ports.notify('success', UPLOADED_MESSAGE);
        break;
      }
      case 'prompt-migration': {
        const choice = await ports.promptMigration(
          semesterCount(localParsed),
          semesterCount(cloudParsed),
        );
        if (resolveMigrationChoice(choice) === 'upload-local') {
          await persistSerial(JSON.stringify(localParsed));
          ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
          ports.notify('success', MIGRATED_LOCAL_MESSAGE);
        } else {
          adoptCloud(cloudParsed);
          return; // reloading
        }
        break;
      }
    }
    subscribeRealtime(activeUid);
  };

  return {
    async start(nextUid) {
      uid = nextUid;
      await runSignInFlow(nextUid);
    },
    stop() {
      // Legacy signed-out cleanup: listener, queued saves, the applied flag.
      uid = null;
      unsubscribe?.();
      unsubscribe = null;
      clearQueued();
      ports.session.removeItem(CLOUD_APPLIED_FLAG);
    },
    queueSave(snapshotJson) {
      const action = decideCloudSave({
        signedIn: uid !== null,
        immediate: false,
        skipFirstSaveFlag: ports.session.getItem(SKIP_FIRST_SAVE_FLAG) !== null,
      });
      if (action === 'noop-signed-out') return;
      if (action === 'skip-echo') {
        ports.session.removeItem(SKIP_FIRST_SAVE_FLAG);
        return;
      }
      queuedSnapshot = snapshotJson;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const snapshot = queuedSnapshot;
        clearQueued();
        if (snapshot !== null) void persistSerial(snapshot);
      }, debounceMs);
    },
    async saveNow(snapshotJson) {
      const action = decideCloudSave({
        signedIn: uid !== null,
        immediate: true,
        skipFirstSaveFlag: false,
      });
      if (action === 'noop-signed-out') return false;
      clearQueued();
      return persistSerial(snapshotJson);
    },
    // Sign-out erases the device, so it first has to know the account is not
    // about to become the only copy of something older than what is on screen.
    //
    // The debounced save is pushed through first — the last seconds of typing
    // deserve their chance — and the answer then comes from a fingerprint
    // compare, the same content compare the realtime listener uses, because
    // shohoj_last_sync only records that a write was attempted. Every
    // uncertainty (offline, an unreadable doc, a save that never landed)
    // answers false, which the caller turns into a warning, never a quiet erase.
    async isCloudCurrent() {
      if (uid === null) return false;
      const localRaw = ports.local.getItem(STORAGE_KEY);
      if (localRaw === null) return true; // nothing here to lose
      // Present but unreadable is not the same as absent: a snapshot truncated
      // by a quota error is still the only copy of something, and calling it
      // backed up would erase it under the reassuring half of the dialog.
      if (parseStoredState(localRaw) === null) return false;

      const pending = queuedSnapshot;
      if (pending !== null) {
        clearQueued();
        await persistSerial(pending);
      }
      // Let an in-flight write settle, but do not read its result: a failed
      // save whose content the account already holds is not a reason to warn.
      // The fingerprint below is the only authority on what is actually there.
      await activeSave.catch(() => false);
      if (!ports.isOnline()) return false;

      const cloudRaw = await ports.repo.load(uid);
      if (cloudRaw === null) return false;
      return getDataFingerprint(localRaw ?? '') === getDataFingerprint(cloudRaw);
    },
  };
}
