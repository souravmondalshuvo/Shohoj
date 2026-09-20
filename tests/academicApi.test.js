/**
 * tests/academicApi.test.js
 *
 * The frontend half of the academic contract (#712) —
 * src/platform/api/academic.ts and src/features/academic/enrollmentSuggestions.ts.
 *
 * No network and no React: `fetch` is injected, and everything asserted here is
 * either a schema or a pure function. What these pin down is the boundary —
 * what the client accepts from the server, and what it refuses.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from '../src/platform/api/apiClient.ts';
import {
  EnrollmentSchema,
  SemesterSchema,
  activeSemester,
  createEnrollment,
  createSemester,
  deleteSemester,
  enrolledCredits,
  listEnrollments,
  listSemesters,
  updateSemester,
} from '../src/platform/api/academic.ts';
import {
  suggestEnrollments,
  suggestRunningEnrollments,
} from '../src/features/academic/enrollmentSuggestions.ts';

const BASE = 'https://worker.example';

const SEMESTER = {
  id: 'sem_bracu_20263',
  name: 'Fall 2026',
  year: 2026,
  season: 'Fall',
  sessionId: 20263,
  status: 'ACTIVE',
  startDate: '2026-10-03',
  endDate: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const ENROLLMENT = {
  id: 'enr_0123456789abcdef0123456789abcdef',
  semesterId: 'sem_bracu_20263',
  courseCode: 'CSE220',
  credits: 3,
  section: '13',
  facultyInitials: 'SHO',
  status: 'ENROLLED',
  source: 'MANUAL',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function recordingFetch(...responses) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return typeof next === 'function' ? next() : next;
  };
  fn.calls = calls;
  return fn;
}

const clientWith = (fetchFn) =>
  createApiClient({ baseUrl: BASE, getIdToken: async () => 'token', fetchFn });

// ── Schemas ─────────────────────────────────────────────────────────────────

test('a well-formed semester and enrolment are accepted', () => {
  assert.equal(SemesterSchema.safeParse(SEMESTER).success, true);
  assert.equal(EnrollmentSchema.safeParse(ENROLLMENT).success, true);
});

test('a malformed id is refused at the boundary', () => {
  // These become foreign keys on tasks. A malformed one must fail here, not
  // later, inside a feature that assumed it was fine.
  assert.equal(SemesterSchema.safeParse({ ...SEMESTER, id: 'fall-2026' }).success, false);
  assert.equal(EnrollmentSchema.safeParse({ ...ENROLLMENT, id: 'enr_nope' }).success, false);
});

test('an unknown enum value is refused rather than passed through', () => {
  assert.equal(SemesterSchema.safeParse({ ...SEMESTER, status: 'PAUSED' }).success, false);
  assert.equal(EnrollmentSchema.safeParse({ ...ENROLLMENT, source: 'TELEPATHY' }).success, false);
  assert.equal(SemesterSchema.safeParse({ ...SEMESTER, season: 'Winter' }).success, false);
});

test('nullable fields really are nullable', () => {
  const bare = { ...SEMESTER, sessionId: null, startDate: null, endDate: null };
  assert.equal(SemesterSchema.safeParse(bare).success, true);
  const unpriced = { ...ENROLLMENT, credits: null, section: null, facultyInitials: null };
  assert.equal(EnrollmentSchema.safeParse(unpriced).success, true);
});

test('a field the server adds later does not break an older client', () => {
  const parsed = SemesterSchema.safeParse({ ...SEMESTER, creditCap: 15 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.name, 'Fall 2026');
});

test('...but it is STRIPPED, not carried through', () => {
  // Worth pinning explicitly, because the comfortable reading of the test above
  // is "new fields flow to the app", and they do not: Zod drops what a schema
  // does not name. A server field nobody adds to a schema is a field nobody can
  // use — which is exactly how `removedTasks` went missing between the Worker
  // and the UI before it was noticed (#715).
  const parsed = SemesterSchema.safeParse({ ...SEMESTER, creditCap: 15 });
  assert.equal('creditCap' in parsed.data, false);
});

// ── Calls ───────────────────────────────────────────────────────────────────

test('listSemesters unwraps items and hits the right path', async () => {
  const fetchFn = recordingFetch(json({ items: [SEMESTER] }));
  const result = await listSemesters(clientWith(fetchFn));

  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].id, SEMESTER.id);
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/semesters`);
});

test('createSemester posts the input and unwraps the semester', async () => {
  const fetchFn = recordingFetch(json({ semester: SEMESTER }, 201));
  const result = await createSemester(clientWith(fetchFn), { sessionId: 20263, status: 'ACTIVE' });

  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Fall 2026');
  assert.equal(fetchFn.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(fetchFn.calls[0].init.body), { sessionId: 20263, status: 'ACTIVE' });
});

test('updateSemester PATCHes the encoded id', async () => {
  const fetchFn = recordingFetch(json({ semester: SEMESTER }));
  await updateSemester(clientWith(fetchFn), 'sem_bracu_20263', { status: 'ACTIVE' });

  assert.equal(fetchFn.calls[0].init.method, 'PATCH');
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/semesters/sem_bracu_20263`);
});

test('listEnrollments filters by semester through a query parameter', async () => {
  const fetchFn = recordingFetch(json({ items: [ENROLLMENT] }));
  await listEnrollments(clientWith(fetchFn), { semesterId: 'sem_bracu_20263' });

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.pathname, '/api/v1/enrollments');
  assert.equal(url.searchParams.get('semesterId'), 'sem_bracu_20263');
});

test('listEnrollments with no filter sends no query at all', async () => {
  const fetchFn = recordingFetch(json({ items: [] }));
  await listEnrollments(clientWith(fetchFn));
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/enrollments`);
});

test('deleteSemester reports what the cascade took', async () => {
  // The cascade is not optional, so the student has to be told — both counts.
  const fetchFn = recordingFetch(
    json({ deleted: { id: SEMESTER.id, removedEnrollments: 4, removedTasks: 31 } }),
  );
  const result = await deleteSemester(clientWith(fetchFn), SEMESTER.id);

  assert.equal(result.ok, true);
  assert.equal(result.value.removedEnrollments, 4);
  assert.equal(result.value.removedTasks, 31);
  assert.equal(fetchFn.calls[0].init.method, 'DELETE');
});

test('a validation failure from the server surfaces as a typed error', async () => {
  const fetchFn = recordingFetch(
    json(
      {
        error: {
          code: 'invalid_request',
          message: 'Not a course in the Shohoj catalogue.',
          field: 'courseCode',
        },
      },
      400,
    ),
  );
  const result = await createEnrollment(clientWith(fetchFn), {
    semesterId: SEMESTER.id,
    courseCode: 'ZZZ999',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'worker');
  assert.equal(result.error.userMessage, 'Not a course in the Shohoj catalogue.');
});

test('a response whose shape is wrong is a failure, not a silent undefined', async () => {
  const fetchFn = recordingFetch(json({ items: [{ ...SEMESTER, year: 'twenty twenty six' }] }));
  const result = await listSemesters(clientWith(fetchFn));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation');
});

// ── Derived views ───────────────────────────────────────────────────────────

test('activeSemester picks the ACTIVE one, or null', () => {
  assert.equal(activeSemester([]), null);
  assert.equal(activeSemester([{ ...SEMESTER, status: 'COMPLETED' }]), null);
  assert.equal(activeSemester([SEMESTER]).id, SEMESTER.id);
});

test('activeSemester survives two ACTIVE semesters by taking the first', () => {
  // The server keeps one, but a race between two devices can briefly leave two.
  // The list arrives newest-first, so the first match is the stable answer.
  const older = { ...SEMESTER, id: 'sem_bracu_20261', name: 'Spring 2026' };
  assert.equal(activeSemester([SEMESTER, older]).id, SEMESTER.id);
});

test('enrolledCredits sums enrolled and completed courses only', () => {
  const rows = [
    { ...ENROLLMENT, credits: 3, status: 'ENROLLED' },
    { ...ENROLLMENT, credits: 1, status: 'COMPLETED' },
    { ...ENROLLMENT, credits: 3, status: 'DROPPED' },
    { ...ENROLLMENT, credits: 3, status: 'WITHDRAWN' },
    { ...ENROLLMENT, credits: null, status: 'ENROLLED' },
  ];
  assert.equal(enrolledCredits(rows), 4);
});

// ── Calculator adapter ──────────────────────────────────────────────────────

const CALC_STATE = [
  {
    id: 1,
    name: 'Fall 2025',
    running: false,
    courses: [
      { name: 'CSE110', credits: 3, grade: 'A' },
      { name: 'MAT110', credits: 3, grade: 'A-', faculty: 'ABC' },
    ],
  },
  {
    id: 2,
    name: 'Fall 2026',
    running: true,
    courses: [
      { name: 'CSE220', credits: 3, grade: '', faculty: 'sho' },
      { name: 'MAT215', credits: 3, grade: '' },
      { name: '', credits: 3, grade: '' },
    ],
  },
];

test('suggestions come from the calculator state, one per real course', () => {
  const out = suggestEnrollments(CALC_STATE);
  assert.deepEqual(
    out.map((s) => s.courseCode),
    ['CSE110', 'MAT110', 'CSE220', 'MAT215'],
  );
});

test('an unfilled course row is skipped rather than suggested blank', () => {
  // The calculator allows placeholder rows; they are common in a planned term.
  const out = suggestEnrollments(CALC_STATE);
  assert.equal(
    out.some((s) => s.courseCode === ''),
    false,
  );
});

test('faculty initials are carried through and normalised', () => {
  const out = suggestEnrollments(CALC_STATE);
  assert.equal(out.find((s) => s.courseCode === 'CSE220').facultyInitials, 'SHO');
  assert.equal(out.find((s) => s.courseCode === 'MAT215').facultyInitials, null);
});

test('a section from the routine picks upgrades the recorded source', () => {
  // A course the student pasted from CONNECT is a stronger claim than a
  // free-text calculator row, and recording which is what lets a later
  // reconciliation tell them apart.
  const out = suggestEnrollments(CALC_STATE, { sectionPicks: { CSE220: '13' } });
  const cse = out.find((s) => s.courseCode === 'CSE220');
  assert.equal(cse.section, '13');
  assert.equal(cse.source, 'ROUTINE');
  assert.equal(out.find((s) => s.courseCode === 'MAT215').source, 'CALCULATOR');
});

test('the running semester alone is the common case', () => {
  const out = suggestRunningEnrollments(CALC_STATE);
  assert.deepEqual(
    out.map((s) => s.courseCode),
    ['CSE220', 'MAT215'],
  );
});

test('no running semester suggests nothing, rather than guessing the newest', () => {
  // A wrong guess attaches a student's tasks to a finished term.
  const noneRunning = CALC_STATE.map((s) => ({ ...s, running: false }));
  assert.deepEqual(suggestRunningEnrollments(noneRunning), []);
});

test('courses already enrolled are not suggested again', () => {
  const out = suggestEnrollments(CALC_STATE, { alreadyEnrolled: ['cse220'] });
  assert.equal(
    out.some((s) => s.courseCode === 'CSE220'),
    false,
  );
  assert.equal(
    out.some((s) => s.courseCode === 'MAT215'),
    true,
  );
});

test('the same course in two semesters is suggested twice — that is a retake', () => {
  const retaken = [
    { id: 1, name: 'Fall 2025', courses: [{ name: 'CSE220', credits: 3, grade: 'F' }] },
    {
      id: 2,
      name: 'Fall 2026',
      running: true,
      courses: [{ name: 'CSE220', credits: 3, grade: '' }],
    },
  ];
  const out = suggestEnrollments(retaken);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].sourceSemesterId, out[1].sourceSemesterId);
});

test('summary semesters carry no courses and are skipped', () => {
  const withSummary = [
    { id: 1, summary: true, summaryCGPA: 3.5, summaryCredits: 60, courses: [] },
    ...CALC_STATE,
  ];
  assert.equal(suggestEnrollments(withSummary).length, suggestEnrollments(CALC_STATE).length);
});

test('malformed stored state is survived, not thrown on', () => {
  // This reads a blob that has been through years of versions and devices.
  assert.deepEqual(suggestEnrollments([]), []);
  assert.deepEqual(suggestEnrollments([{ id: 1 }]), []);
  assert.deepEqual(suggestEnrollments([{ id: 1, courses: null }]), []);
  assert.deepEqual(suggestEnrollments([{ id: 1, courses: [{ name: 42 }] }]), []);
});

test('the adapter reads only — it returns plain data and mutates nothing', () => {
  const before = JSON.stringify(CALC_STATE);
  suggestEnrollments(CALC_STATE, { sectionPicks: { CSE220: '13' } });
  suggestRunningEnrollments(CALC_STATE);
  assert.equal(JSON.stringify(CALC_STATE), before);
});
