/**
 * worker/test/academicApi.test.js
 *
 * The academic core's HANDLER layer (#712) and its wiring.
 *
 * Two halves:
 *
 *   * handlers driven directly against an in-memory repository — no Request, no
 *     Response, no fetch, which is the payoff of handlers that return plain
 *     `{ status, body }`;
 *   * the routes through `worker.fetch`, with a locally-signed token and every
 *     outbound call mocked, so path matching, auth and the ownership boundary
 *     are exercised as they actually ship.
 *
 * The assertion that matters most is the last group: one student cannot see or
 * touch another's records, and the reason is structural — the repository is
 * bound to the verified uid before any handler runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests } from '../index.js';
import { createAcademicRepo, MAX_SEMESTERS } from '../academicRepo.js';
import * as academic from '../academicHandlers.js';

const NOW = new Date('2026-09-20T10:00:00.000Z');

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A whole Firestore, as a Map keyed by document path. */
function memoryStore() {
  const docs = new Map();
  return {
    docs,
    getDoc: async (path) => (docs.has(path) ? { ...docs.get(path) } : null),
    patchDoc: async (path, fields) => {
      docs.set(path, { ...(docs.get(path) || {}), ...fields });
    },
    deleteDoc: async (path) => {
      docs.delete(path);
    },
    listDocs: async (collectionPath) =>
      [...docs.entries()]
        .filter(([path]) => {
          if (!path.startsWith(`${collectionPath}/`)) return false;
          // A collection holds documents, not the documents of its
          // subcollections: `.../semesters/x` belongs, `.../semesters/x/y/z`
          // does not. Without this a list of semesters would return enrolments.
          return path.slice(collectionPath.length + 1).includes('/') === false;
        })
        .map(([, fields]) => ({ ...fields })),
  };
}

function ctxFor(store, { uid = 'uid-1', userId = 'usr_a', university = 'bracu' } = {}) {
  return {
    repo: createAcademicRepo(store, uid),
    userId,
    university,
    sha256Hex,
    now: () => NOW,
  };
}

// ── Semesters ───────────────────────────────────────────────────────────────

test('creating a semester answers 201 and stores it under the student', async () => {
  const store = memoryStore();
  const ctx = ctxFor(store);

  const res = await academic.createSemester(ctx, { year: 2026, season: 'Fall' });

  assert.equal(res.status, 201);
  assert.equal(res.body.semester.id, 'sem_bracu_20263');
  assert.equal(res.body.semester.name, 'Fall 2026');
  assert.ok(store.docs.has('shohojUsers/uid-1/semesters/sem_bracu_20263'));
});

test('creating the same semester twice is idempotent, not a duplicate or a 409', async () => {
  // The id is derived from the term, so a retried POST is the same semester.
  // A mobile client retrying a dropped request needs this.
  const store = memoryStore();
  const ctx = ctxFor(store);

  const first = await academic.createSemester(ctx, { year: 2026, season: 'Fall' });
  const second = await academic.createSemester(ctx, { year: 2026, season: 'Fall' });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200, 'the repeat is an update, not a creation');
  assert.equal(second.body.semester.id, first.body.semester.id);
  assert.equal(store.docs.size, 1);
});

test('only one semester is ACTIVE at a time', async () => {
  // "Which semester am I in" has exactly one answer; Today and Upcoming depend
  // on it.
  const store = memoryStore();
  const ctx = ctxFor(store);

  await academic.createSemester(ctx, { year: 2026, season: 'Spring', status: 'ACTIVE' });
  await academic.createSemester(ctx, { year: 2026, season: 'Fall', status: 'ACTIVE' });

  const list = await academic.listSemesters(ctx);
  const active = list.body.items.filter((s) => s.status === 'ACTIVE');
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'sem_bracu_20263');
  assert.equal(list.body.items.find((s) => s.id === 'sem_bracu_20261').status, 'COMPLETED');
});

test('promoting via PATCH also demotes the previous active semester', async () => {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2026, season: 'Spring', status: 'ACTIVE' });
  await academic.createSemester(ctx, { year: 2026, season: 'Fall' });

  await academic.patchSemester(ctx, 'sem_bracu_20263', { status: 'ACTIVE' });

  const list = await academic.listSemesters(ctx);
  assert.equal(list.body.items.filter((s) => s.status === 'ACTIVE').length, 1);
});

