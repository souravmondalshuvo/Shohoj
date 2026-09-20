// src/app/routes/TasksRoute.tsx
//
// Shohoj Tasks (#717) — the screen everything since #710 was built for.
//
// Three views over one list: Today (overdue plus due-today), Upcoming (the next
// week) and All (everything, including undated work that appears in neither of
// the others). The view is in the URL as `?view=`, so a student can bookmark
// Today and so the browser's back button steps between views rather than
// leaving the route.
//
// Auth-gated: tasks are per-student server state and a signed-out visitor has
// nothing to show. An offline build — a fork, a pull-request preview — says so
// instead of erroring, the same contract every other cloud route here keeps.
//
// Display logic lives in src/features/tasks/taskView.ts, and data in
// ./useTasks.ts; this file is composition and the bits that genuinely need a
// component.

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useAcademicRecords } from '../../features/academic/useAcademicRecords.ts';
import { TaskComposer } from '../../features/tasks/TaskComposer.tsx';
import { TaskRow } from '../../features/tasks/TaskRow.tsx';
import {
  TASK_VIEWS,
  courseOptions,
  emptyState,
  isTaskView,
  summarise,
  workloadLabel,
  type TaskView,
} from '../../features/tasks/taskView.ts';
import { useTasks } from '../../features/tasks/useTasks.ts';
import type { Task } from '../../platform/api/tasks.ts';
import { useApiClient } from '../providers/ApiProvider';
import { useAuth } from '../providers/AuthProvider';
import { useConfirm } from '../providers/ModalProvider';
import { useNotifications } from '../../state/NotificationProvider';

