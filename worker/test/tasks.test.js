/**
 * worker/test/tasks.test.js
 *
 * Shohoj Tasks' domain layer (#715) — worker/tasks.js. Pure: no Firestore, no
 * Request, no ambient clock.
 *
 * The timezone primitives have their own file (taskTime.test.js); what is
 * tested here is what Today and Upcoming MEAN once the window is known, plus
 * validation and the completedAt bookkeeping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_UPCOMING_DAYS,
  MAX_UPCOMING_DAYS,
  applyTaskPatch,
  buildTaskRecord,
  selectToday,
  selectUpcoming,
  sortTasks,
  taskDto,
  taskId,
  upcomingDays,
  validateTaskInput,
} from '../tasks.js';

const NOW_ISO = '2026-10-05T10:00:00.000Z';
const TZ = 'Asia/Dhaka';
/** 2026-10-05 16:00 in Dhaka — mid-afternoon, safely inside the local day. */
const NOW_MS = Date.parse('2026-10-05T10:00:00Z');

/** Deterministic id source, so a test can name the id it expects. */
let counter = 0;
const fakeRandomHex = (bytes) => String(counter++).padStart(bytes * 2, 'a');

const validInput = (over = {}) => validateTaskInput({ title: 'Assignment 2', ...over }).value;

const makeTask = (over = {}) => ({
  id: 'tsk_1',
  status: 'TODO',
  priority: 'MEDIUM',
  dueAt: null,
  ...over,
});

// ── Identity ────────────────────────────────────────────────────────────────

test('task ids are assigned, not derived — two identical tasks are two tasks', () => {
  // The one place Task diverges from Semester and Enrollment. A student who
  // genuinely has two readings due Friday must be able to create both.
  const a = taskId(fakeRandomHex);
  const b = taskId(fakeRandomHex);
  assert.notEqual(a, b);
  assert.match(a, /^tsk_[0-9a-f]{32}$/);
});

// ── Validation ──────────────────────────────────────────────────────────────

test('a task needs a title and defaults the rest sensibly', () => {
  const out = validateTaskInput({ title: '  Assignment 2  ' });
  assert.equal(out.error, undefined);
  assert.equal(out.value.title, 'Assignment 2', 'trimmed');
  assert.equal(out.value.type, 'ASSIGNMENT');
  assert.equal(out.value.status, 'TODO');
  assert.equal(out.value.priority, 'MEDIUM');
  assert.equal(out.value.source, 'MANUAL');
  assert.equal(out.value.dueAt, null, 'a task with no deadline is still a task');
});

test('a blank or oversized title is refused', () => {
  assert.equal(validateTaskInput({ title: '   ' }).error.field, 'title');
  assert.equal(validateTaskInput({}).error.field, 'title');
  assert.equal(validateTaskInput({ title: 'x'.repeat(201) }).error.field, 'title');
});

test('a due date must name an instant, not a bare local time', () => {
  // '2026-10-05T23:00' does not name a moment. Guessing a zone for it is how a
  // deadline moves when a student travels.
  assert.equal(validateTaskInput({ title: 'x', dueAt: '2026-10-05T23:00' }).error.field, 'dueAt');
  assert.equal(validateTaskInput({ title: 'x', dueAt: '2026-10-05' }).error.field, 'dueAt');
  assert.equal(validateTaskInput({ title: 'x', dueAt: 'soon' }).error.field, 'dueAt');
});

test('an offset due date is accepted and normalised to UTC', () => {
  // +06:00 is Dhaka. The same moment, stored identically either way.
  const withOffset = validateTaskInput({ title: 'x', dueAt: '2026-10-05T23:00:00+06:00' });
  const withZ = validateTaskInput({ title: 'x', dueAt: '2026-10-05T17:00:00Z' });
  assert.equal(withOffset.value.dueAt, '2026-10-05T17:00:00.000Z');
  assert.equal(withOffset.value.dueAt, withZ.value.dueAt);
});

test('a task cannot start after it is due', () => {
  const out = validateTaskInput({
    title: 'x',
    startAt: '2026-10-06T10:00:00Z',
    dueAt: '2026-10-05T10:00:00Z',
  });
  assert.equal(out.error.field, 'startAt');
});

test('estimated minutes must be a sane positive whole number', () => {
  assert.equal(validateTaskInput({ title: 'x', estimatedMinutes: 90 }).error, undefined);
  assert.equal(
    validateTaskInput({ title: 'x', estimatedMinutes: 0 }).error.field,
    'estimatedMinutes',
  );
  assert.equal(
    validateTaskInput({ title: 'x', estimatedMinutes: -5 }).error.field,
    'estimatedMinutes',
  );
  assert.equal(
    validateTaskInput({ title: 'x', estimatedMinutes: 1.5 }).error.field,
    'estimatedMinutes',
  );
  assert.equal(
    validateTaskInput({ title: 'x', estimatedMinutes: 99999 }).error.field,
    'estimatedMinutes',
  );
});

