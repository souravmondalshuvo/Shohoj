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
  'shohoj_cgpa_backup_v1',       // the shell's pre-migration copy of all of it
  'shohoj_routine_v1',           // class routine (legacy)
  'shohoj_routine_picks_v1',     // class routine (shell — a different key)
  'shohoj_my_reviews_v1',        // the record of reviews this student wrote
  'shohoj_seat_watch_v1',        // seat watchlist
  'shohoj_seat_alerts_enabled',  // seat-alert opt-in
  'shohoj_connect_profile_v1',   // their CONNECT profile snapshot
];

// The two routine keys are not a typo. The shell writes shohoj_routine_picks_v1
// (src/app/routes/RoutineRoute.tsx) and legacy writes shohoj_routine_v1; both
// builds share an origin, so a student who has used either leaves that key
// behind and both have to go. shohoj_cgpa_backup_v1 is the shell's one-time
// pre-migration backup — a verbatim copy of the whole snapshot, which made the
// wipe cosmetic while it stayed (#627).

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

// ── What is actually on this device ──────────────────────────────────────────
// A student cannot act on storage they cannot see, and until now nothing told
// them it existed: the only removal was a Clear Data button at the foot of the
// calculator, which someone using Routine Builder or Seat Status never scrolls
// to. This turns the contents into a sentence the notice can show them (#627).
//
// Counts come from the stored shape, so a key that is present but empty says
// nothing rather than claiming a category the student would not recognise.
function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null; // unreadable is the same as absent for a summary
  }
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Human labels for the personal data on this device, most substantial first.
 *  Empty when there is nothing to tell them about. */
export function describeStoredPersonalData() {
  const parts = [];

  const semesters = readJson(CGPA_STORAGE_KEY)?.semesters;
  if (Array.isArray(semesters) && semesters.length > 0) {
    parts.push(plural(semesters.length, 'semester', 'semesters'));
  }

  // Either build's routine counts once — a student who has used both should not
  // be told they have two routines.
  const picks = PD_ROUTINE_KEYS
    .map(key => readJson(key)?.picks)
    .find(value => value && typeof value === 'object' && Object.keys(value).length > 0);
  if (picks) parts.push('your routine');

  const watches = readJson('shohoj_seat_watch_v1');
  if (Array.isArray(watches) && watches.length > 0) {
    parts.push(plural(watches.length, 'watched section', 'watched sections'));
  }

  const reviews = readJson('shohoj_my_reviews_v1');
  if (reviews && typeof reviews === 'object') {
    const written = Object.values(reviews).reduce(
      (total, list) => total + (Array.isArray(list) ? list.length : 0),
      0,
    );
    if (written > 0) parts.push(plural(written, 'review you wrote', 'reviews you wrote'));
  }

  if (readJson('shohoj_connect_profile_v1')) parts.push('your transcript profile');

  return parts;
}

// ── Devices the old sign-out already left dirty ──────────────────────────────
// Before #627, signing out ended the Firebase session and left everything in
// localStorage. Those devices are still out there, and the wipe above cannot
// help them: it runs at sign-out, and nobody signs out twice.
//
// They are identifiable, though. The old sign-out removed `shohoj_session_start`
// but left `shohoj_last_sync` behind, so a device carrying last-sync WITHOUT a
// session start was signed in once and signed out under the old code. A visitor
// who never signed in has neither, which is what keeps this off the local-first
// path that has always been Shohoj's default — their data is not ours to delete.
//
// A live session has BOTH (session start is written at sign-in and survives
// reloads), so a signed-in student reloading the page never matches. The 30-day
// expiry path does match, having cleared session start on its way out; wiping
// there is the same bargain as a sign-out, and the account still holds the data.
//
// This holds on the legacy build, which is the only one that writes session
// start. The shell does not, so it must not run this at boot — see the note on
// the same predicate in src/services/storage/personalData.ts.
export function hasStaleSignedOutData() {
  try {
    return (
      localStorage.getItem('shohoj_last_sync') !== null
      && localStorage.getItem('shohoj_session_start') === null
    );
  } catch (e) {
    return false; // storage unreachable — nothing to read, nothing to clear
  }
}

