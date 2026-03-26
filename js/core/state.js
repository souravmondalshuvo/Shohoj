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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch(e) { /* storage unavailable */ }
}

export function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
}