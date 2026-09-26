// tests/legacyTasksApi.test.js — the legacy Tasks client (#767).
//
// js/core/tasksApi.js is not a twin (the shell's tasks.ts is built on zod and
// its ApiClient), so twinParity cannot hold it to the shell. Two things are
// pinned here instead:
//   1. its pure helpers — isOpen, dueTone, byPriority — agree with the shell's
//      on the same inputs, because taskView.js (a real twin) is built on them;
//   2. the transport keeps the shell's rules: a token on every call and no call
//      without one, the Worker's own error message surfaced, a malformed
//      response refused whole, and a hung request turned into an error.

import test from 'node:test';
import assert from 'node:assert/strict';

import { importTyped } from './helpers/twins.mjs';
import * as legacy from '../js/core/tasksApi.js';

const typed = await importTyped('src/platform/api/tasks.ts');

const NOW = new Date(Date.UTC(2026, 9, 8, 12, 0));
const task = (n, overrides = {}) => ({
  id: `tsk_${String(n).repeat(32).slice(0, 32)}`,
  enrollmentId: null,
  title: `Task ${n}`,
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'MEDIUM',
  priorityScore: null,
  dueAt: null,
  startAt: null,
  estimatedMinutes: null,
  completedAt: null,
  ...overrides,
});

const TASKS = [
  task(1, { dueAt: '2026-10-05T09:00:00.000Z', priorityScore: 40 }),
  task(2, { dueAt: '2026-10-08T17:59:00.000Z', priorityScore: 80 }),
  task(3, { dueAt: '2026-10-09T10:00:00.000Z', status: 'IN_PROGRESS', priorityScore: 80 }),
  task(4, { dueAt: '2026-10-12T10:00:00.000Z', status: 'COMPLETED' }),
  task(5, { dueAt: '2026-11-20T10:00:00.000Z', status: 'CANCELLED' }),
  task(6, { dueAt: 'nonsense' }),
  task(7),
];

test('isOpen and dueTone agree with the shell on every fixture', () => {
  for (const t of TASKS) {
    assert.equal(legacy.isOpen(t), typed.isOpen(t), `isOpen ${t.id}`);
    assert.equal(legacy.dueTone(t, NOW), typed.dueTone(t, NOW), `dueTone ${t.id}`);
  }
});

test('byPriority orders exactly as the shell does', () => {
  const ids = (list) => list.map((t) => t.id);
  assert.deepEqual(ids([...TASKS].sort(legacy.byPriority)), ids([...TASKS].sort(typed.byPriority)));
});

test('the enums and labels match the shell', () => {
  assert.deepEqual(legacy.TASK_TYPES, [...typed.TASK_TYPES]);
  assert.deepEqual(legacy.TASK_STATUSES, [...typed.TASK_STATUSES]);
  assert.deepEqual(legacy.TASK_PRIORITIES, [...typed.TASK_PRIORITIES]);
  assert.deepEqual(legacy.TASK_TYPE_LABELS, { ...typed.TASK_TYPE_LABELS });
  assert.deepEqual(legacy.TASK_PRIORITY_LABELS, { ...typed.TASK_PRIORITY_LABELS });
});

// ── Transport ────────────────────────────────────────────────────────────────

function fakeFetch(respond) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = respond(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new Error('no body');
        return body;
      },
    };
  };
  return { calls, fetchFn };
}

const deps = (fetchFn, token = 'id-token') => ({
  baseUrl: 'https://w.example.dev',
  getIdToken: async () => token,
  fetchFn,
});

test('a call carries the token and reaches /api/v1', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({ body: { items: [TASKS[0]] } }));
  const result = await legacy.listTasks(deps(fetchFn));
  assert.equal(result.ok, true);
  assert.equal(result.value[0].id, TASKS[0].id);
  assert.equal(calls[0].url, 'https://w.example.dev/api/v1/tasks');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer id-token');
});

test('no token means no request', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({ body: { items: [] } }));
  const result = await legacy.listTasks(deps(fetchFn, null));
  assert.equal(result.ok, false);
  assert.equal(result.error.userMessage, 'Please sign in to continue.');
  assert.equal(calls.length, 0);
});

test('Today sends the viewer timezone and reads both lists', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({ body: { overdue: [TASKS[0]], dueToday: [TASKS[1]] } }));
  const result = await legacy.fetchToday(deps(fetchFn));
  assert.equal(result.ok, true);
  assert.equal(result.value.overdue.length, 1);
  assert.equal(result.value.dueToday.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/tasks\/today\?tz=/);
});

test('create posts JSON and returns the created task', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({ status: 201, body: { task: TASKS[1] } }));
  const result = await legacy.createTask({ title: 'Lab report', type: 'LAB' }, deps(fetchFn));
  assert.equal(result.ok, true);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { title: 'Lab report', type: 'LAB' });
});

test('completion and delete hit their own routes', async () => {
  const { calls, fetchFn } = fakeFetch((url) => ({
    body: url.endsWith('/completion') ? { task: TASKS[0] } : { deleted: { id: TASKS[0].id } },
  }));
  assert.equal((await legacy.setTaskCompleted(TASKS[0].id, true, deps(fetchFn))).ok, true);
  assert.equal((await legacy.deleteTask(TASKS[0].id, deps(fetchFn))).ok, true);
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { completed: true });
  assert.equal(calls[1].init.method, 'DELETE');
});

test("the Worker's own error message is what the student sees", async () => {
  const { fetchFn } = fakeFetch(() => ({
    status: 400,
    body: { error: { code: 'VALIDATION', message: 'A due date needs a timezone offset.' } },
  }));
  const result = await legacy.createTask({ title: 'x' }, deps(fetchFn));
  assert.equal(result.error.userMessage, 'A due date needs a timezone offset.');
});

test('an error with no envelope falls back to a message for its status', async () => {
  const { fetchFn } = fakeFetch(() => ({ status: 503 }));
  const result = await legacy.listTasks(deps(fetchFn));
  assert.equal(result.error.userMessage, 'Shohoj is having trouble right now. Please try again shortly.');
});

test('one malformed item refuses the whole list', async () => {
  for (const bad of [{ ...TASKS[0], status: 'DONE' }, { ...TASKS[0], id: 'nope' }, { ...TASKS[0], dueAt: 7 }]) {
    const { fetchFn } = fakeFetch(() => ({ body: { items: [TASKS[1], bad] } }));
    const result = await legacy.listTasks(deps(fetchFn));
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
});

test('a hung request times out into an error', async () => {
  const fetchFn = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const result = await legacy.listTasks({ ...deps(fetchFn), timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.error.userMessage, 'That took too long. Check your connection and try again.');
});

test('an unconfigured build says so instead of calling anything', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({ body: {} }));
  const result = await legacy.listTasks({ ...deps(fetchFn), baseUrl: null });
  // null falls through to window lookup; in node there is no window.
  assert.equal(result.ok, false);
  assert.match(result.error.userMessage, /not configured/);
  assert.equal(calls.length, 0);
});

test('the active semester is the first ACTIVE one', () => {
  const semesters = [
    { id: 's3', name: 'Spring 2027', status: 'PLANNED' },
    { id: 's2', name: 'Fall 2026', status: 'ACTIVE' },
    { id: 's1', name: 'Summer 2026', status: 'COMPLETED' },
  ];
  assert.equal(legacy.activeSemester(semesters).id, 's2');
  assert.equal(legacy.activeSemester([]), null);
});