/** Clear a pre-#627 leftover. True only once the residue is provably gone.
 *
 * The return value gates the caller's reload, and it is checked rather than
 * assumed: a storage that refuses removeItem would otherwise leave the residue
 * in place, keep this predicate true, and reload the page forever.
 */
export function clearStaleSignedOutData() {
  if (!hasStaleSignedOutData()) return false;
  clearPersonalData();
  return !hasStaleSignedOutData();
}

/** Clear Data's wipe: the above, plus the preferences it promises to reset. */
export function clearAllShohojData() {
  clearPersonalData();
  removeLocalKeys(PREFERENCE_LOCAL_KEYS);
}

// ── Cross-device slices ───────────────────────────────────────────────────────
// The cloud doc (users/{uid}.data) used to carry the calculator and nothing
// else: semesters, grades, the plan. Everything else a student built up — their
// routine, the seat watchlist, the reviews they wrote, the transcript-derived
// profile — lived on one device and died with it. That is what made clearing
// the device on sign-out a real loss, and what made "sign in on your phone" a
// half-truth (#627).
//
// These slices ride along in the same snapshot, so the sync machinery carries
// them for free: one doc, one fingerprint, one conflict prompt. Nothing here
// invents a second sync path.
//
// Every name in this file is prefixed because build3.py flattens both bundles
// into one scope each, and MY_REVIEWS_KEY / PROFILE_SNAPSHOT_KEY are already
// taken in the same scopes by js/auth/firebase.js and js/ui/modals.js.
/** The snapshot fields these functions own. Drift-guarded against the shell's
 *  copy — a mismatch here fails nothing, it just quietly stops syncing. */
export const PERSONAL_SLICE_FIELDS = [
  'routine',
  'myReviews',
  'seatWatches',
  'seatAlertsEnabled',
  'profileSnapshot',
];

const PD_ROUTINE_KEYS   = ['shohoj_routine_v1', 'shohoj_routine_picks_v1'];
const PD_MY_REVIEWS_KEY = 'shohoj_my_reviews_v1';
const PD_SEAT_WATCH_KEY = 'shohoj_seat_watch_v1';
const PD_SEAT_ALERTS_KEY = 'shohoj_seat_alerts_enabled';
const PD_PROFILE_KEY    = 'shohoj_connect_profile_v1';

// Caps, so a doc that has been tampered with cannot make the app chew through
// an unbounded list on restore. MAX_WATCHES in js/core/seatWatch.js is 50.
const PD_MAX_PICKS   = 40;
const PD_MAX_WATCHES = 50;
const PD_MAX_REVIEWS = 200;

function pdReadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Reports whether the write actually landed. applyPersonalSlices's return value
// gates a page reload, and a storage that silently refuses every write would
// otherwise reload forever: nothing written means no local snapshot, which sends
// the sign-in flow straight back down the adopt-cloud path (#627).
function pdWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/** `{ picks: { COURSECODE: sectionId|null } }` or null. Both builds store the
 *  same shape under different keys (see the note on PERSONAL_LOCAL_KEYS). */
function pdCleanRoutine(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.picks;
  if (!source || typeof source !== 'object') return null;
  const picks = {};
  let count = 0;
  for (const [code, sectionId] of Object.entries(source)) {
    if (count >= PD_MAX_PICKS) break;
    if (typeof code !== 'string') continue;
    if (sectionId !== null && !(typeof sectionId === 'number' && isFinite(sectionId))) continue;
    picks[code.toUpperCase()] = sectionId;
    count += 1;
  }
  return { picks };
}

/** Read the routine from whichever key this build writes. */
function pdReadRoutine() {
  for (const key of PD_ROUTINE_KEYS) {
    const routine = pdCleanRoutine(pdReadJson(key));
    if (routine) return routine;
  }
  return null;
}

