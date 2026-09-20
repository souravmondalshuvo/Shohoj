/**
 * tests/taskView.test.js
 *
 * What the Tasks screens display (#717) — src/features/tasks/taskView.ts.
 *
 * Pure, so it is testable without a React renderer, which the repo does not
 * have. The empty states are the part most worth pinning: telling a student
 * "no tasks" when the real problem is that they have no semester set up is how
 * a feature gets written off as broken.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIORITY_ORDER,
  TASK_VIEWS,
  courseLabel,
  courseOptions,
  dueLabel,
  emptyState,
  isTaskView,
  priorityClass,
  summarise,
  toneClass,
  typeLabel,
  workloadLabel,
} from '../src/features/tasks/taskView.ts';

const TASK = {
  id: 'tsk_0123456789abcdef0123456789abcdef',
  enrollmentId: 'enr_0123456789abcdef0123456789abcdef',
  title: 'Assignment 2',
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'HIGH',
  priorityScore: null,
  dueAt: null,
  startAt: null,
  estimatedMinutes: null,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
};

const ENROLLMENT = {
  id: TASK.enrollmentId,
  semesterId: 'sem_bracu_20263',
  courseCode: 'CSE220',
  credits: 3,
  section: '13',
  facultyInitials: 'SHO',
  status: 'ENROLLED',
  source: 'MANUAL',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

/** Local noon, so nothing here straddles a day boundary by accident. */
const NOW = new Date('2026-10-05T12:00:00');
const localIso = (s) => new Date(s).toISOString();

// ── Views ───────────────────────────────────────────────────────────────────

test('the three views are Today, Upcoming and All', () => {
  assert.deepEqual(TASK_VIEWS.map((v) => v.key), ['today', 'upcoming', 'all']);
  assert.equal(isTaskView('today'), true);
  assert.equal(isTaskView('yesterday'), false);
  assert.equal(isTaskView(undefined), false);
});

// ── Course labelling ────────────────────────────────────────────────────────

test('a course reads with its section when there is one', () => {
  assert.equal(courseLabel(TASK, [ENROLLMENT]), 'CSE220 · 13');
  assert.equal(courseLabel(TASK, [{ ...ENROLLMENT, section: null }]), 'CSE220');
});

test('a task with no course, or an unknown one, labels as null', () => {
  // Null rather than a placeholder: the three screens want different things
  // there, so the caller decides.
  assert.equal(courseLabel({ ...TASK, enrollmentId: null }, [ENROLLMENT]), null);
  assert.equal(courseLabel(TASK, []), null);
});

test('the course filter lists enrolled courses alphabetically, with an all option', () => {
  const options = courseOptions([
    { ...ENROLLMENT, id: 'enr_b', courseCode: 'MAT215' },
    { ...ENROLLMENT, id: 'enr_a', courseCode: 'CSE220' },
  ]);
  assert.deepEqual(options.map((o) => o.label), ['All courses', 'CSE220', 'MAT215']);
  assert.equal(options[0].value, '', 'the all option carries an empty value');
});

test('dropped courses are not offered as filters', () => {
  const options = courseOptions([
    { ...ENROLLMENT, id: 'enr_a', courseCode: 'CSE220', status: 'ENROLLED' },
    { ...ENROLLMENT, id: 'enr_b', courseCode: 'MAT215', status: 'DROPPED' },
  ]);
  assert.deepEqual(options.map((o) => o.label), ['All courses', 'CSE220']);
});

// ── Deadline text ───────────────────────────────────────────────────────────

test('a deadline reads relatively when it is close', () => {
  const on = (local) => dueLabel({ ...TASK, dueAt: localIso(local) }, NOW);
  assert.match(on('2026-10-05T23:59:00'), /^Today /);
  assert.match(on('2026-10-06T09:00:00'), /^Tomorrow /);
  // Within the week: a weekday name is more useful than a date.
  assert.match(on('2026-10-08T09:00:00'), /^Thursday /);
});

test('a distant deadline reads as a date, because "in 34 days" helps nobody', () => {
  const label = dueLabel({ ...TASK, dueAt: localIso('2026-11-08T09:00:00') }, NOW);
  assert.doesNotMatch(label, /Today|Tomorrow/);
  assert.match(label, /Nov|11/);
});

test('an overdue deadline says how late it is', () => {
  const on = (local) => dueLabel({ ...TASK, dueAt: localIso(local) }, NOW);
  assert.match(on('2026-10-04T09:00:00'), /yesterday/);
  assert.match(on('2026-10-01T09:00:00'), /4 days ago/);
});

test('"overdue" means before TODAY, not earlier today', () => {
  // A deliberate definition, and the same one the server uses: selectToday puts
  // anything due within the local day in `dueToday`, and only a past day counts
  // as overdue. So a 6am deadline read at noon is still today's work.
  //
  // The alternative — overdue the moment the hour passes — would move tasks
  // between two lists during the day and disagree with what the API returns,
  // which is the worse of the two inconsistencies.
  assert.match(dueLabel({ ...TASK, dueAt: localIso('2026-10-05T06:00:00') }, NOW), /^Today /);
  assert.equal(toneClass({ ...TASK, dueAt: localIso('2026-10-05T06:00:00') }, NOW), 'tasks-due-today');
});

