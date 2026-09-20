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
  AssessmentSchema,
  COMMON_REMINDER_OFFSETS,
  ReminderSchema,
  addReminder,
  listReminders,
  reminderLabel,
  removeReminder,
  PRIORITY_FACTOR_LABELS,
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
  deleteAssessment,
  explainPriority,
  fetchAssessment,
  putAssessment,
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

// ── Priority score and its explanation (#721) ───────────────────────────────

const FACTORS = [
  { name: 'urgency', value: 0.857, weight: 0.45, points: 38.57 },
  { name: 'weight', value: 0.4, weight: 0.25, points: 10 },
  { name: 'workload', value: 0.875, weight: 0.15, points: 13.13 },
  { name: 'importance', value: 0.667, weight: 0.15, points: 10 },
];

test('a task carrying a score and its breakdown is accepted', () => {
  const scored = { ...TASK, priorityScore: 71.7, priorityFactors: FACTORS };
  const parsed = TaskSchema.safeParse(scored);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.priorityScore, 71.7);
  assert.equal(parsed.data.priorityFactors.length, 4);
});

test('a task from a backend without the engine still validates', () => {
  // priorityFactors is optional on purpose: the field shipped after the task
  // shape did, and an older Worker must not break a newer client.
  const parsed = TaskSchema.safeParse({ ...TASK, priorityScore: null });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.priorityFactors, undefined);
});

test('an unknown factor name is refused', () => {
  const bogus = { ...TASK, priorityFactors: [{ ...FACTORS[0], name: 'vibes' }] };
  assert.equal(TaskSchema.safeParse(bogus).success, false);
});

test('the explanation drops factors that contributed nothing', () => {
  // "Takes a while: 0 points" is noise. A student reading why something ranked
  // highly wants the reasons it did, not the reasons it did not.
  const task = {
    ...TASK,
    priorityScore: 48.6,
    priorityFactors: [
      { name: 'urgency', value: 0.9, weight: 0.45, points: 40.5 },
      { name: 'weight', value: 0, weight: 0.25, points: 0 },
      { name: 'workload', value: 0, weight: 0.15, points: 0 },
      { name: 'importance', value: 0.54, weight: 0.15, points: 8.1 },
    ],
  };
  const shown = explainPriority(task);
  assert.deepEqual(
    shown.map((f) => f.name),
    ['urgency', 'importance'],
    'biggest first, zeros gone',
  );
});

test('a task with no breakdown explains nothing rather than throwing', () => {
  assert.deepEqual(explainPriority(TASK), []);
});

test('every factor has a label', () => {
  for (const name of ['urgency', 'weight', 'workload', 'importance']) {
    assert.equal(typeof PRIORITY_FACTOR_LABELS[name], 'string');
  }
});

// ── Assessments (#721) ──────────────────────────────────────────────────────

const ASSESSMENT = {
  taskId: TASK.id,
  totalMarks: 40,
  earnedMarks: null,
  weightPercent: 40,
  syllabus: 'Chapters 4-6',
  location: null,
  notes: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

test('an ungraded assessment is valid, with earnedMarks null', () => {
  // Null means NOT MARKED YET, which is not zero — and the two are a keystroke
  // apart, so the schema has to accept null rather than coerce it.
  const parsed = AssessmentSchema.safeParse(ASSESSMENT);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.earnedMarks, null);

  const graded = AssessmentSchema.safeParse({ ...ASSESSMENT, earnedMarks: 0 });
  assert.equal(graded.data.earnedMarks, 0, 'and a real zero survives as zero');
});

test('putAssessment PUTs to the task sub-resource', async () => {
  const fetchFn = recordingFetch(json({ assessment: ASSESSMENT }, 201));
  const result = await putAssessment(clientWith(fetchFn), TASK.id, {
    totalMarks: 40,
    weightPercent: 40,
  });

  assert.equal(result.ok, true);
  assert.equal(fetchFn.calls[0].init.method, 'PUT');
  assert.equal(fetchFn.calls[0].url, `${BASE}/api/v1/tasks/${TASK.id}/assessment`);
});