test('unknown enum values are refused', () => {
  for (const field of ['type', 'status', 'priority', 'source']) {
    assert.equal(validateTaskInput({ title: 'x', [field]: 'NOPE' }).error.field, field);
  }
});

// ── Records and completion ──────────────────────────────────────────────────

test('a new task records when it was made and is not yet complete', () => {
  const record = buildTaskRecord({
    id: 'tsk_1',
    userId: 'usr_a',
    input: validInput(),
    nowIso: NOW_ISO,
  });
  assert.equal(record.createdAt, NOW_ISO);
  assert.equal(record.completedAt, null);
  assert.equal(record.priorityScore, null, 'reserved for the Phase 5 engine');
});

test('completing stamps completedAt, and reopening clears it', () => {
  // Stored rather than inferred, because "when did I finish this" is a question
  // a status field cannot answer. Maintained in BOTH directions, because a task
  // claiming it was completed last Tuesday while sitting in TODO would corrupt
  // the analytics the field exists for.
  const record = buildTaskRecord({
    id: 'tsk_1',
    userId: 'usr_a',
    input: validInput(),
    nowIso: NOW_ISO,
  });

  const done = applyTaskPatch(record, { status: 'COMPLETED' }, '2026-10-06T00:00:00.000Z');
  assert.equal(done.value.completedAt, '2026-10-06T00:00:00.000Z');

  const reopened = applyTaskPatch(done.value, { status: 'TODO' }, '2026-10-07T00:00:00.000Z');
  assert.equal(reopened.value.completedAt, null);
});

test('a patch that does not touch status leaves completedAt alone', () => {
  const record = buildTaskRecord({
    id: 'tsk_1',
    userId: 'usr_a',
    input: validInput({ status: 'COMPLETED' }),
    nowIso: NOW_ISO,
  });
  const renamed = applyTaskPatch(record, { title: 'Renamed' }, '2026-10-09T00:00:00.000Z');
  assert.equal(renamed.value.completedAt, NOW_ISO);
});

test('timing rules are checked against the MERGED task, not the patch alone', () => {
  // Otherwise "cannot start after it is due" is bypassed by patching one field
  // at a time.
  const record = buildTaskRecord({
    id: 'tsk_1',
    userId: 'usr_a',
    input: validInput({ dueAt: '2026-10-05T10:00:00Z' }),
    nowIso: NOW_ISO,
  });
  const out = applyTaskPatch(record, { startAt: '2026-10-06T10:00:00Z' }, NOW_ISO);
  assert.equal(out.error.field, 'startAt');
});

test('an unknown patch field is refused rather than ignored', () => {
  const record = buildTaskRecord({
    id: 'tsk_1',
    userId: 'usr_a',
    input: validInput(),
    nowIso: NOW_ISO,
  });
  assert.equal(
    applyTaskPatch(record, { completedAt: NOW_ISO }, NOW_ISO).error.field,
    'completedAt',
  );
  assert.equal(applyTaskPatch(record, { userId: 'usr_b' }, NOW_ISO).error.field, 'userId');
  assert.equal(applyTaskPatch(record, { priorityScore: 99 }, NOW_ISO).error.field, 'priorityScore');
});

test('the DTO withholds the owner and the storage version', () => {
  const dto = taskDto(
    buildTaskRecord({ id: 'tsk_1', userId: 'usr_a', input: validInput(), nowIso: NOW_ISO }),
  );
  assert.equal('userId' in dto, false);
  assert.equal('schemaVersion' in dto, false);
});

// ── Ordering ────────────────────────────────────────────────────────────────

test('tasks sort soonest first, then by priority', () => {
  const sorted = sortTasks([
    makeTask({ id: 'c', dueAt: '2026-10-07T10:00:00Z' }),
    makeTask({ id: 'a', dueAt: '2026-10-05T10:00:00Z', priority: 'LOW' }),
    makeTask({ id: 'b', dueAt: '2026-10-05T10:00:00Z', priority: 'CRITICAL' }),
  ]);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['b', 'a', 'c'],
  );
});

test('undated tasks sort LAST, not first', () => {
  // A null due date is not "due now". Sorting nulls to the top would bury the
  // exam that is actually tomorrow under every undated reading.
  const sorted = sortTasks([
    makeTask({ id: 'undated', dueAt: null }),
    makeTask({ id: 'tomorrow', dueAt: '2026-10-06T10:00:00Z' }),
  ]);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['tomorrow', 'undated'],
  );
});

// ── Today ───────────────────────────────────────────────────────────────────

