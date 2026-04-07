// Single shared mutable state — all modules import this object and mutate its properties.
// Never reassign `state` itself; always mutate properties: state.semesters = [...], etc.
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
    };

    // Always save to localStorage as fallback (works when logged out too)
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