// ── js/ui/tasksTab.js ─────────────────────────────────────────────────────────
// The legacy calculator's Tasks tab, phase 1 (#767): Today / Upcoming / All,
// add a task, complete and delete, filter by course, sort by priority. It is
// the legacy rendering of the shell's /tasks (TasksRoute, TaskRow,
// TaskComposer) on the same Worker API and the same sign-in, with the same
// markup classes so both are styled by the one set of rules in style.css.
// Phase 2 adds a task's details (why it ranks there, reminders, what it is
// worth) and the course grade picture (TaskDetails, TaskReminders,
// GradeImpactPanel). Calendar, digest and paste/AI import are later phases.
//
// Every interpolation goes through escHtml. Wiring is data-action throughout:
// the bundle's CSP blocks inline handlers.

import { registerAction } from '../core/dispatch.js';
import { escHtml } from '../core/helpers.js';
import { localInputToInstant } from '../core/localInstant.js';
import {
  COMMON_REMINDER_OFFSETS,
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  activeSemester,
  addReminder,
  assessmentsByTask,
  byPriority,
  createTask,
  deleteAssessment,
  deleteTask,
  fetchToday,
  fetchUpcoming,
  listAssessments,
  listEnrollments,
  listReminders,
  listSemesters,
  listTasks,
  putAssessment,
  reminderLabel,
  removeReminder,
  setTaskCompleted,
  tasksWorkerUrl,
} from '../core/tasksApi.js';
import { PRIORITY_BAND_LABELS, priorityBand, priorityReasons } from '../core/priorityExplainer.js';
import { gradeImpactView, paceText } from '../core/gradeImpactView.js';
import {
  PRIORITY_ORDER,
  TASK_VIEWS,
  courseLabel,
  courseOptions,
  dueLabel,
  emptyState,
  priorityClass,
  summarise,
  toneClass,
  typeLabel,
  workloadLabel,
} from '../core/taskView.js';

// Calendar is the one view that is not a list; it arrives in a later phase.
const _TASKS_LIST_VIEWS = TASK_VIEWS.filter((v) => v.key !== 'calendar');

const _tasks = {
  uid: null,           // whose data is loaded; a change of user discards it
  view: 'today',
  sortByPriority: false,
  courseFilter: '',
  status: 'idle',      // 'idle' | 'loading' | 'ready' | 'error'
  items: [],
  overdue: [],
  error: '',
  loadSeq: 0,          // guards against a slow response for a view left behind
  academic: { status: 'idle', active: null, enrollments: [] },
  composerOpen: false,
  draft: null,         // composer field values, kept across re-renders
  composerError: '',
  busy: false,
  // Phase 2: one task's details open at a time, as on the shell.
  assessments: new Map(), // taskId -> assessment
  openTaskId: null,
  reminders: { taskId: null, items: [], status: 'idle' },
  reminderCustomOpen: false,
  assessDraft: null,      // { taskId, weight, total, earned } across re-renders
  detailsError: { reminders: '', assessment: '' },
  detailsBusy: false,
};

function _tasksUid() {
  return typeof window._shohoj_currentUid === 'function' ? window._shohoj_currentUid() : null;
}

function _tasksAuthReady() {
  return typeof window._shohoj_isAuthReady !== 'function' || window._shohoj_isAuthReady();
}

function _tasksToast(message) {
  if (typeof window._shohoj_showToast === 'function') window._shohoj_showToast(message);
}

function _tasksPanelActive() {
  return !!document.getElementById('tabTasks')?.classList.contains('active');
}

// ── Loading ─────────────────────────────────────────────────────────────────

async function _loadTasks() {
  const seq = ++_tasks.loadSeq;
  _tasks.status = 'loading';
  _tasks.error = '';
  _renderTasksBody();

  let next;
  if (_tasks.view === 'today') {
    const r = await fetchToday();
    next = r.ok ? { items: r.value.dueToday, overdue: r.value.overdue } : r;
  } else if (_tasks.view === 'upcoming') {
    const r = await fetchUpcoming();
    next = r.ok ? { items: r.value, overdue: [] } : r;
  } else {
    const r = await listTasks();
    next = r.ok ? { items: r.value, overdue: [] } : r;
  }
  if (seq !== _tasks.loadSeq) return;

  if (next.ok === false) {
    _tasks.status = 'error';
    _tasks.error = next.error.userMessage;
    _tasks.items = [];
    _tasks.overdue = [];
  } else {
    _tasks.status = 'ready';
    _tasks.items = next.items;
    _tasks.overdue = next.overdue;
  }
  _renderTasksBody();
}

