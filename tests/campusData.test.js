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
assert.ok(nsu.courses.records.length >= 600, 'the Summer 2025 catalogue is loaded');
assert.ok(nsu.sections['252'].records.length >= 2800, 'the Summer 2025 sections are loaded');
assert.ok(nsu.calendars['263'], 'the Fall 2026 calendar is loaded');

// ── Each rule catches the mistake it is for ─────────────────────────────────

function withBrokenCopy(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-data-'));
  try {
    fs.cpSync(CAMPUS_DATA_DIR, dir, { recursive: true });
    mutate(path.join(dir, 'nsu'));
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

function expectError(label, mutate, pattern) {
  const { errors } = withBrokenCopy(mutate);
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

expectError('unknown day code', (dir) => editJson(path.join(dir, 'sections', '252.json'), (d) => {
  d.records[0].days = 'SX';
}), /bad day string "SX"/);

expectError('repeated day', (dir) => editJson(path.join(dir, 'sections', '252.json'), (d) => {
  d.records[0].days = 'SS';
}), /bad day string "SS"/);

expectError('section for a course the catalogue lacks', (dir) => editJson(path.join(dir, 'sections', '252.json'), (d) => {
  d.records[0].course = 'ZZZ999';
}), /ZZZ999\.\d+: course is not in courses\.json/);

expectError('section that ends before it starts', (dir) => editJson(path.join(dir, 'sections', '252.json'), (d) => {
  d.records[0].start = '15:00';
  d.records[0].end = '14:00';
}), /starts at 15:00 but ends at 14:00/);

expectError('term file named for the wrong term', (dir) => {
  fs.renameSync(path.join(dir, 'sections', '252.json'), path.join(dir, 'sections', '253.json'));
}, /sections\/253\.json: file name does not match term 252/);

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

// A prerequisite that names a course we have no record of is incomplete data,
// not wrong data: a warning, never an error.
const missingTarget = withBrokenCopy((dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records[0].allOf = [['ZZZ997']];
}));
assert.deepEqual(missingTarget.errors, []);
assert.ok(missingTarget.warnings.some((w) => /requires ZZZ997/.test(w)));

console.log(`campusData: data/campuses is valid (${real.warnings.length} warning(s)); every validation rule fires`);
