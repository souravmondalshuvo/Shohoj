// src/core/types/storage.ts
//
// Versioned schema for the locally-persisted Shohoj state (localStorage key
// `shohoj_cgpa_v1`) and its Firestore mirror (`users/{uid}.data`, stored as a
// JSON string). See docs/FULL_REACT_TYPESCRIPT_MIGRATION.md §6.
//
// V1 is the *current* on-disk shape — it has NO explicit version field (the
// "v1" lives only in the storage key name). V2 adds an explicit `version` field
// so future migrations are detectable. The shape is otherwise preserved exactly;
// this is a versioning wrapper, not a data redesign (changing the semester/course
// shape would risk the parity-tested academic core).

import type { SemesterEntry } from '../types';

/**
 * The current persisted snapshot, as written by `saveState()` in
 * js/core/state.js. Unknown top-level keys are intentionally allowed through
 * (the index signature) so a forward-compatible field written by a newer client
 * is never silently dropped on an older one.
 */
export interface StoredShohojStateV1 {
  currentDept?: string;
  semesterCounter?: number;
  semesters: SemesterEntry[];
  /** Start-of-degree season label (e.g. "Spring"); opaque string today. */
  startSeason?: string;
  /** Start-of-degree year (e.g. "2022"); opaque string today. */
  startYear?: string;
  /** Planner course codes (validated against the course-code regex). */
  planCourses?: string[];
  [key: string]: unknown;
}

export const CURRENT_SCHEMA_VERSION = 2 as const;

/** The target schema: V1 plus an explicit, detectable `version`. */
export interface StoredShohojStateV2 extends StoredShohojStateV1 {
  version: typeof CURRENT_SCHEMA_VERSION;
}

export type AnyStoredState = StoredShohojStateV1 | StoredShohojStateV2;

/** localStorage key holding the live state (unchanged from legacy). */
export const STORAGE_KEY = 'shohoj_cgpa_v1';

/**
 * One-time pre-migration backup of the raw legacy string, written before the
 * first V2 write so a botched migration is always recoverable.
 */
export const LEGACY_BACKUP_KEY = 'shohoj_cgpa_backup_v1';
