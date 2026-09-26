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
  source: 'MANUAL',
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

// ── Phase 2: priority factors, reminders, assessments (#767) ─────────────────

const factors = [
  { name: 'weight', value: 0.5, weight: 30, points: 15 },
  { name: 'urgency', value: 1, weight: 40, points: 40 },
  { name: 'workload', value: 0, weight: 20, points: 0 },
];

test('explainPriority, reminderLabel and assessmentsByTask agree with the shell', () => {
  for (const t of [task(20, { priorityFactors: factors }), task(21), task(22, { priorityFactors: [] })]) {
    assert.deepEqual(legacy.explainPriority(t), typed.explainPriority(t));
  }
  assert.deepEqual(legacy.COMMON_REMINDER_OFFSETS, typed.COMMON_REMINDER_OFFSETS.map((o) => ({ ...o })));
  assert.deepEqual(legacy.REMINDER_CHANNELS, [...typed.REMINDER_CHANNELS]);
  assert.deepEqual(legacy.REMINDER_STATUSES, [...typed.REMINDER_STATUSES]);
  const base = { id: 'rem_' + '1'.repeat(32), taskId: task(1).id, channel: 'WEB', sentAt: null };
  for (const r of [
    { ...base, offsetMinutes: 1440, status: 'PENDING', scheduledFor: '2026-10-08T00:00:00Z' },
    { ...base, offsetMinutes: 0, status: 'SENT', scheduledFor: '2026-10-08T00:00:00Z' },
    { ...base, offsetMinutes: 120, status: 'CANCELLED', scheduledFor: '2026-10-08T00:00:00Z' },
    { ...base, offsetMinutes: 45, status: 'PENDING', scheduledFor: null },
  ]) {
    assert.equal(legacy.reminderLabel(r), typed.reminderLabel(r), JSON.stringify(r));
  }
  const list = [{ taskId: 'a', weightPercent: 1 }, { taskId: 'b', weightPercent: 2 }];
  assert.deepEqual([...legacy.assessmentsByTask(list)], [...typed.assessmentsByTask(list)]);
});

test('priority factors survive the reader, and a malformed one refuses the list', async () => {
  const good = task(23, { priorityFactors: factors });
  let { fetchFn } = fakeFetch(() => ({ body: { items: [good] } }));
  const ok = await legacy.listTasks(deps(fetchFn));
  assert.deepEqual(ok.value[0].priorityFactors, factors);

  ({ fetchFn } = fakeFetch(() => ({ body: { items: [task(24, { priorityFactors: [{ name: 'vibes', value: 1, weight: 1, points: 1 }] })] } })));
  assert.equal((await legacy.listTasks(deps(fetchFn))).ok, false);
});

test('reminders: list, add and remove hit the task routes', async () => {
  const reminder = {
    id: 'rem_' + 'a'.repeat(32), taskId: task(1).id, offsetMinutes: 30, channel: 'WEB',
    scheduledFor: '2026-10-08T11:30:00Z', status: 'PENDING', sentAt: null,
    createdAt: 'x', updatedAt: 'x',
  };
  const { calls, fetchFn } = fakeFetch((url, init) => {
    if (init.method === 'GET') return { body: { items: [reminder] } };
    if (init.method === 'POST') return { status: 201, body: { reminder } };
    return { body: { deleted: { id: reminder.id } } };
  });
  const listed = await legacy.listReminders(task(1).id, deps(fetchFn));
  assert.equal(listed.value[0].offsetMinutes, 30);
  assert.equal((await legacy.addReminder(task(1).id, { offsetMinutes: 30 }, deps(fetchFn))).ok, true);
  assert.equal((await legacy.removeReminder(task(1).id, reminder.id, deps(fetchFn))).ok, true);
  assert.match(calls[0].url, /\/api\/v1\/tasks\/tsk_[0-9a-f]{32}\/reminders$/);
  assert.deepEqual(JSON.parse(calls[1].init.body), { offsetMinutes: 30 });
  assert.match(calls[2].url, /\/reminders\/rem_a+$/);
  assert.equal(calls[2].init.method, 'DELETE');
});

test('assessments: an unmarked score stays null, never zero', async () => {
  const unmarked = {
    taskId: task(1).id, totalMarks: 40, earnedMarks: null, weightPercent: 30,
    syllabus: null, location: null, notes: null, createdAt: 'x', updatedAt: 'x',
  };
  const { calls, fetchFn } = fakeFetch((url, init) => {
    if (init.method === 'GET') return { body: { items: [unmarked] } };
    if (init.method === 'PUT') return { body: { assessment: unmarked } };
    return { body: { deleted: { taskId: unmarked.taskId } } };
  });
  const listed = await legacy.listAssessments(deps(fetchFn));
  assert.equal(listed.value[0].earnedMarks, null);
  const put = await legacy.putAssessment(task(1).id, { totalMarks: 40, weightPercent: 30, earnedMarks: null }, deps(fetchFn));
  assert.equal(put.ok, true);
  assert.equal(JSON.parse(calls[1].init.body).earnedMarks, null);
  assert.equal((await legacy.deleteAssessment(task(1).id, deps(fetchFn))).ok, true);

  const { fetchFn: bad } = fakeFetch(() => ({ body: { items: [{ ...unmarked, earnedMarks: '12' }] } }));
  assert.equal((await legacy.listAssessments(deps(bad))).ok, false);
});

