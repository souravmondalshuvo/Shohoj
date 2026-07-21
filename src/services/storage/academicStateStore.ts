// src/services/storage/academicStateStore.ts
//
// The safe seam between the app and persisted academic state (Phase 4). Composes
// the existing pieces — one-time backup, versioned parse+migrate, validation —
// into the load/save the UI calls, and encodes the safety policy that protects
// users' CGPA/transcript data:
//
//   loadAcademicState:
//     1. Back up the raw legacy string ONCE before anything (recoverable).
//     2. Parse + validate + migrate.
//     3. corrupt/unusable  -> 'corrupt': return empty state to keep the app
//        usable, but NEVER overwrite the stored raw (backup + original kept).
//     4. valid             -> 'loaded' (migrated in memory; persisted only on
//        the next explicit save — load never writes user data).
//     5. empty slot        -> 'empty'.
//
//   saveAcademicState: stamp the current schema version and write. The only
//   path that overwrites stored state, and only with app-produced state.
//
// Pure aside from the injected KeyValueStore — fully testable with
// MemoryKeyValueStore; no direct localStorage/DOM access here.

import { err, ok, type Result } from '../../core/result.ts';
import { StorageError, type ValidationError } from '../../core/errors.ts';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  type StoredShohojStateV1,
  type StoredShohojStateV2,
} from '../../core/types/storage.ts';
import { backupLegacyStateOnce } from './backup.ts';
import { parseAndMigrate } from './migrate.ts';
import type { KeyValueStore } from './keyValueStore.ts';

export type LoadStatus = 'loaded' | 'empty' | 'corrupt';

export interface LoadResult {
  readonly status: LoadStatus;
  /** Migrated state for 'loaded'; null for 'empty'/'corrupt'. */
  readonly state: StoredShohojStateV2 | null;
  /** Source schema version when 'loaded'. */
  readonly fromVersion?: 1 | 2;
  /** Validated semesters dropped during migration (reported, not hidden). */
  readonly droppedSemesters?: number;
  /** Typed reason when 'corrupt' (safe userMessage included). */
  readonly error?: ValidationError;
  /** True when a one-time pre-migration backup was written by this load. */
  readonly backedUp: boolean;
}

/**
 * Load academic state safely. Always takes a one-time backup first; never writes
 * or clears the stored slot, even on corruption — the corrupt raw and its backup
 * are preserved so the user can recover rather than losing data.
 */
export function loadAcademicState(store: KeyValueStore, key: string = STORAGE_KEY): LoadResult {
  const backup = backupLegacyStateOnce(store, { sourceKey: key });
  const backedUp = backup.ok && backup.value.backedUp;

  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch (cause) {
    // Can't even read — treat as corrupt-but-untouched; don't throw.
    return {
      status: 'corrupt',
      state: null,
      backedUp,
      error: new StorageError('Could not read stored state', {
        cause,
      }) as unknown as ValidationError,
    };
  }

  const migrated = parseAndMigrate(raw);
  if (!migrated.ok) {
    // Corrupt/unusable: keep the raw exactly as-is (already backed up above).
    return { status: 'corrupt', state: null, backedUp, error: migrated.error };
  }
  if (migrated.value === null) {
    return { status: 'empty', state: null, backedUp };
  }

  const { state, fromVersion, droppedSemesters } = migrated.value;
  return { status: 'loaded', state, fromVersion, droppedSemesters, backedUp };
}

/**
 * Persist academic state, stamping the current schema version. The single write
 * path; storage failures surface as a typed StorageError instead of throwing.
 */
export function saveAcademicState(
  store: KeyValueStore,
  // Accepts state with or without an explicit version (V2 extends V1); the
  // version is (re)stamped below, mirroring migrate.ts.
  state: StoredShohojStateV1,
  key: string = STORAGE_KEY,
): Result<void, StorageError> {
  const versioned: StoredShohojStateV2 = { ...state, version: CURRENT_SCHEMA_VERSION };
  try {
    store.setItem(key, JSON.stringify(versioned));
    return ok(undefined);
  } catch (cause) {
    return err(new StorageError('Could not save your data locally', { cause }));
  }
}
