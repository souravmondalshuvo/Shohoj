/**
 * tests/academicIntegration.test.js
 *
 * Phase 2's acceptance criterion, proven end to end (#712):
 *
 *   "A signed-in student can create a semester, mark it active, list their
 *    semesters, and enrol courses into one."
 *
 * The REAL frontend client (src/platform/api) is pointed at the REAL Worker
 * routes (worker/index.js) by giving the client a `fetchFn` that invokes
 * `worker.fetch`. Both halves are shipping code: the client builds URLs,
 * attaches the token and validates every response schema; the Worker verifies
 * that token, resolves the student, enforces ownership and answers in the
 * /api/v1 envelope.
 *
 * Only what genuinely leaves the process is faked — Google's OAuth exchange and
 * the Firestore REST API, backed by a Map so documents persist across requests
 * the way Firestore would. No network, no browser, no emulator, no credentials.
 *
 * The complement to worker/test/academicApi.test.js: that one proves the server
 * behaves; this proves the two sides agree about what they are saying to each
 * other, which is the failure a mock on either side alone cannot catch.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests } from '../worker/index.js';
import { createApiClient } from '../src/platform/api/apiClient.ts';
import {
  activeSemester,
  createEnrollment,
  createSemester,
  deleteSemester,
  enrolledCredits,
  listEnrollments,
  listSemesters,
  updateEnrollment,
  updateSemester,
} from '../src/platform/api/academic.ts';
import { suggestRunningEnrollments } from '../src/features/academic/enrollmentSuggestions.ts';

const PROJECT_ID = 'shohoj-test';
const BASE_URL = 'https://worker.example';
const ORIGIN = 'https://shohoj.example';
const WORKER_ENV = { FIREBASE_PROJECT_ID: PROJECT_ID, ALLOWED_ORIGINS: ORIGIN };

async function signToken(claims, kid = 'integration-key') {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(PROJECT_ID)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, jwk };
}

async function serviceAccountJson() {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  return JSON.stringify({
    client_email: 'integration@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

/** Google's OAuth exchange and Firestore REST, over one shared Map. */
function fakeGoogle(docs = new Map()) {
  const handler = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';

    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'sa-token', expires_in: 3600 });
    }

    const [, raw] = /\/documents\/([^?]+)/.exec(url) || [];
    if (raw === undefined) throw new Error(`unexpected outbound fetch: ${method} ${url}`);
    const path = decodeURIComponent(raw);

    if (method === 'PATCH') {
      docs.set(path, JSON.parse(init.body).fields);
      return Response.json(JSON.parse(init.body));
    }
    if (method === 'DELETE') {
      docs.delete(path);
      return Response.json({});
    }
    // Odd segment count = a collection; even = a document.
    if (path.split('/').length % 2 === 1) {
      const documents = [...docs.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, fields]) => ({
          name: `projects/p/databases/(default)/documents/${key}`,
          fields,
        }));
      return Response.json({ documents });
    }
    const fields = docs.get(path);
    if (fields === undefined) return new Response('{}', { status: 404 });
    return Response.json({ fields });
  };
  return { handler, docs };
}