test('no deadline says so rather than rendering an invalid date', () => {
  assert.equal(dueLabel({ ...TASK, dueAt: null }, NOW), 'No deadline');
  assert.equal(dueLabel({ ...TASK, dueAt: 'not a date' }, NOW), 'No deadline');
});

test('workload reads in hours and minutes, and is absent when unestimated', () => {
  assert.equal(workloadLabel(45), '45m');
  assert.equal(workloadLabel(60), '1h');
  assert.equal(workloadLabel(150), '2h 30m');
  assert.equal(workloadLabel(null), null);
  assert.equal(workloadLabel(0), null);
});

test('a type reads as a label, and an unknown one falls back to itself', () => {
  assert.equal(typeLabel({ ...TASK, type: 'LAB' }), 'Lab');
  assert.equal(typeLabel({ ...TASK, type: 'FUTURE_KIND' }), 'FUTURE_KIND');
});

// ── Empty states ────────────────────────────────────────────────────────────

const base = {
  view: 'today',
  hasActiveSemester: true,
  enrollmentCount: 3,
  totalTasks: 5,
  filtered: false,
};

test('no semester is explained before anything else', () => {
  // The most common first-run state, and the one where "no tasks" would be
  // actively misleading.
  const state = emptyState({ ...base, hasActiveSemester: false, enrollmentCount: 0, totalTasks: 0 });
  assert.match(state.title, /semester/i);
  assert.equal(state.needsSetup, true);
});

test('no courses is explained next', () => {
  const state = emptyState({ ...base, enrollmentCount: 0, totalTasks: 0 });
  assert.match(state.title, /courses/i);
  assert.equal(state.needsSetup, true);
});

test('a filter hiding everything says so, and does not claim setup is missing', () => {
  const state = emptyState({ ...base, filtered: true });
  assert.match(state.detail, /filter/i);
  assert.equal(state.needsSetup, false);
});

test('a set-up student with no tasks at all is invited to add one', () => {
  const state = emptyState({ ...base, totalTasks: 0 });
  assert.match(state.title, /no tasks yet/i);
  assert.equal(state.needsSetup, false);
});

test('an empty Today with work elsewhere points at Upcoming', () => {
  const state = emptyState({ ...base, view: 'today' });
  assert.match(state.title, /nothing due today/i);
  assert.match(state.detail, /upcoming/i);
});

test('an empty Upcoming mentions where undated work lives', () => {
  // Undated tasks are in neither Today nor Upcoming, which is surprising unless
  // the screen says so.
  const state = emptyState({ ...base, view: 'upcoming' });
  assert.match(state.detail, /All/);
});

// ── Summary ─────────────────────────────────────────────────────────────────

test('the summary counts open and overdue work', () => {
  const summary = summarise(
    [
      { ...TASK, id: 'a', status: 'TODO', dueAt: localIso('2026-10-01T09:00:00') },
      { ...TASK, id: 'b', status: 'IN_PROGRESS', dueAt: localIso('2026-10-09T09:00:00') },
      { ...TASK, id: 'c', status: 'COMPLETED', dueAt: localIso('2026-10-01T09:00:00') },
    ],
    NOW,
  );
  assert.equal(summary.open, 2);
  assert.equal(summary.overdue, 1, 'a completed overdue task is not a warning');
});

test('workload is null when nothing is estimated, not zero', () => {
  // Zero would read as "no work ahead", which is a different claim.
  const none = summarise([{ ...TASK, estimatedMinutes: null }], NOW);
  assert.equal(none.workloadMinutes, null);

  const some = summarise(
    [
      { ...TASK, id: 'a', estimatedMinutes: 90 },
      { ...TASK, id: 'b', estimatedMinutes: 30 },
      { ...TASK, id: 'c', estimatedMinutes: null },
    ],
    NOW,
  );
  assert.equal(some.workloadMinutes, 120);
});

test('completed work is not counted toward the workload ahead', () => {
  const summary = summarise(
    [
      { ...TASK, id: 'a', estimatedMinutes: 90, status: 'COMPLETED' },
      { ...TASK, id: 'b', estimatedMinutes: 30, status: 'TODO' },
    ],
    NOW,
  );
  assert.equal(summary.workloadMinutes, 30);
});

// ── Styling hooks ───────────────────────────────────────────────────────────

test('priority and tone map to CSS classes rather than inline branching', () => {
  assert.equal(priorityClass('CRITICAL'), 'tasks-priority-critical');
  assert.equal(toneClass({ ...TASK, dueAt: localIso('2026-10-01T09:00:00') }, NOW), 'tasks-due-overdue');
  assert.equal(toneClass({ ...TASK, dueAt: null }, NOW), 'tasks-due-none');
});

test('the priority picker offers most-urgent first', () => {
  assert.deepEqual(PRIORITY_ORDER, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
});
