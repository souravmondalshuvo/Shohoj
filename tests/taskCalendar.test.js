/**
 * tests/taskCalendar.test.js
 *
 * Tasks as calendar events, and as an .ics file (#729).
 *
 * The normalised shape is what a Google or Apple integration will map FROM in
 * Phase 7, so its contents matter beyond the export that reads it today. The
 * ICS half is tested on the things that make a file open or not open: escaping,
 * UTC stamps, and stable UIDs.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTasksICS,
  groupByDay,
  icsFilename,
  localDayKey,
  toCalendarEvents,
} from '../src/features/tasks/taskCalendar.ts';

const task = (over = {}) => ({
  id: `tsk_${String(over.k ?? 1).padStart(32, '0')}`,
  enrollmentId: null,
  title: 'A task',
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'MEDIUM',
  priorityScore: null,
  dueAt: '2026-10-09T17:00:00.000Z',
  startAt: null,
  estimatedMinutes: null,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '',
  updatedAt: '',
  completedAt: null,
  ...over,
});

const ENROLLMENT = {
  id: 'enr_a',
  semesterId: 'sem_bracu_20263',
  courseCode: 'MAT215',
  credits: 3,
  section: '01',
  facultyInitials: null,
  status: 'ENROLLED',
  source: 'MANUAL',
  createdAt: '',
  updatedAt: '',
};

// ── Normalisation ───────────────────────────────────────────────────────────

test('a dated task becomes an event carrying the brief’s fields', () => {
  const [event] = toCalendarEvents([task({ enrollmentId: 'enr_a', type: 'EXAM' })], [ENROLLMENT]);
  assert.equal(event.title, 'MAT215: A task');
  assert.equal(event.type, 'EXAM');
  assert.equal(event.courseCode, 'MAT215');
  assert.equal(event.enrollmentId, 'enr_a');
  assert.equal(event.start, '2026-10-09T17:00:00.000Z');
  assert.equal(event.allDay, false);
  assert.equal(event.metadata.priority, 'MEDIUM');
});

test('an undated task is EXCLUDED, not placed on today', () => {
  // A reading with no due date is not a thing happening today, and putting it
  // there would make a calendar lie about the one thing it exists to show.
  assert.deepEqual(toCalendarEvents([task({ dueAt: null })]), []);
  assert.deepEqual(toCalendarEvents([task({ dueAt: 'not a date' })]), []);
});

test('a cancelled task is excluded but a completed one is kept', () => {
  // A calendar is partly a record of what happened; a week that looks empty
  // because the work got done is a misleading week.
  assert.equal(toCalendarEvents([task({ status: 'CANCELLED' })]).length, 0);
  assert.equal(toCalendarEvents([task({ status: 'COMPLETED' })]).length, 1);
});

test('an event gets a nominal length, and a long estimate is capped', () => {
  // A zero-length event is invisible in most calendars; a 12-hour block for a
  // 5pm deadline would swallow the day it is shown on.
  const [plain] = toCalendarEvents([task()]);
  assert.equal(Date.parse(plain.end) - Date.parse(plain.start), 30 * 60_000);

  const [sized] = toCalendarEvents([task({ estimatedMinutes: 90 })]);
  assert.equal(Date.parse(sized.end) - Date.parse(sized.start), 90 * 60_000);

  const [capped] = toCalendarEvents([task({ estimatedMinutes: 720 })]);
  assert.equal(Date.parse(capped.end) - Date.parse(capped.start), 120 * 60_000);
});

test('an unattached task has no course and is titled plainly', () => {
  const [event] = toCalendarEvents([task()], [ENROLLMENT]);
  assert.equal(event.courseCode, null);
  assert.equal(event.title, 'A task');
});

test('a task pointing at an unknown enrolment degrades rather than throwing', () => {
  const [event] = toCalendarEvents([task({ enrollmentId: 'enr_gone' })], [ENROLLMENT]);
  assert.equal(event.courseCode, null);
});

// ── Grouping ────────────────────────────────────────────────────────────────

test('events group by LOCAL day and sort within it', () => {
  const events = toCalendarEvents([
    task({ k: 1, dueAt: '2026-10-09T17:00:00.000Z' }),
    task({ k: 2, dueAt: '2026-10-09T09:00:00.000Z' }),
    task({ k: 3, dueAt: '2026-10-11T09:00:00.000Z' }),
  ]);
  const byDay = groupByDay(events);
  assert.equal(byDay.size, 2);
  const first = [...byDay.keys()].sort()[0];
  assert.deepEqual(
    byDay.get(first).map((e) => e.start),
    [...byDay.get(first).map((e) => e.start)].sort(),
    'earliest first within a day',
  );
});

test('the day key is local, not UTC', () => {
  // A UTC key would put a Dhaka student's late-evening deadline on tomorrow.
  const local = new Date(2026, 9, 9, 23, 30);
  assert.equal(localDayKey(local), '2026-10-09');
});

// ── ICS ─────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-21T00:00:00.000Z');

test('the file has the envelope a calendar app expects', () => {
  const ics = buildTasksICS(toCalendarEvents([task()]), { now: NOW });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /\r\n/, 'CRLF line endings per RFC 5545');
});

test('semicolons and commas in a title are escaped', () => {
  // Unescaped, they are property separators — the event silently loses its
  // title or the file fails to parse.
  const ics = buildTasksICS(toCalendarEvents([task({ title: 'Final; Exam, part 2' })]), {
    now: NOW,
  });
  assert.match(ics, /SUMMARY:Final\\; Exam\\, part 2/);
});

test('a newline in a title does not break the file', () => {
  const ics = buildTasksICS(toCalendarEvents([task({ title: 'Line one\nline two' })]), { now: NOW });
  assert.match(ics, /SUMMARY:Line one\\nline two/);
  assert.equal(ics.split('SUMMARY:').length, 2, 'one SUMMARY property, not two lines');
});

test('times are written as UTC stamps', () => {
  const ics = buildTasksICS(toCalendarEvents([task()]), { now: NOW });
  assert.match(ics, /DTSTART:20261009T170000Z/);
  assert.match(ics, /DTEND:20261009T173000Z/);
  assert.match(ics, /DTSTAMP:20260921T000000Z/);
});

test('UIDs are stable, so a re-import updates rather than duplicates', () => {
  // The difference between a calendar you can re-sync and one that fills with
  // copies of the same exam.
  const events = toCalendarEvents([task()]);
  const first = buildTasksICS(events, { now: NOW });
  const later = buildTasksICS(events, { now: new Date('2026-10-01T00:00:00.000Z') });
  const uid = (ics) => /UID:(.+)/.exec(ics)[1];
  assert.equal(uid(first), uid(later));
  assert.match(uid(first), /@tasks\.shohoj/);
});

test('an alarm is written only when asked for', () => {
  const events = toCalendarEvents([task()]);
  assert.doesNotMatch(buildTasksICS(events, { now: NOW }), /VALARM/);
  assert.match(buildTasksICS(events, { now: NOW, alarmMinutes: 60 }), /TRIGGER:-PT60M/);
});

test('an empty calendar is still a valid file', () => {
  const ics = buildTasksICS([], { now: NOW });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});

test('the filename is dated and recognisable', () => {
  assert.equal(icsFilename(new Date(2026, 8, 21)), 'shohoj-tasks-2026-09-21.ics');
});
