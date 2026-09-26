// ── js/core/tasksApi.js ───────────────────────────────────────────────────────
// The legacy page's client for Shohoj Tasks (#767): the same Worker endpoints
// (/api/v1/tasks, /api/v1/semesters, /api/v1/enrollments) the shell reaches
// through src/platform/api/tasks.ts and academic.ts.
//
// Not a twin — the shell's module is built on zod and its ApiClient, neither of
// which the legacy bundle carries. The rules are the same ones, though:
//   - a response is untrusted until its shape is checked, and a response that
//     fails the check is an error rather than a partly-rendered list;
//   - unknown enum values are refused;
//   - every call carries a fresh ID token, and none is sent without one;
//   - every call times out, so a hung Worker shows an error instead of a
//     skeleton that never resolves (the routine tab's #764 lesson).
// The pure helpers at the top (isOpen, dueTone, byPriority) are pinned to the
// shell's by tests/legacyTasksApi.test.js.
//
// Every call resolves to { ok: true, value } or { ok: false, error }, where
// error.userMessage is safe to show.

export const TASK_TYPES = ['ASSIGNMENT', 'QUIZ', 'EXAM', 'PROJECT', 'LAB', 'READING', 'PERSONAL', 'OTHER'];
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const TASK_TYPE_LABELS = {
  ASSIGNMENT: 'Assignment',
  QUIZ: 'Quiz',
  EXAM: 'Exam',
  PROJECT: 'Project',
  LAB: 'Lab',
  READING: 'Reading',
  PERSONAL: 'Personal',
  OTHER: 'Other',
};

export const TASK_PRIORITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// ── Pure helpers (mirrors of src/platform/api/tasks.ts) ─────────────────────

export function isOpen(task) {
  return task.status === 'TODO' || task.status === 'IN_PROGRESS';
}

/** Where a deadline falls against the student's local calendar. */
export function dueTone(task, now = new Date()) {
  if (task.dueAt === null) return 'none';
  const due = Date.parse(task.dueAt);
  if (Number.isNaN(due)) return 'none';

  const startOfLocalDay = (offsetDays) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.getTime();
  };

  if (due < startOfLocalDay(0)) return 'overdue';
  if (due < startOfLocalDay(1)) return 'today';
  if (due < startOfLocalDay(2)) return 'tomorrow';
  if (due < startOfLocalDay(7)) return 'soon';
  return 'later';
}

/** Highest automatic score first; then earliest deadline; then id, for stability. */
export function byPriority(a, b) {
  const aScore = a.priorityScore ?? -1;
  const bScore = b.priorityScore ?? -1;
  if (aScore !== bScore) return bScore - aScore;
  const aDue = a.dueAt ?? '\uffff';
  const bDue = b.dueAt ?? '\uffff';
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.id.localeCompare(b.id);
}

// ── Response checks ─────────────────────────────────────────────────────────

const _TASK_ID_RE = /^tsk_[0-9a-f]{32}$/;

function _isStringOrNull(v) {
  return v === null || typeof v === 'string';
}

// Fields the shell's TaskSchema requires. Unknown fields are dropped, as there.
function _readTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !_TASK_ID_RE.test(raw.id)) return null;
  if (typeof raw.title !== 'string') return null;
  if (!TASK_TYPES.includes(raw.type)) return null;
  if (!TASK_STATUSES.includes(raw.status)) return null;
  if (!TASK_PRIORITIES.includes(raw.priority)) return null;
  for (const key of ['enrollmentId', 'description', 'dueAt', 'startAt', 'completedAt']) {
    if (!_isStringOrNull(raw[key])) return null;
  }
  if (raw.priorityScore !== null && typeof raw.priorityScore !== 'number') return null;
  if (raw.estimatedMinutes !== null && !Number.isInteger(raw.estimatedMinutes)) return null;
  return {
    id: raw.id,
    enrollmentId: raw.enrollmentId,
    title: raw.title,
    description: raw.description,
    type: raw.type,
    status: raw.status,
    priority: raw.priority,
    priorityScore: raw.priorityScore,
    dueAt: raw.dueAt,
    startAt: raw.startAt,
    estimatedMinutes: raw.estimatedMinutes,
    completedAt: raw.completedAt,
  };
}

function _readSemester(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.status !== 'string') return null;
  return { id: raw.id, name: raw.name, status: raw.status };
}

function _readEnrollment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.semesterId !== 'string') return null;
  if (typeof raw.courseCode !== 'string' || typeof raw.status !== 'string') return null;
  if (!_isStringOrNull(raw.section)) return null;
  return {
    id: raw.id,
    semesterId: raw.semesterId,
    courseCode: raw.courseCode,
    section: raw.section,
    status: raw.status,
  };
}