test('semesters come back newest first', async () => {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2025, season: 'Fall' });
  await academic.createSemester(ctx, { year: 2026, season: 'Fall' });
  await academic.createSemester(ctx, { year: 2026, season: 'Spring' });

  const list = await academic.listSemesters(ctx);
  assert.deepEqual(
    list.body.items.map((s) => s.name),
    ['Fall 2026', 'Spring 2026', 'Fall 2025'],
  );
});

test('an invalid semester answers 400 naming the field', async () => {
  const res = await academic.createSemester(ctxFor(memoryStore()), {
    year: 2026,
    season: 'Winter',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_request');
  assert.equal(res.body.error.field, 'season');
});

test('a semester that does not exist answers 404', async () => {
  const ctx = ctxFor(memoryStore());
  assert.equal((await academic.getSemester(ctx, 'sem_bracu_20263')).status, 404);
  assert.equal((await academic.patchSemester(ctx, 'sem_bracu_20263', {})).status, 404);
  assert.equal((await academic.deleteSemester(ctx, 'sem_bracu_20263')).status, 404);
});

test('a student cannot hold unbounded semesters', async () => {
  const store = memoryStore();
  const ctx = ctxFor(store);
  for (let i = 0; i < MAX_SEMESTERS; i += 1) {
    store.docs.set(`shohojUsers/uid-1/semesters/sem_bracu_filler${i}`, {
      id: `sem_bracu_filler${i}`,
      status: 'ARCHIVED',
      year: 2001,
      season: 'Spring',
    });
  }
  const res = await academic.createSemester(ctx, { year: 2026, season: 'Fall' });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /up to 40 semesters/);
});

// ── Enrollments ─────────────────────────────────────────────────────────────

async function withSemester() {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2026, season: 'Fall', status: 'ACTIVE' });
  return { store, ctx, semesterId: 'sem_bracu_20263' };
}

test('a course can be enrolled into a semester', async () => {
  const { ctx, semesterId } = await withSemester();

  const res = await academic.createEnrollment(ctx, {
    semesterId,
    courseCode: 'CSE220',
    section: '13',
    facultyInitials: 'SHO',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.enrollment.courseCode, 'CSE220');
  assert.equal(res.body.enrollment.section, '13');
  assert.equal(res.body.enrollment.facultyInitials, 'SHO');
  assert.equal(res.body.enrollment.credits, 3, 'credits come from the server catalogue');
  assert.equal(res.body.enrollment.source, 'MANUAL');
});

test('enrolling the same course twice in one semester updates, never duplicates', async () => {
  const { store, ctx, semesterId } = await withSemester();

  const first = await academic.createEnrollment(ctx, { semesterId, courseCode: 'CSE220' });
  const second = await academic.createEnrollment(ctx, {
    semesterId,
    courseCode: 'CSE220',
    section: '07',
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.enrollment.id, first.body.enrollment.id);
  assert.equal(second.body.enrollment.section, '07');

  const list = await academic.listEnrollments(ctx);
  assert.equal(list.body.items.length, 1);
  void store;
});

test('the same course in two semesters is two enrolments — a retake works', async () => {
  const { ctx } = await withSemester();
  await academic.createSemester(ctx, { year: 2027, season: 'Spring' });

  await academic.createEnrollment(ctx, { semesterId: 'sem_bracu_20263', courseCode: 'CSE220' });
  await academic.createEnrollment(ctx, { semesterId: 'sem_bracu_20271', courseCode: 'CSE220' });

  const all = await academic.listEnrollments(ctx);
  assert.equal(all.body.items.length, 2);

  const fall = await academic.listEnrollments(ctx, { semesterId: 'sem_bracu_20263' });
  assert.equal(fall.body.items.length, 1);
});

test('enrolling into a semester that is not yours answers 404', async () => {
  // Not 403 — confirming it exists would tell one student about another's data.
  const { ctx } = await withSemester();
  const res = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20991',
    courseCode: 'CSE220',
  });
  assert.equal(res.status, 404);
});