// Semester and courses are best-effort: they label rows and fill the course
// pickers, but the task list stands on its own if they fail.
async function _loadAcademic() {
  _tasks.academic = { status: 'loading', active: null, enrollments: [] };
  const [semesters, enrollments] = await Promise.all([listSemesters(), listEnrollments()]);
  if (!semesters.ok || !enrollments.ok) {
    _tasks.academic = { status: 'error', active: null, enrollments: [] };
  } else {
    const active = activeSemester(semesters.value);
    _tasks.academic = { status: 'ready', active, enrollments: enrollments.value };
  }
  _renderTasksBody();
}

// Assessments are listed once for every task, as the shell's useAssessments
// does: rows need them for the "why" wording, and a course filter needs them
// for the grade picture.
async function _loadAssessments() {
  const r = await listAssessments();
  _tasks.assessments = r.ok ? assessmentsByTask(r.value) : new Map();
  _renderTasksBody();
}

async function _loadReminders(taskId) {
  _tasks.reminders = { taskId, items: [], status: 'loading' };
  _renderTasksBody();
  const r = await listReminders(taskId);
  if (_tasks.openTaskId !== taskId) return;
  _tasks.reminders = { taskId, items: r.ok ? r.value : [], status: r.ok ? 'ready' : 'error' };
  if (!r.ok) _tasks.detailsError.reminders = r.error.userMessage;
  _renderTasksBody();
}

function _activeEnrollments() {
  const { active, enrollments } = _tasks.academic;
  return active ? enrollments.filter((e) => e.semesterId === active.id) : [];
}

// ── Rendering ───────────────────────────────────────────────────────────────

function _signedOutHTML() {
  return `
    <section class="tasks-route" data-testid="tasks-page">
      <h2 class="tasks-heading">Tasks</h2>
      <p class="tasks-signin" data-testid="tasks-signin">
        Sign in to keep your assignments, quizzes and deadlines in Shohoj.
      </p>
      <button type="button" class="tasks-add magnetic" data-action="tasks:signin">Sign in with Google</button>
    </section>`;
}

function _messageHTML(text, testid) {
  return `
    <section class="tasks-route" data-testid="tasks-page">
      <h2 class="tasks-heading">Tasks</h2>
      <p class="tasks-signin" data-testid="${testid}">${escHtml(text)}</p>
    </section>`;
}

