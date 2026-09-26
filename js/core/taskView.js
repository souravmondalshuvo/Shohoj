// Twin of src/features/tasks/taskView.ts — hand-maintained, not generated.
// src/features/tasks/taskView.ts is the source of truth: change it there first,
// then mirror the change here. tests/twinParity.test.js fails if the two drift.
//
// What the Tasks screens display (#717), for the legacy Tasks tab (#767): which
// view a student is on, what a deadline reads as, how a course is labelled,
// what an empty screen should say. Pure functions from data to display values.

import { TASK_TYPE_LABELS, dueTone, isOpen } from './tasksApi.js';

/**
 * The four views. The legacy tab shows the three lists; Calendar arrives with
 * a later phase, but the table stays whole so the twins agree.
 */
export const TASK_VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'calendar', label: 'Calendar' },
];

export function isTaskView(value) {
  return value === 'today' || value === 'upcoming' || value === 'all' || value === 'calendar';
}

/** "CSE220 · 04" for a task filed against a course; null for anything else. */
export function courseLabel(task, enrollments) {
  if (task.enrollmentId === null) return null;
  const enrollment = enrollments.find((e) => e.id === task.enrollmentId);
  if (enrollment === undefined) return null;
  return enrollment.section === null
    ? enrollment.courseCode
    : `${enrollment.courseCode} · ${enrollment.section}`;
}

/** The course filter's options: "All courses", then the courses being taken. */
export function courseOptions(enrollments) {
  const courses = [...enrollments]
    .filter((e) => e.status === 'ENROLLED')
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode))
    .map((e) => ({ value: e.id, label: e.courseCode }));
  return [{ value: '', label: 'All courses' }, ...courses];
}

/** What a deadline reads as, relative to the student's own day. */
export function dueLabel(task, now = new Date()) {
  if (task.dueAt === null) return 'No deadline';
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return 'No deadline';

  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const tone = dueTone(task, now);

  if (tone === 'today') return `Today ${time}`;
  if (tone === 'tomorrow') return `Tomorrow ${time}`;
  if (tone === 'overdue') {
    const days = _taskWholeDaysBetween(due, now);
    if (days === 0) return `Overdue · ${time}`;
    return days === 1 ? 'Overdue · yesterday' : `Overdue · ${days} days ago`;
  }
  if (tone === 'soon') {
    return `${due.toLocaleDateString(undefined, { weekday: 'long' })} ${time}`;
  }
  return due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function _taskWholeDaysBetween(earlier, later) {
  const a = new Date(earlier);
  const b = new Date(later);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "1h 30m" for an estimate; null when there is none. */
export function workloadLabel(minutes) {
  if (minutes === null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function typeLabel(task) {
  return TASK_TYPE_LABELS[task.type] ?? task.type;
}

/** What an empty screen should say, most blocking reason first. */
export function emptyState(input) {
  if (!input.hasActiveSemester) {
    return {
      title: 'Set your current semester first',
      detail:
        'Shohoj Tasks hangs off the semester you are in, so it knows which courses a deadline belongs to.',
      needsSetup: true,
    };
  }
  if (input.enrollmentCount === 0) {
    return {
      title: 'Add the courses you are taking',
      detail: 'Once your courses are in, you can file assignments, quizzes and exams against them.',
      needsSetup: true,
    };
  }
  if (input.filtered) {
    return {
      title: 'Nothing for this course',
      detail: 'Clear the course filter to see everything else.',
      needsSetup: false,
    };
  }
  if (input.totalTasks === 0) {
    return {
      title: 'No tasks yet',
      detail: 'Add your first assignment, quiz or reading and it will show up here.',
      needsSetup: false,
    };
  }
  if (input.view === 'today') {
    return {
      title: 'Nothing due today',
      detail: 'Nothing overdue either. Check Upcoming for what is next.',
      needsSetup: false,
    };
  }
  if (input.view === 'upcoming') {
    return {
      title: 'Nothing in the next week',
      detail: 'Anything without a deadline is under All.',
      needsSetup: false,
    };
  }
  if (input.view === 'calendar') {
    return {
      title: 'Nothing with a deadline',
      detail: 'A task needs a due date before it can appear on a calendar.',
      needsSetup: false,
    };
  }
  return {
    title: 'No tasks here',
    detail: 'Nothing matches the current filter.',
    needsSetup: false,
  };
}

/** Open count, overdue count, and summed estimate (null when nothing is estimated). */
export function summarise(tasks, now = new Date()) {
  const open = tasks.filter(isOpen);
  const overdue = open.filter((task) => dueTone(task, now) === 'overdue');
  const estimated = open.filter((task) => task.estimatedMinutes !== null);
  return {
    open: open.length,
    overdue: overdue.length,
    workloadMinutes:
      estimated.length === 0
        ? null
        : estimated.reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0),
  };
}

export const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function priorityClass(priority) {
  return `tasks-priority-${priority.toLowerCase()}`;
}

export function toneClass(task, now = new Date()) {
  return `tasks-due-${dueTone(task, now)}`;
}
