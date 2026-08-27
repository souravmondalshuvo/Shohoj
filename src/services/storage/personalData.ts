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

// Both from the schema module rather than cloudSync/cloudSyncEngine.ts, which
// re-exports STORAGE_KEY: the engine imports this file to fan an adopted
// snapshot out, and taking the constant from there would close a cycle that
// dies in the temporal dead zone at module init.
import { LEGACY_BACKUP_KEY, STORAGE_KEY } from '../../core/types/storage.ts';
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
  LEGACY_BACKUP_KEY, // the pre-migration copy of all of it
  'shohoj_routine_v1', // class routine (legacy)
  'shohoj_routine_picks_v1', // class routine (shell — a different key)
  MY_REVIEWS_KEY, // the record of reviews this student wrote
  SEAT_WATCH_KEY, // seat watchlist
  'shohoj_seat_alerts_enabled', // seat-alert opt-in
  'shohoj_connect_profile_v1', // their CONNECT profile snapshot
];

// The two routine keys are not a typo. RoutineRoute writes
// shohoj_routine_picks_v1 and legacy's routineTab.js writes shohoj_routine_v1;
// both builds share an origin, so a student who has used either leaves that key
// behind. LEGACY_BACKUP_KEY is backupLegacyStateOnce's verbatim copy of the
// whole snapshot, which made the wipe cosmetic while it stayed (#627).

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

// ── Devices the old sign-out already left dirty ──────────────────────────────
// Before #627, signing out ended the Firebase session and left everything in
// localStorage. Those devices are still out there, and the wipe below cannot
// help them: it runs at sign-out, and nobody signs out twice.
//
// They are identifiable, though. The old sign-out removed `shohoj_session_start`
// but left `shohoj_last_sync` behind, so a device carrying last-sync WITHOUT a
// session start was signed in once and signed out under the old code. A visitor
// who never signed in has neither, which keeps this off the local-first path
// that has always been Shohoj's default — their data is not ours to delete.
//
// A live session has BOTH — on the LEGACY build, which writes session start at
// sign-in (js/auth/firebase.js) and keeps it across reloads.
//
// !! The shell does NOT write `shohoj_session_start` at all. Nothing in src/
// sets it, so a signed-in shell student has last-sync with no session start and
// matches this predicate exactly like an abandoned device does. That is why the
// shell calls this only from a path where auth has ALREADY resolved to signed
// out — never at boot, where it would wipe live sessions on every load. An
// e2e caught precisely that (e2e-shell/sign-out-clears-device.spec.js).
//
// Wiring this into the shell's boot means first making the shell write
// `shohoj_session_start` on sign-in, and reckoning with every student who is
// already signed in without one.
export function hasStaleSignedOutData(local: KeyValueStore): boolean {
  try {
    return (
      local.getItem('shohoj_last_sync') !== null && local.getItem('shohoj_session_start') === null
    );
  } catch {
    return false; // storage unreachable — nothing to read, nothing to clear
  }
}

/** Clear a pre-#627 leftover. True only once the residue is provably gone.
 *
 * The return value gates the caller's reload, and it is checked rather than
 * assumed: a store that refuses removeItem would otherwise leave the residue in
 * place, keep this predicate true, and reload the page forever.
 */
export function clearStaleSignedOutData(local: KeyValueStore, session: KeyValueStore): boolean {
  if (!hasStaleSignedOutData(local)) return false;
  clearPersonalData(local, session);
  return !hasStaleSignedOutData(local);
}

/** Sign-out's wipe: the student's data goes, their theme stays. */
export function clearPersonalData(local: KeyValueStore, session: KeyValueStore): void {
  removeAll(local, PERSONAL_LOCAL_KEYS);
  removeAll(local, SYNC_LOCAL_KEYS);
  removeAll(session, PERSONAL_SESSION_KEYS);
}

// ── Cross-device slices ──────────────────────────────────────────────────────
// The shell's half of the same contract as js/core/personalData.js: what rides
// along in the cloud snapshot beyond the calculator, so signing in on another
// device restores the whole picture rather than just semesters and grades
// (#627). Field names are drift-guarded against the legacy copy — a mismatch
// here would not fail anything, it would just quietly stop syncing.

/** The snapshot fields these functions own. Compared across both copies. */
export const PERSONAL_SLICE_FIELDS: readonly string[] = [
  'routine',
  'myReviews',
  'seatWatches',
  'seatAlertsEnabled',
  'profileSnapshot',
];

const ROUTINE_KEYS = ['shohoj_routine_v1', 'shohoj_routine_picks_v1'] as const;
const SEAT_ALERTS_KEY = 'shohoj_seat_alerts_enabled';
const PROFILE_KEY = 'shohoj_connect_profile_v1';