function _rowHTML(task) {
  const done = task.status === 'COMPLETED';
  const course = courseLabel(task, _tasks.academic.enrollments);
  const workload = workloadLabel(task.estimatedMinutes);
  const tone = toneClass(task);
  const label = done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`;
  const expanded = _tasks.openTaskId === task.id;
  return `
    <li class="tasks-row ${done ? 'tasks-row-done' : ''} ${tone}" data-testid="tasks-row" data-task-id="${escHtml(task.id)}">
      <label class="tasks-check">
        <input type="checkbox" ${done ? 'checked' : ''} data-action="tasks:toggle" data-id="${escHtml(task.id)}" aria-label="${escHtml(label)}">
        <span class="tasks-check-box" aria-hidden="true"></span>
      </label>
      <div class="tasks-row-body">
        <p class="tasks-row-title">${escHtml(task.title)}</p>
        <p class="tasks-row-meta">
          ${course !== null ? `<span class="tasks-course">${escHtml(course)}</span>` : ''}
          <span class="tasks-type">${escHtml(typeLabel(task))}</span>
          <span class="tasks-due ${tone}">${escHtml(dueLabel(task))}</span>
          ${workload !== null ? `<span class="tasks-workload">${escHtml(workload)}</span>` : ''}
          <span class="tasks-priority ${priorityClass(task.priority)}">${escHtml(task.priority.toLowerCase())}</span>
        </p>
      </div>
      <button type="button" class="tasks-disclose" data-action="tasks:details" data-id="${escHtml(task.id)}" aria-expanded="${expanded}" aria-label="${escHtml(`${expanded ? 'Hide' : 'Show'} details for ${task.title}`)}">${expanded ? '▴' : '▾'}</button>
      <button type="button" class="tasks-delete" data-action="tasks:delete" data-id="${escHtml(task.id)}" aria-label="${escHtml(`Delete ${task.title}`)}" title="Delete">×</button>
      ${expanded ? _detailsHTML(task) : ''}
    </li>`;
}

// ── Details (TaskDetails / TaskReminders / AssessmentEditor on the shell) ───

function _whyHTML(task) {
  const assessment = _tasks.assessments.get(task.id) ?? null;
  const reasons = priorityReasons(task, { assessmentWeight: assessment?.weightPercent ?? null });
  if (reasons.length === 0) return '';
  const band = priorityBand(task.priorityScore);
  return `
    <section class="tasks-why">
      <h4 class="tasks-why-title">
        Why this is here
        ${band !== null ? `<span class="tasks-band tasks-band-${band}">${escHtml(PRIORITY_BAND_LABELS[band])}</span>` : ''}
      </h4>
      <ul class="tasks-why-list" data-testid="tasks-why-list">
        ${reasons.map((r) => `
          <li class="tasks-why-item">
            <span class="tasks-why-text">${escHtml(r.text)}</span>
            <span class="tasks-why-bar" aria-hidden="true" style="width: ${Math.round(r.share * 100)}%"></span>
          </li>`).join('')}
      </ul>
    </section>`;
}

function _remindersHTML(task) {
  const loaded = _tasks.reminders.taskId === task.id ? _tasks.reminders : { items: [], status: 'loading' };
  const set = new Set(loaded.items.map((r) => r.offsetMinutes));
  const busy = _tasks.detailsBusy || loaded.status === 'loading' ? 'disabled' : '';
  return `
    <section class="tasks-reminders" data-testid="tasks-reminders">
      <h4 class="tasks-why-title">Remind me</h4>
      ${task.dueAt === null ? `
        <p class="tasks-assessment-hint" data-testid="tasks-reminders-nodeadline">
          Reminders count back from the deadline. Add one and they will start working.
        </p>` : ''}
      <div class="tasks-reminder-offsets">
        ${COMMON_REMINDER_OFFSETS.map((o) => {
          const already = set.has(o.minutes);
          return `<button type="button" class="tasks-reminder-chip ${already ? 'is-set' : ''}" aria-pressed="${already}" data-action="tasks:reminderChip" data-minutes="${o.minutes}" ${busy}>${escHtml(o.label)}</button>`;
        }).join('')}
        ${_tasks.reminderCustomOpen ? '' : '<button type="button" class="tasks-reminder-more" data-action="tasks:reminderCustom">Custom…</button>'}
      </div>
      ${_tasks.reminderCustomOpen ? `
        <div class="tasks-composer-row">
          <label class="tasks-field tasks-field-narrow" for="tasksReminderMinutes">
            <span class="tasks-label">Minutes before</span>
            <input id="tasksReminderMinutes" class="tasks-input" type="number" min="0" step="5" data-enter-action="tasks:reminderAdd">
          </label>
          <button type="button" class="tasks-save magnetic" data-action="tasks:reminderAdd" ${busy}>Add</button>
        </div>` : ''}
      ${loaded.items.length > 0 ? `
        <ul class="tasks-reminder-list" data-testid="tasks-reminder-list">
          ${loaded.items.map((r) => `
            <li class="tasks-reminder-item">
              <span>${escHtml(reminderLabel(r))}</span>
              <button type="button" class="tasks-delete" data-action="tasks:reminderRemove" data-rid="${escHtml(r.id)}" aria-label="${escHtml(`Remove reminder ${reminderLabel(r)}`)}" ${busy}>×</button>
            </li>`).join('')}
        </ul>` : ''}
      ${_tasks.detailsError.reminders ? `<p class="tasks-error" role="alert">${escHtml(_tasks.detailsError.reminders)}</p>` : ''}
    </section>`;
}

function _assessmentHTML(task) {
  const saved = _tasks.assessments.get(task.id) ?? null;
  const d = _tasks.assessDraft?.taskId === task.id ? _tasks.assessDraft : {
    weight: saved === null ? '' : String(saved.weightPercent),
    total: saved === null ? '' : String(saved.totalMarks),
    earned: saved === null || saved.earnedMarks === null ? '' : String(saved.earnedMarks),
  };
  const busy = _tasks.detailsBusy ? 'disabled' : '';
  const field = (id, label, value, attrs) => `
    <label class="tasks-field tasks-field-narrow" for="${id}">
      <span class="tasks-label">${label}</span>
      <input id="${id}" class="tasks-input" type="number" step="any" ${attrs} value="${escHtml(value)}" data-enter-action="tasks:assessSave">
    </label>`;
  return `
    <div class="tasks-assessment" data-testid="tasks-assessment" data-task-id="${escHtml(task.id)}">
      <h4 class="tasks-why-title">What it is worth</h4>
      <div class="tasks-composer-row">
        ${field('tasksAssessWeight', '% of course', d.weight, 'min="0" max="100" placeholder="40"')}
        ${field('tasksAssessTotal', 'Out of', d.total, 'min="1" placeholder="40"')}
        ${field('tasksAssessEarned', 'You scored', d.earned, 'min="0" placeholder="—"')}
      </div>
      <p class="tasks-assessment-hint">Leave “You scored” blank until it is marked — blank is not the same as zero.</p>
      ${_tasks.detailsError.assessment ? `<p class="tasks-error" role="alert">${escHtml(_tasks.detailsError.assessment)}</p>` : ''}
      <div class="tasks-composer-actions">
        <button type="button" class="tasks-save magnetic" data-testid="tasks-assessment-save" data-action="tasks:assessSave" ${busy}>${_tasks.detailsBusy ? 'Saving…' : 'Save'}</button>
        ${saved !== null ? `<button type="button" class="tasks-cancel" data-action="tasks:assessRemove" ${busy}>Remove</button>` : ''}
      </div>
    </div>`;
}

function _detailsHTML(task) {
  return `
    <div class="tasks-details" data-testid="tasks-details">
      ${_whyHTML(task)}
      ${_remindersHTML(task)}
      ${_assessmentHTML(task)}
    </div>`;
}

// ── Grade picture for the filtered course (GradeImpactPanel on the shell) ────

function _gradeHTML(courses) {
  const filter = _tasks.courseFilter;
  if (filter === '') return '';
  const assessed = [..._tasks.items, ..._tasks.overdue]
    .filter((t) => t.enrollmentId === filter)
    .map((task) => ({ task, assessment: _tasks.assessments.get(task.id) }))
    .filter((e) => e.assessment !== undefined);
  if (assessed.length === 0) return '';
  const view = gradeImpactView(assessed);
  if (view === null) return '';
  const label = courses.find((c) => c.value === filter)?.label ?? 'This course';
  const pace = paceText(view);
  return `
    <section class="tasks-grade lg-panel lg-surface" data-testid="tasks-grade" aria-label="${escHtml(`${label} grade impact`)}">
      <div class="lg-shine"></div>
      <header class="tasks-grade-head">
        <h3 class="tasks-grade-title">${escHtml(label)}</h3>
        ${view.inHandPercent !== null ? `<span class="tasks-grade-inhand" data-testid="tasks-grade-inhand">${view.inHandPercent.toFixed(0)}% in hand</span>` : ''}
      </header>
      ${view.partial ? '<p class="tasks-grade-partial" data-testid="tasks-grade-partial">Based on the components you have entered, which do not add up to 100% of the course yet.</p>' : ''}
      <p class="tasks-grade-floor" data-testid="tasks-grade-floor">${escHtml(view.floorText)}</p>
      ${pace !== null ? `<p class="tasks-grade-pace">${escHtml(pace)}</p>` : ''}
      ${view.targets.length > 0 ? `
        <ul class="tasks-grade-targets" data-testid="tasks-grade-targets">
          ${view.targets.map((t) => `<li class="tasks-grade-target tasks-grade-${t.state}">${escHtml(t.text)}</li>`).join('')}
        </ul>` : ''}
    </section>`;
}

function _composerHTML(courses) {
  if (!_tasks.composerOpen) {
    return '<button type="button" class="tasks-add magnetic" data-testid="tasks-add" data-action="tasks:openComposer">+ Add a task</button>';
  }
  const d = _tasks.draft ?? {
    title: '', type: 'ASSIGNMENT', enrollmentId: _tasks.courseFilter, due: '', priority: 'MEDIUM', estimate: '',
  };
  const opt = (value, label, selected) =>
    `<option value="${escHtml(value)}"${value === selected ? ' selected' : ''}>${escHtml(label)}</option>`;
  return `
    <div class="tasks-composer" data-testid="tasks-composer">
      <div class="tasks-composer-row">
        <label class="tasks-field tasks-field-grow" for="tasksTitle">
          <span class="tasks-label">Task</span>
          <input id="tasksTitle" class="tasks-input" maxlength="200" placeholder="Assignment 2" value="${escHtml(d.title)}" data-enter-action="tasks:save">
        </label>
        <label class="tasks-field" for="tasksType">
          <span class="tasks-label">Type</span>
          <select id="tasksType" class="tasks-input">${TASK_TYPES.map((t) => opt(t, TASK_TYPE_LABELS[t], d.type)).join('')}</select>
        </label>
      </div>
      <div class="tasks-composer-row">
        <label class="tasks-field" for="tasksCourse">
          <span class="tasks-label">Course</span>
          <select id="tasksCourse" class="tasks-input">
            ${opt('', 'No course', d.enrollmentId)}
            ${courses.filter((c) => c.value !== '').map((c) => opt(c.value, c.label, d.enrollmentId)).join('')}
          </select>
        </label>
        <label class="tasks-field" for="tasksDue">
          <span class="tasks-label">Due</span>
          <input id="tasksDue" class="tasks-input" type="datetime-local" value="${escHtml(d.due)}">
        </label>
        <label class="tasks-field" for="tasksPriority">
          <span class="tasks-label">Priority</span>
          <select id="tasksPriority" class="tasks-input">${PRIORITY_ORDER.map((p) => opt(p, TASK_PRIORITY_LABELS[p], d.priority)).join('')}</select>
        </label>
        <label class="tasks-field tasks-field-narrow" for="tasksEstimate">
          <span class="tasks-label">Minutes</span>
          <input id="tasksEstimate" class="tasks-input" type="number" min="1" step="5" placeholder="90" value="${escHtml(d.estimate)}">
        </label>
      </div>
      ${_tasks.composerError ? `<p class="tasks-error" role="alert">${escHtml(_tasks.composerError)}</p>` : ''}
      <div class="tasks-composer-actions">
        <button type="button" class="tasks-save magnetic" data-testid="tasks-save" data-action="tasks:save" ${_tasks.busy ? 'disabled' : ''}>${_tasks.busy ? 'Adding…' : 'Add task'}</button>
        <button type="button" class="tasks-cancel" data-action="tasks:cancel">Cancel</button>
      </div>
    </div>`;
}

function _tasksMainHTML() {
  const courses = courseOptions(_activeEnrollments());
  const filter = _tasks.courseFilter;
  const pick = (list) => (filter === '' ? list : list.filter((t) => t.enrollmentId === filter));
  const sort = (list) => (_tasks.sortByPriority ? [...list].sort(byPriority) : list);
  const visible = sort(pick(_tasks.items));
  const overdue = sort(pick(_tasks.overdue));
  const summary = summarise([...overdue, ...visible]);
  const workload = workloadLabel(summary.workloadMinutes);
  const loading = _tasks.status === 'loading';

  const empty = emptyState({
    view: _tasks.view,
    hasActiveSemester: _tasks.academic.active !== null,
    enrollmentCount: _activeEnrollments().length,
    totalTasks: _tasks.items.length + _tasks.overdue.length,
    filtered: filter !== '',
  });

  let body;
  if (_tasks.status === 'error') {
    body = `
      <p class="tasks-error" role="alert" data-testid="tasks-error">
        ${escHtml(_tasks.error)}
        <button type="button" class="tasks-retry" data-action="tasks:retry">Try again</button>
      </p>`;
  } else if (loading && visible.length === 0 && overdue.length === 0) {
    body = '<p class="tasks-signin" aria-busy="true">Loading…</p>';
  } else if (visible.length === 0 && overdue.length === 0) {
    // The shell sends setup to its planner; here the Planner is a tab away.
    body = `
      <div class="tasks-empty" data-testid="tasks-empty">
        <p class="tasks-empty-title">${escHtml(empty.title)}</p>
        <p class="tasks-empty-detail">${escHtml(empty.detail)}</p>
        ${empty.needsSetup ? '<button type="button" class="tasks-empty-link" data-action="tasks:setup">Set up your semester</button>' : ''}
      </div>`;
  } else {
    body = `
      ${overdue.length > 0 ? `
        <section class="tasks-group tasks-group-overdue">
          <h3 class="tasks-group-title">Overdue</h3>
          <ul class="tasks-list" data-testid="tasks-list">${overdue.map(_rowHTML).join('')}</ul>
        </section>` : ''}
      ${visible.length > 0 ? `
        <section class="tasks-group">
          ${overdue.length > 0 ? '<h3 class="tasks-group-title">Due today</h3>' : ''}
          <ul class="tasks-list" data-testid="tasks-list">${visible.map(_rowHTML).join('')}</ul>
        </section>` : ''}`;
  }

  return `
    <section class="tasks-route" data-testid="tasks-page">
      <header class="tasks-head">
        <div>
          <h2 class="tasks-heading">Tasks</h2>
          ${_tasks.academic.active ? `<p class="tasks-semester">${escHtml(_tasks.academic.active.name)}</p>` : ''}
        </div>
        <p class="tasks-summary" data-testid="tasks-summary">
          <span class="tasks-summary-open">${summary.open} open</span>
          ${summary.overdue > 0 ? `<span class="tasks-summary-overdue">${summary.overdue} overdue</span>` : ''}
          ${workload !== null ? `<span class="tasks-summary-load">${escHtml(workload)} of work</span>` : ''}
        </p>
      </header>

      <div class="tasks-controls">
        <div class="tasks-views" role="tablist" aria-label="Task views">
          ${_TASKS_LIST_VIEWS.map((v) => `
            <button type="button" role="tab" aria-selected="${v.key === _tasks.view}" class="tasks-view ${v.key === _tasks.view ? 'is-active' : ''}" data-action="tasks:view" data-view="${v.key}">${escHtml(v.label)}</button>`).join('')}
        </div>
        <label class="tasks-sort">
          <input type="checkbox" ${_tasks.sortByPriority ? 'checked' : ''} data-action="tasks:sort">
          <span>Sort by priority</span>
        </label>
        ${courses.length > 1 ? `
          <label class="tasks-filter">
            <span class="tasks-label">Course</span>
            <select class="tasks-input" aria-label="Filter by course" data-action="tasks:course">
              ${courses.map((c) => `<option value="${escHtml(c.value)}"${c.value === filter ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('')}
            </select>
          </label>` : ''}
      </div>

      <div class="tasks-create" id="tasksCreate">${_composerHTML(courses)}</div>

      ${_tasks.status !== 'error' ? _gradeHTML(courses) : ''}

      <div id="tasksBody">${body}</div>
    </section>`;
}

// Keep what the student typed when a response lands mid-composition.
function _captureDraft() {
  // Only the form that belongs to the open task: while a different task's
  // details are opening, the previous form is still on screen.
  const form = document.querySelector('[data-testid="tasks-assessment"]');
  if (_tasks.openTaskId !== null && form?.dataset.taskId === _tasks.openTaskId) {
    _tasks.assessDraft = {
      taskId: _tasks.openTaskId,
      weight: document.getElementById('tasksAssessWeight').value,
      total: document.getElementById('tasksAssessTotal').value,
      earned: document.getElementById('tasksAssessEarned').value,
    };
  }
  if (!_tasks.composerOpen) return;
  const val = (id) => document.getElementById(id)?.value;
  if (document.getElementById('tasksTitle') === null) return;
  _tasks.draft = {
    title: val('tasksTitle') ?? '',
    type: val('tasksType') ?? 'ASSIGNMENT',
    enrollmentId: val('tasksCourse') ?? '',
    due: val('tasksDue') ?? '',
    priority: val('tasksPriority') ?? 'MEDIUM',
    estimate: val('tasksEstimate') ?? '',
  };
}

function _renderTasksBody() {
  const root = document.getElementById('tasksContent');
  if (!root) return;
  // A response that lands after sign-out, or after a switch of account, must
  // not paint the previous student's list; renderTasksTab owns that transition.
  if (_tasks.uid === null || _tasksUid() !== _tasks.uid) return;
  const focusedId = document.activeElement?.id;
  _captureDraft();
  // Every interpolation above is escaped (escHtml) or a number/enum we produced.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = _tasksMainHTML();
  if (focusedId) document.getElementById(focusedId)?.focus();
}

/** Entry point from switchCalcTab and the auth listener. */
export function renderTasksTab() {
  const root = document.getElementById('tasksContent');
  if (!root) return;

  if (!_tasksAuthReady()) {
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    root.innerHTML = _messageHTML('Loading…', 'tasks-loading');
    return;
  }
  const uid = _tasksUid();
  if (!uid) {
    _tasks.uid = null;
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    root.innerHTML = _signedOutHTML();
    return;
  }
  if (tasksWorkerUrl() === null) {
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    root.innerHTML = _messageHTML('Tasks needs the Shohoj backend, which this build is not configured for.', 'tasks-offline');
    return;
  }

  if (uid !== _tasks.uid) {
    // A different student: nothing of the previous one's may show.
    Object.assign(_tasks, {
      uid, status: 'idle', items: [], overdue: [], error: '', courseFilter: '',
      academic: { status: 'idle', active: null, enrollments: [] },
      composerOpen: false, draft: null, composerError: '',
      assessments: new Map(), openTaskId: null, reminders: { taskId: null, items: [], status: 'idle' },
      reminderCustomOpen: false, assessDraft: null, detailsError: { reminders: '', assessment: '' },
    });
  }
  _renderTasksBody();
  if (_tasks.academic.status === 'idle') _loadAcademic();
  // Opening the tab always re-reads: another device may have changed things.
  _loadTasks();
  _loadAssessments();
}

// ── Actions ─────────────────────────────────────────────────────────────────

registerAction('tasks:signin', () => window._shohoj_signIn?.());

registerAction('tasks:view', (el) => {
  const view = el.dataset.view;
  if (!_TASKS_LIST_VIEWS.some((v) => v.key === view) || view === _tasks.view) return;
  _tasks.view = view;
  _tasks.items = [];
  _tasks.overdue = [];
  _loadTasks();
});

// Checkboxes and selects fire click/input AND change, and dispatch.js hands
// every one of them to the same action; these act on `change` alone so a single
// tick is a single request.
registerAction('tasks:sort', (el, event) => {
  if (event?.type !== 'change') return;
  _tasks.sortByPriority = !!el.checked;
  _renderTasksBody();
});

registerAction('tasks:course', (el, event) => {
  if (event?.type !== 'change') return;
  _tasks.courseFilter = el.value;
  _renderTasksBody();
});

registerAction('tasks:retry', () => _loadTasks());

registerAction('tasks:setup', () => window.switchCalcTab?.('planner'));

registerAction('tasks:openComposer', () => {
  _tasks.composerOpen = true;
  _tasks.draft = null;
  _tasks.composerError = '';
  _renderTasksBody();
  document.getElementById('tasksTitle')?.focus();
});

registerAction('tasks:cancel', () => {
  _tasks.composerOpen = false;
  _tasks.draft = null;
  _tasks.composerError = '';
  _renderTasksBody();
});

registerAction('tasks:save', async (_el, event) => {
  event?.preventDefault?.();
  if (_tasks.busy) return;
  _captureDraft();
  const d = _tasks.draft;
  if (!d) return;

  const title = d.title.trim();
  if (title === '') {
    _tasks.composerError = 'Give the task a title.';
    _renderTasksBody();
    return;
  }
  const minutes = d.estimate.trim() === '' ? null : Number(d.estimate);
  if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) {
    _tasks.composerError = 'Estimate should be a whole number of minutes.';
    _renderTasksBody();
    return;
  }

  _tasks.busy = true;
  _tasks.composerError = '';
  _renderTasksBody();
  const result = await createTask({
    title,
    type: d.type,
    priority: d.priority,
    enrollmentId: d.enrollmentId === '' ? null : d.enrollmentId,
    dueAt: localInputToInstant(d.due),
    estimatedMinutes: minutes,
  });
  _tasks.busy = false;
  if (!result.ok) {
    _tasks.composerError = result.error.userMessage;
    _renderTasksBody();
    return;
  }
  _tasks.composerOpen = false;
  _tasks.draft = null;
  _tasksToast('Task added.');
  _loadTasks();
});

