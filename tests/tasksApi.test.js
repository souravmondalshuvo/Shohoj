/**
 * tests/tasksApi.test.js
 *
 * The frontend half of the Tasks contract (#715) — src/platform/api/tasks.ts.
 *
 * No network, no React. Schemas and pure derived views.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from '../src/platform/api/apiClient.ts';
import {
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  TaskSchema,
  createTask,
  deleteTask,
  dueTone,
  estimatedWorkload,
  fetchToday,
  fetchUpcoming,
  groupByEnrollment,
  isOpen,
  listTasks,
  setTaskCompleted,
  updateTask,
  viewerTimeZone,
} from '../src/platform/api/tasks.ts';

const BASE = 'https://worker.example';

const TASK = {
  id: 'tsk_0123456789abcdef0123456789abcdef',
  enrollmentId: 'enr_0123456789abcdef0123456789abcdef',
  title: 'Assignment 2',
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'HIGH',
  priorityScore: null,
  dueAt: '2026-10-09T17:00:00.000Z',
  startAt: null,
  estimatedMinutes: 180,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

// ── Schema ──────────────────────────────────────────────────────────────────

test('a well-formed task is accepted', () => {
  assert.equal(TaskSchema.safeParse(TASK).success, true);
});

test('a malformed task id is refused at the boundary', () => {
  assert.equal(TaskSchema.safeParse({ ...TASK, id: 'task-1' }).success, false);
});

test('unknown enum values are refused', () => {
  assert.equal(TaskSchema.safeParse({ ...TASK, type: 'HOMEWORK' }).success, false);
  assert.equal(TaskSchema.safeParse({ ...TASK, status: 'DOING' }).success, false);
  assert.equal(TaskSchema.safeParse({ ...TASK, priority: 'URGENT' }).success, false);
});

test('an undated, unattached task is valid', () => {
  // A personal reading with no deadline is a real task.
  const bare = {
    ...TASK,
    dueAt: null,
    enrollmentId: null,
    estimatedMinutes: null,
    type: 'PERSONAL',
  };
  assert.equal(TaskSchema.safeParse(bare).success, true);
});

test('fields the server adds later do not break an older client', () => {
  const parsed = TaskSchema.safeParse({ ...TASK, recurrence: 'WEEKLY' });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.title, 'Assignment 2');
});

test('every task type has a label', () => {
  for (const type of TASK_TYPES) {
    assert.equal(typeof TASK_TYPE_LABELS[type], 'string');
    assert.ok(TASK_TYPE_LABELS[type].length > 0);
  }
  assert.equal(Object.keys(TASK_PRIORITY_LABELS).length, 4);
});

// ── Calls ───────────────────────────────────────────────────────────────────

test('listTasks passes filters as query parameters', async () => {
  const fetchFn = recordingFetch(json({ items: [TASK] }));
  await listTasks(clientWith(fetchFn), { enrollmentId: 'enr_x', status: 'TODO' });

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.pathname, '/api/v1/tasks');
  assert.equal(url.searchParams.get('enrollmentId'), 'enr_x');
  assert.equal(url.searchParams.get('status'), 'TODO');
});

test('listTasks with no filter sends no query', async () => {
  const fetchFn = recordingFetch(json({ items: [] }));
  await listTasks(clientWith(fetchFn));
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/tasks`);
});

test('createTask posts and unwraps', async () => {
  const fetchFn = recordingFetch(json({ task: TASK }, 201));
  const result = await createTask(clientWith(fetchFn), { title: 'Assignment 2' });

  assert.equal(result.ok, true);
  assert.equal(result.value.title, 'Assignment 2');
  assert.equal(fetchFn.calls[0].init.method, 'POST');
});

test('setTaskCompleted PUTs an explicit boolean', async () => {
  const fetchFn = recordingFetch(json({ task: { ...TASK, status: 'COMPLETED' } }));
  const result = await setTaskCompleted(clientWith(fetchFn), TASK.id, true);

  assert.equal(result.ok, true);
  assert.equal(fetchFn.calls[0].init.method, 'PUT');
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/tasks/${TASK.id}/completion`);
  assert.deepEqual(JSON.parse(fetchFn.calls[0].init.body), { completed: true });
});

test('updateTask PATCHes, deleteTask DELETEs', async () => {
  const patch = recordingFetch(json({ task: TASK }));
  await updateTask(clientWith(patch), TASK.id, { priority: 'CRITICAL' });
  assert.equal(patch.calls[0].init.method, 'PATCH');

  const del = recordingFetch(json({ deleted: { id: TASK.id } }));
  const result = await deleteTask(clientWith(del), TASK.id);
  assert.equal(del.calls[0].init.method, 'DELETE');
  assert.equal(result.value.id, TASK.id);
});

test('Today and Upcoming always send the viewer timezone', async () => {
  // The server refuses without it, and rightly: a UTC default answers the wrong
  // day for a Dhaka student every evening.
  const today = recordingFetch(json({ overdue: [], dueToday: [TASK] }));
  await fetchToday(clientWith(today));
  assert.ok(new URL(today.calls[0].url).searchParams.get('tz'), 'tz must be present');

  const upcoming = recordingFetch(json({ days: 14, items: [TASK] }));
  await fetchUpcoming(clientWith(upcoming), 14);
  const url = new URL(upcoming.calls[0].url);
  assert.ok(url.searchParams.get('tz'));
  assert.equal(url.searchParams.get('days'), '14');
});

test('viewerTimeZone returns something usable', () => {
  const tz = viewerTimeZone();
  assert.equal(typeof tz, 'string');
  assert.ok(tz.length > 0);
  // Whatever it returns must be a zone Intl accepts, or the server will refuse it.
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: tz }));
});

test('a response whose shape is wrong is a failure', async () => {
  const fetchFn = recordingFetch(json({ items: [{ ...TASK, priority: 'WHENEVER' }] }));
  const result = await listTasks(clientWith(fetchFn));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation');
});

// ── Derived views ───────────────────────────────────────────────────────────

test('isOpen covers exactly the unfinished states', () => {
  assert.equal(isOpen({ ...TASK, status: 'TODO' }), true);
  assert.equal(isOpen({ ...TASK, status: 'IN_PROGRESS' }), true);
  assert.equal(isOpen({ ...TASK, status: 'COMPLETED' }), false);
  assert.equal(isOpen({ ...TASK, status: 'CANCELLED' }), false);
});

test('dueTone reads a deadline relative to the local day', () => {
  const now = new Date('2026-10-05T12:00:00');
  const on = (localIso) => dueTone({ ...TASK, dueAt: new Date(localIso).toISOString() }, now);

  assert.equal(on('2026-10-01T09:00:00'), 'overdue');
  assert.equal(on('2026-10-05T23:30:00'), 'today');
  assert.equal(on('2026-10-06T09:00:00'), 'tomorrow');
  assert.equal(on('2026-10-09T09:00:00'), 'soon');
  assert.equal(on('2026-11-09T09:00:00'), 'later');
  assert.equal(dueTone({ ...TASK, dueAt: null }, now), 'none');
  assert.equal(dueTone({ ...TASK, dueAt: 'not a date' }, now), 'none');
});

test('estimatedWorkload counts open work only', () => {
  const total = estimatedWorkload([
    { ...TASK, estimatedMinutes: 180, status: 'TODO' },
    { ...TASK, estimatedMinutes: 60, status: 'IN_PROGRESS' },
    { ...TASK, estimatedMinutes: 240, status: 'COMPLETED' },
    { ...TASK, estimatedMinutes: null, status: 'TODO' },
  ]);
  assert.equal(total, 240);
});

test('groupByEnrollment keys unattached tasks on null', () => {
  const groups = groupByEnrollment([
    { ...TASK, id: 'tsk_a', enrollmentId: 'enr_1' },
    { ...TASK, id: 'tsk_b', enrollmentId: 'enr_1' },
    { ...TASK, id: 'tsk_c', enrollmentId: null },
  ]);
  assert.equal(groups.get('enr_1').length, 2);
  assert.equal(groups.get(null).length, 1);
});