/** An API client whose transport is the Worker itself. */
function clientAgainstWorker({ token, env, google }) {
  return createApiClient({
    baseUrl: BASE_URL,
    getIdToken: async () => token,
    fetchFn: async (url, init) => {
      const headers = new Headers(init?.headers);
      // A real browser always sends one, and the Worker enforces an allowlist.
      headers.set('Origin', ORIGIN);
      const request = new Request(url, { ...init, headers });
      const realFetch = globalThis.fetch;
      globalThis.fetch = google.handler;
      try {
        return await worker.fetch(request, env, {});
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  });
}

const STUDENT = {
  sub: 'academic-uid-1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Academic Student',
  firebase: { sign_in_provider: 'google.com' },
};

/** Sign in, and hand back a client plus the shared fake Firestore. */
async function signedIn(claims = STUDENT, kid = 'integration-key') {
  const { token, jwk } = await signToken(claims, kid);
  const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
  const google = fakeGoogle();
  return { token, jwk, env, google, client: clientAgainstWorker({ token, env, google }) };
}

test('a student creates a semester, activates it, and enrols courses', async () => {
  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;

    // 1. Create the semester from the CONNECT session id.
    const created = await createSemester(client, { sessionId: 20263, startDate: '2026-10-03' });
    assert.equal(created.ok, true, `create failed: ${created.error?.message}`);
    assert.equal(created.value.id, 'sem_bracu_20263');
    assert.equal(created.value.name, 'Fall 2026');
    assert.equal(created.value.status, 'PLANNED');

    // 2. Mark it the one they are in.
    const activated = await updateSemester(client, created.value.id, { status: 'ACTIVE' });
    assert.equal(activated.ok, true);
    assert.equal(activated.value.status, 'ACTIVE');

    // 3. Enrol courses.
    for (const [courseCode, section] of [
      ['CSE220', '13'],
      ['MAT215', '07'],
      ['ECE101L', null],
    ]) {
      const enrolled = await createEnrollment(client, {
        semesterId: created.value.id,
        courseCode,
        section,
      });
      assert.equal(enrolled.ok, true, `${courseCode} failed: ${enrolled.error?.message}`);
    }

    // 4. Read it all back the way a screen would.
    const semesters = await listSemesters(client);
    assert.equal(semesters.ok, true);
    const active = activeSemester(semesters.value);
    assert.equal(active.id, 'sem_bracu_20263');

    const enrollments = await listEnrollments(client, { semesterId: active.id });
    assert.equal(enrollments.ok, true);
    assert.deepEqual(
      enrollments.value.map((e) => e.courseCode),
      ['CSE220', 'ECE101L', 'MAT215'],
    );
    // Credits are the server's, from its own catalogue: 3 + 1 + 3.
    assert.equal(enrolledCredits(enrollments.value), 7);
    assert.equal(enrollments.value.find((e) => e.courseCode === 'CSE220').section, '13');
  } finally {
    __setTestJwksForTests(null);
  }
});

test('enrolling the same course twice leaves one enrolment', async () => {
  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const semester = await createSemester(client, { year: 2026, season: 'Fall', status: 'ACTIVE' });

    await createEnrollment(client, { semesterId: semester.value.id, courseCode: 'CSE220' });
    const again = await createEnrollment(client, {
      semesterId: semester.value.id,
      courseCode: 'CSE220',
      section: '07',
    });

    assert.equal(again.ok, true);
    const all = await listEnrollments(client);
    assert.equal(all.value.length, 1, 'a retried enrolment must not duplicate');
    assert.equal(all.value[0].section, '07', 'the retry still updated it');
  } finally {
    __setTestJwksForTests(null);
  }
});

test('only one semester stays ACTIVE across the real round trip', async () => {
  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    await createSemester(client, { year: 2026, season: 'Spring', status: 'ACTIVE' });
    await createSemester(client, { year: 2026, season: 'Fall', status: 'ACTIVE' });

    const semesters = await listSemesters(client);
    assert.equal(semesters.value.filter((s) => s.status === 'ACTIVE').length, 1);
    assert.equal(activeSemester(semesters.value).name, 'Fall 2026');
  } finally {
    __setTestJwksForTests(null);
  }
});

test('deleting a semester removes its enrolments and reports how many', async () => {
  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const semester = await createSemester(client, { year: 2026, season: 'Fall', status: 'ACTIVE' });
    await createEnrollment(client, { semesterId: semester.value.id, courseCode: 'CSE220' });
    await createEnrollment(client, { semesterId: semester.value.id, courseCode: 'MAT215' });

    const deleted = await deleteSemester(client, semester.value.id);

    assert.equal(deleted.ok, true);
    assert.equal(deleted.value.removedEnrollments, 2);
    assert.equal((await listEnrollments(client)).value.length, 0);
    assert.equal((await listSemesters(client)).value.length, 0);
  } finally {
    __setTestJwksForTests(null);
  }
});