export function Component() {
  const client = useApiClient();
  const auth = useAuth();
  const confirm = useConfirm();
  const { notify } = useNotifications();

  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const view: TaskView = isTaskView(viewParam) ? viewParam : 'today';
  const courseFilter = params.get('course') ?? '';

  const academic = useAcademicRecords(client);
  const tasks = useTasks(client, view);
  const [busy, setBusy] = useState(false);

  const courses = useMemo(
    () => courseOptions(academic.activeEnrollments),
    [academic.activeEnrollments],
  );

  // Filtering is client-side: the list is already scoped to one student and one
  // view, so it is small, and refetching on every filter change would make the
  // list flicker for no benefit.
  const visible = useMemo(
    () =>
      courseFilter === ''
        ? tasks.items
        : tasks.items.filter((task) => task.enrollmentId === courseFilter),
    [tasks.items, courseFilter],
  );
  const visibleOverdue = useMemo(
    () =>
      courseFilter === ''
        ? tasks.overdue
        : tasks.overdue.filter((task) => task.enrollmentId === courseFilter),
    [tasks.overdue, courseFilter],
  );

  const summary = useMemo(
    () => summarise([...visibleOverdue, ...visible]),
    [visible, visibleOverdue],
  );

  /**
   * Update one query parameter.
   *
   * `replace` is the difference between a filter and a navigation. Switching
   * view is moving between screens, so it PUSHES and the back button steps
   * between Today and Upcoming rather than leaving the route. Changing the
   * course filter is refining the current screen, so it replaces — otherwise
   * a student who tried three courses has to press back three times to get out.
   */
  const setParam = (key: string, value: string, { replace = false } = {}) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace });
  };

  // ── Gates ─────────────────────────────────────────────────────────────────

  if (auth.status === 'loading') {
    return (
      <section className="tasks-route" data-testid="tasks-page" aria-busy="true">
        <p className="shell-muted">Loading…</p>
      </section>
    );
  }

  if (auth.status !== 'authenticated') {
    return (
      <section className="tasks-route" data-testid="tasks-page">
        <h2 className="tasks-heading">Tasks</h2>
        <p className="tasks-signin shell-muted" data-testid="tasks-signin">
          Sign in to keep your assignments, quizzes and deadlines in Shohoj.
        </p>
      </section>
    );
  }

  if (client === null) {
    return (
      <section className="tasks-route" data-testid="tasks-page">
        <h2 className="tasks-heading">Tasks</h2>
        <p className="tasks-signin shell-muted" data-testid="tasks-offline">
          Tasks needs the Shohoj backend, which this build is not configured for.
        </p>
      </section>
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const onCreate = async (input: Parameters<typeof tasks.create>[0]) => {
    setBusy(true);
    const failure = await tasks.create(input);
    setBusy(false);
    if (failure !== null) return failure.userMessage;
    notify({ kind: 'success', message: 'Task added.' });
    return null;
  };

  const onToggle = async (task: Task, completed: boolean) => {
    const failure = await tasks.setCompleted(task.id, completed);
    if (failure !== null) notify({ kind: 'error', message: failure.userMessage });
  };

  const onDelete = async (task: Task) => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: `“${task.title}” will be removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const failure = await tasks.remove(task.id);
    if (failure !== null) notify({ kind: 'error', message: failure.userMessage });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const empty = emptyState({
    view,
    hasActiveSemester: academic.active !== null,
    enrollmentCount: academic.activeEnrollments.length,
    totalTasks: tasks.items.length + tasks.overdue.length,
    filtered: courseFilter !== '',
  });
  const nothingToShow = visible.length === 0 && visibleOverdue.length === 0;
  const workload = workloadLabel(summary.workloadMinutes);

  return (
    <section className="tasks-route" data-testid="tasks-page">
      <header className="tasks-head">
        <div>
          <h2 className="tasks-heading">Tasks</h2>
          {academic.active !== null && (
            <p className="tasks-semester shell-muted">{academic.active.name}</p>
          )}
        </div>
        <p className="tasks-summary" data-testid="tasks-summary">
          <span className="tasks-summary-open">{summary.open} open</span>
          {summary.overdue > 0 && (
            <span className="tasks-summary-overdue">{summary.overdue} overdue</span>
          )}
          {workload !== null && <span className="tasks-summary-load">{workload} of work</span>}
        </p>
      </header>

      <div className="tasks-controls">
        <div className="tasks-views" role="tablist" aria-label="Task views">
          {TASK_VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={`tasks-view ${view === entry.key ? 'is-active' : ''}`}
              onClick={() => setParam('view', entry.key === 'today' ? '' : entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {courses.length > 1 && (
          <label className="tasks-filter">
            <span className="tasks-label">Course</span>
            <select
              className="tasks-input"
              // The composer has a "Course" picker too. Two controls with the
              // same accessible name on one screen is ambiguous for anyone
              // navigating by name — this says which one it is, and still
              // contains the visible label so it satisfies label-in-name.
              aria-label="Filter by course"
              value={courseFilter}
              onChange={(event) => setParam('course', event.target.value, { replace: true })}
            >
              {courses.map((course) => (
                <option key={course.value} value={course.value}>
                  {course.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <TaskComposer
        courses={courses}
        defaultEnrollmentId={courseFilter}
        onCreate={onCreate}
        busy={busy}
      />

      {tasks.status === 'error' && tasks.error !== null && (
        <p className="tasks-error" role="alert">
          {tasks.error.userMessage}{' '}
          <button type="button" className="tasks-retry" onClick={tasks.refresh}>
            Try again
          </button>
        </p>
      )}

      {nothingToShow && tasks.status !== 'loading' ? (
        <div className="tasks-empty" data-testid="tasks-empty">
          <p className="tasks-empty-title">{empty.title}</p>
          <p className="tasks-empty-detail shell-muted">{empty.detail}</p>
          {empty.needsSetup && (
            <Link className="tasks-empty-link" to="/planner">
              Set up your semester
            </Link>
          )}
        </div>
      ) : (
        <>
          {visibleOverdue.length > 0 && (
            <section className="tasks-group tasks-group-overdue">
              <h3 className="tasks-group-title">Overdue</h3>
              <ul className="tasks-list" data-testid="tasks-list">
                {visibleOverdue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    enrollments={academic.enrollments}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          )}

          {visible.length > 0 && (
            <section className="tasks-group">
              {visibleOverdue.length > 0 && <h3 className="tasks-group-title">Due today</h3>}
              <ul className="tasks-list" data-testid="tasks-list">
                {visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    enrollments={academic.enrollments}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

export default Component;
