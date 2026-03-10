// ── APPLICATION STATE ────────────────────────────────
// Shared mutable state + localStorage persistence.

import { GRADES }      from './grades.js';
import { DEPARTMENTS } from './departments.js';
import { app }         from './registry.js';

let semesters = [];
    let whatIfMode = false;
    const whatIfGrades = {}; // key: 'semId-cIdx', value: grade string
    let semesterCounter = 0;
    let _restoredFromStorage = false; // prevents Let's go / dept change from wiping restored data


    function saveState() {
      try {
        const state = {
          currentDept,
          semesterCounter,
          semesters,
          startSeason: document.getElementById('startSeason')?.value || '',
          startYear:   document.getElementById('startYear')?.value   || '',
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch(e) { /* storage unavailable */ }
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state.currentDept || !state.semesters?.length) return false;

        // Restore dept dropdown
        const deptSel = document.getElementById('deptSelect');
        if (deptSel) { deptSel.value = state.currentDept; }
        currentDept = state.currentDept;

        // Restore start season/year dropdowns
        const seasonSel = document.getElementById('startSeason');
        const yearSel   = document.getElementById('startYear');
        if (seasonSel && state.startSeason) seasonSel.value = state.startSeason;
        if (yearSel   && state.startYear)   yearSel.value   = state.startYear;

        // Restore semesters & counter
        semesters        = state.semesters;
        semesterCounter  = state.semesterCounter || semesters.length;

        // Show dept info + start row (so user can still change semester)
        const dept = DEPARTMENTS[currentDept];
        if (dept) {
          document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
          document.getElementById('deptCredits').style.display = '';
        }
        const startRow = document.getElementById('startSemRow');
        if (startRow) startRow.style.display = 'flex';

        _restoredFromStorage = true;
        app.renderSemesters();
        app.recalc();
        return true;
      } catch(e) { return false; }
    }

    function clearState() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

export { semesters, whatIfMode, whatIfGrades, saveState, loadState, clearState };