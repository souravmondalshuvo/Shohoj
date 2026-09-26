// ── js/ui/tasksTab.js ─────────────────────────────────────────────────────────
// The legacy calculator's Tasks tab, phase 1 (#767): Today / Upcoming / All,
// add a task, complete and delete, filter by course, sort by priority. It is
// the legacy rendering of the shell's /tasks (TasksRoute, TaskRow,
// TaskComposer) on the same Worker API and the same sign-in, with the same
// markup classes so both are styled by the one set of rules in style.css.
// Calendar, digest, reminders, paste/AI import and grade impact are later
// phases.
//
// Every interpolation goes through escHtml. Wiring is data-action throughout:
// the bundle's CSP blocks inline handlers.

import { registerAction } from '../core/dispatch.js';
import { escHtml } from '../core/helpers.js';
import { localInputToInstant } from '../core/localInstant.js';
import {
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  activeSemester,
  byPriority,
  createTask,
  deleteTask,
  fetchToday,
  fetchUpcoming,
  listEnrollments,
  listSemesters,
  listTasks,
  setTaskCompleted,
  tasksWorkerUrl,
} from '../core/tasksApi.js';
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
      <button type="button" class="tasks-delete" data-action="tasks:delete" data-id="${escHtml(task.id)}" aria-label="${escHtml(`Delete ${task.title}`)}" title="Delete">×</button>
    </li>`;
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

      <div id="tasksBody">${body}</div>
    </section>`;
}

// Keep what the student typed when a response lands mid-composition.
function _captureDraft() {
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
    });
  }
  _renderTasksBody();
  if (_tasks.academic.status === 'idle') _loadAcademic();
  // Opening the tab always re-reads: another device may have changed things.
  _loadTasks();
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

// Sign-in, sign-out and a switch of account all re-render an open tab.
if (typeof window !== 'undefined') {
  window.addEventListener('shohoj:auth-changed', () => {
    if (_tasksPanelActive()) renderTasksTab();
  });
}
