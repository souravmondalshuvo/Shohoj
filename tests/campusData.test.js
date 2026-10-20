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
assert.ok(nsu.sections['263-trimester'].records.length >= 3700, 'the Fall 2026 snapshot is loaded');
assert.ok(
  nsu.sections['263-trimester'].records.every((s) => s.capacity === null && Number.isInteger(s.seatsAvailable)),
  'RDS gives seats left, never a section size',
);
assert.ok(
  nsu.courses.records
    .filter((c) => c.title === null)
    .every((c) => ['rds4plus-263', 'nsuer-263'].includes(c.source)),
  'every untitled catalogue stub says which copy of the RDS page it came from',
);
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
assert.deepEqual(diu.profile.identity.emailDomains, ['diu.edu.bd', 's.diu.edu.bd']);
assert.equal(
  real.campuses.find((c) => c.id === 'diu').sources.records.find((r) => r.id === diu.profile.identity.source).status,
  'third-party',
  "DIU names no student domain itself, so the domains are students' own word and say so",
);
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
// Courses per program: a DIU code means one course in one program only.
assert.equal(diu.courses, undefined, 'no campus-wide course table for DIU');
const diuCourse = (program, code) => diu.programCourses.records.find((r) => r.program === program && r.code === code);
assert.equal(diuCourse('CSE', 'CSE113').title, 'Programming and Problem Solving');
assert.equal(diuCourse('CSE', 'CSE212').title, 'Discrete Mathematics');
assert.match(diuCourse('RME', 'CSE212').title, /Object Oriented Programming/);
assert.equal(diuCourse('ARCH', 'ARCH102').credits, 5, "Architecture's 0:5 is five credits, not ten contact hours");
// ISCED field codes, as fifteen programs write theirs.
assert.equal(diuCourse('EEE', '0714-211').title, 'Electronics I');
assert.equal(diuCourse('BBA', '0413-313').title, 'Production and Operations Management');
// ITM prints an ISCED code beside its own: its own is the one kept.
assert.equal(diuCourse('ITM', 'ITM222').credits, 1);
assert.ok(!diu.programCourses.records.some((r) => r.program === 'ITM' && /^\d/.test(r.code)));
for (const r of diu.programCourses.records) {
  assert.equal(diu.sources.records.find((s) => s.id === r.source)?.status, 'official', `${r.program} ${r.code} cites DIU's own page`);
}
const friday = diu.bus.records.find((r) => r.route.startsWith('Friday Schedule : Dhanmondi'));
assert.deepEqual(friday.departCampus, ['14:20', '18:30'], 'the 12-hour Friday times are read as afternoon');
assert.match(friday.note, /Printed as 02:20, 06:30/);

// DIU: CSE's Fall 2026 routine, and the codes only it names as title-less stubs.
const diuTerm = diu.sections['263-trimester'];
const diuCse = { ...diuTerm, records: diuTerm.records.filter((s) => s.program === 'CSE') };
assert.equal(diuCse.records.length, 975);
assert.ok(diuCse.records.every((s) => s.source === undefined && s.meetings.length > 0), 'CSE records use the file source');
assert.equal(diuCse.source, 'diu-cse-routine-263-v41', 'V4.1, not the stale V3.1 copy');
const diuStubs = diu.programCourses.records.filter((r) => r.title === null);
assert.equal(diuStubs.filter((r) => r.program === 'CSE').length, 35);
assert.equal(diuStubs.filter((r) => r.program === 'SWE').length, 11);
assert.ok(diuStubs.every((r) => r.credits === null && r.note));
const corrected = diuCse.records.find((s) => s.course === 'CSE416');
assert.equal(corrected.section, 'RE_A(2C)');
assert.match(corrected.note, /Printed "RE_A\(2C" in the routine/);
// English's routine in the same file: subject-plus-field codes, all stubs, and
// a retake class printed with an old and a new code is a record for each.
const diuEng = diuTerm.records.filter((s) => s.program === 'ENG');
assert.equal(diuEng.length, 143);
assert.ok(diuEng.every((s) => s.source === 'diu-eng-routine-263-v07'));
assert.ok(diuEng.some((s) => s.course === 'ENG0232-03'), 'subject-plus-field codes load');
assert.equal(diuStubs.filter((r) => r.program === 'ENG').length, 33);
const paired = diuEng.filter((s) => s.course === 'GED0223-15' || s.course === 'ENG221');
assert.equal(paired.length, 2);
assert.ok(paired.every((s) => /Taught in one class with/.test(s.note)));
assert.deepEqual(paired[0].meetings, paired[1].meetings, 'a paired retake shares its meetings');

// SWE's routine in the same file: each record cites its own source; online
// classes have no room; a printed slip is corrected with a note.
const diuSwe = diuTerm.records.filter((s) => s.program === 'SWE');
assert.equal(diuSwe.length, 766);
assert.ok(diuSwe.every((s) => s.source === 'diu-swe-routine-263-v5'));
const online = diuSwe.filter((s) => s.meetings.some((m) => m.room === null));
assert.ok(online.length > 0 && online.every((s) => /Meets online/.test(s.note)));
assert.match(diuSwe.find((s) => s.course === 'RE424').note, /Printed "RE424--41-REA1"/);
const shared = diuCse.records.find((s) => s.course === 'CSE215' && s.section === 'RE_B(3C)');
assert.equal(shared.faculty, null, 'two teachers: neither is picked');
assert.match(shared.note, /Two teachers share this section/);

