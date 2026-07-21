// src/services/storage/migrate.ts
//
// Pure, versioned migration + validation for the persisted Shohoj state. Wraps
// the existing `sanitizeRestoredState` validator (the single source of truth for
// what a valid semester/course/plan looks like — not duplicated here) and stamps
// the explicit schema version. Requirements (Phase 2):
//   - Add a schema version and migrate legacy (un-versioned) state to it.
//   - Validate before accepting restored local OR cloud data.
//   - Never *silently* discard malformed data — surface a typed error for
//     unusable input, and report how many entries were dropped for usable input.

import { err, ok, type Result } from '../../core/result.ts';
import { ValidationError } from '../../core/errors.ts';
import { sanitizeRestoredState } from '../../core/helpers.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type StoredShohojStateV1,
  type StoredShohojStateV2,
} from '../../core/types/storage.ts';

export interface MigrationReport {
  readonly state: StoredShohojStateV2;
  /** Detected source schema version (1 = legacy un-versioned, 2 = current). */
  readonly fromVersion: 1 | 2;
  /** Semesters present in the input but rejected by validation (reported, not hidden). */
  readonly droppedSemesters: number;
}

/** Detect the schema version of an already-parsed stored value. */
export function detectStoredVersion(raw: unknown): 1 | 2 {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    (raw as { version?: unknown }).version === CURRENT_SCHEMA_VERSION
  ) {
    return CURRENT_SCHEMA_VERSION;
  }
  return 1;
}

function inputSemesterCount(raw: unknown): number {
  if (raw !== null && typeof raw === 'object') {
    const sems = (raw as { semesters?: unknown }).semesters;
    if (Array.isArray(sems)) return sems.length;
  }
  return 0;
}

/**
 * Validate + migrate an already-parsed stored value to the current schema.
 * Returns Err(ValidationError) when the input is fundamentally unusable (not an
 * object, or no valid `semesters` array) rather than silently producing empty
 * state — the caller can then preserve the backup and warn the user.
 */
export function migrateStoredState(raw: unknown): Result<MigrationReport, ValidationError> {
  const fromVersion = detectStoredVersion(raw);
  const before = inputSemesterCount(raw);

  const sanitized = sanitizeRestoredState(raw);
  if (sanitized === null) {
    return err(
      new ValidationError('Stored state is not a usable Shohoj snapshot', {
        userMessage: "Your saved data couldn't be read. A backup was kept.",
      }),
    );
  }

  // sanitizeRestoredState is the validation boundary: it normalises semesters,
  // courses, currentDept and planCourses to the V1 shape by construction. Assert
  // the validated shape once here, then stamp the version. (The only trusted cast
  // in the data layer.)
  const v1 = sanitized as unknown as StoredShohojStateV1;
  const state: StoredShohojStateV2 = { ...v1, version: CURRENT_SCHEMA_VERSION };

  const droppedSemesters = Math.max(0, before - state.semesters.length);
  return ok({ state, fromVersion, droppedSemesters });
}

/**
 * Parse a raw JSON string from storage/cloud, then validate + migrate it.
 * Distinguishes corrupt JSON (typed error) from a valid-but-empty slot
 * (Ok with `null`, meaning "no stored state" — not an error).
 */
export function parseAndMigrate(
  raw: string | null,
): Result<MigrationReport | null, ValidationError> {
  if (raw === null || raw === '') return ok(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      new ValidationError('Stored state is not valid JSON', {
        cause,
        userMessage: "Your saved data was corrupted and couldn't be read. A backup was kept.",
      }),
    );
  }

  return migrateStoredState(parsed);
}
