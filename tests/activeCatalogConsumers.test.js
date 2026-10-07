/**
 * tests/activeCatalogConsumers.test.js (#815)
 *
 * The legacy calculator page reads courses and programs through the active
 * campus's catalogue. Two things keep that true:
 *
 *   - a guard: no module imports BRACU's catalogue constants directly, except
 *     the few listed here with their reason, so a new feature cannot quietly
 *     show every campus BRACU's courses;
 *   - the course lookup the data layers validate with (reviews, papers, study
 *     groups) is BRACU's until the page points it at another catalogue.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Nothing reads BRACU's constants behind the catalogue's back ─────────────

const CONSTANTS = ['COURSE_DB', 'ALL_COURSES', 'PREREQS', 'DEPARTMENTS', 'PREFIX_DEPT_MAP', 'DEPT_META', 'getCourseDept'];
const MAY_IMPORT = {
  'js/core/activeCatalog.js': "hands them back as BRACU's catalogue",
  'js/core/courseLookup.js': 'the default lookup, for bundles that carry no campus catalogue (admin)',
  'js/core/announcementDetector.js': 'a twin of shell code; Tasks is a BRACU-only feature',
  'js/ui/unlockMapCard.js': "the profile page's unlock map, fed by BRACU's section feed",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const offenders = [];
const used = new Set();
for (const file of walk(path.join(ROOT, 'js'))) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, 'utf8');
  for (const [, names, from] of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    if (!/\/(catalog|departments)\.js$/.test(from)) continue;
    const direct = names.split(',').map((n) => n.trim()).filter((n) => CONSTANTS.includes(n));
    if (direct.length === 0) continue;
    if (rel in MAY_IMPORT) used.add(rel);
    else offenders.push(`${rel} imports ${direct.join(', ')}`);
  }
}
assert.deepEqual(
  offenders,
  [],
  `read these through getActiveCatalog() (js/core/activeCatalog.js), or findCourse() in a data layer:\n  ${offenders.join('\n  ')}`,
);
// The allowance list can only shrink on purpose.
assert.deepEqual(Object.keys(MAY_IMPORT).filter((f) => !used.has(f)), [], 'an allowance nothing uses any more');

// ── The course lookup ───────────────────────────────────────────────────────

const { findCourse, setCourseLookup } = await import('../js/core/courseLookup.js');
const { COURSE_DB } = await import('../js/core/catalog.js');
const { getCatalogFor } = await import('../js/core/activeCatalog.js');
const reviews = await import('../js/core/reviews.js');
const papers = await import('../js/core/papers.js');
const groups = await import('../js/core/studyGroups.js');
const validators = { reviews, papers, groups };

// Untouched — as on the admin page — it is BRACU's catalogue.
assert.equal(findCourse('CSE110'), COURSE_DB.CSE110);
assert.equal(findCourse('CSE115'), undefined, 'CSE115 is an NSU course');
for (const [name, mod] of Object.entries(validators)) {
  assert.equal(mod.isKnownCourseCode('cse110'), true, `${name}: BRACU course`);
  assert.equal(mod.isKnownCourseCode('CSE115'), false, `${name}: not a BRACU course`);
}

// Pointed at NSU's catalogue, every data layer validates against NSU's courses.
const nsu = getCatalogFor('nsu');
setCourseLookup((code) => nsu.courses[code]);
assert.equal(findCourse('CSE115'), nsu.courses.CSE115);
for (const [name, mod] of Object.entries(validators)) {
  assert.equal(mod.isKnownCourseCode('CSE115'), true, `${name}: NSU course`);
  assert.equal(mod.isKnownCourseCode('CSE110'), false, `${name}: BRACU's CSE110 is unknown at NSU`);
  assert.equal(mod.isKnownCourseCode('<script>'), false, `${name}: shape is still checked first`);
}
assert.equal(
  reviews.validateReview({ facultyInitials: 'ABC', courseCode: 'CSE110', ratings: {} }),
  'Unknown course code',
  'a review for another campus\'s course is refused',
);
setCourseLookup((code) => COURSE_DB[code]);

// ── Which department owns a course is the campus's rule ─────────────────────

const bracu = getCatalogFor('bracu');
assert.equal(bracu.departmentOf('CSE110'), 'CSE');
assert.equal(bracu.departmentOf('CST333'), 'BBA', "BRACU's cross-listed course keeps its override");
assert.equal(nsu.departmentOf('CSE115'), 'ECE', "NSU's CSE is Electrical and Computer Engineering's");
assert.equal(nsu.departmentOf('BUS112'), 'MAT', 'and its own override wins over the subject');
assert.equal(getCatalogFor('diu').departmentOf('CSE101'), null);

console.log('activeCatalogConsumers: no direct BRACU reads, and the course lookup follows the page');
