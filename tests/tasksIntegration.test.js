/**
 * tests/tasksIntegration.test.js
 *
 * Phase 3a's acceptance criterion, proven end to end (#715):
 *
 *   "A user can create a CSE220 assignment tied to the active semester and
 *    later see, update and complete it."
 *
 * The real frontend client against the real Worker routes, with only Google's
 * OAuth exchange and Firestore REST faked. No network, no browser, no emulator.
 *
 * This is also where the two copies of the enums are checked against each
 * other: the client refuses values it does not know, so a server that returned
 * a type the client had not been taught would fail here rather than in a
 * student's browser.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests } from '../worker/index.js';
import { createApiClient } from '../src/platform/api/apiClient.ts';
import {
  createEnrollment,
  createSemester,
  deleteEnrollment,
} from '../src/platform/api/academic.ts';
import {
  createTask,
  deleteTask,
  estimatedWorkload,
  fetchToday,
  fetchUpcoming,
  listTasks,
  setTaskCompleted,
  updateTask,
} from '../src/platform/api/tasks.ts';

const PROJECT_ID = 'shohoj-test';
const BASE_URL = 'https://worker.example';
const ORIGIN = 'https://shohoj.example';
const WORKER_ENV = { FIREBASE_PROJECT_ID: PROJECT_ID, ALLOWED_ORIGINS: ORIGIN };

async function signToken(claims, kid = 'tasks-key') {
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
    client_email: 'tasks@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

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

function clientAgainstWorker({ token, env, google }) {
  return createApiClient({
    baseUrl: BASE_URL,
    getIdToken: async () => token,
    fetchFn: async (url, init) => {
      const headers = new Headers(init?.headers);
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
  sub: 'tasks-uid-1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Tasks Student',
  firebase: { sign_in_provider: 'google.com' },
};

/** Sign in and set up an active semester with CSE220 enrolled. */
async function signedInWithCourse(claims = STUDENT, kid = 'tasks-key') {
  const { token, jwk } = await signToken(claims, kid);
  const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
  const google = fakeGoogle();
  const client = clientAgainstWorker({ token, env, google });
  return { token, jwk, env, google, client };
}

async function setUpCourse(client) {
  const semester = await createSemester(client, { sessionId: 20263, status: 'ACTIVE' });
  assert.equal(semester.ok, true, `semester: ${semester.error?.message}`);
  const enrolled = await createEnrollment(client, {
    semesterId: semester.value.id,
    courseCode: 'CSE220',
    section: '13',
  });
  assert.equal(enrolled.ok, true, `enrolment: ${enrolled.error?.message}`);
  return { semester: semester.value, enrollment: enrolled.value };
}

