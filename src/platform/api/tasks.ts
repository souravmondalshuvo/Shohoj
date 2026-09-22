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
export const TASK_SOURCES = ['MANUAL', 'PASTE', 'GMAIL', 'CALENDAR', 'AI_SUGGESTION'] as const;

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

/** One axis of the automatic priority score. Mirrors worker/priority.js. */
export const PriorityFactorSchema = z.object({
  name: z.enum(['urgency', 'weight', 'workload', 'importance']),
  /** Normalised 0-1, so the axes are comparable. */
  value: z.number(),
  /** The configured weight applied to it. */
  weight: z.number(),
  /** Points contributed, out of 100. The four sum to `priorityScore`. */
  points: z.number(),
});

export type PriorityFactor = z.infer<typeof PriorityFactorSchema>;

/** Human labels for the factors, kept beside the schema so screens agree. */
export const PRIORITY_FACTOR_LABELS: Readonly<Record<PriorityFactor['name'], string>> = {
  urgency: 'Due soon',
  weight: 'Counts for a lot',
  workload: 'Takes a while',
  importance: 'You marked it',
};

// ── Assessments ─────────────────────────────────────────────────────────────

export const AssessmentSchema = z.object({
  taskId: TaskIdSchema,
  totalMarks: z.number(),
  /**
   * Null means NOT MARKED YET, which is not the same as zero.
   *
   * Every projection built on an assessment depends on the distinction, and the
   * two are a keystroke apart — so it is spelled out here as well as on the
   * server.
   */
  earnedMarks: z.number().nullable(),
  weightPercent: z.number(),
  syllabus: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Assessment = z.infer<typeof AssessmentSchema>;

export interface AssessmentInput {
  readonly totalMarks: number;
  readonly weightPercent: number;
  readonly earnedMarks?: number | null;
  readonly syllabus?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export const TaskSchema = z.object({
  id: TaskIdSchema,
  /** Null for PERSONAL tasks and anything else not tied to a course. */
  enrollmentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  /**
   * The automatic score (#721), 0-100, computed server-side on read.
   *
   * Rides ALONGSIDE `priority` rather than replacing it: the student's own pick
   * is an input to the score and is never overwritten. Nullable because a
   * backend that has not shipped the engine still answers this shape.
   */
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
  /**
   * Why the task scored what it did — one entry per factor, with the
   * normalised value, the weight applied and the points contributed.
   *
   * Optional rather than required so an older backend still validates. It
   * exists because a ranking a student cannot interrogate is a ranking they
   * will not trust, and the UI shows it.
   */
  priorityFactors: z.array(PriorityFactorSchema).optional(),
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

const AssessmentResponseSchema = z.object({ assessment: AssessmentSchema });
const AssessmentListSchema = z.object({ items: z.array(AssessmentSchema) });
const DeletedAssessmentSchema = z.object({ deleted: z.object({ taskId: z.string() }) });

/**
 * Every assessment the student has, keyed by task id at the call site.
 *
 * One call rather than one per task: a grade panel over a five-task course
 * would otherwise cost five requests for data the server keeps in a single
 * collection.
 */
export function listAssessments(
  client: ApiClient,
  options?: ApiRequestOptions,
): Call<Assessment[]> {
  return client
    .get('/assessments', AssessmentListSchema, options)
    .then((response) => unwrap(response, 'items'));
}

/** The task's assessment, or a not-found error when it has none. */
export function fetchAssessment(
  client: ApiClient,
  taskId: string,
  options?: ApiRequestOptions,
): Call<Assessment> {
  return client
    .get(`/tasks/${encodeURIComponent(taskId)}/assessment`, AssessmentResponseSchema, options)
    .then((response) => unwrap(response, 'assessment'));
}

/**
 * Create or replace the task's assessment.
 *
 * PUT, and a replacement rather than a merge: there is one slot per task, and
 * writing to it twice must leave one assessment, not two. Omitting a field
 * clears it.
 */
export function putAssessment(
  client: ApiClient,
  taskId: string,
  input: AssessmentInput,
  options?: ApiRequestOptions,
): Call<Assessment> {
  return client
    .put(
      `/tasks/${encodeURIComponent(taskId)}/assessment`,
      input,
      AssessmentResponseSchema,
      options,
    )
    .then((response) => unwrap(response, 'assessment'));
}

export function deleteAssessment(
  client: ApiClient,
  taskId: string,
  options?: ApiRequestOptions,
): Call<{ taskId: string }> {
  return client
    .delete(`/tasks/${encodeURIComponent(taskId)}/assessment`, DeletedAssessmentSchema, options)
    .then((response) => unwrap(response, 'deleted'));
}

// ── Reminders (#727) ────────────────────────────────────────────────────────

export const REMINDER_CHANNELS = ['WEB', 'EMAIL', 'PUSH'] as const;
export const REMINDER_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;

export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/**
 * The offsets the UI offers, mirroring COMMON_OFFSETS in worker/reminders.js.
 * A menu, not a limit — any whole number of minutes is accepted.
 */
export const COMMON_REMINDER_OFFSETS: readonly { minutes: number; label: string }[] = [
  { minutes: 24 * 60, label: 'A day before' },
  { minutes: 3 * 60, label: 'Three hours before' },
  { minutes: 30, label: 'Thirty minutes before' },
];

export const ReminderSchema = z.object({
  id: z.string().regex(/^rem_[0-9a-f]{32}$/, 'malformed reminder id'),
  taskId: TaskIdSchema,
  /** Minutes before the deadline. The thing of record — see worker/reminders.js. */
  offsetMinutes: z.number().int(),
  channel: z.enum(REMINDER_CHANNELS),
  /**
   * When it fires, derived from the task's deadline. Null when the task has no
   * deadline yet — the reminder simply waits rather than being refused.
   */
  scheduledFor: z.string().nullable(),
  status: z.enum(REMINDER_STATUSES),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Reminder = z.infer<typeof ReminderSchema>;

const ReminderListSchema = z.object({ items: z.array(ReminderSchema) });
const ReminderResponseSchema = z.object({ reminder: ReminderSchema });

export function listReminders(
  client: ApiClient,
  taskId: string,
  options?: ApiRequestOptions,
): Call<Reminder[]> {
  return client
    .get(`/tasks/${encodeURIComponent(taskId)}/reminders`, ReminderListSchema, options)
    .then((response) => unwrap(response, 'items'));
}

/** Add a reminder. Idempotent: the same offset and channel twice is one reminder. */
export function addReminder(
  client: ApiClient,
  taskId: string,
  input: { offsetMinutes: number; channel?: ReminderChannel },
  options?: ApiRequestOptions,
): Call<Reminder> {
  return client
    .post(`/tasks/${encodeURIComponent(taskId)}/reminders`, input, ReminderResponseSchema, options)
    .then((response) => unwrap(response, 'reminder'));
}

export function removeReminder(
  client: ApiClient,
  taskId: string,
  reminderId: string,
  options?: ApiRequestOptions,
): Call<{ id: string }> {
  return client
    .delete(
      `/tasks/${encodeURIComponent(taskId)}/reminders/${encodeURIComponent(reminderId)}`,
      DeletedSchema,
      options,
    )
    .then((response) => unwrap(response, 'deleted'));
}

/**
 * How a reminder reads on screen.
 *
 * A reminder with no `scheduledFor` is waiting on a deadline rather than
 * broken, and says so — otherwise a student sees a reminder they set doing
 * apparently nothing, with no explanation.
 */
export function reminderLabel(reminder: Reminder): string {
  const offset = COMMON_REMINDER_OFFSETS.find((o) => o.minutes === reminder.offsetMinutes);
  const when =
    offset?.label ??
    (reminder.offsetMinutes === 0
      ? 'At the deadline'
      : reminder.offsetMinutes % 60 === 0
        ? `${reminder.offsetMinutes / 60} hours before`
        : `${reminder.offsetMinutes} minutes before`);

  if (reminder.status === 'SENT') return `${when} · sent`;
  if (reminder.status === 'CANCELLED') return `${when} · missed`;
  if (reminder.scheduledFor === null) return `${when} · waiting for a deadline`;
  return when;
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

/**
 * The factors that actually moved a score, biggest first.
 *
 * Zero-point factors are dropped: "Takes a while: 0 points" is noise on an
 * explanation, and a student reading why something ranked highly wants the
 * reasons it did, not a list of the reasons it did not.
 */
export function explainPriority(task: Task): readonly PriorityFactor[] {
  return [...(task.priorityFactors ?? [])]
    .filter((factor) => factor.points > 0)
    .sort((a, b) => b.points - a.points);
}

/** Assessments as a lookup by task id — the shape every screen actually wants. */
export function assessmentsByTask(
  assessments: readonly Assessment[],
): ReadonlyMap<string, Assessment> {
  return new Map(assessments.map((assessment) => [assessment.taskId, assessment]));
}

/**
 * Order by the automatic score, highest first.
 *
 * Mirrors `byPriorityScore` in worker/priority.js, including the tiebreak:
 * score, then due date, then id — so the order is total and a list cannot
 * appear to shuffle itself between renders. A task the backend did not score
 * sorts last rather than first, since an unknown score is not a high one.
 */
export function byPriority(a: Task, b: Task): number {
  const aScore = a.priorityScore ?? -1;
  const bScore = b.priorityScore ?? -1;
  if (aScore !== bScore) return bScore - aScore;
  const aDue = a.dueAt ?? '\uffff';
  const bDue = b.dueAt ?? '\uffff';
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.id.localeCompare(b.id);
}

// ── AI extraction (#741) ────────────────────────────────────────────────────

/**
 * A proposal the extractor read out of text.
 *
 * Shaped to match `DetectedTask` in src/features/tasks/detection/types.ts, but
 * declared here because this is the API boundary and the Zod schema is what
 * actually enforces agreement with the Worker at runtime. The Worker has
 * already validated and bounded every field; this is the second wall, not the
 * first — an endpoint that starts returning something else fails here rather
 * than halfway through rendering a proposal.
 */
const ExtractedTaskSchema = z.object({
  title: z.string(),
  type: z.enum(TASK_TYPES),
  dueAt: z.string().nullable(),
  courseCode: z.string().nullable(),
  syllabus: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.string().nullable(),
});

const ExtractResponseSchema = z.object({ detected: z.array(ExtractedTaskSchema) });

export type ExtractedTask = z.infer<typeof ExtractedTaskSchema>;

/**
 * Ask the server to read deadlines out of text.
 *
 * Returns PROPOSALS. Nothing here creates a task — the student confirms them
 * through the same panel the deterministic parser feeds.
 *
 * `courseCodes` narrows what the extractor will call a course. They describe
 * the WORK, not the student: nothing identifying is sent, and the uid the
 * server acts on comes from the token, never from this body.
 */
export function extractTasks(
  client: ApiClient,
  text: string,
  courseCodes: readonly string[] = [],
  options?: ApiRequestOptions,
): Call<readonly ExtractedTask[]> {
  return client
    .post('/tasks/extract', { text, courseCodes: [...courseCodes] }, ExtractResponseSchema, options)
    .then((response) => unwrap(response, 'detected'));
}