registerAction('tasks:toggle', async (el, event) => {
  if (event?.type !== 'change') return;
  const id = el.dataset.id;
  const completed = !!el.checked;
  // Tick at once; the refresh that follows is the source of truth.
  const status = completed ? 'COMPLETED' : 'TODO';
  const flip = (list) => list.map((t) => (t.id === id ? { ...t, status } : t));
  _tasks.items = flip(_tasks.items);
  _tasks.overdue = flip(_tasks.overdue);
  _renderTasksBody();
  const result = await setTaskCompleted(id, completed);
  if (!result.ok) _tasksToast(result.error.userMessage);
  _loadTasks();
});

registerAction('tasks:delete', async (el) => {
  const id = el.dataset.id;
  const task = [..._tasks.items, ..._tasks.overdue].find((t) => t.id === id);
  if (!task) return;
  if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
  const result = await deleteTask(id);
  if (!result.ok) {
    _tasksToast(result.error.userMessage);
    return;
  }
  _loadTasks();
});

// ── Details actions ─────────────────────────────────────────────────────────

registerAction('tasks:details', (el) => {
  const id = el.dataset.id;
  const opening = _tasks.openTaskId !== id;
  _tasks.openTaskId = opening ? id : null;
  _tasks.reminderCustomOpen = false;
  _tasks.assessDraft = null;
  _tasks.detailsError = { reminders: '', assessment: '' };
  if (opening) _loadReminders(id);
  else _renderTasksBody();
});