test('a course outside the catalogue is refused before anything is written', async () => {
  const { store, ctx, semesterId } = await withSemester();
  const before = store.docs.size;

  const res = await academic.createEnrollment(ctx, { semesterId, courseCode: 'ZZZ999' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.field, 'courseCode');
  assert.equal(store.docs.size, before, 'nothing was written');
});

test('enrolments list sorted by course code', async () => {
  const { ctx, semesterId } = await withSemester();
  for (const courseCode of ['MAT215', 'CSE220', 'PHY111']) {
    await academic.createEnrollment(ctx, { semesterId, courseCode });
  }
  const list = await academic.listEnrollments(ctx);
  assert.deepEqual(
    list.body.items.map((e) => e.courseCode),
    ['CSE220', 'MAT215', 'PHY111'],
  );
});

test('deleting a semester takes its enrolments with it', async () => {
  // An enrolment whose semester is gone appears in no view that lists by
  // semester, so it could never be found or removed again.
  const { store, ctx, semesterId } = await withSemester();
  await academic.createEnrollment(ctx, { semesterId, courseCode: 'CSE220' });
  await academic.createEnrollment(ctx, { semesterId, courseCode: 'MAT215' });

  const res = await academic.deleteSemester(ctx, semesterId);

  assert.equal(res.status, 200);
  assert.equal(res.body.deleted.removedEnrollments, 2, 'the client can say what went');
  assert.equal((await academic.listEnrollments(ctx)).body.items.length, 0);
  assert.equal(store.docs.size, 0);
});

test('deleting a semester leaves another semester and its enrolments alone', async () => {
  const { ctx } = await withSemester();
  await academic.createSemester(ctx, { year: 2027, season: 'Spring' });
  await academic.createEnrollment(ctx, { semesterId: 'sem_bracu_20263', courseCode: 'CSE220' });
  await academic.createEnrollment(ctx, { semesterId: 'sem_bracu_20271', courseCode: 'MAT215' });

  await academic.deleteSemester(ctx, 'sem_bracu_20263');

  const left = await academic.listEnrollments(ctx);
  assert.equal(left.body.items.length, 1);
  assert.equal(left.body.items[0].courseCode, 'MAT215');
});

test('an enrolment can be patched and deleted', async () => {
  const { ctx, semesterId } = await withSemester();
  const created = await academic.createEnrollment(ctx, { semesterId, courseCode: 'CSE220' });
  const id = created.body.enrollment.id;

  const patched = await academic.patchEnrollment(ctx, id, { status: 'DROPPED', section: '02' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.enrollment.status, 'DROPPED');
  assert.equal(patched.body.enrollment.section, '02');

  assert.equal((await academic.deleteEnrollment(ctx, id)).status, 200);
  assert.equal((await academic.getEnrollment(ctx, id)).status, 404);
});

// ── Ownership ───────────────────────────────────────────────────────────────

test("one student cannot read, change or delete another's records", async () => {
  const store = memoryStore();
  const mine = ctxFor(store, { uid: 'uid-mine', userId: 'usr_mine' });
  const theirs = ctxFor(store, { uid: 'uid-theirs', userId: 'usr_theirs' });

  await academic.createSemester(mine, { year: 2026, season: 'Fall' });
  const enrolled = await academic.createEnrollment(mine, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'CSE220',
  });
  const enrollmentId = enrolled.body.enrollment.id;

  // Same derived semester id — the other student simply has no such document,
  // because the repository is bound to a different uid.
  assert.equal((await academic.getSemester(theirs, 'sem_bracu_20263')).status, 404);
  assert.equal(
    (await academic.patchSemester(theirs, 'sem_bracu_20263', { status: 'ARCHIVED' })).status,
    404,
  );
  assert.equal((await academic.deleteSemester(theirs, 'sem_bracu_20263')).status, 404);
  assert.equal((await academic.getEnrollment(theirs, enrollmentId)).status, 404);
  assert.equal((await academic.deleteEnrollment(theirs, enrollmentId)).status, 404);

  assert.equal((await academic.listSemesters(theirs)).body.items.length, 0);
  assert.equal((await academic.listEnrollments(theirs)).body.items.length, 0);

  // ...and none of that disturbed the owner's data.
  assert.equal((await academic.listSemesters(mine)).body.items.length, 1);
  assert.equal((await academic.listEnrollments(mine)).body.items.length, 1);
});

// ── Wiring ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'shohoj-test';
const ORIGIN = 'https://shohoj.example';
const ENV_BASE = { FIREBASE_PROJECT_ID: PROJECT_ID, ALLOWED_ORIGINS: ORIGIN };

function req(method, path, { origin = ORIGIN, token = null, body = null } = {}) {
  const headers = new Headers({ Origin: origin });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== null) headers.set('Content-Type', 'application/json');
  return new Request(`https://worker.local${path}`, {
    method,
    headers,
    body: body === null ? null : JSON.stringify(body),
  });
}

