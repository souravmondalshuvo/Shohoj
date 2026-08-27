// ── js/core/personalData.js ───────────────────────────────────────────────────
// The one list of what Shohoj keeps on a student's device, and the wipes that
// act on it.
//
// Two flows erase this data and they must not drift apart: Clear Data
// (js/main.js) and sign-out (js/auth/firebase.js, #627). They differ only in
// what survives — sign-out keeps display preferences, Clear Data resets those
// too, because it is the "reset this browser" button.
//
// This file sits in js/core but is listed in build3.py's FIREBASE_JS_FILES as
// well as MAIN_JS_FILES. firebase.js ships as its own type="module" bundle and
// cannot see the flattened main scope, so each bundle carries a copy: one
// source in the repo, two scopes at runtime, no window bridge.
//
// The shell keeps a parallel copy in src/services/storage/personalData.ts;
// tests/personalDataDrift.test.js fails if the two ever disagree, so a new key
// added on one side cannot silently start leaking on the other.

// The calculator snapshot's key, from js/core/state.js. Spelled out rather than
// imported so this module stays loadable inside the firebase bundle, which does
// not carry state.js.
const CGPA_STORAGE_KEY = 'shohoj_cgpa_v1';

/** localStorage keys holding data that belongs to the person using the browser. */
export const PERSONAL_LOCAL_KEYS = [
  CGPA_STORAGE_KEY,              // semesters, courses, grades, the plan
  'shohoj_routine_v1',           // class routine — device-only, no cloud copy
  'shohoj_my_reviews_v1',        // the record of reviews this student wrote
  'shohoj_seat_watch_v1',        // seat watchlist
  'shohoj_seat_alerts_enabled',  // seat-alert opt-in
  'shohoj_connect_profile_v1',   // their CONNECT profile snapshot
];

// Deliberately absent: shohoj_connect_feed_v1 and shohoj_routine_ratings_v1
// cache the public CONNECT feed and the aggregate faculty-rating map — the same
// bytes for every student, so they identify nobody and dropping them would only
// buy a refetch. shohoj_pdfjs_preview is a developer flag. The Assistant
// transcript lives in IndexedDB and already clears itself when the uid goes
// away (js/ui/assistantFab.js:480).

/** Sync bookkeeping — meaningless once the data it describes is gone. */
export const SYNC_LOCAL_KEYS = [
  'shohoj_last_sync',
  'shohoj_session_start',
];

/** Display preferences. Personal in no useful sense; only Clear Data resets them. */
export const PREFERENCE_LOCAL_KEYS = [
  'shohoj_theme',
];

// shohoj_calc_unlocked is the campus gate's per-tab unlock (js/ui/signinPortal.js).
// It has to go with the data: left set, it walks the next person in this tab
// straight past the gate.
export const PERSONAL_SESSION_KEYS = [
  'shohoj_active_tab',
  'shohoj_cloud_applied',
  'shohoj_skip_first_save',
  'shohoj_calc_unlocked',
];

// Storage can be missing or throw on access (private mode, storage disabled),
// and a wipe that stops halfway is worse than one that quietly skips what it
// cannot reach — so every key is removed on its own.
function removeLocalKeys(keys) {
  keys.forEach(key => {
    try { localStorage.removeItem(key); } catch (e) {}
  });
}

function removeSessionKeys(keys) {
  keys.forEach(key => {
    try { sessionStorage.removeItem(key); } catch (e) {}
  });
}

/** Sign-out's wipe: the student's data goes, their theme stays. */
export function clearPersonalData() {
  removeLocalKeys(PERSONAL_LOCAL_KEYS);
  removeLocalKeys(SYNC_LOCAL_KEYS);
  removeSessionKeys(PERSONAL_SESSION_KEYS);
}

/** Clear Data's wipe: the above, plus the preferences it promises to reset. */
export function clearAllShohojData() {
  clearPersonalData();
  removeLocalKeys(PREFERENCE_LOCAL_KEYS);
}