// Caps mirror the legacy copy: MAX_WATCHES is 50 in src/core/seatWatch.ts.
const MAX_PICKS = 40;
const MAX_WATCHES = 50;
const MAX_REVIEWS = 200;

export interface PersonalSlices {
  routine?: { picks: Record<string, number | null> };
  myReviews?: readonly unknown[];
  seatWatches?: readonly unknown[];
  seatAlertsEnabled?: boolean;
  profileSnapshot?: Record<string, unknown>;
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage off */
  }
}

/** `{ picks: { COURSECODE: sectionId|null } }` — both builds, both keys. */
function cleanRoutine(value: unknown): PersonalSlices['routine'] | null {
  if (value === null || typeof value !== 'object') return null;
  const source = (value as { picks?: unknown }).picks;
  if (source === null || typeof source !== 'object') return null;
  const picks: Record<string, number | null> = {};
  let count = 0;
  for (const [code, sectionId] of Object.entries(source as Record<string, unknown>)) {
    if (count >= MAX_PICKS) break;
    if (sectionId !== null && !(typeof sectionId === 'number' && Number.isFinite(sectionId))) {
      continue;
    }
    picks[code.toUpperCase()] = sectionId as number | null;
    count += 1;
  }
  return { picks };
}

function readRoutine(store: KeyValueStore): PersonalSlices['routine'] | null {
  for (const key of ROUTINE_KEYS) {
    const routine = cleanRoutine(readJson(store, key));
    if (routine) return routine;
  }
  return null;
}

/**
 * What this device holds beyond the calculator. An absent slice stays absent
 * rather than becoming an empty one: a doc written before these fields existed
 * must not read as "this student has no routine" and wipe a newer device's.
 */
export function collectPersonalSlices(store: KeyValueStore, uid: string | null): PersonalSlices {
  const slices: PersonalSlices = {};

  const routine = readRoutine(store);
  if (routine) slices.routine = routine;

  // The receipt is a uid-keyed map on a browser several students may share.
  if (uid !== null) {
    const all = readJson(store, MY_REVIEWS_KEY);
    const mine =
      all !== null && typeof all === 'object' ? (all as Record<string, unknown>)[uid] : null;
    if (Array.isArray(mine)) slices.myReviews = mine.slice(0, MAX_REVIEWS);
  }

  const watches = readJson(store, SEAT_WATCH_KEY);
  if (Array.isArray(watches)) slices.seatWatches = watches.slice(0, MAX_WATCHES);

  const pref = store.getItem(SEAT_ALERTS_KEY);
  // seatsTab treats anything but '0' as on; keep that reading.
  if (pref !== null) slices.seatAlertsEnabled = pref !== '0';

  const profile = readJson(store, PROFILE_KEY);
  if (profile !== null && typeof profile === 'object') {
    slices.profileSnapshot = profile as Record<string, unknown>;
  }

  return slices;
}

/**
 * Fan an adopted cloud snapshot back out to the keys each route reads. A slice
 * the snapshot does not carry is left alone (see collectPersonalSlices).
 */
export function applyPersonalSlices(
  store: KeyValueStore,
  snapshot: unknown,
  uid: string | null,
): void {
  if (snapshot === null || typeof snapshot !== 'object') return;
  const snap = snapshot as Record<string, unknown>;

  const routine = cleanRoutine(snap.routine);
  // Both keys on purpose: a student who uses the shell on one device and legacy
  // on another has one routine, not two.
  if (routine) for (const key of ROUTINE_KEYS) writeJson(store, key, routine);

  if (uid !== null && Array.isArray(snap.myReviews)) {
    const all = readJson(store, MY_REVIEWS_KEY);
    const merged: Record<string, unknown> =
      all !== null && typeof all === 'object' ? { ...(all as Record<string, unknown>) } : {};
    merged[uid] = snap.myReviews
      .filter((entry) => entry !== null && typeof entry === 'object')
      .slice(0, MAX_REVIEWS);
    writeJson(store, MY_REVIEWS_KEY, merged);
  }

  if (Array.isArray(snap.seatWatches)) {
    writeJson(
      store,
      SEAT_WATCH_KEY,
      snap.seatWatches
        .filter((watch) => watch !== null && typeof watch === 'object')
        .slice(0, MAX_WATCHES),
    );
  }

  if (typeof snap.seatAlertsEnabled === 'boolean') {
    try {
      store.setItem(SEAT_ALERTS_KEY, snap.seatAlertsEnabled ? '1' : '0');
    } catch {
      /* storage off */
    }
  }

  if (snap.profileSnapshot !== null && typeof snap.profileSnapshot === 'object') {
    writeJson(store, PROFILE_KEY, snap.profileSnapshot);
  }
}
