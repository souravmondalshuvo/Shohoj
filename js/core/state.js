// Single shared mutable state — all modules import this object and mutate its properties.
// Never reassign `state` itself; always mutate properties: state.semesters = [...], etc.
import { collectPersonalSlices } from './personalData.js';

export const state = {
  semesters:            [],
  semesterCounter:      0,
  currentDept:          '',
  _restoredFromStorage: false,
};

export const STORAGE_KEY = 'shohoj_cgpa_v1';

export function saveState() {
  try {
    const snap = {
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