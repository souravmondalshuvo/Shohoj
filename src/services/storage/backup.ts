// src/services/storage/backup.ts
//
// One-time, non-destructive backup of the raw legacy state string before the
// first schema migration writes over `shohoj_cgpa_v1`. Requirement from
// Phase 2: "Keep a safe backup of the legacy local state before the first
// migration write." Pure aside from the injected store, so it is fully
// testable with MemoryKeyValueStore.

import { err, ok, type Result } from '../../core/result.ts';
import { StorageError } from '../../core/errors.ts';
import { LEGACY_BACKUP_KEY, STORAGE_KEY } from '../../core/types/storage.ts';
import type { KeyValueStore } from './keyValueStore.ts';

export interface BackupOutcome {
  /** True if a backup was written by this call. */
  readonly backedUp: boolean;
  /** Why no backup was written, when `backedUp` is false. */
  readonly reason?: 'already-exists' | 'nothing-to-back-up';
}

/**
 * Write a one-time backup of the current legacy state. Never overwrites an
 * existing backup (so the *oldest* pre-migration copy is preserved), and is a
 * no-op when there is nothing stored. Storage failures are surfaced as a typed
 * StorageError rather than thrown, so callers can decide whether to proceed.
 */
export function backupLegacyStateOnce(
  store: KeyValueStore,
  options: { sourceKey?: string; backupKey?: string } = {},
): Result<BackupOutcome, StorageError> {
  const sourceKey = options.sourceKey ?? STORAGE_KEY;
  const backupKey = options.backupKey ?? LEGACY_BACKUP_KEY;
  try {
    if (store.getItem(backupKey) !== null) {
      return ok({ backedUp: false, reason: 'already-exists' });
    }
    const raw = store.getItem(sourceKey);
    if (raw === null || raw === '') {
      return ok({ backedUp: false, reason: 'nothing-to-back-up' });
    }
    store.setItem(backupKey, raw);
    return ok({ backedUp: true });
  } catch (cause) {
    return err(new StorageError('Failed to back up legacy state', { cause }));
  }
}

/** Read back a previously-written legacy backup, if any. */
export function readLegacyBackup(
  store: KeyValueStore,
  backupKey: string = LEGACY_BACKUP_KEY,
): string | null {
  try {
    return store.getItem(backupKey);
  } catch {
    return null;
  }
}
