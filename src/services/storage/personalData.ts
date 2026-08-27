// src/services/storage/personalData.ts
//
// The shell's copy of what Shohoj keeps on a student's device, and the wipe
// sign-out runs over it (#627).
//
// Legacy's copy is js/core/personalData.js — it has to be a copy, because
// build3.py concatenates plain JS and cannot pull in TypeScript. A copy nothing
// checks is a copy that goes stale, and stale here is not cosmetic: a key added
// on one side keeps leaking on the other. tests/personalDataDrift.test.js
// asserts the two lists agree, key for key, in order.

import { STORAGE_KEY } from '../cloudSync/cloudSyncEngine.ts';
import { MY_REVIEWS_KEY } from '../../features/calculator/myReviewsReceipt.ts';
import type { KeyValueStore } from './keyValueStore.ts';

// src/core/seatWatch.ts owns this key, but its module graph reaches
// extensionless imports that node's type stripping cannot resolve, and this
// list has to stay importable from a plain node test. Spelled out here instead;
// tests/personalDataDrift.test.js reads seatWatch.ts and fails if the two ever
// say different things.
const SEAT_WATCH_KEY = 'shohoj_seat_watch_v1';

/** localStorage keys holding data that belongs to the person using the browser. */
export const PERSONAL_LOCAL_KEYS: readonly string[] = [
  STORAGE_KEY, // semesters, courses, grades, the plan
  'shohoj_routine_v1', // class routine — device-only, no cloud copy
  MY_REVIEWS_KEY, // the record of reviews this student wrote
  SEAT_WATCH_KEY, // seat watchlist
  'shohoj_seat_alerts_enabled', // seat-alert opt-in
  'shohoj_connect_profile_v1', // their CONNECT profile snapshot
];

// Deliberately absent: shohoj_connect_feed_v1 and shohoj_routine_ratings_v1
// cache the public CONNECT feed and the aggregate faculty-rating map — the same
// bytes for every student, so they identify nobody and dropping them would only
// buy a refetch. shohoj_pdfjs_preview is a developer flag.

/** Sync bookkeeping — meaningless once the data it describes is gone. */
export const SYNC_LOCAL_KEYS: readonly string[] = ['shohoj_last_sync', 'shohoj_session_start'];

/** Display preferences. Personal in no useful sense; a sign-out leaves them be. */
export const PREFERENCE_LOCAL_KEYS: readonly string[] = ['shohoj_theme'];

// shohoj_calc_unlocked is the campus gate's per-tab unlock. It has to go with
// the data: left set, it walks the next person in this tab straight past the gate.
export const PERSONAL_SESSION_KEYS: readonly string[] = [
  'shohoj_active_tab',
  'shohoj_cloud_applied',
  'shohoj_skip_first_save',
  'shohoj_calc_unlocked',
];

// Removals go one key at a time: a store can refuse mid-wipe (private mode,
// storage disabled) and a wipe that stops halfway is worse than one that skips
// what it cannot reach.
function removeAll(store: KeyValueStore, keys: readonly string[]): void {
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      /* storage refused this key — keep going */
    }
  }
}

/** Sign-out's wipe: the student's data goes, their theme stays. */
export function clearPersonalData(local: KeyValueStore, session: KeyValueStore): void {
  removeAll(local, PERSONAL_LOCAL_KEYS);
  removeAll(local, SYNC_LOCAL_KEYS);
  removeAll(session, PERSONAL_SESSION_KEYS);
}
