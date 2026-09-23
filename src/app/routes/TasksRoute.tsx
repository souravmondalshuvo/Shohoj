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
import { GradeImpactPanel } from '../../features/tasks/GradeImpactPanel.tsx';
import { TaskComposer } from '../../features/tasks/TaskComposer.tsx';
import { TaskDetails } from '../../features/tasks/TaskDetails.tsx';
import { TaskImport } from '../../features/tasks/TaskImport.tsx';
import { createAiDetector } from '../../features/tasks/detection/aiDetector.ts';
import { TaskRow } from '../../features/tasks/TaskRow.tsx';
import { gradeImpactView } from '../../features/tasks/gradeImpactView.ts';
import { useAssessments } from '../../features/tasks/useAssessments.ts';
import {
  TASK_VIEWS,
  courseOptions,
  emptyState,
  isTaskView,
  summarise,
  workloadLabel,
  type TaskView,
} from '../../features/tasks/taskView.ts';
import { TaskCalendarView } from '../../features/tasks/TaskCalendarView.tsx';
import { buildTasksICS, icsFilename, toCalendarEvents } from '../../features/tasks/taskCalendar.ts';
import { useReminders } from '../../features/tasks/useReminders.ts';
import { useTasks } from '../../features/tasks/useTasks.ts';
import { byPriority, type Task } from '../../platform/api/tasks.ts';
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
  const assessments = useAssessments(client);
  const [busy, setBusy] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Only the open task's reminders are fetched — see useReminders.
  const reminders = useReminders(client, openTaskId);

  // Sorting lives in the URL beside the view and the filter, so a student who
  // prefers priority order keeps it across navigations and can link to it.
  const sortByPriority = params.get('sort') === 'priority';

  // One detector for the life of the client. Null only on an offline build,
  // where the panel then never offers a second reading at all.
  const aiDetector = useMemo(() => (client === null ? null : createAiDetector(client)), [client]);

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

  const ordered = useMemo(
    () => (sortByPriority ? [...visible].sort(byPriority) : visible),
    [visible, sortByPriority],
  );
  const orderedOverdue = useMemo(
    () => (sortByPriority ? [...visibleOverdue].sort(byPriority) : visibleOverdue),
    [visibleOverdue, sortByPriority],
  );

  const summary = useMemo(
    () => summarise([...visibleOverdue, ...visible]),
    [visible, visibleOverdue],
  );

  /**
   * The grade picture, but only when one course is in view.
   *
   * "What do I need" is not a question about a mixed list, so the panel appears
   * exactly when it means something and is absent otherwise — rather than
   * rendering an empty shell on every screen.
   */
  const gradeView = useMemo(() => {
    if (courseFilter === '') return null;
    const assessed = tasks.items
      .concat(tasks.overdue)
      .filter((task) => task.enrollmentId === courseFilter)
      .map((task) => ({ task, assessment: assessments.byTaskId.get(task.id) }))
      .filter((entry) => entry.assessment !== undefined)
      .map((entry) => ({ task: entry.task, assessment: entry.assessment! }));
    return assessed.length === 0 ? null : gradeImpactView(assessed);
  }, [courseFilter, tasks.items, tasks.overdue, assessments.byTaskId]);

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

  /**
   * Create one confirmed proposal.
   *
   * Deliberately quieter than `onCreate`: the import panel reports the batch
   * once it is done, so notifying here would fire a toast per task.
   */
  const onImportCreate = async (input: Parameters<typeof tasks.create>[0]) => {
    const failure = await tasks.create(input);
    return failure === null ? null : failure.userMessage;
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

  /** One row, with its disclosure wired to the shared open-row state. */
  const renderRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      enrollments={academic.enrollments}
      onToggle={onToggle}
      onDelete={onDelete}
      expanded={openTaskId === task.id}
      onToggleDetails={(t) => setOpenTaskId((current) => (current === t.id ? null : t.id))}
      details={
        <TaskDetails
          task={task}
          reminders={reminders.items}
          onAddReminder={(minutes) => reminders.add(minutes)}
          onRemoveReminder={(id) => reminders.remove(id)}
          assessment={assessments.byTaskId.get(task.id) ?? null}
          // Saving an assessment changes the task's PRIORITY SCORE, which the
          // server computes on read — so the task list has to be refetched too,
          // or the explanation keeps citing the old weight until the student
          // navigates away and back.
          onSaveAssessment={async (input) => {
            const failure = await assessments.save(task.id, input);
            if (failure === null) tasks.refresh();
            return failure;
          }}
          onRemoveAssessment={async () => {
            const failure = await assessments.remove(task.id);
            if (failure === null) tasks.refresh();
            return failure;
          }}
        />
      }
    />
  );

  const calendarEvents = useMemo(
    () => toCalendarEvents([...visibleOverdue, ...visible], academic.enrollments),
    [visible, visibleOverdue, academic.enrollments],
  );

  /**
   * Hand the student an .ics file.
   *
   * A Blob and an object URL rather than a server endpoint: the data is already
   * in the page, and a download route would need its own auth. Revoked on the
   * next tick — not revoking leaks the blob for the life of the document.
   */
  const exportCalendar = () => {
    const ics = buildTasksICS(calendarEvents, { alarmMinutes: 60 });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = icsFilename();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const empty = emptyState({
    view,
    hasActiveSemester: academic.active !== null,
    enrollmentCount: academic.activeEnrollments.length,
    totalTasks: tasks.items.length + tasks.overdue.length,
    filtered: courseFilter !== '',
  });
  const nothingToShow = ordered.length === 0 && orderedOverdue.length === 0;
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

        <label className="tasks-sort">
          <input
            type="checkbox"
            checked={sortByPriority}
            onChange={(event) =>
              setParam('sort', event.target.checked ? 'priority' : '', { replace: true })
            }
          />
          {/* Off by default. Reordering the list every current student sees,
              without asking, is not an improvement. */}
          <span>Sort by priority</span>
        </label>

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

      <div className="tasks-create">
        <TaskComposer
          courses={courses}
          defaultEnrollmentId={courseFilter}
          onCreate={onCreate}
          busy={busy}
        />
        <TaskImport
          courses={courses}
          enrollments={academic.activeEnrollments}
          onCreate={onImportCreate}
          aiDetector={aiDetector}
          onDone={(count) =>
            notify({
              kind: 'success',
              message: count === 1 ? 'Task added.' : `${count} tasks added.`,
            })
          }
          busy={busy}
        />
      </div>

      {tasks.status === 'error' && tasks.error !== null && (
        <p className="tasks-error" role="alert">
          {tasks.error.userMessage}{' '}
          <button type="button" className="tasks-retry" onClick={tasks.refresh}>
            Try again
          </button>
        </p>
      )}

      <GradeImpactPanel
        view={gradeView}
        courseLabel={courses.find((c) => c.value === courseFilter)?.label ?? 'This course'}
      />

      {/* The calendar is its own branch, not a variant of the list. Sharing the
          list's `nothingToShow` let a screen labelled Calendar render a LIST of
          undated tasks — which are precisely the ones a calendar cannot show. */}
      {view === 'calendar' && tasks.status !== 'loading' ? (
        calendarEvents.length > 0 ? (
          <TaskCalendarView events={calendarEvents} onExport={exportCalendar} />
        ) : (
          <div className="tasks-empty" data-testid="tasks-empty">
            <p className="tasks-empty-title">{empty.title}</p>
            <p className="tasks-empty-detail shell-muted">{empty.detail}</p>
          </div>
        )
      ) : nothingToShow && tasks.status !== 'loading' ? (
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
          {orderedOverdue.length > 0 && (
            <section className="tasks-group tasks-group-overdue">
              <h3 className="tasks-group-title">Overdue</h3>
              <ul className="tasks-list" data-testid="tasks-list">
                {orderedOverdue.map(renderRow)}
              </ul>
            </section>
          )}

          {ordered.length > 0 && (
            <section className="tasks-group">
              {orderedOverdue.length > 0 && <h3 className="tasks-group-title">Due today</h3>}
              <ul className="tasks-list" data-testid="tasks-list">
                {ordered.map(renderRow)}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

export default Component;
