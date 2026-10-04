// ── ACTIVE CATALOGUE (legacy bundle) ─────────────────────────────────────────
//
// The course catalogue, prerequisites and programs of the campus the student
// is on — the catalogue counterpart of activeCampus.js, which answers the same
// question for grading rules.
//
// BRACU's catalogue is the hand-written constants in catalog.js and
// departments.js, handed back as they are: the same objects, so nothing about
// BRACU changes by reading them through here. NSU's is generated from
// data/campuses/nsu/ (scripts/generate_legacy_catalog.mjs) and expanded into
// the same shapes on first use.
//
// Each catalogue also answers `departmentOf(code)` — the department that owns
// a course, or null — because the rule is the campus's, not just its table,
// and `departmentOrder`, the order its department tiles are shown in.
//
// A campus with no catalogue gets an empty one, never BRACU's: another
// university's courses offered as a student's own is the failure this exists
// to prevent.

import { getActiveCampus } from './activeCampus.js';
import {
  ALL_COURSES,
  COURSE_DB,
  DEPT_META,
  PREFIX_DEPT_MAP,
  PREREQS,
  getCourseDept,
  getCoursePrefix,
} from './catalog.js';
import {
  NSU_CATALOG_ROWS,
  NSU_DEPARTMENT_META,
  NSU_DEPARTMENT_ORDER,
  NSU_DEPARTMENT_OVERRIDES,
  NSU_PREFIX_DEPARTMENTS,
  NSU_PREREQS,
  NSU_PROGRAM_ROWS,
  NSU_UNEXPRESSED_PREREQS,
  NSU_UNTITLED_CODES,
} from './catalogNsu.generated.js';
import { DEPARTMENTS } from './departments.js';

const BRACU_CATALOG = {
  courses: COURSE_DB,
  allCourses: ALL_COURSES,
  prerequisites: PREREQS,
  prefixDepartments: PREFIX_DEPT_MAP,
  departmentMeta: DEPT_META,
  // catalog.js writes them in the order BRACU's tiles are shown.
  departmentOrder: Object.keys(DEPT_META),
  programs: DEPARTMENTS,
  // catalog.js's own lookup, which also knows BRACU's one cross-listed course.
  departmentOf: getCourseDept,
  untitled: [],
  unexpressed: [],
};

const EMPTY_CATALOG = {
  courses: {},
  allCourses: [],
  prerequisites: {},
  prefixDepartments: {},
  departmentMeta: {},
  departmentOrder: [],
  programs: {},
  departmentOf: () => null,
  untitled: [],
  unexpressed: [],
};

let _nsuCatalog = null;

// The generated module stores rows, not objects, to keep the download small.
function expandNsuCatalog() {
  const courses = {};
  for (const [code, name, credits] of NSU_CATALOG_ROWS) {
    courses[code] = { code, name, credits, full: `${name} (${code})` };
  }
  const programs = {};
  for (const [code, p] of Object.entries(NSU_PROGRAM_ROWS)) {
    programs[code] = {
      label: p.label,
      totalCredits: p.totalCredits,
      seasons: p.seasons,
      presets: p.presets.map(([name, rows]) => ({
        name,
        courses: rows.map(([course, credits]) => ({ name: course, credits, grade: '' })),
      })),
    };
  }
  return {
    courses,
    // Rows are generated in code order, so the values already are.
    allCourses: Object.values(courses),
    prerequisites: NSU_PREREQS,
    prefixDepartments: NSU_PREFIX_DEPARTMENTS,
    departmentMeta: NSU_DEPARTMENT_META,
    departmentOrder: NSU_DEPARTMENT_ORDER,
    departmentOverrides: NSU_DEPARTMENT_OVERRIDES,
    programs,
    // A course another department alone offers (BUS112 is Mathematics &
    // Physics') is that department's; everything else is its subject's owner's.
    departmentOf: code => {
      const upper = String(code).toUpperCase();
      return NSU_DEPARTMENT_OVERRIDES[upper] ?? NSU_PREFIX_DEPARTMENTS[getCoursePrefix(upper)] ?? null;
    },
    untitled: NSU_UNTITLED_CODES,
    unexpressed: NSU_UNEXPRESSED_PREREQS,
  };
}

/** The catalogue of one campus, by id. Unknown or data-less campuses get an empty one. */
export function getCatalogFor(campusId) {
  if (campusId === 'bracu') return BRACU_CATALOG;
  if (campusId === 'nsu') {
    if (_nsuCatalog === null) _nsuCatalog = expandNsuCatalog();
    return _nsuCatalog;
  }
  return EMPTY_CATALOG;
}

/** The catalogue every course lookup should use. Never null. */
export function getActiveCatalog() {
  return getCatalogFor(getActiveCampus().id);
}
