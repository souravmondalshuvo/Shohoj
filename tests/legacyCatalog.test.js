/**
 * tests/legacyCatalog.test.js (#810)
 *
 * The legacy bundle's per-campus catalogue. Three links, each checked:
 *
 *   data/campuses → scripts/legacy_catalog.mjs → js/core/catalog*.generated.js
 *                                               → js/core/activeCatalog.js
 *
 * Every generated module must be the current output of the mapping, and what
 * the app reads — catalog.js and departments.js for BRACU, activeCatalog.js
 * for NSU and DIU — must be that output again once expanded.
 *
 * BRACU's catalogue was hand-written in catalog.js and departments.js until
 * #869. The mapping was proven against those literals before they were
 * replaced, down to the order of their keys, which the checks below still hold.
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
const {
  BRACU_CATALOG_OUT_PATH,
  BRACU_DEPARTMENTS_OUT_PATH,
  DIU_COURSES_PATH,
  DIU_OUT_PATH,
  OUT_PATH,
  renderBracuCatalog,
  renderBracuDepartments,
  renderDiuCatalog,
  renderDiuCourses,
  renderNsuCatalog,
} = await import('../scripts/generate_legacy_catalog.mjs');
const { ALL_COURSES, COURSE_DB, DEPT_META, PREFIX_DEPT_MAP, PREREQS, getCourseDept } = await import('../js/core/catalog.js');
const { DEPARTMENTS } = await import('../js/core/departments.js');
const { setActiveCampusForEmail } = await import('../js/core/activeCampus.js');
const {
  catalogEntryFor,
  courseCodeIn,
  getActiveCatalog,
  getCatalogFor,
  loadDiuProgramCourses,
  normalizeCatalogCode,
  setDiuProgramCourses,
} = await import('../js/core/activeCatalog.js');

const plain = (value) => JSON.parse(JSON.stringify(value));
const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, []);
const campus = (id) => campuses.find((c) => c.id === id);

// ── BRACU's generated modules are current, and expand back to the mapping ──

assert.equal(
  fs.readFileSync(BRACU_CATALOG_OUT_PATH, 'utf8'),
  renderBracuCatalog(),
  'js/core/catalogBracu.generated.js is out of date — run: npm run generate:legacy-catalog',
);
assert.equal(
  fs.readFileSync(BRACU_DEPARTMENTS_OUT_PATH, 'utf8'),
  renderBracuDepartments(),
  'js/core/departmentsBracu.generated.js is out of date — run: npm run generate:legacy-catalog',
);

const bracu = buildLegacyCatalog(campus('bracu'), BRACU_LITERAL_SOURCES);
assert.deepEqual(bracu.courses, plain(COURSE_DB), 'COURSE_DB');
assert.deepEqual(bracu.allCourses, plain(ALL_COURSES), 'ALL_COURSES');
assert.deepEqual(bracu.prerequisites, plain(PREREQS), 'PREREQS');
assert.deepEqual(bracu.prefixDepartments, plain(PREFIX_DEPT_MAP), 'PREFIX_DEPT_MAP');
assert.deepEqual(bracu.departmentMeta, plain(DEPT_META), 'DEPT_META');
assert.deepEqual(bracu.programs, plain(DEPARTMENTS), 'DEPARTMENTS');
assert.deepEqual([bracu.untitled, bracu.unexpressed], [[], []], 'nothing of BRACU is left out');
// deepEqual does not look at key order, and the app does: the catalogue is
// listed, and the program picker filled, in the order the data files give.
const hand = (file) => campus('bracu')[file].records.filter((r) => (r.source ?? campus('bracu')[file].source) === 'bracu-catalog');
assert.deepEqual(Object.keys(COURSE_DB), hand('courses').map((c) => c.code), 'COURSE_DB order');
assert.deepEqual(Object.keys(PREREQS), hand('prerequisites').map((r) => r.course), 'PREREQS order');
assert.deepEqual(Object.keys(PREFIX_DEPT_MAP), campus('bracu').departments.records.flatMap((d) => d.prefixes), 'PREFIX_DEPT_MAP order');
assert.deepEqual(Object.keys(DEPARTMENTS), campus('bracu').programs.records.map((p) => p.code), 'DEPARTMENTS order');
// The department tiles keep the order reviewsTab.js used to spell out itself,
// and the one cross-listed course keeps the owner departments.json gives it.
assert.deepEqual(
  bracu.departmentOrder,
  ['CSE', 'EEE', 'ECE', 'MPS', 'BBA', 'ENG', 'ECO', 'ANT', 'ARC', 'PHR', 'LLB', 'GENED'],
  "BRACU's tile order",
);
assert.deepEqual(bracu.departmentOrder, Object.keys(DEPT_META), 'which is the order DEPT_META keeps');
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

// DIU's module is current, and its catalogue is one program's at a time: a
// DIU code is unique only within a department, so there is no campus-wide
// course table — and never another university's in its place.
assert.equal(
  fs.readFileSync(DIU_OUT_PATH, 'utf8'),
  renderDiuCatalog(),
  'js/core/catalogDiu.generated.js is out of date — run: npm run generate:legacy-catalog',
);
const diuData = campus('diu');
const listed = (program) =>
  diuData.programCourses.records
    .filter((r) => r.program === program)
    .map((r) => [r.code, r.title, r.credits])
    .sort(([a], [b]) => (a < b ? -1 : 1));

// The lists are fetched, not bundled. Before they arrive a DIU catalogue has
// programs and no courses; this hands them over the way the page's fetch does.
assert.deepEqual(getCatalogFor('diu', 'CSE').allCourses, [], 'nothing before the lists arrive');
const diuCourses = JSON.parse(fs.readFileSync(DIU_COURSES_PATH, 'utf8'));
assert.equal(fs.readFileSync(DIU_COURSES_PATH, 'utf8'), renderDiuCourses(), 'feeds/diu-courses.json is current');
setDiuProgramCourses(diuCourses.programs);

// No program picked: programs to pick from, and no courses.
const unpicked = getCatalogFor('diu', '');
assert.deepEqual([unpicked.allCourses, Object.keys(unpicked.prerequisites), unpicked.departmentOrder], [[], [], []]);
assert.equal(Object.keys(unpicked.programs).length, 33);
assert.equal(unpicked.programs.CSE.totalCredits, 154.5, 'half credits survive');
assert.deepEqual(unpicked.programs.CSE.seasons, ['Spring', 'Summer', 'Fall'], "trimester by CSE's own course offer");
assert.equal(unpicked.programs.BBA.seasons, undefined, 'no calendar is claimed where DIU states none');
assert.deepEqual(plain(unpicked.programs), plain(buildLegacyCatalog(diuData).programs), "DIU's programs equal the mapping");

// A program picked: exactly the courses its page lists.
const cse = getCatalogFor('diu', 'CSE');
assert.deepEqual(cse.allCourses.map((c) => [c.code, c.name, c.credits]), listed('CSE'));
assert.equal(cse.courses.CSE113.name, 'Programming and Problem Solving');
assert.equal(cse.courses.CSE114.credits, 1.5);
assert.equal(cse.courses.CSE113.full, 'Programming and Problem Solving (CSE113)');
assert.equal(cse.programs, unpicked.programs, 'one program table for every pick');
assert.equal(getCatalogFor('diu', 'CSE'), cse, 'expanded once per program');
// The same code is another course in another program.
assert.equal(cse.courses.CSE212.name, 'Discrete Mathematics');
assert.match(getCatalogFor('diu', 'RME').courses.CSE212.name, /Object Oriented Programming/);
// A program whose page lists no courses Shohoj can read offers none.
assert.deepEqual(getCatalogFor('diu', 'LLB').allCourses, []);
// A code is read however it was typed, and written as the catalogue writes it.
assert.deepEqual(
  ['0413 313', '0413313', '0413 - 313', '0321-106l', 'cse-113', 'CSE 113', 'CSE113', 'BPH 111P', 'Strategic Management', '04133', 'CSE11'].map(normalizeCatalogCode),
  ['0413-313', '0413-313', '0413-313', '0321-106L', 'CSE113', 'CSE113', 'CSE113', 'BPH111P', null, null, null],
);
assert.equal(courseCodeIn('Production and Operations Management (0413-313)'), '0413-313');
assert.equal(courseCodeIn('Programming and Problem Solving (CSE113)'), 'CSE113');
assert.equal(courseCodeIn('0413 313'), '0413-313');
assert.equal(courseCodeIn('A course with no code'), null);
assert.equal(catalogEntryFor('0413313', getCatalogFor('diu', 'BBA')).code, '0413-313');
// ISCED field codes are catalogue codes like any other.
assert.equal(getCatalogFor('diu', 'BBA').courses['0413-313'].name, 'Production and Operations Management');
assert.deepEqual(getCatalogFor('diu', 'NOPE').allCourses, []);
// Electives are published as slots, so every DIU catalogue is partial and a
// course it does not hold takes typed credits.
for (const c of [unpicked, cse, getCatalogFor('diu', 'BBA')]) assert.equal(c.typesCredits, true);
for (const id of ['bracu', 'nsu']) assert.equal(getCatalogFor(id).typesCredits, undefined, `${id} keeps catalogue credits`);
assert.equal(cse.departmentOf('CSE228'), null);

// The fetch: the page's own URL for the lists, once, and a failure leaves the
// catalogue working without them and tries again next time.
setDiuProgramCourses(null);
const asked = [];
const failing = (url) => { asked.push(url); return Promise.resolve({ ok: false, status: 404 }); };
assert.equal(await loadDiuProgramCourses(failing), false);
assert.deepEqual(getCatalogFor('diu', 'CSE').allCourses, []);
const serving = (url) => { asked.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(diuCourses) }); };
const [first, second] = await Promise.all([loadDiuProgramCourses(serving), loadDiuProgramCourses(serving)]);
assert.deepEqual([first, second], [true, true]);
assert.deepEqual(asked, ['feeds/diu-courses.json', 'feeds/diu-courses.json'], 'one failed fetch, then one shared fetch');
assert.equal(await loadDiuProgramCourses(serving), true);
assert.equal(asked.length, 2, 'not fetched again once in hand');
assert.equal(getCatalogFor('diu', 'CSE').courses.CSE113.name, 'Programming and Problem Solving');

// It follows the signed-in student's campus.
setActiveCampusForEmail('someone@s.diu.edu.bd');
assert.equal(getActiveCatalog(), getCatalogFor('diu'));
setActiveCampusForEmail(null);

// A campus with no catalogue gets none — never another university's.
const none = getCatalogFor('aiub');
assert.deepEqual([none.allCourses, Object.keys(none.courses), Object.keys(none.programs)], [[], [], []]);

console.log('legacyCatalog: the mapping reproduces BRACU, the NSU and DIU modules are current, the accessor follows the campus');
