/**
 * tests/legacyCatalog.test.js (#810)
 *
 * The legacy bundle's per-campus catalogue. Three links, each checked:
 *
 *   data/campuses → scripts/legacy_catalog.mjs → js/core/catalogNsu.generated.js
 *                                               → js/core/activeCatalog.js
 *
 * The mapping is trusted because, run on BRACU's records, it reproduces
 * BRACU's hand-written literals exactly. The generated NSU module must be the
 * current output of that mapping, and what activeCatalog hands back must be
 * that output again once expanded.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';

// activeCampus.js announces campus changes on window.
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};

const { loadCampuses } = await import('../scripts/campus_data.mjs');
const { BRACU_LITERAL_SOURCES, buildLegacyCatalog } = await import('../scripts/legacy_catalog.mjs');
const { OUT_PATH, renderNsuCatalog } = await import('../scripts/generate_legacy_catalog.mjs');
const { ALL_COURSES, COURSE_DB, DEPT_META, PREFIX_DEPT_MAP, PREREQS, getCourseDept } = await import('../js/core/catalog.js');
const { DEPARTMENTS } = await import('../js/core/departments.js');
const { setActiveCampusForEmail } = await import('../js/core/activeCampus.js');
const { getActiveCatalog, getCatalogFor } = await import('../js/core/activeCatalog.js');

const plain = (value) => JSON.parse(JSON.stringify(value));
const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, []);
const campus = (id) => campuses.find((c) => c.id === id);

// ── The mapping reproduces BRACU's literals ─────────────────────────────────

const bracu = buildLegacyCatalog(campus('bracu'), BRACU_LITERAL_SOURCES);
assert.deepEqual(bracu.courses, plain(COURSE_DB), 'COURSE_DB');
assert.deepEqual(bracu.allCourses, plain(ALL_COURSES), 'ALL_COURSES');
assert.deepEqual(bracu.prerequisites, plain(PREREQS), 'PREREQS');
assert.deepEqual(bracu.prefixDepartments, plain(PREFIX_DEPT_MAP), 'PREFIX_DEPT_MAP');
assert.deepEqual(bracu.departmentMeta, plain(DEPT_META), 'DEPT_META');
assert.deepEqual(bracu.programs, plain(DEPARTMENTS), 'DEPARTMENTS');
assert.deepEqual([bracu.untitled, bracu.unexpressed], [[], []], 'nothing of BRACU is left out');
// The department tiles keep the order reviewsTab.js used to spell out itself,
// and the one cross-listed course keeps the owner catalog.js hard-codes.
assert.deepEqual(
  bracu.departmentOrder,
  ['CSE', 'EEE', 'ECE', 'MPS', 'BBA', 'ENG', 'ECO', 'ANT', 'ARC', 'PHR', 'LLB', 'GENED'],
  "BRACU's tile order",
);
assert.deepEqual(bracu.departmentOrder, Object.keys(DEPT_META), 'which is the order catalog.js writes DEPT_META in');
assert.deepEqual(bracu.departmentOverrides, { CST333: 'BBA' });
for (const [course, department] of Object.entries(bracu.departmentOverrides)) {
  assert.equal(getCourseDept(course), department, `getCourseDept(${course})`);
}

// ── It leaves out what the legacy shapes cannot say ─────────────────────────

{
  const rule = (course, extra) => ({ course, raw: 'x', source: 's', ...extra });
  const built = buildLegacyCatalog({
    profile: { termSystems: { records: [{ id: 'tri', terms: [{ season: 'Spring' }, { season: 'Fall' }] }] } },
    courses: {
      source: 's',
      records: [
        { code: 'AAA101', title: 'Titled', credits: 3 },
        { code: 'AAA102', title: null, credits: null, source: 'stub' },
      ],
    },
    prerequisites: {
      source: 's',
      records: [
        rule('FLAT201', { allOf: [['AAA101'], ['BBB101']] }),
        rule('ALT201', { allOf: [['AAA101', 'BBB101']] }),
        rule('CRED201', { allOf: [['AAA101']], minCredits: 60 }),
        rule('CGPA201', { allOf: [['AAA101']], minCgpa: 3 }),
        rule('ASK201', { allOf: [['AAA101']], orConsent: true }),
        rule('RAW201', { unparsed: true }),
        rule('SAME201', { program: 'P1', allOf: [['AAA101']] }),
        rule('SAME201', { program: 'P2', allOf: [['AAA101']] }),
        rule('SPLIT201', { program: 'P1', allOf: [['AAA101']] }),
        rule('SPLIT201', { program: 'P2', allOf: [['BBB101']] }),
        rule('SOFT201', { recommended: ['AAA101'] }),
      ],
    },
    programs: { records: [{ code: 'P1', name: 'Program One', totalCredits: 120, termSystem: 'tri' }] },
    plans: {
      records: [
        { program: 'P1', term: 2, code: null, title: 'Open elective', credits: 3 },
        { program: 'P1', term: 1, code: 'AAA101', title: 'Titled', credits: 3 },
      ],
    },
  });

  // A course needs a name to be in the catalogue; a stub's code is kept aside.
  assert.deepEqual(Object.keys(built.courses), ['AAA101']);
  assert.deepEqual(built.untitled, ['AAA102']);

  // Only a rule a flat list says in full is kept — and only if every program
  // that states one states the same.
  assert.deepEqual(built.prerequisites, {
    FLAT201: { hp: ['AAA101', 'BBB101'] },
    SAME201: { hp: ['AAA101'] },
    SOFT201: { sp: ['AAA101'] },
  });
  assert.deepEqual(built.unexpressed, ['ALT201', 'ASK201', 'CGPA201', 'CRED201', 'RAW201', 'SPLIT201']);

  // Presets run in term order; a slot with no code keeps its title bare, and
  // a plan with no term labels numbers its semesters.
  assert.deepEqual(built.programs.P1, {
    label: 'Program One',
    totalCredits: 120,
    seasons: ['Spring', 'Fall'],
    presets: [
      { name: 'Semester 1', courses: [{ name: 'Titled (AAA101)', credits: 3, grade: '' }] },
      { name: 'Semester 2', courses: [{ name: 'Open elective', credits: 3, grade: '' }] },
    ],
  });
}

// ── The generated module is current, and expands back to the mapping ───────

assert.equal(
  fs.readFileSync(OUT_PATH, 'utf8'),
  renderNsuCatalog(),
  'js/core/catalogNsu.generated.js is out of date — run: npm run generate:legacy-catalog',
);

const nsu = buildLegacyCatalog(campus('nsu'));
assert.deepEqual(plain(getCatalogFor('nsu')), nsu, 'the expanded NSU catalogue equals the mapping');
assert.ok(nsu.allCourses.length >= 1000 && Object.keys(nsu.programs).length === 25);
assert.ok(nsu.courses.CSE115 && !nsu.courses.CSE110, 'NSU has its own CSE115, not BRACU\'s CSE110');
assert.deepEqual(nsu.prerequisites.CSE225, { hp: ['CSE215'] });
assert.ok(nsu.programs.CSE.presets.length > 0, 'CSE has a semester-by-semester plan');
assert.deepEqual(nsu.programs.LLB.seasons, ['Spring', 'Summer'], 'LLB runs on the bi-semester calendar');
assert.equal(getCatalogFor('nsu'), getCatalogFor('nsu'), 'expanded once');

// ── The accessor ────────────────────────────────────────────────────────────

// BRACU's catalogue is the existing constants themselves, not copies.
const b = getCatalogFor('bracu');
assert.equal(b.courses, COURSE_DB);
assert.equal(b.allCourses, ALL_COURSES);
assert.equal(b.prerequisites, PREREQS);
assert.equal(b.prefixDepartments, PREFIX_DEPT_MAP);
assert.equal(b.departmentMeta, DEPT_META);
assert.equal(b.programs, DEPARTMENTS);
assert.deepEqual(b.departmentOrder, bracu.departmentOrder);
assert.equal(b.departmentOf('CST333'), 'BBA');

// It follows the signed-in student's campus, and is BRACU's otherwise.
assert.equal(getActiveCatalog(), getCatalogFor('bracu'), 'signed out');
setActiveCampusForEmail('first.last@northsouth.edu');
assert.equal(getActiveCatalog(), getCatalogFor('nsu'));
setActiveCampusForEmail('21301234@g.bracu.ac.bd');
assert.equal(getActiveCatalog(), getCatalogFor('bracu'));
setActiveCampusForEmail(null);
assert.equal(getActiveCatalog(), getCatalogFor('bracu'));

// A campus with no catalogue gets none — never another university's.
const none = getCatalogFor('diu');
assert.deepEqual([none.allCourses, Object.keys(none.courses), Object.keys(none.programs)], [[], [], []]);

console.log('legacyCatalog: the mapping reproduces BRACU, the NSU module is current, the accessor follows the campus');