/** Every item must pass, or the whole list is refused — as the shell does. */
function _readList(items, readItem) {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (const item of items) {
    const read = readItem(item);
    if (read === null) return null;
    out.push(read);
  }
  return out;
}

// ── Transport ───────────────────────────────────────────────────────────────

const _TASKS_TIMEOUT_MS = 15_000;
const _TASKS_API_PREFIX = '/api/v1';

const _MALFORMED = 'Shohoj sent back something unexpected. Please try again.';

function _genericMessageFor(status) {
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item couldn't be found.";
  if (status === 429) return "You're doing that too quickly. Please wait a moment.";
  if (status >= 500) return 'Shohoj is having trouble right now. Please try again shortly.';
  return 'That request could not be completed.';
}

function _fail(userMessage) {
  return { ok: false, error: { userMessage } };
}

/** The Worker base URL, from the runtime config, or null when unconfigured. */
export function tasksWorkerUrl(scope = typeof window !== 'undefined' ? window : undefined) {
  const url = scope?._shohoj_papers_worker_url;
  return typeof url === 'string' && url.startsWith('http') ? url.replace(/\/+$/, '') : null;
}

/** The viewer's IANA timezone; Today and Upcoming are questions about it. */
export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * One authenticated call. `deps` is injectable for tests: { baseUrl, getIdToken, fetchFn }.
 */
async function _call(method, path, { body, query, read } = {}, deps = {}) {
  const baseUrl = deps.baseUrl ?? tasksWorkerUrl();
  if (baseUrl === null) return _fail('Tasks needs the Shohoj backend, which this build is not configured for.');

  const getIdToken = deps.getIdToken
    ?? (() => (typeof window !== 'undefined' && typeof window._shohoj_idToken === 'function'
      ? window._shohoj_idToken()
      : Promise.resolve(null)));
  let token;
  try { token = await getIdToken(); } catch { token = null; }
  if (typeof token !== 'string' || token === '') return _fail('Please sign in to continue.');

  let url = `${baseUrl}${_TASKS_API_PREFIX}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = controller ? setTimeout(() => controller.abort(), deps.timeoutMs ?? _TASKS_TIMEOUT_MS) : null;

  const fetchFn = deps.fetchFn ?? fetch;
  let response;
  try {
    response = await fetchFn(url, init);
  } catch (cause) {
    if (timer) clearTimeout(timer);
    const aborted = cause && cause.name === 'AbortError';
    return _fail(aborted
      ? 'That took too long. Check your connection and try again.'
      : "Couldn't reach the server. Please try again in a moment.");
  }

  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (timer) clearTimeout(timer);

  if (!response.ok) {
    // The Worker's error envelope carries a message written for students.
    const message = payload?.error?.message;
    return _fail(typeof message === 'string' && message ? message : _genericMessageFor(response.status));
  }
  const value = read(payload);
  return value === null ? _fail(_MALFORMED) : { ok: true, value };
}

// ── Endpoints ───────────────────────────────────────────────────────────────

const _readTaskList = (p) => _readList(p?.items, _readTask);
const _readOneTask = (p) => _readTask(p?.task);

export function listTasks(deps) {
  return _call('GET', '/tasks', { read: _readTaskList }, deps);
}

export function fetchToday(deps) {
  return _call('GET', '/tasks/today', {
    query: { tz: viewerTimeZone() },
    read: (p) => {
      const overdue = _readList(p?.overdue, _readTask);
      const dueToday = _readList(p?.dueToday, _readTask);
      return overdue && dueToday ? { overdue, dueToday } : null;
    },
  }, deps);
}

export function fetchUpcoming(deps) {
  return _call('GET', '/tasks/upcoming', { query: { tz: viewerTimeZone() }, read: _readTaskList }, deps);
}

export function createTask(input, deps) {
  return _call('POST', '/tasks', { body: input, read: _readOneTask }, deps);
}

export function setTaskCompleted(id, completed, deps) {
  return _call('PUT', `/tasks/${encodeURIComponent(id)}/completion`, {
    body: { completed },
    read: _readOneTask,
  }, deps);
}

export function deleteTask(id, deps) {
  return _call('DELETE', `/tasks/${encodeURIComponent(id)}`, {
    read: (p) => (typeof p?.deleted?.id === 'string' ? { id: p.deleted.id } : null),
  }, deps);
}

export function listSemesters(deps) {
  return _call('GET', '/semesters', { read: (p) => _readList(p?.items, _readSemester) }, deps);
}

export function listEnrollments(deps) {
  return _call('GET', '/enrollments', { read: (p) => _readList(p?.items, _readEnrollment) }, deps);
}

/** The student's active semester, or null. The list arrives newest-first. */
export function activeSemester(semesters) {
  return semesters.find((s) => s.status === 'ACTIVE') ?? null;
}
