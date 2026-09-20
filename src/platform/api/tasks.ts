// src/platform/api/tasks.ts
//
// The frontend half of Shohoj Tasks' contract (#715).
//
// Same rules as the rest of src/platform/api: every response is `unknown` until
// a schema accepts it, ids are matched rather than trusted, unknown enum values
// are refused, and an unknown FIELD is ignored rather than rejected, so a
// server that grows a field does not break a client that shipped yesterday.
// Ignored means stripped: a field not named below is invisible to the app
// until somebody adds it here.
//
// The one thing specific to this module is the timezone. Today and Upcoming are
// questions about the student's local calendar, and the browser is the only
// party that knows which calendar that is — so it is attached here, once,
// rather than left to each caller to remember.

import type { ShohojError } from '../../core/errors.ts';
import type { Result } from '../../core/result.ts';
import { z } from '../../shared/validation/schema.ts';
import type { ApiClient, ApiRequestOptions } from './apiClient.ts';

// ── Enums ───────────────────────────────────────────────────────────────────
// Mirrors of worker/taskTime.js. Duplicated rather than imported: the Worker is
// a separate package for another runtime. The schemas enforce agreement at
// runtime, and the integration test enforces it at build time.

export const TASK_TYPES = [
  'ASSIGNMENT',
  'QUIZ',
  'EXAM',
  'PROJECT',
  'LAB',
  'READING',
  'PERSONAL',
  'OTHER',
] as const;

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const TASK_SOURCES = ['MANUAL', 'GMAIL', 'CALENDAR', 'AI_SUGGESTION'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];

/** Human labels, kept beside the enum so two screens cannot disagree. */
export const TASK_TYPE_LABELS: Readonly<Record<TaskType, string>> = {
  ASSIGNMENT: 'Assignment',
  QUIZ: 'Quiz',
  EXAM: 'Exam',
  PROJECT: 'Project',
  LAB: 'Lab',
  READING: 'Reading',
  PERSONAL: 'Personal',
  OTHER: 'Other',
};

export const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// ── Schema ──────────────────────────────────────────────────────────────────

const TaskIdSchema = z.string().regex(/^tsk_[0-9a-f]{32}$/, 'malformed task id');