async function _reminderChange(work) {
  const taskId = _tasks.openTaskId;
  if (taskId === null || _tasks.detailsBusy) return;
  _tasks.detailsBusy = true;
  _tasks.detailsError.reminders = '';
  _renderTasksBody();
  const failure = await work(taskId);
  _tasks.detailsBusy = false;
  if (failure) {
    _tasks.detailsError.reminders = failure;
    _renderTasksBody();
    return true;
  }
  await _loadReminders(taskId);
  return false;
}

registerAction('tasks:reminderChip', (el) => {
  const minutes = Number(el.dataset.minutes);
  // The chip IS the setting: tapping a set one removes it.
  _reminderChange(async (taskId) => {
    const existing = _tasks.reminders.items.find((r) => r.offsetMinutes === minutes);
    const r = existing ? await removeReminder(taskId, existing.id) : await addReminder(taskId, { offsetMinutes: minutes });
    return r.ok ? '' : r.error.userMessage;
  });
});

registerAction('tasks:reminderCustom', () => {
  _tasks.reminderCustomOpen = true;
  _renderTasksBody();
  document.getElementById('tasksReminderMinutes')?.focus();
});

registerAction('tasks:reminderAdd', (_el, event) => {
  event?.preventDefault?.();
  const raw = document.getElementById('tasksReminderMinutes')?.value ?? '';
  const minutes = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(minutes) || minutes < 0) {
    _tasks.detailsError.reminders = 'Give a whole number of minutes.';
    _renderTasksBody();
    return;
  }
  _reminderChange(async (taskId) => {
    const r = await addReminder(taskId, { offsetMinutes: minutes });
    if (r.ok) _tasks.reminderCustomOpen = false;
    return r.ok ? '' : r.error.userMessage;
  });
});

