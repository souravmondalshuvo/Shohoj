/**
 * worker/test/academic.test.js
 *
 * The academic core's DOMAIN layer (#712) — worker/academic.js. Pure functions
 * only: no Firestore, no Request, no clock, no network.
 *
 * These are the rules the handlers above and the client below both assume and
 * neither re-checks: what a valid semester is, when two enrolments are the same
 * enrolment, and which fields a client is allowed to move.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENROLLMENT_SOURCES,
  ENROLLMENT_STATUSES,
  SEASON_TERMS,
  SEMESTER_STATUSES,
  applyEnrollmentPatch,
  applySemesterPatch,
  buildEnrollmentRecord,
  buildSemesterRecord,
  enrollmentDto,
  enrollmentId,
  seasonFromSessionId,
  semesterDto,
  semesterId,
  semesterName,
  semestersToDemote,
  sortSemesters,
  validateEnrollmentInput,
  validateSemesterInput,
} from '../academic.js';

const NOW = '2026-09-20T10:00:00.000Z';

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Semester identity ───────────────────────────────────────────────────────

test('the semester id is derived from campus, year and season', () => {
  assert.equal(semesterId('bracu', 2026, 'Fall'), 'sem_bracu_20263');
  assert.equal(semesterId('bracu', 2026, 'Spring'), 'sem_bracu_20261');
  assert.equal(semesterId('nsu', 2026, 'Fall'), 'sem_nsu_20263');
});

test('the same term at two campuses is two semesters', () => {
  // Different term dates, different calendars — the same id would merge them.
  assert.notEqual(semesterId('bracu', 2026, 'Fall'), semesterId('nsu', 2026, 'Fall'));
});

test('a CONNECT session id parses to year and season', () => {
  assert.deepEqual(seasonFromSessionId(20263), { year: 2026, season: 'Fall' });
  assert.deepEqual(seasonFromSessionId(20261), { year: 2026, season: 'Spring' });
  assert.deepEqual(seasonFromSessionId(20252), { year: 2025, season: 'Summer' });
});

test('a session id with an unknown term is refused, not guessed', () => {
  // BRACU has three terms. A 4 is not a term we know how to name.
  assert.equal(seasonFromSessionId(20264), null);
  assert.equal(seasonFromSessionId(20260), null);
  assert.equal(seasonFromSessionId(0), null);
  assert.equal(seasonFromSessionId(-20263), null);
  assert.equal(seasonFromSessionId(1.5), null);
  assert.equal(seasonFromSessionId('20263'), null);
  assert.equal(seasonFromSessionId(null), null);
});

test('a session id outside the plausible year range is refused', () => {
  assert.equal(seasonFromSessionId(19993), null);
  assert.equal(seasonFromSessionId(99993), null);
});

test('the display name is derived, so two clients cannot disagree', () => {
  assert.equal(semesterName(2026, 'Fall'), 'Fall 2026');
});

// ── Semester validation ─────────────────────────────────────────────────────

test('a semester can be created from year and season', () => {
  const out = validateSemesterInput({ year: 2026, season: 'Fall' });
  assert.equal(out.error, undefined);
  assert.equal(out.value.year, 2026);
  assert.equal(out.value.season, 'Fall');
  assert.equal(out.value.status, 'PLANNED', 'a new semester defaults to PLANNED');
});

test('a semester can be created from a session id alone', () => {
  const out = validateSemesterInput({ sessionId: 20263 });
  assert.equal(out.error, undefined);
  assert.equal(out.value.year, 2026);
  assert.equal(out.value.season, 'Fall');
  assert.equal(out.value.sessionId, 20263);
});

test('year/season and a session id that agree are accepted', () => {
  const out = validateSemesterInput({ year: 2026, season: 'Fall', sessionId: 20263 });
  assert.equal(out.error, undefined);
  assert.equal(out.value.sessionId, 20263);
});

test('year/season and a session id that DISAGREE are refused, not reconciled', () => {
  // Guessing which the student meant is how a task lands in the wrong term.
  const out = validateSemesterInput({ year: 2026, season: 'Spring', sessionId: 20263 });
  assert.equal(out.error.field, 'sessionId');
  assert.match(out.error.message, /Fall 2026/);
});

test('a semester with neither year/season nor a session id is refused', () => {
  assert.equal(validateSemesterInput({}).error.field, 'season');
});

test('an implausible year is refused', () => {
  assert.equal(validateSemesterInput({ year: 1998, season: 'Fall' }).error.field, 'year');
  assert.equal(validateSemesterInput({ year: 9999, season: 'Fall' }).error.field, 'year');
  assert.equal(validateSemesterInput({ year: 2026.5, season: 'Fall' }).error.field, 'year');
});

test('an unknown season or status is refused', () => {
  assert.equal(validateSemesterInput({ year: 2026, season: 'Winter' }).error.field, 'season');
  assert.equal(
    validateSemesterInput({ year: 2026, season: 'Fall', status: 'MAYBE' }).error.field,
    'status',
  );
});

test('a date that matches the shape but is not a real day is refused', () => {
  // 2026-02-31 passes a regex and Date would roll it into March.
  const out = validateSemesterInput({ year: 2026, season: 'Fall', startDate: '2026-02-31' });
  assert.equal(out.error.field, 'startDate');
});

test('term dates are accepted, and an end before a start is refused', () => {
  const good = validateSemesterInput({
    year: 2026,
    season: 'Fall',
    startDate: '2026-10-03',
    endDate: '2027-01-20',
  });
  assert.equal(good.error, undefined);
  assert.equal(good.value.startDate, '2026-10-03');

  const bad = validateSemesterInput({
    year: 2026,
    season: 'Fall',
    startDate: '2026-10-03',
    endDate: '2026-09-01',
  });
  assert.equal(bad.error.field, 'endDate');
});

// ── Semester records ────────────────────────────────────────────────────────

test('the stored record derives its own name and id', () => {
  const record = buildSemesterRecord({
    university: 'bracu',
    userId: 'usr_abc',
    input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
    nowIso: NOW,
  });
  assert.equal(record.id, 'sem_bracu_20263');
  assert.equal(record.name, 'Fall 2026');
  assert.equal(record.userId, 'usr_abc');
  assert.equal(record.createdAt, NOW);
});

test('a semester patch can move status and dates', () => {
  const record = buildSemesterRecord({
    university: 'bracu',
    userId: 'usr_abc',
    input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
    nowIso: NOW,
  });
  const out = applySemesterPatch(record, { status: 'ACTIVE', startDate: '2026-10-03' }, 'LATER');
  assert.equal(out.error, undefined);
  assert.equal(out.value.status, 'ACTIVE');
  assert.equal(out.value.startDate, '2026-10-03');
  assert.equal(out.value.updatedAt, 'LATER');
  assert.equal(out.value.createdAt, NOW, 'createdAt is preserved');
});

test('year and season are not patchable — they are what the id is derived from', () => {
  const record = buildSemesterRecord({
    university: 'bracu',
    userId: 'usr_abc',
    input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
    nowIso: NOW,
  });
  const out = applySemesterPatch(record, { year: 2027 }, NOW);
  assert.equal(out.error.field, 'year');
});

test('an unknown patch field is refused rather than ignored', () => {
  // A client that thinks it renamed a semester and got a 200 has been lied to.
  const record = buildSemesterRecord({
    university: 'bracu',
    userId: 'usr_abc',
    input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
    nowIso: NOW,
  });
  assert.equal(applySemesterPatch(record, { name: 'My Term' }, NOW).error.field, 'name');
});

test('a session id that belongs to a different term cannot be attached', () => {
  const record = buildSemesterRecord({
    university: 'bracu',
    userId: 'usr_abc',
    input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
    nowIso: NOW,
  });
  assert.equal(applySemesterPatch(record, { sessionId: 20261 }, NOW).error.field, 'sessionId');
  assert.equal(applySemesterPatch(record, { sessionId: 20263 }, NOW).error, undefined);
});

test('a patch that would end a semester before it starts is refused', () => {
  const record = {
    ...buildSemesterRecord({
      university: 'bracu',
      userId: 'usr_abc',
      input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
      nowIso: NOW,
    }),
    startDate: '2026-10-03',
  };
  assert.equal(applySemesterPatch(record, { endDate: '2026-09-01' }, NOW).error.field, 'endDate');
});

// ── One active semester ─────────────────────────────────────────────────────

test('promoting a semester demotes every other active one', () => {
  const all = [
    { id: 'a', status: 'ACTIVE' },
    { id: 'b', status: 'ACTIVE' },
    { id: 'c', status: 'COMPLETED' },
  ];
  assert.deepEqual(semestersToDemote(all, 'a'), ['b']);
});

test('promoting the already-active semester demotes nothing', () => {
  assert.deepEqual(semestersToDemote([{ id: 'a', status: 'ACTIVE' }], 'a'), []);
});

test('semesters sort newest first, by year then term', () => {
  const sorted = sortSemesters([
    { id: '1', year: 2025, season: 'Fall' },
    { id: '2', year: 2026, season: 'Spring' },
    { id: '3', year: 2026, season: 'Fall' },
    { id: '4', year: 2026, season: 'Summer' },
  ]);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['3', '4', '2', '1'],
  );
});

// ── Enrollment ──────────────────────────────────────────────────────────────

test('the enrolment id is derived, making enrolment idempotent', async () => {
  const a = await enrollmentId('usr_abc', 'sem_bracu_20263', 'CSE220', sha256Hex);
  const b = await enrollmentId('usr_abc', 'sem_bracu_20263', 'CSE220', sha256Hex);
  assert.equal(a, b);
  assert.match(a, /^enr_[0-9a-f]{32}$/);
});

test('a retake is a different enrolment, because it is a different semester', async () => {
  const fall = await enrollmentId('usr_abc', 'sem_bracu_20263', 'CSE220', sha256Hex);
  const spring = await enrollmentId('usr_abc', 'sem_bracu_20271', 'CSE220', sha256Hex);
  assert.notEqual(fall, spring);
});

test('two students enrolling in the same course get different ids', async () => {
  const mine = await enrollmentId('usr_a', 'sem_bracu_20263', 'CSE220', sha256Hex);
  const theirs = await enrollmentId('usr_b', 'sem_bracu_20263', 'CSE220', sha256Hex);
  assert.notEqual(mine, theirs);
});

test('a course outside the catalogue is refused', () => {
  // Shape-valid but nonexistent — the same gate /upload and /reviews apply.
  const out = validateEnrollmentInput({ semesterId: 'sem_bracu_20263', courseCode: 'ZZZ999' });
  assert.equal(out.error.field, 'courseCode');
});

test('a course code is normalised to upper case', () => {
  const out = validateEnrollmentInput({ semesterId: 'sem_bracu_20263', courseCode: 'cse220' });
  assert.equal(out.error, undefined);
  assert.equal(out.value.courseCode, 'CSE220');
});

test('section and faculty initials are optional, validated, and upper-cased', () => {
  const out = validateEnrollmentInput({
    semesterId: 'sem_bracu_20263',
    courseCode: 'CSE220',
    section: '13',
    facultyInitials: 'sho',
  });
  assert.equal(out.error, undefined);
  assert.equal(out.value.section, '13');
  assert.equal(out.value.facultyInitials, 'SHO');

  assert.equal(
    validateEnrollmentInput({
      semesterId: 'sem_bracu_20263',
      courseCode: 'CSE220',
      section: 'way-too-long',
    }).error.field,
    'section',
  );
  assert.equal(
    validateEnrollmentInput({
      semesterId: 'sem_bracu_20263',
      courseCode: 'CSE220',
      facultyInitials: 'S',
    }).error.field,
    'facultyInitials',
  );
});

test('an enrolment with no semester is refused', () => {
  assert.equal(validateEnrollmentInput({ courseCode: 'CSE220' }).error.field, 'semesterId');
});

test('credits come from the server catalogue, never the request', () => {
  const input = validateEnrollmentInput({
    semesterId: 'sem_bracu_20263',
    courseCode: 'CSE220',
    credits: 99,
  });
  // `credits` is not an accepted input field at all, so it is simply not read.
  assert.equal(input.error, undefined);
  assert.equal(input.value.credits, undefined);

  const record = buildEnrollmentRecord({
    id: 'enr_x',
    userId: 'usr_abc',
    input: input.value,
    nowIso: NOW,
  });
  assert.equal(record.credits, 3, 'CSE220 is a 3-credit course in the catalogue');
});

test('a one-credit lab gets its real credit value', () => {
  const record = buildEnrollmentRecord({
    id: 'enr_x',
    userId: 'usr_abc',
    input: validateEnrollmentInput({ semesterId: 'sem_bracu_20263', courseCode: 'ECE101L' }).value,
    nowIso: NOW,
  });
  assert.equal(record.credits, 1);
});

test('course, semester and credits are not patchable', () => {
  const record = buildEnrollmentRecord({
    id: 'enr_x',
    userId: 'usr_abc',
    input: validateEnrollmentInput({ semesterId: 'sem_bracu_20263', courseCode: 'CSE220' }).value,
    nowIso: NOW,
  });
  for (const field of ['courseCode', 'semesterId', 'credits']) {
    assert.equal(applyEnrollmentPatch(record, { [field]: 'x' }, NOW).error.field, field);
  }
});

test('an enrolment patch can set and clear section and faculty', () => {
  const record = buildEnrollmentRecord({
    id: 'enr_x',
    userId: 'usr_abc',
    input: validateEnrollmentInput({
      semesterId: 'sem_bracu_20263',
      courseCode: 'CSE220',
      section: '13',
      facultyInitials: 'SHO',
    }).value,
    nowIso: NOW,
  });

  const set = applyEnrollmentPatch(record, { section: '07', facultyInitials: 'abc' }, 'LATER');
  assert.equal(set.value.section, '07');
  assert.equal(set.value.facultyInitials, 'ABC');
  assert.equal(set.value.updatedAt, 'LATER');

  const cleared = applyEnrollmentPatch(record, { section: null, facultyInitials: null }, NOW);
  assert.equal(cleared.value.section, null);
  assert.equal(cleared.value.facultyInitials, null);
});

test('enum values are rejected outside their sets', () => {
  const base = { semesterId: 'sem_bracu_20263', courseCode: 'CSE220' };
  assert.equal(validateEnrollmentInput({ ...base, status: 'NOPE' }).error.field, 'status');
  assert.equal(validateEnrollmentInput({ ...base, source: 'NOPE' }).error.field, 'source');
  for (const status of ENROLLMENT_STATUSES) {
    assert.equal(validateEnrollmentInput({ ...base, status }).error, undefined);
  }
  for (const source of ENROLLMENT_SOURCES) {
    assert.equal(validateEnrollmentInput({ ...base, source }).error, undefined);
  }
});

// ── DTOs ────────────────────────────────────────────────────────────────────

test('DTOs withhold the storage schema version and the owner id', () => {
  const semester = semesterDto(
    buildSemesterRecord({
      university: 'bracu',
      userId: 'usr_abc',
      input: validateSemesterInput({ year: 2026, season: 'Fall' }).value,
      nowIso: NOW,
    }),
  );
  assert.equal('schemaVersion' in semester, false);
  assert.equal('userId' in semester, false, 'the caller is the owner; echoing it invites trust');
  assert.equal('university' in semester, false);

  const enrollment = enrollmentDto(
    buildEnrollmentRecord({
      id: 'enr_x',
      userId: 'usr_abc',
      input: validateEnrollmentInput({ semesterId: 'sem_bracu_20263', courseCode: 'CSE220' }).value,
      nowIso: NOW,
    }),
  );
  assert.equal('schemaVersion' in enrollment, false);
  assert.equal('userId' in enrollment, false);
});

test('every declared enum value is a plain SCREAMING_SNAKE string', () => {
  for (const set of [SEMESTER_STATUSES, ENROLLMENT_STATUSES, ENROLLMENT_SOURCES]) {
    for (const value of set) assert.match(value, /^[A-Z_]+$/);
  }
  assert.deepEqual(Object.keys(SEASON_TERMS), ['Spring', 'Summer', 'Fall']);
});
