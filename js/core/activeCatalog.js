// ── ACTIVE CATALOGUE (legacy bundle) ─────────────────────────────────────────
//
// The course catalogue, prerequisites and programs of the campus the student
// is on — the catalogue counterpart of activeCampus.js, which answers the same
// question for grading rules.
//
// All are generated from data/campuses/ (scripts/generate_legacy_catalog.mjs).
// BRACU's is expanded by catalog.js and departments.js, whose constants are
// handed back as they are: the same objects, so nothing about BRACU changes by
// reading them through here. NSU's is expanded into the same shapes on first
// use. DIU's is per program: its programs, and the courses of the one the
// student has picked (expandDiuCatalog below says why).
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
import { DIU_COURSES_URL, DIU_PROGRAM_ROWS } from './catalogDiu.generated.js';
import { DEPARTMENTS } from './departments.js';
import { state } from './state.js';

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

// DIU's catalogue is one program's. Its codes are unique only within a
// department — CSE212 is Discrete Mathematics in CSE and a lab in RME — so the
// courses a DIU student is offered are those of the program they picked, and
// a student who has picked none is offered none.
const _diuCatalogs = new Map();
let _diuPrograms = null;
// program → [[code, title, credits]], once fetched. The lists are not in the
// bundle: every student would download them, and only DIU's read them.
let _diuProgramCourses = null;
let _diuLoading = null;

/** Hand the catalogue DIU's course lists (feeds/diu-courses.json's `programs`). */
export function setDiuProgramCourses(lists) {
  _diuProgramCourses = lists && typeof lists === 'object' ? lists : null;
  _diuCatalogs.clear();
}

/**
 * Fetch DIU's course lists, once. Resolves true when they are in hand. Until
 * then a DIU catalogue has programs and no courses, and every course takes
 * typed credits — the page still works, it just fills in less. On success the
 * page is told (`shohoj:catalog-changed`) so it can draw again with them.
 */
export function loadDiuProgramCourses(fetchImpl = globalThis.fetch) {
  if (_diuProgramCourses !== null) return Promise.resolve(true);
  if (_diuLoading) return _diuLoading;
  if (typeof fetchImpl !== 'function') return Promise.resolve(false);
  _diuLoading = Promise.resolve()
    .then(() => fetchImpl(DIU_COURSES_URL))
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
    .then(body => {
      setDiuProgramCourses(body.programs);
      globalThis.dispatchEvent?.(new CustomEvent('shohoj:catalog-changed', { detail: { campus: 'diu' } }));
      return true;
    })
    .catch(() => {
      // A later visit to the tab, or the next campus change, tries again.
      _diuLoading = null;
      return false;
    });
  return _diuLoading;
}

function diuPrograms() {
  if (_diuPrograms === null) {
    _diuPrograms = {};
    for (const [code, p] of Object.entries(DIU_PROGRAM_ROWS)) {
      _diuPrograms[code] = { ...p, presets: [] };
    }
  }
  return _diuPrograms;
}

function expandDiuCatalog(program) {
  const courses = {};
  for (const [code, name, credits] of _diuProgramCourses?.[program] ?? []) {
    courses[code] = { code, name, credits, full: `${name} (${code})` };
  }
  return {
    ...EMPTY_CATALOG,
    courses,
    allCourses: Object.values(courses),
    departmentOverrides: {},
    programs: diuPrograms(),
    // The lists are each program's published courses, and its electives are
    // published as slots ("CSE-***"), not as courses. A course a list does not
    // hold is still a real course, so its credits are the student's to type.
    typesCredits: true,
  };
}

/**
 * The catalogue of one campus, by id. Unknown or data-less campuses get an
 * empty one. DIU's is the given program's (by default the one the student has
 * picked).
 */
export function getCatalogFor(campusId, program = state.currentDept) {
  if (campusId === 'bracu') return BRACU_CATALOG;
  if (campusId === 'nsu') {
    if (_nsuCatalog === null) _nsuCatalog = expandNsuCatalog();
    return _nsuCatalog;
  }
  if (campusId === 'diu') {
    const key = _diuProgramCourses && Object.prototype.hasOwnProperty.call(_diuProgramCourses, program) ? program : '';
    if (!_diuCatalogs.has(key)) _diuCatalogs.set(key, expandDiuCatalog(key));
    return _diuCatalogs.get(key);
  }
  return EMPTY_CATALOG;
}

/** The catalogue every course lookup should use. Never null. */
export function getActiveCatalog() {
  return getCatalogFor(getActiveCampus().id);
}
