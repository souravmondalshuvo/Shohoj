import { detectGrade } from './grades.js';
import { getStartSeason, getStartYear } from './helpers.js';
import { state } from './state.js';
import {
  gpaCoreCalcSemesterGpa,
  gpaCoreClampGradePoint,
  gpaCoreGetImprovementStrategy,
  gpaCoreGetRetakenKeys,
  gpaCoreGetSemesterCreditWarning,
  gpaCoreIsRepeatEligible,
  gpaCoreNormalizeGradePoint,
  gpaCoreUsesBestGradePolicy,
} from './gpa-core.js';

export function calcSemGPA(sem) {
  return gpaCoreCalcSemesterGpa(sem);
}

export function usesBestGradePolicy() {
  return gpaCoreUsesBestGradePolicy({
    startSeason: getStartSeason(),
    startYear: getStartYear(),
  });
}

export function getRetakenKeys(semList, opts) {
  const options = { ...(opts || {}) };
  if (typeof options.bestGrade !== 'boolean') {
    options.startSeason = getStartSeason();
    options.startYear = getStartYear();
  }
  return gpaCoreGetRetakenKeys(semList || state.semesters, options);
}

export function getSemCreditWarning(sem) {
  return gpaCoreGetSemesterCreditWarning(sem);
}

export function isRepeatEligible(grade) {
  return gpaCoreIsRepeatEligible(grade);
}

export function getImprovementStrategy(grade) {
  return gpaCoreGetImprovementStrategy(grade);
}

export function normalizeGradePoint(raw, mode) {
  return gpaCoreNormalizeGradePoint(raw, mode);
}

export function autoDetectGrade(semId, cIdx, val, inputEl) {
  if (val.trim().toUpperCase() === 'NT') {
    const sem = state.semesters.find(s => s.id === semId);
    if (!sem) return;
    sem.courses[cIdx].grade = 'F(NT)';
    sem.courses[cIdx].gradePoint = 'NT';
    // triggers re-render via main.js window.autoDetectGrade
    window._shohoj_renderAndRecalc();
    return;
  }

  // Normalize shorthand: "33" → "3.3" (2-digit only on input)
  let normalized = normalizeGradePoint(val, 'input');
  if (normalized !== val) {
    inputEl.value = normalized;
    val = normalized;
  }

  // Clamp to 0.0–4.0 range
  const clamped = gpaCoreClampGradePoint(val);
  if (clamped !== val) {
    inputEl.value = clamped;
    val = clamped;
  }

  const letter = detectGrade(val);
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return;
  sem.courses[cIdx].grade = letter;
  sem.courses[cIdx].gradePoint = val;

  if (letter) {
    inputEl.style.borderColor = 'rgba(46,204,113,0.6)';
    setTimeout(() => inputEl.style.borderColor = '', 600);
  }

  window._shohoj_renderAndRecalc();

  const block = document.getElementById(`sem-${semId}`);
  if (block) {
    const rows = block.querySelectorAll('.course-row:not(.course-header)');
    const gpInput = rows[cIdx]?.querySelector('input[inputmode="decimal"]');
    if (gpInput) {
      gpInput.focus();
      const len = gpInput.value.length;
      gpInput.setSelectionRange(len, len);
    }
  }
}

/** Called on blur — normalizes single digits like "3" → "3.0" and clamps to 0.0–4.0 */
export function onGradePointBlur(semId, cIdx, inputEl) {
  const original = inputEl.value;
  let val = original;
  const normalized = normalizeGradePoint(val, 'blur');
  if (normalized !== val) val = normalized;
  const clamped = gpaCoreClampGradePoint(val);
  if (clamped !== val) val = clamped;
  if (val !== original) {
    inputEl.value = val;
    const sem = state.semesters.find(s => s.id === semId);
    if (sem) {
      sem.courses[cIdx].gradePoint = val;
      const letter = detectGrade(val);
      if (letter) sem.courses[cIdx].grade = letter;
      window._shohoj_renderAndRecalc();
    }
  }
}

export function onPFChange(semId, cIdx, val) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return;
  sem.courses[cIdx].grade = val;
  sem.courses[cIdx].gradePoint = val;
  window._shohoj_renderAndRecalc();
}
