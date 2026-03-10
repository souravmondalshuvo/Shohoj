// ── APPLICATION STATE ────────────────────────────────
// Single exported `state` object.
// NEVER reassign state itself — only mutate its properties.
// ES module live bindings work on the object reference, not individual vars.

import { GRADES }      from './grades.js';
import { DEPARTMENTS } from './departments.js';
import { app }         from './registry.js';

const STORAGE_KEY = 'shohoj_cgpa_v1';

export const state = {
  semesters:            [],
  whatIfMode:           false,
  whatIfGrades:         {},
  semesterCounter:      0,
  currentDept:          '',
  _restoredFromStorage: false,
};

function saveState() {
      try {
        const snapshot = {
          currentDept: state.currentDept,
          semesterCounter: state.semesterCounter,
          semesters: state.semesters,
          startSeason: document.getElementById('startSeason')?.value || '',
          startYear:   document.getElementById('startYear')?.value   || '',
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch(e) { /* storage unavailable */ }
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved.currentDept || !saved.semesters?.length) return false;

        // Restore dept dropdown
        const deptSel = document.getElementById('deptSelect');
        if (deptSel) { deptSel.value = saved.currentDept; }
        state.currentDept    = saved.currentDept;

        // Restore start season/year dropdowns
        const seasonSel = document.getElementById('startSeason');
        const yearSel   = document.getElementById('startYear');
        if (seasonSel && saved.startSeason) seasonSel.value = saved.startSeason;
        if (yearSel   && saved.startYear)   yearSel.value   = saved.startYear;

        // Restore semesters & counter
        state.semesters      = saved.semesters;
        state.semesterCounter = saved.semesterCounter || state.semesters.length;

        // Show dept info + start row (so user can still change semester)
        const dept = DEPARTMENTS[state.currentDept];
        if (dept) {
          document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
          document.getElementById('deptCredits').style.display = '';
        }
        const startRow = document.getElementById('startSemRow');
        if (startRow) startRow.style.display = 'flex';

        state._restoredFromStorage = true;
        renderSemesters();
        recalc();
        return true;
      } catch(e) { return false; }
    }

    function clearState() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

export { saveState, loadState, clearState };