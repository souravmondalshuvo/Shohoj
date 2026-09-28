import { detectGrade } from './grades.js';
import { getStartSeason, getStartYear } from './helpers.js';
import { state } from './state.js';
import { getActiveCampus } from './activeCampus.js';
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

// Every wrapper below hands gpa-core the active campus's rules (see
// activeCampus.js). gpa-core defaults each one to BRACU, so the explicit pass
// is what lets an NSU student be scored on NSU's scale.

export function calcSemGPA(sem) {
  return gpaCoreCalcSemesterGpa(sem, getActiveCampus().grades);
}

export function usesBestGradePolicy() {
  return gpaCoreUsesBestGradePolicy({
    retake: getActiveCampus().retake,
    startSeason: getStartSeason(),
    startYear: getStartYear(),
  });
}

/** The scale + retake options every calculateCgpaTotals caller should pass. */
export function activeCgpaOptions(extra) {
  const campus = getActiveCampus();
  return {
    scale: campus.grades,
    retake: campus.retake,
    startSeason: getStartSeason(),
    startYear: getStartYear(),
    ...(extra || {}),
  };
}

export function getRetakenKeys(semList, opts) {
  const campus = getActiveCampus();
  const options = { scale: campus.grades, retake: campus.retake, ...(opts || {}) };
  if (typeof options.bestGrade !== 'boolean') {
    options.startSeason = getStartSeason();
    options.startYear = getStartYear();
  }
  return gpaCoreGetRetakenKeys(semList || state.semesters, options);
}

export function getSemCreditWarning(sem) {
  return gpaCoreGetSemesterCreditWarning(sem, getActiveCampus());
}

export function isRepeatEligible(grade) {
  const campus = getActiveCampus();
  return gpaCoreIsRepeatEligible(grade, campus.grades, campus.repeat);
}

export function getImprovementStrategy(grade) {
  const campus = getActiveCampus();
  return gpaCoreGetImprovementStrategy(grade, campus.grades, campus.repeat);
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
  const clamped = gpaCoreClampGradePoint(val, getActiveCampus().grades);
  if (clamped !== val) {
    inputEl.value = clamped;
    val = clamped;
  }

  const letter = detectGrade(val, getActiveCampus().grades.pointsToGrade);
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
  const clamped = gpaCoreClampGradePoint(val, getActiveCampus().grades);
  if (clamped !== val) val = clamped;
  if (val !== original) {
    inputEl.value = val;
    const sem = state.semesters.find(s => s.id === semId);
    if (sem) {
      sem.courses[cIdx].gradePoint = val;
      const letter = detectGrade(val, getActiveCampus().grades.pointsToGrade);
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
