/**
 * worker/test/taskApi.test.js
 *
 * Shohoj Tasks' handler layer and routes (#715).
 *
 * Handlers driven directly against an in-memory repository, then the routes
 * through worker.fetch with a locally-signed token and every outbound call
 * mocked. Offline and deterministic throughout.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests } from '../index.js';
import { createAcademicRepo } from '../academicRepo.js';
import * as academic from '../academicHandlers.js';
import * as tasks from '../taskHandlers.js';

/** 2026-10-05 16:00 in Dhaka. */
const NOW = new Date('2026-10-05T10:00:00.000Z');
const TZ = 'Asia/Dhaka';

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let idCounter = 0;
const randomHex = (bytes) => String(idCounter++).padStart(bytes * 2, 'a');

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
        .filter(
          ([path]) =>
            path.startsWith(`${collectionPath}/`) &&
            !path.slice(collectionPath.length + 1).includes('/'),
        )
        .map(([, fields]) => ({ ...fields })),
  };
}

function ctxFor(store, { uid = 'uid-1', userId = 'usr_a', university = 'bracu' } = {}) {
  return {
    repo: createAcademicRepo(store, uid),
    userId,
    university,
    sha256Hex,
    randomHex,
    now: () => NOW,
  };
}

/** A student with an active Fall 2026 semester and CSE220 enrolled. */
async function withCourse() {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2026, season: 'Fall', status: 'ACTIVE' });
  const enrolled = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'CSE220',
  });
  return { store, ctx, enrollmentId: enrolled.body.enrollment.id };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

test('a task can be created against an enrolled course', async () => {
  const { ctx, enrollmentId } = await withCourse();

  const res = await tasks.createTask(ctx, {
    title: 'Assignment 2',
    type: 'ASSIGNMENT',
    enrollmentId,
    dueAt: '2026-10-09T17:00:00Z',
    estimatedMinutes: 180,
    priority: 'HIGH',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.task.title, 'Assignment 2');
  assert.equal(res.body.task.enrollmentId, enrollmentId);
  assert.equal(res.body.task.status, 'TODO');
  assert.equal(res.body.task.completedAt, null);
  assert.match(res.body.task.id, /^tsk_[0-9a-f]{32}$/);
});

test('a personal task needs no course', async () => {
  const { ctx } = await withCourse();
  const res = await tasks.createTask(ctx, { title: 'Renew library card', type: 'PERSONAL' });
  assert.equal(res.status, 201);
  assert.equal(res.body.task.enrollmentId, null);
});

test('a task cannot point at a course the student does not have', async () => {
  // Without this check a guessed enrolment id produces a task no
  // course-filtered view can reach.
  const { ctx } = await withCourse();
  const res = await tasks.createTask(ctx, { title: 'x', enrollmentId: 'enr_' + 'f'.repeat(32) });
  assert.equal(res.status, 404);
});

test('two identical tasks are two tasks', async () => {
  // Unlike semesters and enrolments, task ids are assigned. A student with two
  // readings due Friday must be able to create both.
  const { ctx, enrollmentId } = await withCourse();
  const a = await tasks.createTask(ctx, { title: 'Read chapter 4', enrollmentId });
  const b = await tasks.createTask(ctx, { title: 'Read chapter 4', enrollmentId });

  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.body.task.id, b.body.task.id);
  assert.equal((await tasks.listTasks(ctx)).body.items.length, 2);
});

test('a task can be patched, completed, reopened and deleted', async () => {
  const { ctx, enrollmentId } = await withCourse();
  const created = await tasks.createTask(ctx, { title: 'Assignment 2', enrollmentId });
  const id = created.body.task.id;

  const patched = await tasks.patchTask(ctx, id, { priority: 'CRITICAL', estimatedMinutes: 240 });
  assert.equal(patched.body.task.priority, 'CRITICAL');
  assert.equal(patched.body.task.estimatedMinutes, 240);

  const done = await tasks.setTaskCompletion(ctx, id, true);
  assert.equal(done.body.task.status, 'COMPLETED');
  assert.equal(done.body.task.completedAt, NOW.toISOString());

  const reopened = await tasks.setTaskCompletion(ctx, id, false);
  assert.equal(reopened.body.task.status, 'TODO');
  assert.equal(reopened.body.task.completedAt, null);

  assert.equal((await tasks.deleteTask(ctx, id)).status, 200);
  assert.equal((await tasks.getTask(ctx, id)).status, 404);
});