registerAction('tasks:reminderRemove', (el) => {
  const rid = el.dataset.rid;
  _reminderChange(async (taskId) => {
    const r = await removeReminder(taskId, rid);
    return r.ok ? '' : r.error.userMessage;
  });
});

async function _assessmentChange(work) {
  const taskId = _tasks.openTaskId;
  if (taskId === null || _tasks.detailsBusy) return;
  _tasks.detailsBusy = true;
  _tasks.detailsError.assessment = '';
  _renderTasksBody();
  const failure = await work(taskId);
  _tasks.detailsBusy = false;
  if (failure) {
    _tasks.detailsError.assessment = failure;
    _renderTasksBody();
    return;
  }
  _tasks.assessDraft = null;
  // What a task is worth feeds its priority score, so the list re-reads too.
  await _loadAssessments();
  _loadTasks();
}

registerAction('tasks:assessSave', (_el, event) => {
  event?.preventDefault?.();
  _captureDraft();
  const d = _tasks.assessDraft;
  if (!d) return;
  const weightPercent = Number(d.weight);
  const totalMarks = Number(d.total);
  let problem = '';
  if (!Number.isFinite(weightPercent) || d.weight.trim() === '') problem = 'How much of the course is this worth?';
  else if (!Number.isFinite(totalMarks) || d.total.trim() === '' || totalMarks <= 0) problem = 'What is it marked out of?';
  const earnedMarks = d.earned.trim() === '' ? null : Number(d.earned);
  if (!problem && earnedMarks !== null && !Number.isFinite(earnedMarks)) {
    problem = 'Marks earned should be a number, or blank if it is not marked yet.';
  }
  if (problem) {
    _tasks.detailsError.assessment = problem;
    _renderTasksBody();
    return;
  }
  _assessmentChange(async (taskId) => {
    const r = await putAssessment(taskId, { totalMarks, weightPercent, earnedMarks });
    return r.ok ? '' : r.error.userMessage;
  });
});

registerAction('tasks:assessRemove', () => {
  _assessmentChange(async (taskId) => {
    const r = await deleteAssessment(taskId);
    return r.ok ? '' : r.error.userMessage;
  });
});

// Sign-in, sign-out and a switch of account all re-render an open tab.
if (typeof window !== 'undefined') {
  window.addEventListener('shohoj:auth-changed', () => {
    if (_tasksPanelActive()) renderTasksTab();
  });
}
