/**
 * worker/test/reminders.test.js
 *
 * Task reminders (#727) — the domain, the endpoints, and the rules that decide
 * whether somebody's phone buzzes.
 *
 * Most of these are about NOT sending. A reminder that fires twice, or fires
 * about a task already finished, or fires a day late about something now simply
 * overdue, is worse than one that never fired — it teaches a student to ignore
 * the next one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMON_OFFSETS,
  DELIVERABLE_CHANNELS,
  MAX_REMINDERS_PER_TASK,
  REMINDER_CHANNELS,
  buildReminderEmail,
  buildReminderRecord,
  isStale,
  reminderDto,
  reminderId,
  rescheduleReminder,
  scheduledForTask,
  shouldSend,
  validateReminderInput,
} from '../reminders.js';
import { createAcademicRepo } from '../academicRepo.js';
import * as academic from '../academicHandlers.js';
import * as tasks from '../taskHandlers.js';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const NOW_MS = NOW.getTime();
const DUE = '2026-10-09T17:00:00.000Z';

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
let seq = 0;
const randomHex = (bytes) => String(seq++).padStart(bytes * 2, 'a');

function memoryStore() {
  const docs = new Map();
  return {
    docs,
    getDoc: async (p) => (docs.has(p) ? { ...docs.get(p) } : null),
    patchDoc: async (p, f) => {
      docs.set(p, { ...(docs.get(p) || {}), ...f });
    },
    deleteDoc: async (p) => {
      docs.delete(p);
    },
    listDocs: async (c) =>
      [...docs.entries()]
        .filter(([p]) => p.startsWith(`${c}/`) && !p.slice(c.length + 1).includes('/'))
        .map(([, f]) => ({ ...f })),
  };
}

const ctxFor = (store, uid = 'uid-1') => ({
  repo: createAcademicRepo(store, uid),
  userId: 'usr_a',
  university: 'bracu',
  sha256Hex,
  randomHex,
  now: () => NOW,
});

async function withTask(over = {}) {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2026, season: 'Fall', status: 'ACTIVE' });
  const enrolled = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'MAT215',
  });
  const created = await tasks.createTask(ctx, {
    title: 'MAT215 Final Exam',
    type: 'EXAM',
    enrollmentId: enrolled.body.enrollment.id,
    dueAt: DUE,
    ...over,
  });
  return { store, ctx, taskId: created.body.task.id, task: created.body.task };
}

const reminder = (over = {}) => ({
  id: 'rem_a',
  taskId: 'tsk_a',
  userId: 'usr_a',
  offsetMinutes: 180,
  channel: 'EMAIL',
  scheduledFor: DUE,
  status: 'PENDING',
  sentAt: null,
  ...over,
});

const task = (over = {}) => ({ id: 'tsk_a', title: 'Final', status: 'TODO', dueAt: DUE, ...over });

// ── Validation ──────────────────────────────────────────────────────────────

test('an offset is required and bounded', () => {
  assert.equal(validateReminderInput({}).error.field, 'offsetMinutes');
  assert.equal(validateReminderInput({ offsetMinutes: -30 }).error.field, 'offsetMinutes');
  assert.equal(validateReminderInput({ offsetMinutes: 1.5 }).error.field, 'offsetMinutes');
  assert.equal(validateReminderInput({ offsetMinutes: 99999999 }).error.field, 'offsetMinutes');
});

test('zero is allowed and means "at the deadline"', () => {
  // A real thing to want, and distinct from a negative offset — a reminder
  // AFTER the fact is a different feature with different wording.
  assert.equal(validateReminderInput({ offsetMinutes: 0 }).error, undefined);
});

test('the channel defaults to email and is checked', () => {
  assert.equal(validateReminderInput({ offsetMinutes: 30 }).value.channel, 'EMAIL');
  assert.equal(validateReminderInput({ offsetMinutes: 30, channel: 'SMS' }).error.field, 'channel');
  for (const channel of REMINDER_CHANNELS) {
    assert.equal(validateReminderInput({ offsetMinutes: 30, channel }).error, undefined);
  }
});

test('the offered offsets are the ones students ask for', () => {
  assert.deepEqual(
    COMMON_OFFSETS.map((o) => o.minutes),
    [1440, 180, 30],
  );
});

// ── Scheduling ──────────────────────────────────────────────────────────────

test('the firing time is derived from the deadline', () => {
  assert.equal(scheduledForTask(task(), 180), '2026-10-09T14:00:00.000Z');
  assert.equal(scheduledForTask(task(), 24 * 60), '2026-10-08T17:00:00.000Z');
  assert.equal(scheduledForTask(task(), 0), DUE);
});

test('a task with no deadline schedules nothing, and that is not an error', () => {
  // A student can add a deadline later and the reminder starts working then.
  assert.equal(scheduledForTask(task({ dueAt: null }), 180), null);
  assert.equal(scheduledForTask(task({ dueAt: 'nonsense' }), 180), null);
});

test('moving a deadline moves its reminders', () => {
  // The reason the offset is the thing of record rather than the instant.
  const original = reminder({ scheduledFor: '2026-10-09T14:00:00.000Z' });
  const moved = rescheduleReminder(original, task({ dueAt: '2026-10-12T17:00:00.000Z' }), 'LATER');
  assert.equal(moved.scheduledFor, '2026-10-12T14:00:00.000Z');
  assert.equal(moved.updatedAt, 'LATER');
});

test('a reminder that did not move is not rewritten', () => {
  const unchanged = reminder({ scheduledFor: '2026-10-09T14:00:00.000Z' });
  assert.equal(rescheduleReminder(unchanged, task(), 'LATER'), null);
});

test('a reminder that already fired is left alone when the deadline moves', () => {
  // Its scheduledFor is the record of when it went; rewriting it loses that,
  // and moving the deadline does not un-fire it.
  const sent = reminder({ status: 'SENT', scheduledFor: '2026-10-09T14:00:00.000Z' });
  assert.equal(rescheduleReminder(sent, task({ dueAt: '2026-10-20T17:00:00.000Z' }), 'LATER'), null);
});

test('an id is derived, so the same reminder asked for twice is one', async () => {
  const a = await reminderId('tsk_a', 180, 'EMAIL', sha256Hex);
  const b = await reminderId('tsk_a', 180, 'EMAIL', sha256Hex);
  assert.equal(a, b);
  assert.match(a, /^rem_[0-9a-f]{32}$/);
  assert.notEqual(a, await reminderId('tsk_a', 30, 'EMAIL', sha256Hex));
});

// ── Whether to send ─────────────────────────────────────────────────────────

test('a due reminder on an open task sends', () => {
  const due = reminder({ scheduledFor: new Date(NOW_MS - 60_000).toISOString() });
  assert.equal(shouldSend(due, task(), NOW_MS), true);
});

test('it does not send before it is due', () => {
  const later = reminder({ scheduledFor: new Date(NOW_MS + 60_000).toISOString() });
  assert.equal(shouldSend(later, task(), NOW_MS), false);
});

test('it fires once — a sent or cancelled reminder never goes again', () => {
  const at = new Date(NOW_MS - 60_000).toISOString();
  for (const status of ['SENT', 'CANCELLED', 'FAILED']) {
    assert.equal(shouldSend(reminder({ scheduledFor: at, status }), task(), NOW_MS), false, status);
  }
});

test('a finished or abandoned task is not reminded about', () => {
  // The deadline stopped mattering. Buzzing anyway teaches a student to ignore
  // the next one.
  const at = new Date(NOW_MS - 60_000).toISOString();
  for (const status of ['COMPLETED', 'CANCELLED']) {
    assert.equal(shouldSend(reminder({ scheduledFor: at }), task({ status }), NOW_MS), false, status);
  }
});

test('a deleted task is not reminded about', () => {
  const at = new Date(NOW_MS - 60_000).toISOString();
  assert.equal(shouldSend(reminder({ scheduledFor: at }), null, NOW_MS), false);
});

test('a channel nothing can deliver is skipped, not claimed as sent', () => {
  // WEB and PUSH are storable so a choice survives their arrival, but a
  // reminder recorded as delivered through a channel that does not exist is
  // worse than one still waiting.
  const at = new Date(NOW_MS - 60_000).toISOString();
  assert.equal(shouldSend(reminder({ scheduledFor: at, channel: 'PUSH' }), task(), NOW_MS), false);
  assert.deepEqual(DELIVERABLE_CHANNELS, ['EMAIL']);
});

test('a reminder too late to matter is dropped rather than sent', () => {
  // A cron down overnight must not, on recovery, deliver yesterday's nudges
  // about work the student already knows is overdue.
  const longAgo = new Date(NOW_MS - 5 * 60 * 60_000).toISOString();
  const late = reminder({ scheduledFor: longAgo });
  assert.equal(shouldSend(late, task(), NOW_MS), false);
  assert.equal(isStale(late, NOW_MS), true);

  const recent = reminder({ scheduledFor: new Date(NOW_MS - 10 * 60_000).toISOString() });
  assert.equal(isStale(recent, NOW_MS), false);
});

// ── The email ───────────────────────────────────────────────────────────────

test('the email names the task, the course and when', () => {
  const { subject, html } = buildReminderEmail(task({ title: 'Final Exam' }), reminder(), 'MAT215');
  assert.match(subject, /MAT215/);
  assert.match(subject, /Final Exam/);
  assert.match(subject, /3 hours/);
  assert.match(html, /Final Exam/);
});

test('the wording matches the offset', () => {
  const t = task();
  assert.match(buildReminderEmail(t, reminder({ offsetMinutes: 1440 })).subject, /1 day/);
  assert.match(buildReminderEmail(t, reminder({ offsetMinutes: 2880 })).subject, /2 days/);
  assert.match(buildReminderEmail(t, reminder({ offsetMinutes: 60 })).subject, /1 hour/);
  assert.match(buildReminderEmail(t, reminder({ offsetMinutes: 45 })).subject, /45 minutes/);
  assert.match(buildReminderEmail(t, reminder({ offsetMinutes: 0 })).subject, /Due now/);
});

test('a title with markup in it cannot inject into the email', () => {
  const { html } = buildReminderEmail(task({ title: '<img src=x onerror=alert(1)>' }), reminder());
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('an unattached task needs no course in the subject', () => {
  const { subject } = buildReminderEmail(task(), reminder(), null);
  assert.doesNotMatch(subject, /·/);
});

// ── Records ─────────────────────────────────────────────────────────────────

test('re-adding a fired reminder resets it to pending', () => {
  // The student is asking to be reminded again; that is the only thing the
  // request can mean.
  const sent = reminder({ status: 'SENT', sentAt: 'EARLIER', createdAt: 'FIRST' });
  const rebuilt = buildReminderRecord({
    id: 'rem_a',
    taskId: 'tsk_a',
    userId: 'usr_a',
    input: { offsetMinutes: 180, channel: 'EMAIL' },
    task: task(),
    nowIso: 'NOW',
    existing: sent,
  });
  assert.equal(rebuilt.status, 'PENDING');
  assert.equal(rebuilt.sentAt, null);
  assert.equal(rebuilt.createdAt, 'FIRST', 'but it is the same reminder');
});

test('the DTO withholds the owner and the storage version', () => {
  const dto = reminderDto(
    buildReminderRecord({
      id: 'rem_a',
      taskId: 'tsk_a',
      userId: 'usr_a',
      input: { offsetMinutes: 180, channel: 'EMAIL' },
      task: task(),
      nowIso: 'NOW',
    }),
  );
  assert.equal('userId' in dto, false);
  assert.equal('schemaVersion' in dto, false);
});

// ── Endpoints ───────────────────────────────────────────────────────────────

test('reminders can be added, listed and removed', async () => {
  const { ctx, taskId } = await withTask();

  const first = await tasks.createReminder(ctx, taskId, { offsetMinutes: 1440 });
  assert.equal(first.status, 201);
  assert.equal(first.body.reminder.scheduledFor, '2026-10-08T17:00:00.000Z');

  await tasks.createReminder(ctx, taskId, { offsetMinutes: 30 });
  const listed = await tasks.listReminders(ctx, taskId);
  assert.deepEqual(
    listed.body.items.map((r) => r.offsetMinutes),
    [1440, 30],
    'furthest out first, the order a student sets and reads them in',
  );

  assert.equal((await tasks.deleteReminder(ctx, taskId, first.body.reminder.id)).status, 200);
  assert.equal((await tasks.listReminders(ctx, taskId)).body.items.length, 1);
});

test('asking twice for the same reminder leaves one', async () => {
  const { ctx, taskId } = await withTask();
  const a = await tasks.createReminder(ctx, taskId, { offsetMinutes: 180 });
  const b = await tasks.createReminder(ctx, taskId, { offsetMinutes: 180 });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal((await tasks.listReminders(ctx, taskId)).body.items.length, 1);
});

test('a task can only carry so many', async () => {
  const { ctx, taskId } = await withTask();
  for (let i = 1; i <= MAX_REMINDERS_PER_TASK; i += 1) {
    assert.equal((await tasks.createReminder(ctx, taskId, { offsetMinutes: i * 10 })).status, 201);
  }
  const over = await tasks.createReminder(ctx, taskId, { offsetMinutes: 999 });
  assert.equal(over.status, 400);
});

test('moving a task deadline reschedules its pending reminders', async () => {
  const { ctx, taskId } = await withTask();
  await tasks.createReminder(ctx, taskId, { offsetMinutes: 180 });

  await tasks.patchTask(ctx, taskId, { dueAt: '2026-10-12T17:00:00.000Z' });

  const [moved] = (await tasks.listReminders(ctx, taskId)).body.items;
  assert.equal(moved.scheduledFor, '2026-10-12T14:00:00.000Z');
});

test('a reminder on a task with no deadline is accepted and simply waits', async () => {
  const { ctx } = await withTask();
  const undated = await tasks.createTask(ctx, { title: 'Someday' });
  const added = await tasks.createReminder(ctx, undated.body.task.id, { offsetMinutes: 180 });

  assert.equal(added.status, 201);
  assert.equal(added.body.reminder.scheduledFor, null);

  // Give it a deadline and it schedules itself.
  await tasks.patchTask(ctx, undated.body.task.id, { dueAt: DUE });
  const [scheduled] = (await tasks.listReminders(ctx, undated.body.task.id)).body.items;
  assert.equal(scheduled.scheduledFor, '2026-10-09T14:00:00.000Z');
});

test('deleting a task takes its reminders — they would email about nothing', async () => {
  const { store, ctx, taskId } = await withTask();
  await tasks.createReminder(ctx, taskId, { offsetMinutes: 180 });

  await tasks.deleteTask(ctx, taskId);

  const orphans = [...store.docs.keys()].filter((p) => p.includes('/reminders/'));
  assert.deepEqual(orphans, []);
});

test("reminders on another student's task cannot be reached", async () => {
  const { store, taskId } = await withTask();
  const theirs = ctxFor(store, 'uid-theirs');

  assert.equal((await tasks.createReminder(theirs, taskId, { offsetMinutes: 30 })).status, 404);
  assert.equal((await tasks.listReminders(theirs, taskId)).status, 404);
  assert.equal((await tasks.deleteReminder(theirs, taskId, 'rem_x')).status, 404);
});

test('a reminder cannot be deleted through a different task of your own', async () => {
  // Reminder ids are derivable, so without the taskId check a caller could
  // address one task's reminder under another.
  const { ctx, taskId } = await withTask();
  const other = await tasks.createTask(ctx, { title: 'Other', dueAt: DUE });
  const added = await tasks.createReminder(ctx, taskId, { offsetMinutes: 180 });

  const wrong = await tasks.deleteReminder(ctx, other.body.task.id, added.body.reminder.id);
  assert.equal(wrong.status, 404);
  assert.equal((await tasks.listReminders(ctx, taskId)).body.items.length, 1);
});
