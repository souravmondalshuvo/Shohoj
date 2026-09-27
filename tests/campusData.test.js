/**
 * tests/campusData.test.js (#784)
 *
 * data/campuses/ is the source of truth for campus reference data, so this is
 * what keeps it honest in CI: the committed data must load with zero errors,
 * and each rule in scripts/campus_data.mjs must actually fire on the mistake it
 * exists to catch. The second half copies the real data into a temp dir, breaks
 * one thing at a time, and asserts the validator names it — a check that never
 * fails is indistinguishable from no check.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CAMPUS_DATA_DIR, loadCampuses } from '../scripts/campus_data.mjs';

// ── The committed data is valid ─────────────────────────────────────────────

const real = loadCampuses();
assert.deepEqual(real.errors, [], `data/campuses has errors:\n${real.errors.join('\n')}`);

const nsu = real.campuses.find((c) => c.id === 'nsu');
assert.ok(nsu, 'NSU is registered');
assert.equal(nsu.profile.shortName, 'NSU');
assert.deepEqual(nsu.profile.identity.emailDomains, ['northsouth.edu']);
assert.equal(nsu.profile.retake.maxRetakes, 3, 'the 2026 policy book caps retakes at three');
assert.ok(!nsu.profile.grading.scale.some((g) => g.letter === 'A+' || g.letter === 'D-'), 'NSU awards no A+ or D-');
assert.equal(nsu.programs.records.length, 25);
assert.ok(nsu.courses.records.length >= 1000, 'the catalogue spans every loaded source');
assert.ok(nsu.sections['252-trimester'].records.length >= 2800, 'the Summer 2025 sections are loaded');
assert.ok(nsu.sections['253-trimester'].records.length >= 3200, 'the Fall 2025 sections are loaded');
assert.ok(nsu.sections['252-bisemester'], 'the bi-semester sections are loaded');
for (const key of ['261-trimester', '262-trimester', '263-trimester', '261-bisemester', '262-bisemester']) {
  assert.ok(nsu.calendars[key], `the ${key} calendar is loaded`);
}
const bba = nsu.programs.records.find((p) => p.code === 'BBA-FIN');
assert.equal(bba.totalCredits, 130, 'BBA follows the December 2025 handbook');
assert.equal(bba.extends, 'BBA');

// Every plan, and every program whose requirement groups are complete, adds up
// to the program's published total. These are the transcription checks: a
// dropped row or a misread credit breaks one of these sums.
const credits = (items) => items.reduce((n, i) => n + (i.credits ?? 0), 0);
for (const program of ['CSE', 'EEE', 'CEE', 'PHR', 'LLB']) {
  const total = nsu.programs.records.find((p) => p.code === program).totalCredits;
  assert.equal(credits(nsu.plans.records.filter((p) => p.program === program)), total, `${program} plan totals ${total}`);
}
const groupsOf = (code) => nsu.requirements.records.filter((g) => g.program === code);
for (const program of ['CSE', 'PHR', 'LLB']) {
  const total = nsu.programs.records.find((p) => p.code === program).totalCredits;
  assert.equal(credits(groupsOf(program)), total, `${program} requirement groups total ${total}`);
}
for (const major of ['ACT', 'ECO', 'FIN', 'HRM', 'INB', 'MGT', 'MIS', 'MKT', 'SCM']) {
  assert.equal(credits(groupsOf('BBA')) + credits(groupsOf(`BBA-${major}`)), 130, `BBA-${major} totals 130`);
}

// DIU: what it publishes is loaded; what it doesn't is empty or null with a
// note, never guessed.
const diu = real.campuses.find((c) => c.id === 'diu');
assert.ok(diu, 'DIU is registered');
assert.deepEqual(diu.profile.identity.emailDomains, [], 'the student domain stays unconfirmed, not guessed');
assert.deepEqual(
  diu.profile.grading.scale.map((g) => [g.letter, g.points, g.minMark]).slice(0, 3),
  [['A+', 4.0, 80], ['A', 3.75, 75], ['A-', 3.5, 70]],
  'the UGC uniform scale',
);
assert.equal(diu.profile.retake.counts, 'latest');
assert.equal(diu.programs.records.length, 33);
assert.equal(diu.programs.records.find((p) => p.code === 'CSE').totalCredits, 154.5, 'half credits load');
assert.ok(diu.programs.records.some((p) => p.termSystem === null), 'unknown calendars stay null');
for (const key of ['261-trimester', '262-trimester', '263-trimester', '261-bisemester', '263-bisemester']) {
  assert.ok(diu.calendars[key], `DIU ${key} calendar is loaded`);
}
assert.equal(diu.bus.records.length, 20);
const friday = diu.bus.records.find((r) => r.route.startsWith('Friday Schedule : Dhanmondi'));
assert.deepEqual(friday.departCampus, ['14:20', '18:30'], 'the 12-hour Friday times are read as afternoon');
assert.match(friday.note, /Printed as 02:20, 06:30/);

// ── Each rule catches the mistake it is for ─────────────────────────────────

function withBrokenCopy(mutate, campus = 'nsu') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-data-'));
  try {
    fs.cpSync(CAMPUS_DATA_DIR, dir, { recursive: true });
    mutate(path.join(dir, campus));
    return loadCampuses(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function editJson(file, change) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  change(data);
  fs.writeFileSync(file, JSON.stringify(data));
}

function expectError(label, mutate, pattern, campus) {
  const { errors } = withBrokenCopy(mutate, campus);
  assert.ok(errors.some((e) => pattern.test(e)), `${label}: expected an error matching ${pattern}, got:\n${errors.join('\n') || '(none)'}`);
}

expectError('malformed course code', (dir) => editJson(path.join(dir, 'courses.json'), (d) => {
  d.records[0].code = 'cse-115';
}), /courses\.json: records\.0\.code: not a course code/);

expectError('credits off the half-credit grid', (dir) => editJson(path.join(dir, 'courses.json'), (d) => {
  d.records[0].credits = 3.3;
}), /multiple of 0\.5/);

expectError('duplicate course', (dir) => editJson(path.join(dir, 'courses.json'), (d) => {
  d.records.push({ ...d.records[0] });
}), /courses: duplicate code/);

const SUMMER = ['sections', '252-trimester.json'];

expectError('unknown day code', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].days = 'SX';
}), /bad day string "SX"/);

expectError('repeated day', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].days = 'SS';
}), /bad day string "SS"/);

expectError('section for a course the catalogue lacks', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].course = 'ZZZ999';
}), /ZZZ999\.\d+: course is not in courses\.json/);

expectError('section that ends before it starts', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].start = '15:00';
  d.records[0].end = '14:00';
}), /starts at 15:00 but ends at 14:00/);

expectError('a half-scheduled section', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].days = null;
}), /days, start and end must be all set or all null/);

expectError('term file named for the wrong term', (dir) => {
  fs.renameSync(path.join(dir, ...SUMMER), path.join(dir, 'sections', '251-trimester.json'));
}, /sections\/251-trimester\.json: file name does not match 252-trimester/);

expectError('term file named for the wrong calendar system', (dir) => {
  fs.renameSync(path.join(dir, ...SUMMER), path.join(dir, 'sections', '252-semester.json'));
}, /file name does not match 252-trimester/);

expectError('the same prerequisite rule twice from one source', (dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records.push({ ...d.records[0] });
}), /duplicate rule for .* from the same source and program/);

expectError('a prerequisite scoped to an unknown program', (dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records[0].program = 'XYZ';
}), /unknown program XYZ/);

expectError('a plan for an unknown program', (dir) => editJson(path.join(dir, 'plans.json'), (d) => {
  d.records[0].program = 'XYZ';
}), /plans\.XYZ .*unknown program XYZ/);

expectError('a program extending one that does not exist', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  d.records.find((p) => p.extends).extends = 'NOPE';
}), /extends unknown program NOPE/);

expectError('a choose group asking for more than it offers', (dir) => editJson(path.join(dir, 'requirements.json'), (d) => {
  const group = d.records.find((g) => g.rule === 'choose');
  group.choose = group.options.length + 1;
}), /must choose between 1 and/);

expectError('a free group that lists options', (dir) => editJson(path.join(dir, 'requirements.json'), (d) => {
  d.records.find((g) => g.rule === 'free').options = [['ENG102']];
}), /a free group lists no options/);

expectError('a calendar range that ends before it starts', (dir) => editJson(path.join(dir, 'calendar', '262-bisemester.json'), (d) => {
  const range = d.records.find((e) => e.endDate);
  range.endDate = '2000-01-01';
}), /ends before it starts/);

// Sums that stop matching are warnings: a dropped plan row shows up here.
const shortPlan = withBrokenCopy((dir) => editJson(path.join(dir, 'plans.json'), (d) => {
  d.records.splice(d.records.findIndex((p) => p.program === 'CSE' && p.code === 'CSE173'), 1);
}));
assert.deepEqual(shortPlan.errors, []);
assert.ok(shortPlan.warnings.some((w) => /plans\.CSE: plan totals 127 credits, the program requires 130/.test(w)));

// A plan credit that differs from the catalogue warns unless the plan says why.
const unexplained = withBrokenCopy((dir) => editJson(path.join(dir, 'plans.json'), (d) => {
  delete d.records.find((p) => p.program === 'CSE' && p.code === 'MAT116').note;
}));
assert.ok(unexplained.warnings.some((w) => /MAT116 is planned at 0 credits but catalogued at 3/.test(w)));

expectError('citing a source that is not registered', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  d.source = 'made-up-source';
}), /programs cites unknown source "made-up-source"/);

expectError('a program on a term system the campus lacks', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  d.records[0].termSystem = 'quarter';
}), /uses unknown term system "quarter"/);

expectError('a grading scale out of order', (dir) => editJson(path.join(dir, 'profile.json'), (d) => {
  d.grading.scale.reverse();
}), /scale must run from the highest letter down/);

expectError('a prerequisite rule for an unknown course', (dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records[0].course = 'ZZZ998';
}), /prerequisites: ZZZ998 is not in courses\.json/);

expectError('an unknown field (typo)', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  d.records[0].totalCredit = d.records[0].totalCredits;
}), /Unrecognized key/);

expectError('a campus without sources.json', (dir) => {
  fs.rmSync(path.join(dir, 'sources.json'));
}, /nsu: missing sources\.json/);

// "Not published" is allowed only when a note says so.
expectError('no email domain and no note', (dir) => editJson(path.join(dir, 'profile.json'), (d) => {
  delete d.identity.note;
}), /diu: identity: no email domains and no note/, 'diu');

expectError('an empty honours list with no note', (dir) => editJson(path.join(dir, 'profile.json'), (d) => {
  d.honours.records = [];
  delete d.honours.note;
}), /profile\.honours: empty with no note/);

expectError('a program with no term system and no note', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  const p = d.records.find((r) => r.termSystem === null);
  delete p.note;
}), /has no term system and no note/, 'diu');

expectError('program credits off the half-credit grid', (dir) => editJson(path.join(dir, 'programs.json'), (d) => {
  d.records[0].totalCredits = 154.3;
}), /multiple of 0\.5/, 'diu');

expectError('an academic rule citing an unknown source', (dir) => editJson(path.join(dir, 'profile.json'), (d) => {
  d.academicRules.records[0].source = 'made-up-source';
}), /academicRules\..* cites unknown source "made-up-source"/);

expectError('a bus without dates or fares and no note', (dir) => editJson(path.join(dir, 'bus.json'), (d) => {
  delete d.note;
}), /bus: servicePeriod or fares is null with no note/, 'diu');

expectError('a bus route off on an unknown day', (dir) => editJson(path.join(dir, 'bus.json'), (d) => {
  d.records[0].daysOff = 'X';
}), /bad daysOff string "X"/, 'diu');

// A prerequisite that names a course we have no record of is incomplete data,
// not wrong data: a warning, never an error.
const missingTarget = withBrokenCopy((dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records[0].allOf = [['ZZZ997']];
}));
assert.deepEqual(missingTarget.errors, []);
assert.ok(missingTarget.warnings.some((w) => /not in courses\.json yet: .*ZZZ997/.test(w)));

console.log(`campusData: data/campuses is valid (${real.warnings.length} warning(s)); every validation rule fires`);