test('a task that does not exist answers 404 on every verb', async () => {
  const { ctx } = await withCourse();
  const ghost = 'tsk_' + 'f'.repeat(32);
  assert.equal((await tasks.getTask(ctx, ghost)).status, 404);
  assert.equal((await tasks.patchTask(ctx, ghost, { title: 'x' })).status, 404);
  assert.equal((await tasks.deleteTask(ctx, ghost)).status, 404);
  assert.equal((await tasks.setTaskCompletion(ctx, ghost, true)).status, 404);
});

test('an invalid task answers 400 naming the field', async () => {
  const { ctx } = await withCourse();
  const res = await tasks.createTask(ctx, { title: 'x', dueAt: '2026-10-05T23:00' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.field, 'dueAt');
});

test('moving a task to a course the student does not have is refused', async () => {
  const { ctx, enrollmentId } = await withCourse();
  const created = await tasks.createTask(ctx, { title: 'x', enrollmentId });
  const res = await tasks.patchTask(ctx, created.body.task.id, {
    enrollmentId: 'enr_' + 'e'.repeat(32),
  });
  assert.equal(res.status, 404);
});

// ── Filtering ───────────────────────────────────────────────────────────────

test('tasks filter by course and by status', async () => {
  const { ctx, enrollmentId } = await withCourse();
  const other = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'MAT215',
  });
  const otherId = other.body.enrollment.id;

  await tasks.createTask(ctx, { title: 'cse a', enrollmentId });
  await tasks.createTask(ctx, { title: 'cse b', enrollmentId, status: 'COMPLETED' });
  await tasks.createTask(ctx, { title: 'mat a', enrollmentId: otherId });

  assert.equal((await tasks.listTasks(ctx, { enrollmentId })).body.items.length, 2);
  assert.equal((await tasks.listTasks(ctx, { enrollmentId: otherId })).body.items.length, 1);
  assert.equal((await tasks.listTasks(ctx, { status: 'COMPLETED' })).body.items.length, 1);
  assert.equal((await tasks.listTasks(ctx)).body.items.length, 3);
});

// ── Today and Upcoming ──────────────────────────────────────────────────────

test('Today needs a timezone rather than silently assuming UTC', async () => {
  // A UTC default answers the wrong day for every Dhaka student after 6pm —
  // exactly when they would be checking.
  const { ctx } = await withCourse();
  const res = await tasks.todayTasks(ctx, {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.field, 'tz');

  assert.equal((await tasks.todayTasks(ctx, { tz: 'Mars/Phobos' })).status, 400);
});

test('Today returns overdue and due-today separately', async () => {
  const { ctx, enrollmentId } = await withCourse();
  await tasks.createTask(ctx, { title: 'late', enrollmentId, dueAt: '2026-10-01T10:00:00Z' });
  await tasks.createTask(ctx, { title: 'tonight', enrollmentId, dueAt: '2026-10-05T17:00:00Z' });
  await tasks.createTask(ctx, { title: 'next week', enrollmentId, dueAt: '2026-10-12T10:00:00Z' });

  const res = await tasks.todayTasks(ctx, { tz: TZ });

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.overdue.map((t) => t.title),
    ['late'],
  );
  assert.deepEqual(
    res.body.dueToday.map((t) => t.title),
    ['tonight'],
  );
});