test('fetchAssessment GETs it, deleteAssessment DELETEs it', async () => {
  const get = recordingFetch(json({ assessment: ASSESSMENT }));
  const fetched = await fetchAssessment(clientWith(get), TASK.id);
  assert.equal(fetched.value.weightPercent, 40);

  const del = recordingFetch(json({ deleted: { taskId: TASK.id } }));
  const removed = await deleteAssessment(clientWith(del), TASK.id);
  assert.equal(del.calls[0].init.method, 'DELETE');
  assert.equal(removed.value.taskId, TASK.id);
});

test('a task with no assessment surfaces as a typed not-found', async () => {
  const fetchFn = recordingFetch(
    json({ error: { code: 'not_found', message: 'This task has no assessment.' } }, 404),
  );
  const result = await fetchAssessment(clientWith(fetchFn), TASK.id);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'not_found');
});

// ── Reminders (#727) ────────────────────────────────────────────────────────

const REMINDER = {
  id: 'rem_0123456789abcdef0123456789abcdef',
  taskId: TASK.id,
  offsetMinutes: 180,
  channel: 'EMAIL',
  scheduledFor: '2026-10-09T14:00:00.000Z',
  status: 'PENDING',
  sentAt: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

test('a reminder validates, including one still waiting for a deadline', () => {
  assert.equal(ReminderSchema.safeParse(REMINDER).success, true);
  // Null scheduledFor is a reminder on an undated task — waiting, not broken.
  assert.equal(ReminderSchema.safeParse({ ...REMINDER, scheduledFor: null }).success, true);
  assert.equal(ReminderSchema.safeParse({ ...REMINDER, id: 'rem_nope' }).success, false);
  assert.equal(ReminderSchema.safeParse({ ...REMINDER, channel: 'SMS' }).success, false);
});

test('reminders are added, listed and removed against the task sub-resource', async () => {
  const list = recordingFetch(json({ items: [REMINDER] }));
  const listed = await listReminders(clientWith(list), TASK.id);
  assert.equal(listed.value.length, 1);
  assert.equal(list.calls[0].url, `${BASE}/api/v1/tasks/${TASK.id}/reminders`);

  const add = recordingFetch(json({ reminder: REMINDER }, 201));
  await addReminder(clientWith(add), TASK.id, { offsetMinutes: 180 });
  assert.equal(add.calls[0].init.method, 'POST');

  const del = recordingFetch(json({ deleted: { id: REMINDER.id } }));
  await removeReminder(clientWith(del), TASK.id, REMINDER.id);
  assert.equal(del.calls[0].init.method, 'DELETE');
  assert.equal(del.calls[0].url, `${BASE}/api/v1/tasks/${TASK.id}/reminders/${REMINDER.id}`);
});

test('a reminder reads as words, and says when it is waiting', () => {
  // A student who set a reminder and sees it doing nothing needs to know why.
  assert.equal(reminderLabel(REMINDER), 'Three hours before');
  assert.equal(reminderLabel({ ...REMINDER, offsetMinutes: 1440 }), 'A day before');
  assert.equal(reminderLabel({ ...REMINDER, offsetMinutes: 0 }), 'At the deadline');
  assert.equal(reminderLabel({ ...REMINDER, offsetMinutes: 45 }), '45 minutes before');
  assert.match(reminderLabel({ ...REMINDER, status: 'SENT' }), /sent/);
  assert.match(reminderLabel({ ...REMINDER, scheduledFor: null }), /waiting for a deadline/);
});

test('the offered offsets match the ones the server names', () => {
  assert.deepEqual(
    COMMON_REMINDER_OFFSETS.map((o) => o.minutes),
    [1440, 180, 30],
  );
});