// BUBT: sections belong to a program, and a code means what its program says.
const bubt = real.campuses.find((c) => c.id === 'bubt');
assert.equal(bubt.courses, undefined, 'no campus-wide course table for BUBT');
const bubtCourse = (program, code) => bubt.programCourses.records.find((r) => r.program === program && r.code === code);
assert.equal(bubtCourse('ENG', 'GED1105').title, 'History of the Emergence of Bangladesh');
assert.equal(bubtCourse('LLB', 'GED1105').title, 'Government and Politics', 'one code, two programs, two courses');
assert.equal(bubtCourse('CSE', 'CSE100').credits, 0.75, 'quarter credits load');
assert.equal(bubtCourse('BBA', 'ENG1101').credits, null, 'a routine gives a title, not credits');
assert.equal(bubtCourse('CSE', 'CSE490').credits, 0, 'a 0-credit course loads with its note');
const bubtSections = Object.values(bubt.sections).flatMap((f) => f.records);
assert.equal(bubtSections.length, 1324);
assert.ok(bubtSections.every((s) => s.program && s.capacity === null && s.meetings.length > 0));
assert.ok(bubt.sections['263-bisemester'].records.every((s) => s.program === 'LLB' || s.program === 'LLM'), 'Law runs bi-semester');
assert.ok(bubtSections.some((s) => s.program === 'BBA' && s.section === '59-1') && bubtSections.some((s) => s.program === 'CSE' && s.section === '59-1'),
  'every program has its own intake-section 59-1');

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

expectError('section with neither a capacity nor a seat count', (dir) => editJson(path.join(dir, ...SUMMER), (d) => {
  d.records[0].capacity = null;
}), /has neither a capacity nor a seat count/);

expectError('an untitled course that cites no source of its own', (dir) => editJson(path.join(dir, 'courses.json'), (d) => {
  d.records[0].title = null;
  delete d.records[0].source;
}), /a course with no title must cite its own source/);

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

expectError('a code listed twice in one program', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  d.records.push({ ...d.records[0] });
}), /program-courses: \w+ lists \w+ twice/, 'diu');

expectError('a program list naming an unknown program', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  d.records[0].program = 'NOPE';
}), /unknown program NOPE/, 'diu');

// "Not published" is allowed only when a note says so.
expectError('no email domain and no note', (dir) => editJson(path.join(dir, 'profile.json'), (d) => {
  d.identity.emailDomains = [];
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

// Program-scoped sections (BUBT).
const bubtTrimester = (dir) => path.join(dir, 'sections', '263-trimester.json');

expectError('a section in an unknown program', (dir) => editJson(bubtTrimester(dir), (d) => {
  d.records[0].program = 'NOPE';
}), /unknown program NOPE/, 'bubt');

expectError('a section of a program on another calendar', (dir) => editJson(bubtTrimester(dir), (d) => {
  d.records[0].program = 'LLB';
}), /LLB runs on bisemester, not trimester/, 'bubt');

expectError("a section whose course is not in its program's list", (dir) => editJson(bubtTrimester(dir), (d) => {
  d.records[0].course = 'CSE999';
}), /course is not in [A-Z-]+'s program-courses list/, 'bubt');

expectError('a section listed twice in one program', (dir) => editJson(bubtTrimester(dir), (d) => {
  d.records.push({ ...d.records[0] });
}), /duplicate section/, 'bubt');

expectError('a four-digit code outside a program-scoped section', (dir) => editJson(bubtTrimester(dir), (d) => {
  delete d.records.find((s) => /\d{4}$/.test(s.course)).program;
}), /only a program-scoped section may use this code shape/, 'bubt');

// "No capacity published" is allowed only when the file says so, and why.
expectError('unpublished capacity with no note', (dir) => editJson(bubtTrimester(dir), (d) => {
  delete d.note;
}), /capacity is unpublished with no note/, 'bubt');

expectError('sections with no capacity and no flag', (dir) => editJson(bubtTrimester(dir), (d) => {
  delete d.capacityPublished;
}), /has neither a capacity nor a seat count/, 'bubt');

expectError("program credits off the quarter grid", (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  d.records.find((r) => r.credits === 0.75).credits = 0.3;
}), /multiple of 0\.25/, 'bubt');

expectError('a subject-plus-field code with a one-digit course number', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  d.records.find((r) => r.code === 'ENG0232-03').code = 'ENG0232-3';
}), /not a course code/, 'diu');

expectError('a section citing an unknown source', (dir) => editJson(path.join(dir, 'sections', '263-trimester.json'), (d) => {
  d.records.find((r) => r.source).source = 'made-up-routine';
}), /cites unknown source "made-up-routine"/, 'diu');

expectError('a section meeting twice at one hour in one room', (dir) => editJson(path.join(dir, 'sections', '263-trimester.json'), (d) => {
  const s = d.records.find((r) => r.meetings.length > 0);
  s.meetings.push({ ...s.meetings[0] });
}), /meets twice on/, 'diu');

expectError('a title-less course that carries credits', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  d.records.find((r) => r.title === null).credits = 3;
}), /a course with no title is a stub/, 'diu');

expectError('a title-less course with no note', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  delete d.records.find((r) => r.title === null).note;
}), /a course with no title is a stub/, 'diu');

expectError('a 0-credit course with no note', (dir) => editJson(path.join(dir, 'program-courses.json'), (d) => {
  delete d.records.find((r) => r.credits === 0).note;
}), /a 0-credit course needs a note/, 'bubt');

// A prerequisite that names a course we have no record of is incomplete data,
// not wrong data: a warning, never an error.
const missingTarget = withBrokenCopy((dir) => editJson(path.join(dir, 'prerequisites.json'), (d) => {
  d.records[0].allOf = [['ZZZ997']];
}));
assert.deepEqual(missingTarget.errors, []);
assert.ok(missingTarget.warnings.some((w) => /not in courses\.json yet: .*ZZZ997/.test(w)));

console.log(`campusData: data/campuses is valid (${real.warnings.length} warning(s)); every validation rule fires`);
