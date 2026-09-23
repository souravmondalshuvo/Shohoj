/**
 * tests/calendarFeedParity.test.js
 *
 * The download and the subscription are ONE calendar (#744).
 *
 * `src/features/tasks/taskCalendar.ts` builds the .ics a student downloads, in
 * the browser. `worker/taskCalendarIcs.js` builds the one a calendar app
 * subscribes to, on the server. They exist twice because the Worker is a
 * separate package for a different runtime and neither module graph belongs in
 * the other — a boundary this repo has consistently refused to cross for ~50
 * lines of formatting.
 *
 * What makes that safe rather than merely tolerated is this file. A student who
 * downloaded the file once and subscribed later must not end up looking at two
 * different calendars, and "we were careful" is not a mechanism.
 *
 * These compare OUTPUT, not source. A twin-source check would pass on two files
 * that drifted in meaning and fail on a renamed local variable; this fails on
 * exactly the thing that matters and nothing else.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTasksICS as shellBuild,
  toCalendarEvents as shellEvents,
} from '../src/features/tasks/taskCalendar.ts';
import {
  buildTasksICS as workerBuild,
  toCalendarEvents as workerEvents,
} from '../worker/taskCalendarIcs.js';

/** A fixed clock, so DTSTAMP is not the thing under test. */
const NOW = new Date('2026-09-23T08:00:00.000Z');

const ENROLLMENTS = [
  { id: 'enr_' + 'a'.repeat(32), courseCode: 'CSE220' },
  { id: 'enr_' + 'b'.repeat(32), courseCode: 'MAT215' },
];

function task(over = {}) {
  return {
    id: 'tsk_' + '1'.repeat(32),
    enrollmentId: ENROLLMENTS[0].id,
    title: 'Assignment 2',
    description: null,
    type: 'ASSIGNMENT',
    status: 'TODO',
    priority: 'MEDIUM',
    priorityScore: 50,
    dueAt: '2026-09-27T11:00:00.000Z',
    startAt: null,
    estimatedMinutes: null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    ...over,
  };
}

/** Both writers over the same input, as bytes. */
function bothICS(tasks, options = {}) {
  const opts = { now: NOW, ...options };
  return {
    shell: shellBuild(shellEvents(tasks, ENROLLMENTS), opts),
    worker: workerBuild(workerEvents(tasks, ENROLLMENTS), opts),
  };
}

/** The fixtures that have to agree. Named, so a failure says which case broke. */
const CASES = {
  'a plain dated task': [task()],
  'a task with no course': [task({ enrollmentId: null })],
  'a task with an estimate': [task({ estimatedMinutes: 45 })],
  'an estimate past the cap': [task({ estimatedMinutes: 10_000 })],
  'a zero estimate': [task({ estimatedMinutes: 0 })],
  'a completed task': [task({ status: 'COMPLETED', completedAt: '2026-09-25T10:00:00.000Z' })],
  'a cancelled task': [task({ status: 'CANCELLED' })],
  'an undated task': [task({ dueAt: null })],
  'a task with an unparseable date': [task({ dueAt: 'not a date' })],
  'a title needing RFC 5545 escaping': [task({ title: 'Report; part 2, final\\draft\nand more' })],
  'a task on an unknown enrolment': [task({ enrollmentId: 'enr_' + 'f'.repeat(32) })],
  'several tasks at once': [
    task({ id: 'tsk_' + '1'.repeat(32) }),
    task({ id: 'tsk_' + '2'.repeat(32), enrollmentId: ENROLLMENTS[1].id, type: 'QUIZ' }),
    task({ id: 'tsk_' + '3'.repeat(32), enrollmentId: null, type: 'READING', dueAt: null }),
  ],
  'nothing at all': [],
};

for (const [label, tasks] of Object.entries(CASES)) {
  test(`the two writers agree on ${label}`, () => {
    const { shell, worker } = bothICS(tasks);
    assert.equal(worker, shell);
  });
}

test('the two writers agree with alarms switched on', () => {
  const { shell, worker } = bothICS([task()], { alarmMinutes: 60 });

  assert.equal(worker, shell);
  assert.match(worker, /BEGIN:VALARM/);
});

test('the two writers agree on a renamed calendar', () => {
  const { shell, worker } = bothICS([task()], { calName: 'Shohoj; deadlines' });
  assert.equal(worker, shell);
});

// ── Properties the feed depends on, asserted on the worker's own output ─────

test('UIDs are stable, so re-fetching updates rather than duplicates', () => {
  // This is what makes a subscription a subscription. It is also why
  // subscribing after downloading merges instead of doubling.
  const first = workerBuild(workerEvents([task()], ENROLLMENTS), { now: NOW });
  const later = workerBuild(workerEvents([task({ dueAt: '2026-10-01T11:00:00.000Z' })], ENROLLMENTS), {
    now: new Date('2026-09-30T08:00:00.000Z'),
  });

  const uid = /UID:(.+)/.exec(first)[1];
  assert.equal(uid, /UID:(.+)/.exec(later)[1]);
  assert.ok(uid.endsWith('@tasks.shohoj'));
});

test('an undated task never reaches the feed', () => {
  // A task with no due date is not a thing happening now, and a calendar that
  // pretends otherwise is wrong about the one thing it exists to show.
  const ics = workerBuild(workerEvents([task({ dueAt: null })], ENROLLMENTS), { now: NOW });
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});

test('every line ends CRLF, including the last', () => {
  const ics = workerBuild(workerEvents([task()], ENROLLMENTS), { now: NOW });

  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n').slice(0, -1)) {
    assert.doesNotMatch(line, /[\r\n]/, `bare newline inside: ${line}`);
  }
});
