// ── BRACU'S COURSE CATALOGUE ─────────────────────────────────────────────────
//
// The data is not written here. It is generated from data/campuses/bracu/
// (courses.json, prerequisites.json, departments.json) into
// catalogBracu.generated.js; to add a course or change a rule, edit those
// files and run `npm run generate:legacy-catalog`.
//
// This module expands the generated rows into the shapes the app reads.

import {
  BRACU_CATALOG_ROWS,
  BRACU_DEPARTMENT_META,
  BRACU_DEPARTMENT_OVERRIDES,
  BRACU_PREFIX_DEPARTMENTS,
  BRACU_PREREQS,
} from './catalogBracu.generated.js';

// code → { code, name, credits, full }, in the order courses.json lists them.
export const COURSE_DB = {};

BRACU_CATALOG_ROWS.forEach(([code, name, credits]) => {
  const full = `${name} (${code})`;
  COURSE_DB[code] = { code, name, credits, full };
});

export const ALL_COURSES = Object.values(COURSE_DB).sort((a,b) => a.code.localeCompare(b.code));

// ══════════════════════════════════════════════════════════════════════════════
// PREREQUISITE DATA
// hp = hard prerequisites (must be completed before taking the course)
// sp = soft prerequisites (recommended but not enforced by the system)
// ══════════════════════════════════════════════════════════════════════════════
export const PREREQS = BRACU_PREREQS;

// ══════════════════════════════════════════════════════════════════════════════
// DEPARTMENT OWNERSHIP
// Maps every course prefix to the department that owns it.
// Used to determine which department a course "belongs to" regardless of which
// program a student is enrolled in.
// ══════════════════════════════════════════════════════════════════════════════
export const PREFIX_DEPT_MAP = BRACU_PREFIX_DEPARTMENTS;

// Human-readable labels and school affiliation for each department code.
export const DEPT_META = BRACU_DEPARTMENT_META;

// Returns the prefix portion of a course code (letters before the first digit).
export function getCoursePrefix(code) {
  const m = String(code).match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

// Returns the owning department code for a course, or null if unknown.
// A course another department owns outright (departments.json → overrides) is
// that department's; everything else is its subject's owner's.
export function getCourseDept(code) {
  const upper = String(code).toUpperCase();
  return BRACU_DEPARTMENT_OVERRIDES[upper] ?? PREFIX_DEPT_MAP[getCoursePrefix(upper)] ?? null;
}