test('Today separates overdue from due-today', () => {
  const { overdue, dueToday } = selectToday(
    [
      makeTask({ id: 'late', dueAt: '2026-10-01T10:00:00Z' }),
      makeTask({ id: 'today', dueAt: '2026-10-05T14:00:00Z' }),
      makeTask({ id: 'later', dueAt: '2026-10-09T10:00:00Z' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(
    overdue.map((t) => t.id),
    ['late'],
  );
  assert.deepEqual(
    dueToday.map((t) => t.id),
    ['today'],
  );
});

test('a Dhaka evening task is due TODAY, not tomorrow', () => {
  // 2026-10-05 23:00 Dhaka = 2026-10-05T17:00Z. In UTC that is still the 5th,
  // but the failure mode is a task at 2026-10-05T18:30Z (00:30 on the 6th in
  // Dhaka) being counted as today. Both are pinned here.
  const tonight = makeTask({ id: 'tonight', dueAt: '2026-10-05T17:00:00Z' });
  const afterMidnight = makeTask({ id: 'tomorrow', dueAt: '2026-10-05T18:30:00Z' });

  const { dueToday } = selectToday([tonight, afterMidnight], NOW_MS, TZ);
  assert.deepEqual(
    dueToday.map((t) => t.id),
    ['tonight'],
  );
});

test('overdue keeps only open work', () => {
  // A completed task that was due last week is not a warning.
  const { overdue } = selectToday(
    [
      makeTask({ id: 'open', dueAt: '2026-10-01T10:00:00Z', status: 'TODO' }),
      makeTask({ id: 'doing', dueAt: '2026-10-01T10:00:00Z', status: 'IN_PROGRESS' }),
      makeTask({ id: 'done', dueAt: '2026-10-01T10:00:00Z', status: 'COMPLETED' }),
      makeTask({ id: 'dropped', dueAt: '2026-10-01T10:00:00Z', status: 'CANCELLED' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(overdue.map((t) => t.id).sort(), ['doing', 'open']);
});

test('due-today KEEPS completed work', () => {
  // A Today list that empties itself as work is finished takes away the only
  // evidence the day went well.
  const { dueToday } = selectToday(
    [
      makeTask({ id: 'done', dueAt: '2026-10-05T09:00:00Z', status: 'COMPLETED' }),
      makeTask({ id: 'todo', dueAt: '2026-10-05T14:00:00Z' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(dueToday.map((t) => t.id).sort(), ['done', 'todo']);
});

test('cancelled tasks appear in neither list', () => {
  const { overdue, dueToday } = selectToday(
    [
      makeTask({ id: 'a', dueAt: '2026-10-01T10:00:00Z', status: 'CANCELLED' }),
      makeTask({ id: 'b', dueAt: '2026-10-05T14:00:00Z', status: 'CANCELLED' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(overdue, []);
  assert.deepEqual(dueToday, []);
});

test('undated and malformed tasks are skipped, not crashed on', () => {
  const { overdue, dueToday } = selectToday(
    [
      makeTask({ id: 'a', dueAt: null }),
      makeTask({ id: 'b', dueAt: 'not a date' }),
      makeTask({ id: 'c' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(overdue, []);
  assert.deepEqual(dueToday, []);
});

// ── Upcoming ────────────────────────────────────────────────────────────────

test('Upcoming starts tomorrow and excludes today', () => {
  // A task in both lists would be double-counted by anything that adds them.
  const items = selectUpcoming(
    [
      makeTask({ id: 'today', dueAt: '2026-10-05T14:00:00Z' }),
      makeTask({ id: 'tomorrow', dueAt: '2026-10-06T14:00:00Z' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(
    items.map((t) => t.id),
    ['tomorrow'],
  );
});

test('Upcoming honours its horizon', () => {
  const tasks = [
    makeTask({ id: 'in3', dueAt: '2026-10-08T10:00:00Z' }),
    makeTask({ id: 'in20', dueAt: '2026-10-25T10:00:00Z' }),
  ];
  assert.deepEqual(
    selectUpcoming(tasks, NOW_MS, TZ, 7).map((t) => t.id),
    ['in3'],
  );
  assert.deepEqual(
    selectUpcoming(tasks, NOW_MS, TZ, 30).map((t) => t.id),
    ['in3', 'in20'],
  );
});

test('Upcoming excludes finished work, unlike Today', () => {
  // Upcoming answers "what is ahead of me"; something finished is not ahead.
  const items = selectUpcoming(
    [
      makeTask({ id: 'done', dueAt: '2026-10-07T10:00:00Z', status: 'COMPLETED' }),
      makeTask({ id: 'open', dueAt: '2026-10-07T10:00:00Z', status: 'TODO' }),
    ],
    NOW_MS,
    TZ,
  );
  assert.deepEqual(
    items.map((t) => t.id),
    ['open'],
  );
});

test('the upcoming horizon is clamped, defaulted and validated', () => {
  assert.equal(upcomingDays(undefined), DEFAULT_UPCOMING_DAYS);
  assert.equal(upcomingDays(''), DEFAULT_UPCOMING_DAYS);
  assert.equal(upcomingDays('14'), 14);
  assert.equal(upcomingDays('9999'), MAX_UPCOMING_DAYS, 'clamped, not refused');
  assert.equal(upcomingDays('0'), null);
  assert.equal(upcomingDays('-3'), null);
  assert.equal(upcomingDays('soon'), null);
});