test('Upcoming defaults to a week and accepts a horizon', async () => {
  const { ctx, enrollmentId } = await withCourse();
  await tasks.createTask(ctx, { title: 'in 3 days', enrollmentId, dueAt: '2026-10-08T10:00:00Z' });
  await tasks.createTask(ctx, { title: 'in 3 weeks', enrollmentId, dueAt: '2026-10-25T10:00:00Z' });

  const week = await tasks.upcomingTasks(ctx, { tz: TZ });
  assert.equal(week.body.days, 7);
  assert.deepEqual(
    week.body.items.map((t) => t.title),
    ['in 3 days'],
  );

  const month = await tasks.upcomingTasks(ctx, { tz: TZ, days: '30' });
  assert.equal(month.body.days, 30);
  assert.equal(month.body.items.length, 2);
});

test('a nonsense horizon is refused', async () => {
  const { ctx } = await withCourse();
  const res = await tasks.upcomingTasks(ctx, { tz: TZ, days: '0' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.field, 'days');
});

// ── Cascades ────────────────────────────────────────────────────────────────

test('deleting an enrolment takes its tasks with it', async () => {
  // A task whose enrolment is gone shows in no course-filtered view, so it
  // could never be found or removed again.
  const { ctx, enrollmentId } = await withCourse();
  const other = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'MAT215',
  });
  await tasks.createTask(ctx, { title: 'cse a', enrollmentId });
  await tasks.createTask(ctx, { title: 'cse b', enrollmentId });
  await tasks.createTask(ctx, { title: 'mat a', enrollmentId: other.body.enrollment.id });

  const res = await academic.deleteEnrollment(ctx, enrollmentId);

  assert.equal(res.status, 200);
  assert.equal(res.body.deleted.removedTasks, 2);
  const left = await tasks.listTasks(ctx);
  assert.deepEqual(
    left.body.items.map((t) => t.title),
    ['mat a'],
  );
});

test('deleting a semester cascades all the way to tasks', async () => {
  const { ctx, enrollmentId } = await withCourse();
  await tasks.createTask(ctx, { title: 'a', enrollmentId });
  await tasks.createTask(ctx, { title: 'b', enrollmentId });

  const res = await academic.deleteSemester(ctx, 'sem_bracu_20263');

  assert.equal(res.body.deleted.removedEnrollments, 1);
  assert.equal(res.body.deleted.removedTasks, 2);
  assert.equal((await tasks.listTasks(ctx)).body.items.length, 0);
});

test('a personal task survives a semester being deleted', async () => {
  // It was never attached to a course, so nothing about it is orphaned.
  const { ctx, enrollmentId } = await withCourse();
  await tasks.createTask(ctx, { title: 'coursework', enrollmentId });
  await tasks.createTask(ctx, { title: 'renew library card', type: 'PERSONAL' });

  await academic.deleteSemester(ctx, 'sem_bracu_20263');

  const left = await tasks.listTasks(ctx);
  assert.deepEqual(
    left.body.items.map((t) => t.title),
    ['renew library card'],
  );
});

// ── Ownership ───────────────────────────────────────────────────────────────

test("one student cannot see or touch another's tasks", async () => {
  const store = memoryStore();
  const mine = ctxFor(store, { uid: 'uid-mine', userId: 'usr_mine' });
  const theirs = ctxFor(store, { uid: 'uid-theirs', userId: 'usr_theirs' });

  await academic.createSemester(mine, { year: 2026, season: 'Fall', status: 'ACTIVE' });
  const enrolled = await academic.createEnrollment(mine, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'CSE220',
  });
  const created = await tasks.createTask(mine, {
    title: 'Private',
    enrollmentId: enrolled.body.enrollment.id,
  });
  const id = created.body.task.id;

  assert.equal((await tasks.getTask(theirs, id)).status, 404);
  assert.equal((await tasks.patchTask(theirs, id, { title: 'stolen' })).status, 404);
  assert.equal((await tasks.deleteTask(theirs, id)).status, 404);
  assert.equal((await tasks.setTaskCompletion(theirs, id, true)).status, 404);
  assert.equal((await tasks.listTasks(theirs)).body.items.length, 0);
  assert.equal((await tasks.todayTasks(theirs, { tz: TZ })).body.overdue.length, 0);

  assert.equal((await tasks.listTasks(mine)).body.items.length, 1);
});

