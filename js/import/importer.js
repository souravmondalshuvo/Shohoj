// ── PDF IMPORT ORCHESTRATOR ──────────────────────────

import { GRADES }      from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState, clearState } from '../core/state.js';
import { parseTranscriptText } from './parser.js';
import { getModalTheme, showImportModal, hideImportModal, importTranscriptPDF } from '../ui/modals.js';
import { app }         from '../core/registry.js';

function applyImport(parsed) {
      hideImportModal();
      clearState();

      // Reset dept state before import to avoid stale values
      state.currentDept = null;
      const _dSel = document.getElementById('deptSelect'); if (_dSel) _dSel.value = '';
      document.getElementById('deptCreditsText').textContent = '';
      const _dCred = document.getElementById('deptCredits'); if (_dCred) _dCred.style.display = 'none';
      // Set dept if detected
      if (parsed.detectedDept) {
        const deptKey = Object.keys(DEPARTMENTS).find(k => DEPARTMENTS[k].label === parsed.detectedDept);
        if (deptKey) {
          state.currentDept = deptKey;
          const sel = document.getElementById('deptSelect');
          if (sel) sel.value = deptKey;
          const dept = DEPARTMENTS[deptKey];
          document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
          const credEl = document.getElementById('deptCredits');
          if (credEl) credEl.style.display = 'inline-flex';
          const startRow = document.getElementById('startSemRow');
          if (startRow) startRow.style.display = 'flex';
        }
      }

      // Assign fresh sequential IDs
      state.semesters = parsed.state.semesters.map((s, idx) => ({
        ...s,
        id: idx + 1,
        courses: s.courses.map(c => ({
          name:       c.name       || '',
          credits:    c.credits    || 0,
          grade:      c.grade      || '',
          gradePoint: c.gradePoint !== undefined ? c.gradePoint : '',
        })),
      }));
      state.semesterCounter = state.semesters.length + 1;

      // Set start season/year from first semester
      if (state.semesters.length > 0) {
        const first   = state.semesters[0];
        const parts   = first.name.split(' ');
        const season  = parts[0];
        const year    = parts[1];
        const seasonEl = document.getElementById('startSeason');
        const yearEl   = document.getElementById('startYear');
        if (seasonEl && ['Spring','Summer','Fall'].includes(season)) seasonEl.value = season;
        if (yearEl   && year && /^\d{4}$/.test(year))                yearEl.value   = year;
      }

      app.renderSemesters();
      app.recalc();
      saveState();

      // Scroll to calculator
      const calc = document.getElementById('calculator');
      if (calc) {
        const top = calc.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }

// ── WHAT-IF MODE HELPERS (#5) ─────────────────────────

export { importTranscriptPDF, applyImport };