// ── Phase 3: the server reader (#767) ────────────────────────────────────────

import { createAiDetector } from '../js/core/aiDetector.js';

const extracted = {
  title: 'Quiz 3', type: 'QUIZ', dueAt: '2026-09-25T03:30:00.000Z', courseCode: 'CSE220',
  syllabus: null, confidence: 'high', evidence: 'Quiz 3 is on 25 September at 9:30 am',
};

test('extractTasks posts only text and course codes, and reads the quota', async () => {
  const { calls, fetchFn } = fakeFetch(() => ({
    body: { detected: [extracted], quota: { remaining: 4, limit: 5, resetsAt: '2026-10-09T00:00:00Z' } },
  }));
  const r = await legacy.extractTasks('Quiz 3 is on 25 September', ['CSE220'], deps(fetchFn));
  assert.equal(r.ok, true);
  assert.equal(r.value.tasks[0].title, 'Quiz 3');
  assert.deepEqual(r.value.quota, { remaining: 4, limit: 5, resetsAt: '2026-10-09T00:00:00Z' });
  assert.match(calls[0].url, /\/api\/v1\/tasks\/extract$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'Quiz 3 is on 25 September', courseCodes: ['CSE220'] });
});

test('the AI detector maps a reading to proposals, with the quote as evidence', async () => {
  const { fetchFn } = fakeFetch(() => ({ body: { detected: [extracted], quota: null } }));
  const r = await createAiDetector(deps(fetchFn)).detect('text', { now: NOW, knownCourseCodes: [] });
  assert.equal(r.outcome, 'ok');
  assert.equal(r.source, 'AI_SUGGESTION');
  assert.deepEqual(r.detected[0].evidence, { dueAt: { text: extracted.evidence, index: 0 } });
});

test('every AI failure is a note, never an error state', async () => {
  const cases = [
    [{ code: 'unavailable', message: 'Reader is off today.' }, 'unavailable', 'Reader is off today.'],
    [{ code: 'quota_exceeded', message: '' }, 'quota_exhausted', null],
    [{ code: 'boom', message: 'Nope.' }, 'failed', 'Nope.'],
  ];
  for (const [error, outcome, note] of cases) {
    const { fetchFn } = fakeFetch(() => ({ status: 503, body: { error } }));
    const r = await createAiDetector(deps(fetchFn)).detect('text', { now: NOW });
    assert.equal(r.outcome, outcome);
    assert.deepEqual(r.detected, []);
    // With no message in the envelope, the transport's generic wording for the
    // status is what arrives — as userMessage does on the shell.
    if (note !== null) assert.equal(r.note, note);
    else assert.ok(r.note.length > 0);
  }
});

// ── Phase 4: calendar subscription (#767) ────────────────────────────────────

test('the task reader keeps source and refuses an unknown one', async () => {
  let { fetchFn } = fakeFetch(() => ({ body: { items: [task(30, { source: 'PASTE' })] } }));
  assert.equal((await legacy.listTasks(deps(fetchFn))).value[0].source, 'PASTE');
  ({ fetchFn } = fakeFetch(() => ({ body: { items: [task(31, { source: 'FAX' })] } })));
  assert.equal((await legacy.listTasks(deps(fetchFn))).ok, false);
  assert.deepEqual(legacy.TASK_SOURCES, [...typed.TASK_SOURCES]);
});

test('the calendar feed: none, created, replaced, turned off', async () => {
  const feed = { url: 'https://w.example.dev/api/v1/tasks/feed/abc.ics', createdAt: '2026-10-08T00:00:00Z' };
  const { calls, fetchFn } = fakeFetch((url, init) => ({
    body: { feed: init.method === 'GET' || init.method === 'DELETE' ? null : feed },
  }));
  assert.deepEqual((await legacy.fetchCalendarFeed(deps(fetchFn))).value, { feed: null });
  assert.deepEqual((await legacy.createCalendarFeed(deps(fetchFn))).value, { feed });
  assert.deepEqual((await legacy.deleteCalendarFeed(deps(fetchFn))).value, { feed: null });
  assert.deepEqual(calls.map((c) => c.init.method), ['GET', 'POST', 'DELETE']);
  assert.ok(calls.every((c) => c.url === 'https://w.example.dev/api/v1/tasks/feed'));

  const { fetchFn: bad } = fakeFetch(() => ({ body: { nope: true } }));
  assert.equal((await legacy.fetchCalendarFeed(deps(bad))).ok, false);
});