async function signToken(claims) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'academic-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
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
    client_email: 'academic@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

/** Google's OAuth exchange and Firestore REST, over an in-memory Map. */
function fakeGoogle(store = new Map()) {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'sa-token', expires_in: 3600 });
    }
    const [, raw] = /\/documents\/([^?]+)/.exec(url) || [];
    if (raw === undefined) throw new Error(`unexpected fetch: ${method} ${url}`);
    const path = decodeURIComponent(raw);

    if (method === 'PATCH') {
      store.set(path, JSON.parse(init.body).fields);
      return Response.json(JSON.parse(init.body));
    }
    if (method === 'DELETE') {
      store.delete(path);
      return Response.json({});
    }
    // A GET on a path ending in a collection lists it; otherwise it is a doc.
    const isCollection = path.split('/').length % 2 === 1;
    if (isCollection) {
      const documents = [...store.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, fields]) => ({
          name: `projects/p/databases/(default)/documents/${key}`,
          fields,
        }));
      return Response.json({ documents });
    }
    const fields = store.get(path);
    if (fields === undefined) return new Response('{}', { status: 404 });
    return Response.json({ fields });
  };
}

async function withMockedFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const STUDENT = {
  sub: 'wired-uid-1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Wired Student',
  firebase: { sign_in_provider: 'google.com' },
};

test('the routes refuse an unauthenticated request in the v1 envelope', async () => {
  for (const path of ['/api/v1/semesters', '/api/v1/enrollments']) {
    const res = await worker.fetch(req('GET', path), ENV_BASE, {});
    assert.equal(res.status, 401, path);
    assert.equal((await res.json()).error.code, 'unauthenticated');
  }
});

test('the routes refuse a disallowed browser origin', async () => {
  const res = await worker.fetch(
    req('GET', '/api/v1/semesters', { origin: 'https://attacker.example' }),
    ENV_BASE,
    {},
  );
  assert.equal(res.status, 403);
});

test('an unsupported method on a known path is 404, not a crash', async () => {
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const res = await withMockedFetch(fakeGoogle(), () =>
      worker.fetch(req('PUT', '/api/v1/semesters', { token }), env, {}),
    );
    assert.equal(res.status, 404);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a student signs in, creates a semester, and enrols a course over HTTP', async () => {
  // Phase 2's acceptance criterion, through the real route table.
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();

    await withMockedFetch(google, async () => {
      const created = await worker.fetch(
        req('POST', '/api/v1/semesters', {
          token,
          body: { sessionId: 20263, status: 'ACTIVE', startDate: '2026-10-03' },
        }),
        env,
        {},
      );
      assert.equal(created.status, 201);
      const semester = (await created.json()).semester;
      assert.equal(semester.id, 'sem_bracu_20263');
      assert.equal(semester.name, 'Fall 2026');
      assert.equal(semester.status, 'ACTIVE');

      const enrolled = await worker.fetch(
        req('POST', '/api/v1/enrollments', {
          token,
          body: { semesterId: semester.id, courseCode: 'CSE220', section: '13' },
        }),
        env,
        {},
      );
      assert.equal(enrolled.status, 201);
      assert.equal((await enrolled.json()).enrollment.credits, 3);

      const listed = await worker.fetch(
        req('GET', `/api/v1/enrollments?semesterId=${semester.id}`, { token }),
        env,
        {},
      );
      assert.equal(listed.status, 200);
      const items = (await listed.json()).items;
      assert.equal(items.length, 1);
      assert.equal(items[0].courseCode, 'CSE220');

      const semesters = await worker.fetch(req('GET', '/api/v1/semesters', { token }), env, {});
      assert.equal((await semesters.json()).items.length, 1);
    });
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a non-campus account cannot set up semesters, and is told why', async () => {
  // The semester id embeds the campus. There is no correct id to mint for
  // somebody who belongs to none, so this says so rather than guessing one.
  const { token, jwk } = await signToken({
    sub: 'admin-uid',
    email: 'admin.shohoj@gmail.com',
    email_verified: true,
    admin: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const res = await withMockedFetch(fakeGoogle(), () =>
      worker.fetch(req('GET', '/api/v1/semesters', { token }), env, {}),
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'forbidden');
  } finally {
    __setTestJwksForTests(null);
  }
});