/** What this device holds beyond the calculator, ready to ride along in the
 *  cloud snapshot. A slice that is absent stays absent rather than becoming an
 *  empty one: an older client's doc must not read as "this student has no
 *  routine" and wipe a newer client's. */
export function collectPersonalSlices(uid) {
  const slices = {};

  const routine = pdReadRoutine();
  if (routine) slices.routine = routine;

  // The local receipt is keyed by uid (one browser, several students). Only the
  // signed-in student's own slice belongs in their own doc.
  if (uid) {
    const all = pdReadJson(PD_MY_REVIEWS_KEY);
    const mine = all && typeof all === 'object' ? all[uid] : null;
    if (Array.isArray(mine)) slices.myReviews = mine.slice(0, PD_MAX_REVIEWS);
  }

  const watches = pdReadJson(PD_SEAT_WATCH_KEY);
  if (Array.isArray(watches)) slices.seatWatches = watches.slice(0, PD_MAX_WATCHES);

  try {
    const pref = localStorage.getItem(PD_SEAT_ALERTS_KEY);
    // seatsTab treats anything but '0' as on; keep that reading.
    if (pref !== null) slices.seatAlertsEnabled = pref !== '0';
  } catch (e) { /* storage off */ }

  const profile = pdReadJson(PD_PROFILE_KEY);
  if (profile && typeof profile === 'object') slices.profileSnapshot = profile;

  return slices;
}

/** Fan an adopted cloud snapshot back out to the keys each module reads.
 *
 * Called wherever a cloud doc becomes this device's copy. A slice the snapshot
 * does not carry is left alone — that is a doc written before these fields
 * existed, not a student with nothing. */
/** Fan a cloud snapshot's slices back out to the keys each module reads.
 *
 * Returns true when something was actually written. The caller needs that: the
 * routine, seats, reviews and profile modules each read their key ONCE at module
 * load, so writing the key on an already-booted page changes storage and nothing
 * else. A restore that lands the calculator and silently drops the rest is the
 * new-device bug this return value exists to prevent (#627).
 */
export function applyPersonalSlices(snapshot, uid) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  let wrote = false;

  const routine = pdCleanRoutine(snapshot.routine);
  // Written to both routine keys on purpose: a student who uses the shell on
  // one device and legacy on another has one routine, not two.
  if (routine) {
    // Reduce, not forEach: a refused write must not be reported as a restore.
    wrote = PD_ROUTINE_KEYS.reduce((ok, key) => pdWriteJson(key, routine) || ok, wrote);
  }

  if (uid && Array.isArray(snapshot.myReviews)) {
    const all = pdReadJson(PD_MY_REVIEWS_KEY);
    const merged = (all && typeof all === 'object') ? all : {};
    merged[uid] = snapshot.myReviews
      .filter(entry => entry && typeof entry === 'object')
      .slice(0, PD_MAX_REVIEWS);
    if (pdWriteJson(PD_MY_REVIEWS_KEY, merged)) wrote = true;
  }

  if (Array.isArray(snapshot.seatWatches)) {
    const watches = snapshot.seatWatches
      .filter(w => w && typeof w === 'object')
      .slice(0, PD_MAX_WATCHES);
    if (pdWriteJson(PD_SEAT_WATCH_KEY, watches)) wrote = true;
  }

  if (typeof snapshot.seatAlertsEnabled === 'boolean') {
    try {
      localStorage.setItem(PD_SEAT_ALERTS_KEY, snapshot.seatAlertsEnabled ? '1' : '0');
      wrote = true;
    } catch (e) { /* storage off */ }
  }

  if (snapshot.profileSnapshot && typeof snapshot.profileSnapshot === 'object') {
    if (pdWriteJson(PD_PROFILE_KEY, snapshot.profileSnapshot)) wrote = true;
  }

  return wrote;
}
