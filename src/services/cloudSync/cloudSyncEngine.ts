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
import { applyPersonalSlices } from '../storage/personalData.ts';
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

interface SyncSession {
  readonly uid: string;
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

  // A new object invalidates every continuation, including a sign-out/sign-in
  // to the same UID. A UID check alone cannot distinguish those sessions.
  let session: SyncSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedSnapshot: string | null = null;
  let remoteApplyTimer: ReturnType<typeof setTimeout> | null = null;
  let localWriteAt = 0;
  let activeSave: Promise<boolean> = Promise.resolve(true);

  const isCurrent = (activeSession: SyncSession) => session === activeSession;

  const hasPendingLocalSave = () => saveTimer !== null || queuedSnapshot !== null;

  const clearQueued = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    queuedSnapshot = null;
  };

  const cancelSession = () => {
    session = null;
    unsubscribe?.();
    unsubscribe = null;
    clearQueued();
    if (remoteApplyTimer !== null) clearTimeout(remoteApplyTimer);
    remoteApplyTimer = null;
    localWriteAt = 0;
    // In-flight I/O cannot be cancelled, but it must neither block the next
    // account's saves nor mutate its bookkeeping when it eventually settles.
    activeSave = Promise.resolve(true);
  };

  // persistCloudState parity: offline skips the write (data stays local), the
  // own-write clock arms before the write and resets on failure.
  const persist = async (snapshotJson: string, activeSession: SyncSession): Promise<boolean> => {
    if (!isCurrent(activeSession)) return false;
    if (!ports.isOnline()) return false;
    localWriteAt = ports.now();
    try {
      await ports.repo.save(activeSession.uid, snapshotJson);
      if (!isCurrent(activeSession)) return false;
      ports.local.setItem(LAST_SYNC_KEY, String(ports.now()));
      return true;
    } catch {
      if (!isCurrent(activeSession)) return false;
      localWriteAt = 0;
      ports.notify('error', SAVE_FAILED_MESSAGE);
      return false;
    }
  };

  const persistSerial = (snapshotJson: string, activeSession: SyncSession): Promise<boolean> => {
    if (!isCurrent(activeSession)) return Promise.resolve(false);
    activeSave = activeSave.then(() => persist(snapshotJson, activeSession));
    return activeSave;
  };

  // startRealtimeSync parity, decisions via decideRealtimeSnapshot.
  const subscribeRealtime = (activeSession: SyncSession) => {
    if (!isCurrent(activeSession)) return;
    unsubscribe?.();
    let isFirstSnapshot = true;
    unsubscribe = ports.repo.subscribe(activeSession.uid, (data, exists) => {
      // Unsubscribing does not retract an already queued callback.
      if (!isCurrent(activeSession)) return;
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
      // The routine, watchlist, review receipt and profile travel in the same
      // doc; fan them out to their own keys before applyRemote reloads, or the
      // routes that read those keys boot on the other device's copy (#627).
      applyPersonalSlices(ports.local, parseStoredState(data), activeSession.uid);
      ports.notify('info', REMOTE_UPDATE_MESSAGE);
      if (remoteApplyTimer !== null) clearTimeout(remoteApplyTimer);
      remoteApplyTimer = setTimeout(() => {
        if (!isCurrent(activeSession)) return;
        remoteApplyTimer = null;
        ports.applyRemote();
      }, remoteApplyDelayMs);
    });
  };

  // applyCloudData parity: flags, local write, then reload (the legacy
  // pre-boot fallback; the shell's routes rebuild from storage on boot).
  const adoptCloud = (cloudParsed: unknown, activeSession: SyncSession) => {
    if (!isCurrent(activeSession)) return;
    ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
    ports.session.setItem(SKIP_FIRST_SAVE_FLAG, '1');
    ports.local.setItem(STORAGE_KEY, JSON.stringify(cloudParsed));
    // Same fan-out as the realtime path — this is the sign-in branch where the
    // cloud copy wins, so it is the one that has to restore a new device.
    applyPersonalSlices(ports.local, cloudParsed, activeSession.uid);
    ports.applyRemote();
  };

  const runSignInFlow = async (activeSession: SyncSession) => {
    const cloudRaw = await ports.repo.load(activeSession.uid);
    if (!isCurrent(activeSession)) return;
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
        adoptCloud(cloudParsed, activeSession);
        return; // reloading — no listener this page
      case 'upload-local': {
        const saved = await persistSerial(JSON.stringify(localParsed), activeSession);
        if (!isCurrent(activeSession)) return;
        if (!saved) break;
        ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
        ports.notify('success', UPLOADED_MESSAGE);
        break;
      }
      case 'prompt-migration': {
        const choice = await ports.promptMigration(
          semesterCount(localParsed),
          semesterCount(cloudParsed),
        );
        if (!isCurrent(activeSession)) return;
        if (resolveMigrationChoice(choice) === 'upload-local') {
          const saved = await persistSerial(JSON.stringify(localParsed), activeSession);
          if (!isCurrent(activeSession)) return;
          if (!saved) break;
          ports.session.setItem(CLOUD_APPLIED_FLAG, '1');
          ports.notify('success', MIGRATED_LOCAL_MESSAGE);
        } else {
          adoptCloud(cloudParsed, activeSession);
          return; // reloading
        }
        break;
      }
    }
    subscribeRealtime(activeSession);
  };

  return {
    async start(nextUid) {
      const replacingSession = session !== null;
      cancelSession();
      // Preserve the initial reload flags, but do not inherit another active
      // session's echo flags when start is called directly for a new account.
      if (replacingSession) {
        ports.session.removeItem(CLOUD_APPLIED_FLAG);
        ports.session.removeItem(SKIP_FIRST_SAVE_FLAG);
      }
      const activeSession: SyncSession = { uid: nextUid };
      session = activeSession;
      await runSignInFlow(activeSession);
    },
    stop() {
      cancelSession();
      ports.session.removeItem(CLOUD_APPLIED_FLAG);
      ports.session.removeItem(SKIP_FIRST_SAVE_FLAG);
    },
    queueSave(snapshotJson) {
      const activeSession = session;
      if (activeSession === null) return;
      const action = decideCloudSave({
        signedIn: true,
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
        if (!isCurrent(activeSession)) return;
        const snapshot = queuedSnapshot;
        clearQueued();
        if (snapshot !== null) void persistSerial(snapshot, activeSession);
      }, debounceMs);
    },
    async saveNow(snapshotJson) {
      const activeSession = session;
      if (activeSession === null) return false;
      const action = decideCloudSave({
        signedIn: true,
        immediate: true,
        skipFirstSaveFlag: false,
      });
      if (action === 'noop-signed-out') return false;
      clearQueued();
      return persistSerial(snapshotJson, activeSession);
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
      const activeSession = session;
      if (activeSession === null) return false;
      const localRaw = ports.local.getItem(STORAGE_KEY);
      if (localRaw === null) return true; // nothing here to lose
      // Present but unreadable is not the same as absent: a snapshot truncated
      // by a quota error is still the only copy of something, and calling it
      // backed up would erase it under the reassuring half of the dialog.
      if (parseStoredState(localRaw) === null) return false;

      const pending = queuedSnapshot;
      if (pending !== null) {
        clearQueued();
        await persistSerial(pending, activeSession);
        if (!isCurrent(activeSession)) return false;
      }
      // Let an in-flight write settle, but do not read its result: a failed
      // save whose content the account already holds is not a reason to warn.
      // The fingerprint below is the only authority on what is actually there.
      await activeSave.catch(() => false);
      if (!isCurrent(activeSession) || !ports.isOnline()) return false;

      const cloudRaw = await ports.repo.load(activeSession.uid);
      if (!isCurrent(activeSession) || cloudRaw === null) return false;
      return getDataFingerprint(localRaw ?? '') === getDataFingerprint(cloudRaw);
    },
  };
}