test("one student cannot reach another's semester over HTTP", async () => {
  const mine = await signToken(STUDENT, 'key-mine');
  const theirs = await signToken(
    { ...STUDENT, sub: 'academic-uid-2', email: 'other@g.bracu.ac.bd', name: 'Other' },
    'key-theirs',
  );
  __setTestJwksForTests({ keys: [mine.jwk, theirs.jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();
    const myClient = clientAgainstWorker({ token: mine.token, env, google });
    const theirClient = clientAgainstWorker({ token: theirs.token, env, google });

    const semester = await createSemester(myClient, {
      year: 2026,
      season: 'Fall',
      status: 'ACTIVE',
    });
    await createEnrollment(myClient, { semesterId: semester.value.id, courseCode: 'CSE220' });

    // They derive the SAME semester id — and still see nothing.
    assert.deepEqual((await listSemesters(theirClient)).value, []);
    assert.deepEqual((await listEnrollments(theirClient)).value, []);

    const stolen = await updateSemester(theirClient, semester.value.id, { status: 'ARCHIVED' });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.error.code, 'not_found', '404, not 403 — 403 would confirm it exists');

    const wiped = await deleteSemester(theirClient, semester.value.id);
    assert.equal(wiped.ok, false);

    // ...and none of it disturbed the owner.
    assert.equal((await listSemesters(myClient)).value.length, 1);
    assert.equal((await listEnrollments(myClient)).value.length, 1);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a course outside the catalogue is refused with a message worth showing', async () => {
  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const semester = await createSemester(client, { year: 2026, season: 'Fall', status: 'ACTIVE' });

    const result = await createEnrollment(client, {
      semesterId: semester.value.id,
      courseCode: 'ZZZ999',
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.userMessage, 'Not a course in the Shohoj catalogue.');
    assert.equal((await listEnrollments(client)).value.length, 0);
  } finally {
    __setTestJwksForTests(null);
  }
});

test("the calculator's courses can be enrolled without duplicating its data", async () => {
  // The path a student will actually take in Phase 3: Shohoj reads the
  // semesters they already keep in the calculator, suggests this term's
  // courses, and enrols the ones they confirm. Nothing writes back to the
  // calculator's state.
  const calculatorState = [
    {
      id: 1,
      name: 'Fall 2025',
      running: false,
      courses: [{ name: 'CSE110', credits: 3, grade: 'A' }],
    },
    {
      id: 2,
      name: 'Fall 2026',
      running: true,
      courses: [
        { name: 'CSE220', credits: 3, grade: '', faculty: 'SHO' },
        { name: 'MAT215', credits: 3, grade: '' },
      ],
    },
  ];
  const snapshot = JSON.stringify(calculatorState);

  const session = await signedIn();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const semester = await createSemester(client, { sessionId: 20263, status: 'ACTIVE' });

    const suggestions = suggestRunningEnrollments(calculatorState, {
      sectionPicks: { CSE220: '13' },
    });
    assert.equal(suggestions.length, 2, 'only the running semester');

    // The student confirms; Shohoj enrols.
    for (const suggestion of suggestions) {
      const enrolled = await createEnrollment(client, {
        semesterId: semester.value.id,
        courseCode: suggestion.courseCode,
        section: suggestion.section,
        facultyInitials: suggestion.facultyInitials,
        source: suggestion.source,
      });
      assert.equal(enrolled.ok, true, `${suggestion.courseCode}: ${enrolled.error?.message}`);
    }

    const enrollments = await listEnrollments(client, { semesterId: semester.value.id });
    assert.deepEqual(
      enrollments.value.map((e) => e.courseCode),
      ['CSE220', 'MAT215'],
    );
    const cse = enrollments.value.find((e) => e.courseCode === 'CSE220');
    assert.equal(cse.section, '13');
    assert.equal(cse.facultyInitials, 'SHO');
    assert.equal(cse.source, 'ROUTINE', 'a CONNECT-backed pick is recorded as such');

    assert.equal(JSON.stringify(calculatorState), snapshot, 'the calculator state is untouched');
  } finally {
    __setTestJwksForTests(null);
  }
});
