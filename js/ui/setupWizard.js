// ── SETUP WIZARD + CALCULATOR INIT ───────────────────

import { state, loadState } from '../core/state.js';
import { getStartSeason, getStartYear } from '../core/helpers.js';
import { app }         from '../core/registry.js';

function updateSetupWizard() {
      const s1  = document.getElementById('stepNum1');
      const s2  = document.getElementById('stepNum2');
      const s3  = document.getElementById('stepNum3');
      const si2 = document.getElementById('stepIndicator2');
      const si3 = document.getElementById('stepIndicator3');
      if (!s1) return;
      const hasDept    = !!state.currentDept;
      const hasSem     = hasDept && getStartSeason() && getStartYear();
      const hasCourses = hasSem && state.semesters.length > 0;
      s1.className  = 'setup-step-num ' + (hasDept ? 'done' : 'active');
      if (si2) si2.className = 'setup-step-indicator ' + (hasSem ? 'step-done' : hasDept ? 'step-active' : '');
      s2.className  = 'setup-step-num ' + (hasSem ? 'done' : hasDept ? 'active' : '');
      if (si3) si3.className = 'setup-step-indicator ' + (hasCourses ? 'step-done' : hasSem ? 'step-active' : '');
      s3.className  = 'setup-step-num ' + (hasCourses ? 'done' : hasSem ? 'active' : '');
      const wizard  = document.getElementById('setupWizard');
      if (wizard) wizard.style.opacity = hasCourses ? '0.4' : '1';
    }

function initCalculator() {
      document.getElementById('deptCreditsText').textContent = '';
      document.getElementById('deptCredits').style.display = 'none';
      app.renderSemesters();
      app.recalc();
    }

export { updateSetupWizard, initCalculator };