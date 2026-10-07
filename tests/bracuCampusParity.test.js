/**
 * tests/bracuCampusParity.test.js (#792)
 *
 * The proof that data/campuses/bracu/ holds every BRACU fact Shohoj keeps in
 * code — not most of it. Each block rebuilds one runtime structure purely from
 * the database files and requires it to equal what the code exports today:
 * the catalogue, prerequisites, department ownership, programs and presets,
 * grading, marks, standing tiers, the minor, the BRACU profile, campus
 * location and hours, bus, cafeteria, campus places, faculty and seed reviews.
 *
 * Until the code is generated from the database, both copies exist. When one
 * of those literals changes, this test fails and names it: re-run
 * `node scripts/export_bracu_campus_data.mjs` (see its header for the feed
 * arguments) so the database follows.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCampuses } from '../scripts/campus_data.mjs';
import { COURSE_DB, ALL_COURSES, PREREQS, PREFIX_DEPT_MAP, DEPT_META, getCourseDept } from '../js/core/catalog.js';
import { DEPARTMENTS } from '../js/core/departments.js';
import { GRADES, POINTS_TO_GRADE } from '../js/core/grades.js';
import { MARK_SCALE } from '../js/core/courseMarks.js';
import { MILESTONE_TIERS } from '../js/core/milestones.js';
import { MINOR_PROGRAMS } from '../js/core/minors.js';
import { CAMPUS_START_MIN, CAMPUS_END_MIN } from '../js/core/freeRooms.js';
import { CAMPUS_UTC_OFFSET_MIN } from '../js/core/semesterBriefing.js';
import { SEMESTER_TERM_NAMES } from '../js/core/semesterIdentity.js';
import * as bus from '../src/core/busRoutes.ts';
import * as cafeteria from '../src/core/cafeteriaOutlets.ts';
import * as places from '../src/core/campusPlaces.ts';
import { CAMPUS_LAT, CAMPUS_LNG, CAMPUS_RADIUS_M } from '../src/core/campusRooms.ts';
import { DEPARTMENT_LABELS } from '../src/core/transcript.ts';
import { UNIVERSITIES } from '../src/core/university.ts';
import { UNIVERSITIES as LEGACY_UNIVERSITIES } from '../js/core/university.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value)); // drop freezes and prototypes

const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, [], `data/campuses has errors:\n${errors.join('\n')}`);
const bracu = campuses.find((c) => c.id === 'bracu');
assert.ok(bracu, 'BRACU is in the campus database');
const p = bracu.profile;

// ── Catalogue ───────────────────────────────────────────────────────────────
const codeBased = bracu.courses.records.filter((c) => c.source === 'bracu-catalog' || c.source === 'bracu-departments');
const courseDb = Object.fromEntries(
  codeBased.map((c) => [c.code, { code: c.code, name: c.title, credits: c.credits, full: `${c.title} (${c.code})` }]),
);
assert.deepEqual(courseDb, plain(COURSE_DB), 'COURSE_DB');
assert.deepEqual(Object.values(courseDb).sort((a, b) => a.code.localeCompare(b.code)), plain(ALL_COURSES), 'ALL_COURSES');
// The catalogue is generated from these records (#869) and keeps their order.
assert.deepEqual(codeBased.map((c) => c.code), Object.keys(COURSE_DB), 'COURSE_DB order');

const prereqs = {};
for (const r of bracu.prerequisites.records.filter((x) => x.source === 'bracu-catalog')) {
  prereqs[r.course] = {
    ...(r.allOf ? { hp: r.allOf.map((group) => { assert.equal(group.length, 1); return group[0]; }) } : {}),
    ...(r.recommended ? { sp: r.recommended } : {}),
  };
}
assert.deepEqual(prereqs, plain(PREREQS), 'PREREQS');

const prefixMap = {};
const deptMeta = {};
for (const d of bracu.departments.records) {
  for (const prefix of d.prefixes) prefixMap[prefix] = d.code;
  deptMeta[d.code] = { label: d.label, ...(d.displayCode ? { displayCode: d.displayCode } : {}), school: d.school };
}
assert.deepEqual(prefixMap, plain(PREFIX_DEPT_MAP), 'PREFIX_DEPT_MAP');
assert.deepEqual(deptMeta, plain(DEPT_META), 'DEPT_META');
for (const o of bracu.departments.overrides) assert.equal(getCourseDept(o.course), o.department, `getCourseDept(${o.course})`);

// ── Programs and presets ────────────────────────────────────────────────────
const seasonsOf = Object.fromEntries(p.termSystems.records.map((t) => [t.id, t.terms.map((x) => x.season)]));
const departments = {};
for (const prog of bracu.programs.records) {
  const items = bracu.plans.records.filter((x) => x.program === prog.code);
  const terms = [...new Set(items.map((x) => x.term))].sort((a, b) => a - b);
  departments[prog.code] = {
    label: prog.name,
    totalCredits: prog.totalCredits,
    seasons: seasonsOf[prog.termSystem],
    presets: terms.map((t) => {
      const inTerm = items.filter((x) => x.term === t);
      return {
        name: inTerm[0].termLabel,
        courses: inTerm.map((x) => ({ name: `${x.title} (${x.code})`, credits: x.credits, grade: '' })),
      };
    }),
  };
}
assert.deepEqual(departments, plain(DEPARTMENTS), 'DEPARTMENTS');
for (const [code, label] of Object.entries(DEPARTMENT_LABELS)) {
  assert.equal(bracu.programs.records.find((x) => x.code === code)?.name, label, `transcript DEPARTMENT_LABELS.${code}`);
}

// ── Grading, marks, standing ────────────────────────────────────────────────
const grades = Object.fromEntries([
  ...p.grading.scale.map((g) => [g.letter, g.points]),
  ...p.grading.nonGpaGrades.map((g) => [g.letter, null]),
]);
assert.deepEqual(grades, plain(GRADES), 'GRADES');
assert.deepEqual(p.grading.pointsToGrade, plain(POINTS_TO_GRADE), 'POINTS_TO_GRADE');
const marks = p.grading.scale.filter((g) => g.minMark !== null).map((g) => ({ letter: g.letter, min: g.minMark }));
assert.deepEqual(marks, plain(MARK_SCALE), 'MARK_SCALE');
assert.deepEqual(
  p.standingTiers.records.map((t) => ({ id: t.id, standingLabel: t.standingLabel, goalLabel: t.goalLabel, threshold: t.minCgpa })),
  plain(MILESTONE_TIERS),
  'MILESTONE_TIERS',
);
// The meter bands live in main.js's recalc as literals; every band and label
// must still be there.
const mainJs = source('js/main.js');
for (const band of p.meterBands.records) {
  assert.ok(mainJs.includes(`<strong>${band.label}</strong>`), `main.js meter label ${band.label}`);
  if (band.minCgpa > 0) assert.ok(mainJs.includes(`cgpaCompleted >= ${band.minCgpa}`), `main.js meter threshold ${band.minCgpa}`);
}

// ── The BRACU profile, in both registries ───────────────────────────────────
// src/core/university.ts (the shell) and its legacy twin js/core/university.js
// each hold a copy; the database must match both.
for (const [where, registry] of [
  ['src/core/university.ts', UNIVERSITIES.bracu],
  ['js/core/university.js', LEGACY_UNIVERSITIES.bracu],
]) {
  assert.equal(p.name, registry.name, `${where} name`);
  assert.equal(p.shortName, registry.shortName, `${where} shortName`);
  assert.deepEqual(p.identity.emailDomains, plain(registry.emailDomains), `${where} email domains`);
  assert.deepEqual(grades, plain(registry.grades.points), `${where} grade points`);
  assert.deepEqual(marks, plain(registry.grades.marks), `${where} mark cutoffs`);
  assert.equal(p.retake.counts, registry.retake.kind, `${where} retake kind`);
  assert.deepEqual(p.retake.cutoff, plain(registry.retake.cutoff), `${where} retake cutoff`);
  assert.equal(p.retake.maxRetakes, registry.maxRetakes ?? null, `${where} max retakes`);
  // "Repeatable at or below B-" must pick exactly the letters the registry's
  // "strictly below 3.0" rule does.
  const eligible = (points) => (registry.repeat.inclusive ? points <= registry.repeat.threshold : points < registry.repeat.threshold);
  const ceiling = p.grading.scale.find((g) => g.letter === p.retake.eligibleAtOrBelow).points;
  for (const g of p.grading.scale) assert.equal(g.points <= ceiling, eligible(g.points), `${where} repeat rule for ${g.letter}`);
  assert.deepEqual(
    { min: p.creditLoad.min, max: p.creditLoad.max, warnAbove: p.creditLoad.warnAbove },
    plain(registry.creditLoad),
    `${where} credit load`,
  );
  assert.deepEqual(p.features.records, plain(registry.features), `${where} features`);
}

// ── Terms, days, location, rooms ────────────────────────────────────────────
assert.deepEqual(
  p.termSystems.records.find((t) => t.id === 'trimester').terms.map((t) => t.season),
  [1, 2, 3].map((n) => SEMESTER_TERM_NAMES[n]),
  'term digits',
);
const weekOrder = source('js/core/routineGrid.js').match(/WEEK_ORDER = \[\s*([^\]]+)\]/)[1].match(/[A-Z]+/g);
assert.deepEqual(p.days.records.map((d) => d.day.toUpperCase()), weekOrder, 'week order');
assert.deepEqual(
  { lat: p.location.lat, lng: p.location.lng, radiusM: p.location.radiusM, utc: p.location.utcOffsetMinutes },
  { lat: CAMPUS_LAT, lng: CAMPUS_LNG, radiusM: CAMPUS_RADIUS_M, utc: CAMPUS_UTC_OFFSET_MIN },
  'campus location',
);
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
assert.deepEqual([minutes(p.location.dayStart), minutes(p.location.dayEnd)], [CAMPUS_START_MIN, CAMPUS_END_MIN], 'campus hours');
const roomsTs = source('src/core/campusRooms.ts');
assert.ok(roomsTs.includes(`/${p.roomCodes.regex}/`), 'room-code regex');
for (const [letter, kind] of Object.entries(p.roomCodes.kinds)) assert.ok(roomsTs.includes(`${letter}: '${kind}'`), `room kind ${letter}`);

// The grade-sheet header words the transcript parser skips.
const skipRe = source('js/import/transcript-core.js').match(/const skipRe = (\/.+\/i);/)[1];
for (const marker of p.transcript.headerMarkers) {
  assert.ok(skipRe.includes(marker.replace(/ /g, '\\s+')), `transcript header marker ${marker}`);
}

// ── Minor ───────────────────────────────────────────────────────────────────
assert.deepEqual(
  bracu.minors.records.map(({ document, ...m }) => ({ ...m, source: document })),
  plain(MINOR_PROGRAMS),
  'MINOR_PROGRAMS',
);

// ── Campus life ─────────────────────────────────────────────────────────────
assert.equal(bracu.bus.effectiveFrom, bus.BUS_SCHEDULE_EFFECTIVE_FROM);
assert.equal(bracu.bus.availability, bus.BUS_SERVICE_AVAILABILITY);
assert.equal(bracu.bus.fareNote, bus.BUS_FARE_NOTE);
assert.deepEqual(bracu.bus.contacts, plain(bus.BUS_CONTACTS));
assert.deepEqual(bracu.bus.instructions, plain(bus.BUS_GENERAL_INSTRUCTIONS));
assert.deepEqual(bracu.bus.records, plain(bus.BUS_ROUTES), 'BUS_ROUTES');

assert.equal(bracu.cafeteria.lastReviewed, cafeteria.CAFETERIA_LAST_REVIEWED);
assert.equal(bracu.cafeteria.disclaimer, cafeteria.CAFETERIA_DISCLAIMER);
assert.deepEqual(bracu.cafeteria.records, plain(cafeteria.CAFETERIA_OUTLETS), 'CAFETERIA_OUTLETS');
assert.ok(bracu.cafeteria.records.every((o) => !o.verified), 'cafeteria stays marked unverified');
assert.equal(bracu.sources.records.find((s) => s.id === bracu.cafeteria.source).status, 'placeholder');

assert.deepEqual(
  bracu.places.levels,
  { basement: places.BASEMENT_LEVEL, ground: places.GROUND_LEVEL, upperRoof: places.UPPER_ROOF_LEVEL },
);
assert.deepEqual(bracu.places.records, plain(places.CAMPUS_PLACES), 'CAMPUS_PLACES');

// ── Faculty and seed reviews ────────────────────────────────────────────────
const jsonl = (file) => source(file).split('\n').filter(Boolean).map((line) => JSON.parse(line));
assert.deepEqual(bracu.faculty.records, jsonl('data/faculty_profiles.jsonl'), 'faculty_profiles.jsonl');
assert.deepEqual(bracu.reviews.records, jsonl('data/input_reviews.jsonl'), 'input_reviews.jsonl');

// ── Sections: both CONNECT snapshots, with the feed's own prerequisites ─────
for (const key of ['20262-trimester', '20263-trimester']) assert.ok(bracu.sections[key]?.records.length > 1900, `${key} sections`);
assert.ok(bracu.prerequisites.records.some((r) => r.source === 'bracu-connect-20263' && r.anyOf), 'feed OR-of-AND prerequisites are kept');

console.log('bracuCampusParity: every BRACU literal in code equals the campus database');
