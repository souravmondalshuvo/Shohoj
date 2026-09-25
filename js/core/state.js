// Single shared mutable state — all modules import this object and mutate its properties.
// Never reassign `state` itself; always mutate properties: state.semesters = [...], etc.
import { collectPersonalSlices } from './personalData.js';

export const state = {
  semesters:            [],
  semesterCounter:      0,
  currentDept:          '',
  // The selected minor's code ('' for none), or null until it has been read
  // from storage — see currentMinorField below for why the two differ.
  currentMinor:         null,
  _restoredFromStorage: false,
};

export const STORAGE_KEY = 'shohoj_cgpa_v1';

/**
 * The `currentMinor` field for the next save (#731, #766).
 *
 * Both surfaces now set it — the shell on /degree-progress, legacy in the minor
 * panel under the degree tracker — but legacy rebuilds the whole snapshot on
 * every save, and a save can run before the stored state has been read. Until
 * then `state.currentMinor` is null, and the stored value is carried through
 * untouched rather than overwritten with a default: otherwise editing one grade
 * before the restore finished would silently clear a student's minor.
 */
function currentMinorField() {
  if (typeof state.currentMinor === 'string') return { currentMinor: state.currentMinor };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const prev = JSON.parse(raw);
    return typeof prev?.currentMinor === 'string' ? { currentMinor: prev.currentMinor } : {};
  } catch (e) { return {}; }
}

export function saveState() {
  try {
    const snap = {
      ...currentMinorField(),
      currentDept:     state.currentDept,
      semesterCounter: state.semesterCounter,
      semesters:       state.semesters,
      startSeason:     document.getElementById('startSeason')?.value || '',
      startYear:       document.getElementById('startYear')?.value   || '',
      planCourses:     typeof window._shohoj_getPlanCourses === 'function'
        ? window._shohoj_getPlanCourses()
        : [],
      // The routine, seat watchlist, review receipt and profile snapshot ride
      // along so signing in on another device restores the whole picture, not
      // just the calculator (#627). Each module still owns its own key locally;
      // these copies exist so the cloud doc is complete, and are fanned back out
      // by applyPersonalSlices when a cloud doc is adopted.
      ...collectPersonalSlices(
        typeof window._shohoj_currentUid === 'function' ? window._shohoj_currentUid() : null,
      ),
    };

    // Always save to localStorage as fallback (works when logged out too).
    // The slices are written here too, byte for byte, because the realtime
    // listener decides "did another device change something" by fingerprinting
    // this string against the cloud one — a local copy missing fields the cloud
    // has would look like a permanent conflict and reload in a loop.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));

    // Cloud sync — only fires when user is signed in via Firebase
    // window._shohoj_onSave is set in index.html after initAuth() boots
    if (typeof window._shohoj_onSave === 'function') {
      window._shohoj_onSave(snap);
    }
  } catch(e) { /* storage unavailable */ }
}

export function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
}