// ── Wiring ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'shohoj-test';
const ORIGIN = 'https://shohoj.example';
const ENV_BASE = { FIREBASE_PROJECT_ID: PROJECT_ID, ALLOWED_ORIGINS: ORIGIN };

function req(method, path, { token = null, body = null } = {}) {
  const headers = new Headers({ Origin: ORIGIN });
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
  jwk.kid = 'task-key';
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
    client_email: 'task@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

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
    if (path.split('/').length % 2 === 1) {
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
  sub: 'task-uid-1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Task Student',
  firebase: { sign_in_provider: 'google.com' },
};

test('the task routes refuse an unauthenticated request', async () => {
  for (const path of ['/api/v1/tasks', '/api/v1/tasks/today', '/api/v1/tasks/upcoming']) {
    const res = await worker.fetch(req('GET', path), ENV_BASE, {});
    assert.equal(res.status, 401, path);
    assert.equal((await res.json()).error.code, 'unauthenticated');
  }
});

test('/tasks/today and /tasks/upcoming are not swallowed by the id route', async () => {
  // Both are literal paths that /tasks/{id} would otherwise match, answering
  // 404 for the two most-used endpoints in the product.
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    await withMockedFetch(fakeGoogle(), async () => {
      const today = await worker.fetch(
        req('GET', `/api/v1/tasks/today?tz=${encodeURIComponent(TZ)}`, { token }),
        env,
        {},
      );
      assert.equal(today.status, 200);
      const todayBody = await today.json();
      assert.ok(Array.isArray(todayBody.overdue));
      assert.ok(Array.isArray(todayBody.dueToday));

      const upcoming = await worker.fetch(
        req('GET', `/api/v1/tasks/upcoming?tz=${encodeURIComponent(TZ)}`, { token }),
        env,
        {},
      );
      assert.equal(upcoming.status, 200);
      assert.equal((await upcoming.json()).days, 7);
    });
  } finally {
    __setTestJwksForTests(null);
  }
});

test('the whole flow works over HTTP: enrol, create, complete', async () => {
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    await withMockedFetch(fakeGoogle(), async () => {
      await worker.fetch(
        req('POST', '/api/v1/semesters', { token, body: { sessionId: 20263, status: 'ACTIVE' } }),
        env,
        {},
      );
      const enrolled = await worker.fetch(
        req('POST', '/api/v1/enrollments', {
          token,
          body: { semesterId: 'sem_bracu_20263', courseCode: 'CSE220' },
        }),
        env,
        {},
      );
      const enrollmentId = (await enrolled.json()).enrollment.id;

      const created = await worker.fetch(
        req('POST', '/api/v1/tasks', {
          token,
          body: {
            title: 'CSE220 Assignment 2',
            type: 'ASSIGNMENT',
            enrollmentId,
            dueAt: '2026-10-09T17:00:00Z',
          },
        }),
        env,
        {},
      );
      assert.equal(created.status, 201);
      const task = (await created.json()).task;

      const listed = await worker.fetch(
        req('GET', `/api/v1/tasks?enrollmentId=${enrollmentId}`, { token }),
        env,
        {},
      );
      assert.equal((await listed.json()).items.length, 1);

      const completed = await worker.fetch(
        req('PUT', `/api/v1/tasks/${task.id}/completion`, { token, body: { completed: true } }),
        env,
        {},
      );
      assert.equal(completed.status, 200);
      assert.equal((await completed.json()).task.status, 'COMPLETED');
    });
  } finally {
    __setTestJwksForTests(null);
  }
});

test('the completion endpoint insists on a boolean', async () => {
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...ENV_BASE, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const res = await withMockedFetch(fakeGoogle(), () =>
      worker.fetch(
        req('PUT', `/api/v1/tasks/tsk_${'a'.repeat(32)}/completion`, { token, body: { done: 1 } }),
        env,
        {},
      ),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.field, 'completed');
  } finally {
    __setTestJwksForTests(null);
  }
});
