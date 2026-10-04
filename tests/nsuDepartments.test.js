/**
 * tests/nsuDepartments.test.js (#833)
 *
 * data/campuses/nsu/departments.json says which department owns each course
 * subject. That is not typed in from a list of departments: it is derived from
 * the offering department NSU names on every row of the Fall 2025 offered
 * list. This re-derives it, so the file cannot drift from the rows it rests
 * on, and so the rule is written down somewhere it is run.
 *
 *   - A subject belongs to the department that offers most of its sections.
 *     A tie goes to the department that offers the subject's lowest-numbered
 *     course — the undergraduate one, where the other is the MBA office.
 *   - A course that one other department alone offers is an override.
 *   - Three subjects appear only on the bi-semester list, which names no
 *     department, and are placed by program. Those are listed here by name so
 *     nothing else can be added that the offered list does not say.
 */

import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};

const { loadCampuses } = await import('../scripts/campus_data.mjs');
const { getCatalogFor } = await import('../js/core/activeCatalog.js');

const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, []);
const nsu = campuses.find((c) => c.id === 'nsu');
const { records, overrides } = nsu.departments;
const rows = nsu.sections['253-trimester'].records;
assert.ok(rows.every((r) => r.department), 'every Fall 2025 row names its offering department');

const subject = (course) => course.match(/^[A-Z]+/)[0];
const number = (course) => Number(course.match(/\d+/)[0]);
const tally = (map, key, department) => {
  if (!map.has(key)) map.set(key, new Map());
  map.get(key).set(department, (map.get(key).get(department) ?? 0) + 1);
};
const bySubject = new Map();
const byCourse = new Map();
for (const r of rows) {
  tally(bySubject, subject(r.course), r.department);
  tally(byCourse, r.course, r.department);
}

// ── The rule ────────────────────────────────────────────────────────────────

function ownerOf(subj) {
  const counts = bySubject.get(subj);
  const most = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === most).map(([d]) => d).sort();
  if (leaders.length === 1) return leaders[0];
  const lowest = [...byCourse.keys()]
    .filter((course) => subject(course) === subj)
    .sort((a, b) => number(a) - number(b) || a.localeCompare(b))[0];
  return leaders.find((d) => byCourse.get(lowest).has(d)) ?? leaders[0];
}

const derivedOwner = new Map([...bySubject.keys()].map((subj) => [subj, ownerOf(subj)]));
const derivedOverrides = [...byCourse]
  .filter(([course, counts]) => counts.size === 1 && !counts.has(derivedOwner.get(subject(course))))
  .map(([course, counts]) => ({ course, department: [...counts.keys()][0] }))
  .sort((a, b) => a.course.localeCompare(b.course));

// ── The file is the rule's output ───────────────────────────────────────────

/** Placed by program, because the bi-semester list names no department. */
const BY_PROGRAM = { PHR: 'PHR', LLB: 'LAW', LLM: 'LAW' };
for (const subj of Object.keys(BY_PROGRAM)) {
  assert.ok(!bySubject.has(subj), `${subj} is not on the Fall 2025 trimester list`);
}

const fileOwner = new Map(records.flatMap((d) => d.prefixes.map((p) => [p, d.code])));
assert.deepEqual(
  Object.fromEntries([...fileOwner].sort()),
  Object.fromEntries([...derivedOwner, ...Object.entries(BY_PROGRAM)].sort()),
  'every subject is owned by the department that offers most of it',
);
assert.deepEqual(overrides, derivedOverrides, 'overrides are exactly the courses another department alone offers');

// The one tie, and that it went to the undergraduate department.
assert.equal(fileOwner.get('SCM'), 'MGT');
assert.deepEqual([...bySubject.get('SCM')].sort(), [['MBA', 3], ['MGT', 3]]);
// The override the note names.
assert.deepEqual(overrides.find((o) => o.course === 'BUS112'), { course: 'BUS112', department: 'MAT' });

// ── It describes the list it came from ──────────────────────────────────────

const overrideOf = new Map(overrides.map((o) => [o.course, o.department]));
const resolve = (course) => overrideOf.get(course) ?? fileOwner.get(subject(course));
const disagree = rows.filter((r) => resolve(r.course) !== r.department);
// Only a course several departments offer can disagree, and only for the
// sections its subject's owner does not teach.
assert.deepEqual([...new Set(disagree.map((r) => r.course))].sort(), ['BUS498', 'ECO104']);
assert.ok(disagree.length / rows.length < 0.03, `${disagree.length} of ${rows.length} sections`);

// Every department the list uses is in the table, and every one in the table
// (bar Pharmaceutical Sciences, which the list never reaches) is on the list.
const listed = new Set(rows.map((r) => r.department));
const codes = records.map((d) => d.code);
assert.deepEqual([...listed].filter((d) => !codes.includes(d)), []);
assert.deepEqual(codes.filter((d) => !listed.has(d)), ['PHR']);
assert.equal(new Set(codes).size, codes.length);
// The catalogue's own per-course department, where it records one, agrees.
for (const course of nsu.courses.records) {
  if (course.department) assert.ok(codes.includes(course.department), `${course.code}: ${course.department}`);
}

// Four schools, as programs.json spells them.
const schools = new Set(nsu.programs.records.map((p) => p.school));
for (const d of records) assert.ok(schools.has(d.school), `${d.code}: ${d.school}`);

// ── And the legacy catalogue carries it ─────────────────────────────────────

const catalog = getCatalogFor('nsu');
assert.deepEqual(catalog.departmentOrder, codes, 'tiles in the order the file lists them: by school');
assert.equal(catalog.departmentMeta.ECE.label, 'Electrical and Computer Engineering');
assert.equal(catalog.departmentOf('CSE115'), 'ECE', "a subject's owner");
assert.equal(catalog.departmentOf('cse115'), 'ECE');
assert.equal(catalog.departmentOf('BUS112'), 'MAT', 'an override wins over the subject');
assert.equal(catalog.departmentOf('BUS172'), 'MGT');
assert.equal(catalog.departmentOf('PHR101'), 'PHR');
assert.equal(catalog.departmentOf('GEO101'), null, 'a subject the list never offers has no owner');
// Every department has at least one titled course to show on its page.
for (const code of codes) {
  const count = catalog.allCourses.filter((c) => catalog.departmentOf(c.code) === code).length;
  assert.ok(count > 0, `${code} has no courses in the catalogue`);
}

console.log(`nsuDepartments: ${codes.length} departments, ${fileOwner.size} subjects and ${overrides.length} overrides match the Fall 2025 list`);
