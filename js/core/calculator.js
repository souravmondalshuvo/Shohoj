import { GRADES, detectGrade } from './grades.js';
import { SEASON_ORDER, getStartSeason, getStartYear } from './helpers.js';
import { state } from './state.js';

export function calcSemGPA(sem) {
  let pts = 0, creds = 0;
  sem.courses.forEach((c) => {
    const gp = GRADES[c.grade];
    if (gp === undefined || !c.credits) return;
    if (c.grade === 'P' || c.grade === 'I') return;
    if (c.grade === 'F(NT)') { creds += c.credits; return; }
    if (gp === null) return;
    pts += gp * c.credits;
    creds += c.credits;
  });
  return creds > 0 ? pts / creds : null;
}

export function usesBestGradePolicy() {
  const season = getStartSeason();
  const year   = parseInt(getStartYear());
  if (!season || !year) return false;
  const idx = SEASON_ORDER.indexOf(season);
  if (year < 2024) return true;
  if (year === 2024 && idx === 0) return true;
  if (year === 2024 && idx === 1) return true;
  if (year === 2024 && idx === 2) return false;
  return false;
}

export function getRetakenKeys(semList, opts) {
  const list = (semList || state.semesters).filter(sem => !sem.running && !sem.summary);
  const bestGrade = (opts && typeof opts.bestGrade === 'boolean')
    ? opts.bestGrade
    : usesBestGradePolicy();

  const all = [];
  list.forEach(sem => {
    sem.courses.forEach((c, i) => {
      if (!c.name.trim()) return;
      const codeMatch = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      const code = codeMatch ? codeMatch[1] : null;
      const baseName = c.name.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase();
      const gp = (c.grade && c.grade !== 'F(NT)') ? (GRADES[c.grade] ?? -1) : -1;
      all.push({ semId: sem.id, idx: i, code, baseName, key: `${sem.id}-${i}`, gp });
    });
  });

  const groups = {};
  all.forEach(entry => {
    const groupKey = entry.code || entry.baseName;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(entry);
  });

  const retakenKeys = new Set();
  Object.values(groups).forEach(group => {
    if (group.length < 2) return;
    if (bestGrade) {
      const best = group.reduce((a, b) => a.gp >= b.gp ? a : b);
      group.forEach(e => { if (e.key !== best.key) retakenKeys.add(e.key); });
    } else {
      group.slice(0, -1).forEach(e => retakenKeys.add(e.key));
    }
  });
  return retakenKeys;
}

export function getSemCreditWarning(sem) {
  const total = sem.courses.reduce((sum, c) => {
    if (!c.name.trim() || !c.credits) return sum;
    if (c.grade === 'P' || c.grade === 'F(NT)') return sum;
    return sum + c.credits;
  }, 0);
  if (total === 0) return null;
  if (total < 9)  return { type: 'error', msg: `⚠ ${total} credits — below 9-credit minimum` };
  if (total > 15) return { type: 'error', msg: `⛔ ${total} credits — exceeds 15-credit maximum` };
  if (total > 12) return { type: 'warn',  msg: `⚠ ${total} credits — requires chairman's permission` };
  return null;
}

/**
 * Returns whether a course with the given grade is eligible for a Repeat.
 *
 * Repeat policy (effective for all students):
 *   - Eligible if current grade is BELOW B (i.e. B- or lower, excluding F)
 *   - F grades require a Retake (full re-enrollment), not a Repeat
 *   - Can only be repeated ONCE, within 2 semesters of initial enrollment
 *   - No grade cap — latest grade counts regardless of what it is
 *   - Same intake-based policy applies to which grade counts in CGPA
 *     (best grade for Spring 2024 and earlier, latest grade for Fall 2024+)
 *
 * @param {string} grade - The current letter grade (e.g. 'C+', 'B-', 'F')
 * @returns {boolean}
 */
export function isRepeatEligible(grade) {
  // F and F(NT) require Retake, not Repeat
  if (grade === 'F' || grade === 'F(NT)') return false;
  // P and I are not eligible
  if (grade === 'P' || grade === 'I' || !grade) return false;
  const gp = GRADES[grade];
  if (gp === undefined || gp === null) return false;
  // Below B means grade point < 3.0 (B = 3.0 is the threshold, not eligible)
  return gp < 3.0;
}

/**
 * Returns the improvement strategy for a given grade:
 *   'retake'  — F grade, must re-enroll (up to 2 retakes)
 *   'repeat'  — B- or below (non-F), can sit repeat exam (once, within 2 sems)
 *   null      — B or above, no improvement mechanism available
 *
 * @param {string} grade
 * @returns {'retake'|'repeat'|null}
 */
export function getImprovementStrategy(grade) {
  if (grade === 'F' || grade === 'F(NT)') return 'retake';
  if (isRepeatEligible(grade)) return 'repeat';
  return null;
}

/**
 * Normalize grade point input for common shorthand.
 * Two modes:
 *   'input' — only fixes 2-digit shorthand (safe mid-typing)
 *             "33" → "3.3",  "27" → "2.7",  "40" → "4.0"
 *   'blur'  — also fixes single digits (user is done typing)
 *             "3"  → "3.0",  "0"  → "0.0",  "4"  → "4.0"
 * Already valid inputs like "3.3", "2.70", "NT" pass through unchanged.
 */
export function normalizeGradePoint(raw, mode) {
  const trimmed = raw.trim();

  // Let NT / text pass through untouched
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;

  // Already has a decimal point → leave it alone
  if (trimmed.includes('.')) return trimmed;

  // Two digits where first is 0-4 → insert decimal  (e.g. "33" → "3.3", "27" → "2.7")
  if (/^[0-4]\d$/.test(trimmed)) return trimmed[0] + '.' + trimmed[1];

  // Single digit 0-4 → append .0 — only on blur (user is done typing)
  if (mode === 'blur' && /^[0-4]$/.test(trimmed)) return trimmed + '.0';

  // Anything else → pass through
  return trimmed;
}

/**
 * Clamp a grade point value to the valid 0.0–4.0 range.
 * Returns the clamped string, or the original if non-numeric.
 */
function clampGradePoint(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (n > 4.0) return '4.0';
  if (n < 0)   return '0.0';
  return val;
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
  const clamped = clampGradePoint(val);
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
  const clamped = clampGradePoint(val);
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