// src/features/tasks/taskView.ts
//
// What the Tasks screens display, decided without React (#717).
//
// Everything here is a pure function from data to display values: which view a
// student is on, what a deadline reads as, how a course is labelled, what an
// empty screen should say. Kept out of the components because a component is
// the one place this logic cannot be tested — the repo has no React test
// renderer — and because "what should this screen say when the student has no
// active semester" is a product decision worth pinning down rather than
// leaving inline in JSX.

import type { Enrollment } from '../../platform/api/academic.ts';
import {
  type Task,
  type TaskPriority,
  TASK_TYPE_LABELS,
  dueTone,
  isOpen,
} from '../../platform/api/tasks.ts';

/**
 * The four views.
 *
 * `all` is the only one that shows undated work; `calendar` lays the dated work
 * out by day and is the only one that is not a list.
 */
export type TaskView = 'today' | 'upcoming' | 'all' | 'calendar';

export const TASK_VIEWS: readonly { readonly key: TaskView; readonly label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'calendar', label: 'Calendar' },
];

export function isTaskView(value: unknown): value is TaskView {
  return value === 'today' || value === 'upcoming' || value === 'all' || value === 'calendar';
}

// ── Course labelling ────────────────────────────────────────────────────────

/**
 * How a task's course reads: `CSE220` on its own, or `CSE220 · 13` with a
 * section.
 *
 * Returns null for a task with no course rather than a placeholder, so the
 * caller decides whether to render "Personal", nothing, or something else —
 * the three screens want different things there.
 */
export function courseLabel(task: Task, enrollments: readonly Enrollment[]): string | null {
  if (task.enrollmentId === null) return null;
  const enrollment = enrollments.find((e) => e.id === task.enrollmentId);
  if (enrollment === undefined) return null;
  return enrollment.section === null
    ? enrollment.courseCode
    : `${enrollment.courseCode} · ${enrollment.section}`;
}

/** The course filter's options, newest-enrolled first, plus the two specials. */
export interface CourseOption {
  readonly value: string;
  readonly label: string;
}

export function courseOptions(enrollments: readonly Enrollment[]): CourseOption[] {
  const courses = [...enrollments]
    .filter((e) => e.status === 'ENROLLED')
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode))
    .map((e) => ({ value: e.id, label: e.courseCode }));
  return [{ value: '', label: 'All courses' }, ...courses];
}

// ── Deadline text ───────────────────────────────────────────────────────────

/**
 * A deadline in words, from the viewer's own clock.
 *
 * Relative for anything close ("Today 11:59 PM", "Tomorrow"), absolute once it
 * is far enough away that a relative phrase stops helping — nobody reads "in
 * 34 days" and knows when that is.
 *
 * `now` is injected so this is testable; callers pass nothing.
 */
export function dueLabel(task: Task, now: Date = new Date()): string {
  if (task.dueAt === null) return 'No deadline';
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return 'No deadline';

  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const tone = dueTone(task, now);

  if (tone === 'today') return `Today ${time}`;
  if (tone === 'tomorrow') return `Tomorrow ${time}`;
  if (tone === 'overdue') {
    const days = wholeDaysBetween(due, now);
    if (days === 0) return `Overdue · ${time}`;
    return days === 1 ? 'Overdue · yesterday' : `Overdue · ${days} days ago`;
  }
  if (tone === 'soon') {
    return `${due.toLocaleDateString(undefined, { weekday: 'long' })} ${time}`;
  }
  return due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Whole local days between two instants, ignoring the time of day. */
function wholeDaysBetween(earlier: Date, later: Date): number {
  const a = new Date(earlier);
  const b = new Date(later);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** `3h`, `45m`, `2h 30m`, or null when the student gave no estimate. */
export function workloadLabel(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The type as a student reads it. Falls back to the raw value for a type we don't know. */
export function typeLabel(task: Task): string {
  return TASK_TYPE_LABELS[task.type] ?? task.type;
}

// ── Empty states ────────────────────────────────────────────────────────────

/**
 * What an empty screen should say, and whether anything can be done about it.
 *
 * An empty Tasks screen has four quite different causes, and telling a student
 * "no tasks" when the real problem is that they have not set up a semester is
 * how a feature gets written off as broken. Each case names its own next step.
 */
export interface EmptyState {
  readonly title: string;
  readonly detail: string;
  /** True when the student should be pointed at setting up their courses. */
  readonly needsSetup: boolean;
}

export interface EmptyStateInput {
  readonly view: TaskView;
  readonly hasActiveSemester: boolean;
  readonly enrollmentCount: number;
  /** Tasks the student has at all, before the current view's filtering. */
  readonly totalTasks: number;
  /** True when a course filter is narrowing the list. */
  readonly filtered: boolean;
}

export function emptyState(input: EmptyStateInput): EmptyState {
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

// ── Summary ─────────────────────────────────────────────────────────────────

export interface TaskSummary {
  readonly open: number;
  readonly overdue: number;
  /** Estimated minutes of open work, or null when nothing carries an estimate. */
  readonly workloadMinutes: number | null;
}

/**
 * The header line: what is still open, what is late, how long it all looks.
 *
 * Workload is null rather than 0 when NOTHING carries an estimate, so the UI
 * can omit it instead of claiming a student has zero hours of work ahead.
 */
export function summarise(tasks: readonly Task[], now: Date = new Date()): TaskSummary {
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

// ── Priority ────────────────────────────────────────────────────────────────

/** Priorities in the order a picker should offer them: most urgent last is wrong. */
export const PRIORITY_ORDER: readonly TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** A CSS modifier for a priority, so styling lives in CSS and not in a switch. */
export function priorityClass(priority: TaskPriority): string {
  return `tasks-priority-${priority.toLowerCase()}`;
}

/** A CSS modifier for how close a deadline is. */
export function toneClass(task: Task, now: Date = new Date()): string {
  return `tasks-due-${dueTone(task, now)}`;
}