export const TaskSchema = z.object({
  id: TaskIdSchema,
  /** Null for PERSONAL tasks and anything else not tied to a course. */
  enrollmentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  /** Reserved for the Phase 5 scoring engine; null until then. */
  priorityScore: z.number().nullable(),
  /** ISO 8601 UTC. Null is valid — a reading with no deadline is still a task. */
  dueAt: z.string().nullable(),
  startAt: z.string().nullable(),
  estimatedMinutes: z.number().int().nullable(),
  source: z.enum(TASK_SOURCES),
  sourceReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

const TaskListSchema = z.object({ items: z.array(TaskSchema) });
const TaskResponseSchema = z.object({ task: TaskSchema });
const TodaySchema = z.object({
  overdue: z.array(TaskSchema),
  dueToday: z.array(TaskSchema),
});
const UpcomingSchema = z.object({
  days: z.number().int(),
  items: z.array(TaskSchema),
});
const DeletedSchema = z.object({ deleted: z.object({ id: z.string() }) });

// ── Request shapes ──────────────────────────────────────────────────────────

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly type?: TaskType;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly enrollmentId?: string | null;
  /** ISO 8601 **with an offset**. A bare local time is refused by the server. */
  readonly dueAt?: string | null;
  readonly startAt?: string | null;
  readonly estimatedMinutes?: number | null;
  readonly source?: TaskSource;
  readonly sourceReference?: string | null;
}

export type UpdateTaskInput = Omit<CreateTaskInput, 'title' | 'source' | 'sourceReference'> & {
  readonly title?: string;
};

// ── Timezone ────────────────────────────────────────────────────────────────

/**
 * The viewer's IANA timezone, e.g. `Asia/Dhaka`.
 *
 * Falls back to UTC only when the browser cannot say — which in practice means
 * a very old engine or a locked-down environment. The fallback is a last resort
 * rather than a default: the server requires the field, and answering "UTC"
 * when the student is in Dhaka puts their whole evening on tomorrow.
 */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────

type Call<T> = Promise<Result<T, ShohojError>>;

function unwrap<T, K extends string>(
  response: Result<Record<K, T>, ShohojError>,
  key: K,
): Result<T, ShohojError> {
  return response.ok ? { ok: true, value: response.value[key] } : response;
}

export interface TaskFilter {
  readonly enrollmentId?: string;
  readonly status?: TaskStatus;
}

export function listTasks(
  client: ApiClient,
  filter: TaskFilter = {},
  options?: ApiRequestOptions,
): Call<Task[]> {
  const query: Record<string, string> = {};
  if (filter.enrollmentId !== undefined) query['enrollmentId'] = filter.enrollmentId;
  if (filter.status !== undefined) query['status'] = filter.status;
  return client
    .get('/tasks', TaskListSchema, { ...options, query: { ...options?.query, ...query } })
    .then((response) => unwrap(response, 'items'));
}

export function createTask(
  client: ApiClient,
  input: CreateTaskInput,
  options?: ApiRequestOptions,
): Call<Task> {
  return client
    .post('/tasks', input, TaskResponseSchema, options)
    .then((response) => unwrap(response, 'task'));
}

export function updateTask(
  client: ApiClient,
  id: string,
  input: UpdateTaskInput,
  options?: ApiRequestOptions,
): Call<Task> {
  return client
    .patch(`/tasks/${encodeURIComponent(id)}`, input, TaskResponseSchema, options)
    .then((response) => unwrap(response, 'task'));
}

/**
 * Tick or untick a task.
 *
 * Its own call rather than an `updateTask({ status })`, mirroring the endpoint:
 * this is the most common write in the product and the one most worth being
 * unable to get wrong.
 */
export function setTaskCompleted(
  client: ApiClient,
  id: string,
  completed: boolean,
  options?: ApiRequestOptions,
): Call<Task> {
  return client
    .put(`/tasks/${encodeURIComponent(id)}/completion`, { completed }, TaskResponseSchema, options)
    .then((response) => unwrap(response, 'task'));
}

export function deleteTask(
  client: ApiClient,
  id: string,
  options?: ApiRequestOptions,
): Call<{ id: string }> {
  return client
    .delete(`/tasks/${encodeURIComponent(id)}`, DeletedSchema, options)
    .then((response) => unwrap(response, 'deleted'));
}

export interface TodayTasks {
  readonly overdue: readonly Task[];
  readonly dueToday: readonly Task[];
}

/** Today's work plus everything already overdue, for the viewer's calendar. */
export function fetchToday(client: ApiClient, options?: ApiRequestOptions): Call<TodayTasks> {
  return client.get('/tasks/today', TodaySchema, {
    ...options,
    query: { ...options?.query, tz: viewerTimeZone() },
  });
}

export interface UpcomingTasks {
  readonly days: number;
  readonly items: readonly Task[];
}

/** The next `days` days, starting tomorrow. */
export function fetchUpcoming(
  client: ApiClient,
  days?: number,
  options?: ApiRequestOptions,
): Call<UpcomingTasks> {
  const query: Record<string, string | number> = { tz: viewerTimeZone() };
  if (days !== undefined) query['days'] = days;
  return client.get('/tasks/upcoming', UpcomingSchema, {
    ...options,
    query: { ...options?.query, ...query },
  });
}

// ── Derived views ───────────────────────────────────────────────────────────

/** True when a task is still work: not finished, not abandoned. */
export function isOpen(task: Task): boolean {
  return task.status === 'TODO' || task.status === 'IN_PROGRESS';
}

/**
 * How a due date reads relative to now, in the viewer's own calendar.
 *
 * Returned as a token rather than a formatted string so the caller picks the
 * wording and the styling; the arithmetic is the part worth having in one place.
 */
export type DueTone = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later' | 'none';

export function dueTone(task: Task, now: Date = new Date()): DueTone {
  if (task.dueAt === null) return 'none';
  const due = Date.parse(task.dueAt);
  if (Number.isNaN(due)) return 'none';

  const startOfLocalDay = (offsetDays: number) => {
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

/** Total estimated minutes of open work. Tasks with no estimate contribute nothing. */
export function estimatedWorkload(items: readonly Task[]): number {
  return items.filter(isOpen).reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0);
}

/** Group tasks by course, for the per-course view. Unattached tasks key on null. */
export function groupByEnrollment(items: readonly Task[]): Map<string | null, Task[]> {
  const groups = new Map<string | null, Task[]>();
  for (const task of items) {
    const key = task.enrollmentId;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [task]);
    else bucket.push(task);
  }
  return groups;
}