test('a student creates a CSE220 assignment, sees it, updates it and completes it', async () => {
  const session = await signedInWithCourse();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const { enrollment } = await setUpCourse(client);

    // Create.
    const created = await createTask(client, {
      title: 'CSE220 Assignment 2',
      type: 'ASSIGNMENT',
      enrollmentId: enrollment.id,
      dueAt: '2026-10-09T23:59:00+06:00',
      estimatedMinutes: 180,
      priority: 'HIGH',
    });
    assert.equal(created.ok, true, `create: ${created.error?.message}`);
    assert.match(created.value.id, /^tsk_[0-9a-f]{32}$/);
    assert.equal(created.value.status, 'TODO');
    assert.equal(created.value.completedAt, null);
    // The offset was normalised to the same instant in UTC.
    assert.equal(created.value.dueAt, '2026-10-09T17:59:00.000Z');

    // See it, filtered to the course.
    const forCourse = await listTasks(client, { enrollmentId: enrollment.id });
    assert.equal(forCourse.ok, true);
    assert.equal(forCourse.value.length, 1);
    assert.equal(forCourse.value[0].title, 'CSE220 Assignment 2');
    assert.equal(estimatedWorkload(forCourse.value), 180);

    // Update it.
    const updated = await updateTask(client, created.value.id, {
      priority: 'CRITICAL',
      estimatedMinutes: 240,
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.value.priority, 'CRITICAL');
    assert.equal(updated.value.estimatedMinutes, 240);

    // Complete it.
    const done = await setTaskCompleted(client, created.value.id, true);
    assert.equal(done.ok, true);
    assert.equal(done.value.status, 'COMPLETED');
    assert.ok(done.value.completedAt !== null, 'completing stamps completedAt');

    // And change your mind.
    const reopened = await setTaskCompleted(client, created.value.id, false);
    assert.equal(reopened.value.status, 'TODO');
    assert.equal(reopened.value.completedAt, null);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('Today and Upcoming answer over the real routes', async () => {
  const session = await signedInWithCourse();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const { enrollment } = await setUpCourse(client);

    // Relative to the real clock, so the test says what it means whenever it runs.
    const now = new Date();
    const inDays = (n, hour = 12) => {
      const d = new Date(now);
      d.setDate(d.getDate() + n);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    await createTask(client, { title: 'overdue', enrollmentId: enrollment.id, dueAt: inDays(-3) });
    await createTask(client, { title: 'today', enrollmentId: enrollment.id, dueAt: inDays(0, 23) });
    await createTask(client, {
      title: 'in two days',
      enrollmentId: enrollment.id,
      dueAt: inDays(2),
    });
    await createTask(client, {
      title: 'next month',
      enrollmentId: enrollment.id,
      dueAt: inDays(40),
    });
    await createTask(client, { title: 'undated', enrollmentId: enrollment.id });

    const today = await fetchToday(client);
    assert.equal(today.ok, true, `today: ${today.error?.message}`);
    assert.deepEqual(
      today.value.overdue.map((t) => t.title),
      ['overdue'],
    );
    assert.deepEqual(
      today.value.dueToday.map((t) => t.title),
      ['today'],
    );

    const upcoming = await fetchUpcoming(client);
    assert.equal(upcoming.ok, true);
    assert.equal(upcoming.value.days, 7);
    assert.deepEqual(
      upcoming.value.items.map((t) => t.title),
      ['in two days'],
    );

    const wider = await fetchUpcoming(client, 60);
    assert.deepEqual(
      wider.value.items.map((t) => t.title),
      ['in two days', 'next month'],
    );

    // The undated task is in neither view, but is still findable.
    const all = await listTasks(client);
    assert.equal(all.value.length, 5);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a task cannot be attached to a course the student does not have', async () => {
  const session = await signedInWithCourse();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    await setUpCourse(client);

    const result = await createTask(client, {
      title: 'Someone else’s coursework',
      enrollmentId: `enr_${'f'.repeat(32)}`,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'not_found');
    assert.equal((await listTasks(client)).value.length, 0);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('dropping a course takes its tasks with it, and says how many', async () => {
  const session = await signedInWithCourse();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const { semester, enrollment } = await setUpCourse(client);
    const other = await createEnrollment(client, {
      semesterId: semester.id,
      courseCode: 'MAT215',
    });

    await createTask(client, { title: 'cse a', enrollmentId: enrollment.id });
    await createTask(client, { title: 'cse b', enrollmentId: enrollment.id });
    await createTask(client, { title: 'mat a', enrollmentId: other.value.id });
    await createTask(client, { title: 'personal', type: 'PERSONAL' });

    const dropped = await deleteEnrollment(client, enrollment.id);
    assert.equal(dropped.ok, true);
    assert.equal(dropped.value.removedTasks, 2);

    const left = await listTasks(client);
    assert.deepEqual(left.value.map((t) => t.title).sort(), ['mat a', 'personal']);
  } finally {
    __setTestJwksForTests(null);
  }
});

test("one student's tasks are invisible to another", async () => {
  const mine = await signToken(STUDENT, 'key-mine');
  const theirs = await signToken(
    { ...STUDENT, sub: 'tasks-uid-2', email: 'other@g.bracu.ac.bd', name: 'Other' },
    'key-theirs',
  );
  __setTestJwksForTests({ keys: [mine.jwk, theirs.jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();
    const myClient = clientAgainstWorker({ token: mine.token, env, google });
    const theirClient = clientAgainstWorker({ token: theirs.token, env, google });

    const { enrollment } = await setUpCourse(myClient);
    const task = await createTask(myClient, { title: 'Private', enrollmentId: enrollment.id });

    assert.deepEqual((await listTasks(theirClient)).value, []);
    const today = await fetchToday(theirClient);
    assert.deepEqual(today.value.overdue, []);
    assert.deepEqual(today.value.dueToday, []);

    const stolen = await updateTask(theirClient, task.value.id, { title: 'stolen' });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.error.code, 'not_found', '404, not 403 — 403 would confirm it exists');

    assert.equal((await setTaskCompleted(theirClient, task.value.id, true)).ok, false);
    assert.equal((await deleteTask(theirClient, task.value.id)).ok, false);

    // The owner is undisturbed.
    const ours = await listTasks(myClient);
    assert.equal(ours.value.length, 1);
    assert.equal(ours.value[0].title, 'Private');
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a bare local due date is refused with a message worth showing', async () => {
  const session = await signedInWithCourse();
  __setTestJwksForTests({ keys: [session.jwk] });
  try {
    const { client } = session;
    const { enrollment } = await setUpCourse(client);

    const result = await createTask(client, {
      title: 'x',
      enrollmentId: enrollment.id,
      dueAt: '2026-10-09T23:59',
    });

    assert.equal(result.ok, false);
    assert.match(result.error.userMessage, /ISO 8601/);
    assert.equal((await listTasks(client)).value.length, 0);
  } finally {
    __setTestJwksForTests(null);
  }
});
