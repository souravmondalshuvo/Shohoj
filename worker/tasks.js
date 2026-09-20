// worker/tasks.js
//
// Shohoj Tasks' domain layer (#715): the Task itself, and the Today/Upcoming
// selections built over it.
//
// Pure. No Firestore, no Request, no ambient clock — the current instant is
// passed in. That matters more here than anywhere else in the API, because the
// two hardest rules in this file are about time, and a function that reads the
// clock itself cannot be pinned by a test.
//
// ONE MODEL, NOT EIGHT
//
// A quiz, an assignment and a lab report are one entity with different `type`
// values. They differ in what they are called and in whether they eventually
// carry an assessment — not in their storage, their queries, their sort order
// or their Today view. Separate entities per kind would mean eight of
// everything and a union at every call site, to express a difference that is
// one string field.

import {
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  TASK_TYPES,
  dayWindowUtc,
} from './taskTime.js';

export { TASK_PRIORITIES, TASK_SOURCES, TASK_STATUSES, TASK_TYPES };

export const TASK_SCHEMA_VERSION = 1;

/** Longest window /tasks/upcoming will look ahead. */
export const MAX_UPCOMING_DAYS = 90;
export const DEFAULT_UPCOMING_DAYS = 7;

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const MAX_SOURCE_REFERENCE = 512;
/** Sixteen hours. Past this the student is describing a project, not a sitting. */
const MAX_ESTIMATED_MINUTES = 960;

function invalid(field, message) {
  return { field, message };
}

function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Validate an ISO 8601 instant, returning it normalised to UTC.
 *
 * Accepts any offset the client sends and stores the instant — `2026-10-05T23:00:00+06:00`
 * and `2026-10-05T17:00:00Z` are the same moment and are stored identically.
 * What is NOT accepted is a bare local time with no offset: `2026-10-05T23:00`
 * does not name an instant, and guessing a zone for it is how a deadline moves
 * when a student travels.
 */
function cleanInstant(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * A task id: `tsk_` + 32 hex characters, randomly assigned.
 *
 * The one place Task diverges from Semester and Enrollment, whose ids are
 * derived. Deriving an id from its content would make two identical tasks the
 * same task — and a student who genuinely has two readings due Friday must be
 * able to create both. Idempotency is not available here and pretending
 * otherwise would silently swallow a real task.
 *
 * `randomHex` is injected so tests are deterministic; the Worker passes one
 * backed by crypto.getRandomValues.
 */
export function taskId(randomHex) {
  return `tsk_${randomHex(16)}`;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a task-creation request.
 *
 * `enrollmentId` is optional but not free-form: a PERSONAL task may have none,
 * and anything else should be attached to a course. That is a nudge rather than
 * a rule — "revise for everything" is a real task a student might file as
 * OTHER with no course — so an unattached non-personal task is allowed and the
 * UI can prompt instead.
 */
export function validateTaskInput(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }

  const title = cleanString(payload.title, MAX_TITLE);
  if (title === null) {
    return { error: invalid('title', `Give the task a title, up to ${MAX_TITLE} characters.`) };
  }

  let description = null;
  if (payload.description != null) {
    description = cleanString(payload.description, MAX_DESCRIPTION);
    if (description === null) {
      return {
        error: invalid('description', `Description must be under ${MAX_DESCRIPTION} characters.`),
      };
    }
  }

  const type = payload.type === undefined ? 'ASSIGNMENT' : payload.type;
  if (!TASK_TYPES.includes(type)) {
    return { error: invalid('type', `Type must be one of ${TASK_TYPES.join(', ')}.`) };
  }

  const status = payload.status === undefined ? 'TODO' : payload.status;
  if (!TASK_STATUSES.includes(status)) {
    return { error: invalid('status', `Status must be one of ${TASK_STATUSES.join(', ')}.`) };
  }

  const priority = payload.priority === undefined ? 'MEDIUM' : payload.priority;
  if (!TASK_PRIORITIES.includes(priority)) {
    return {
      error: invalid('priority', `Priority must be one of ${TASK_PRIORITIES.join(', ')}.`),
    };
  }

  const source = payload.source === undefined ? 'MANUAL' : payload.source;
  if (!TASK_SOURCES.includes(source)) {
    return { error: invalid('source', `Source must be one of ${TASK_SOURCES.join(', ')}.`) };
  }

  let enrollmentId = null;
  if (payload.enrollmentId != null) {
    enrollmentId = cleanString(payload.enrollmentId, 64);
    if (enrollmentId === null) {
      return { error: invalid('enrollmentId', 'Not a course this task can belong to.') };
    }
  }
  if (enrollmentId === null && type !== 'PERSONAL' && payload.enrollmentId === null) {
    // Explicit null on a course-shaped task is accepted; see the note above.
    // Kept as a branch rather than folded away so the intent stays readable.
    enrollmentId = null;
  }

  const timing = validateTiming(payload);
  if (timing.error) return timing;

  let sourceReference = null;
  if (payload.sourceReference != null) {
    sourceReference = cleanString(payload.sourceReference, MAX_SOURCE_REFERENCE);
    if (sourceReference === null) {
      return { error: invalid('sourceReference', 'Source reference is too long.') };
    }
  }

  return {
    value: {
      title,
      description,
      type,
      status,
      priority,
      source,
      sourceReference,
      enrollmentId,
      ...timing.value,
    },
  };
}

/** Shared by create and patch: dueAt, startAt, estimatedMinutes and their rules. */
function validateTiming(payload) {
  let dueAt = null;
  if (payload.dueAt != null) {
    dueAt = cleanInstant(payload.dueAt);
    if (dueAt === null) {
      return {
        error: invalid('dueAt', 'Due date must be an ISO 8601 instant with a timezone offset.'),
      };
    }
  }

  let startAt = null;
  if (payload.startAt != null) {
    startAt = cleanInstant(payload.startAt);
    if (startAt === null) {
      return {
        error: invalid('startAt', 'Start must be an ISO 8601 instant with a timezone offset.'),
      };
    }
  }

  if (dueAt !== null && startAt !== null && startAt > dueAt) {
    return { error: invalid('startAt', 'A task cannot start after it is due.') };
  }

  let estimatedMinutes = null;
  if (payload.estimatedMinutes != null) {
    const minutes = payload.estimatedMinutes;
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_ESTIMATED_MINUTES) {
      return {
        error: invalid(
          'estimatedMinutes',
          `Estimate must be between 1 and ${MAX_ESTIMATED_MINUTES} minutes.`,
        ),
      };
    }
    estimatedMinutes = minutes;
  }

  return { value: { dueAt, startAt, estimatedMinutes } };
}

// ── Records ─────────────────────────────────────────────────────────────────

export function buildTaskRecord({ id, userId, input, nowIso }) {
  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    userId,
    enrollmentId: input.enrollmentId,
    title: input.title,
    description: input.description,
    type: input.type,
    status: input.status,
    priority: input.priority,
    /** Reserved for the Phase 5 scoring engine. Null means "not scored yet". */
    priorityScore: null,
    dueAt: input.dueAt,
    startAt: input.startAt,
    estimatedMinutes: input.estimatedMinutes,
    source: input.source,
    sourceReference: input.sourceReference,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: input.status === 'COMPLETED' ? nowIso : null,
  };
}

const TASK_PATCHABLE = Object.freeze([
  'title',
  'description',
  'type',
  'status',
  'priority',
  'dueAt',
  'startAt',
  'estimatedMinutes',
  'enrollmentId',
]);

/**
 * Apply a partial update to a stored task.
 *
 * `completedAt` is maintained here rather than accepted from the client, and it
 * is maintained in both directions: completing stamps it, and reopening clears
 * it. A task that says it was completed last Tuesday while its status is TODO
 * would corrupt the Phase 5 analytics that exist to answer "when did I finish
 * this" — which is also why the field is stored at all rather than inferred.
 */
export function applyTaskPatch(existing, payload, nowIso) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }
  const unknown = Object.keys(payload).filter((key) => !TASK_PATCHABLE.includes(key));
  if (unknown.length > 0) {
    return {
      error: invalid(unknown[0], `Cannot be changed. Editable: ${TASK_PATCHABLE.join(', ')}.`),
    };
  }

  const next = { ...existing };

  if (payload.title !== undefined) {
    const title = cleanString(payload.title, MAX_TITLE);
    if (title === null) {
      return { error: invalid('title', `Give the task a title, up to ${MAX_TITLE} characters.`) };
    }
    next.title = title;
  }

  if (payload.description !== undefined) {
    if (payload.description === null) {
      next.description = null;
    } else {
      const description = cleanString(payload.description, MAX_DESCRIPTION);
      if (description === null) {
        return {
          error: invalid('description', `Description must be under ${MAX_DESCRIPTION} characters.`),
        };
      }
      next.description = description;
    }
  }

  for (const [field, allowed] of [
    ['type', TASK_TYPES],
    ['status', TASK_STATUSES],
    ['priority', TASK_PRIORITIES],
  ]) {
    if (payload[field] === undefined) continue;
    if (!allowed.includes(payload[field])) {
      return { error: invalid(field, `Must be one of ${allowed.join(', ')}.`) };
    }
    next[field] = payload[field];
  }

  if (payload.enrollmentId !== undefined) {
    if (payload.enrollmentId === null) {
      next.enrollmentId = null;
    } else {
      const enrollmentId = cleanString(payload.enrollmentId, 64);
      if (enrollmentId === null) {
        return { error: invalid('enrollmentId', 'Not a course this task can belong to.') };
      }
      next.enrollmentId = enrollmentId;
    }
  }

  // Timing is validated against the MERGED task, not the patch alone: sending
  // only `startAt` must still be checked against the stored `dueAt`, or the
  // "cannot start after it is due" rule is trivially bypassed by patching one
  // field at a time.
  const timingPayload = {
    dueAt: payload.dueAt === undefined ? next.dueAt : payload.dueAt,
    startAt: payload.startAt === undefined ? next.startAt : payload.startAt,
    estimatedMinutes:
      payload.estimatedMinutes === undefined ? next.estimatedMinutes : payload.estimatedMinutes,
  };
  const timing = validateTiming(timingPayload);
  if (timing.error) return timing;
  Object.assign(next, timing.value);

  if (next.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    next.completedAt = nowIso;
  } else if (next.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
    next.completedAt = null;
  }

  next.updatedAt = nowIso;
  return { value: next };
}

export function taskDto(record) {
  return {
    id: record.id,
    enrollmentId: record.enrollmentId ?? null,
    title: record.title,
    description: record.description ?? null,
    type: record.type,
    status: record.status,
    priority: record.priority,
    priorityScore: record.priorityScore ?? null,
    dueAt: record.dueAt ?? null,
    startAt: record.startAt ?? null,
    estimatedMinutes: record.estimatedMinutes ?? null,
    source: record.source,
    sourceReference: record.sourceReference ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? null,
  };
}

// ── Ordering ────────────────────────────────────────────────────────────────

const PRIORITY_RANK = Object.freeze({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 });

/**
 * The order a task list is read in: soonest first, then by priority.
 *
 * Tasks with no due date sort LAST rather than first. A null is not "due now" —
 * an undated reading is the least urgent thing on the list, and sorting nulls
 * to the top would bury the exam that is actually tomorrow.
 */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (rank !== 0) return rank;
    // Stable and deterministic across backends, which a test can rely on.
    return String(a.id).localeCompare(String(b.id));
  });
}

// ── Today and Upcoming ──────────────────────────────────────────────────────
//
// These are the reason the endpoints exist rather than being a date range the
// client assembles. "Today" is not a range: it is today's work PLUS everything
// already overdue, which is a rule about status as much as about time, and one
// that every client would otherwise have to re-implement identically.

const OPEN_STATUSES = ['TODO', 'IN_PROGRESS'];

const isOpen = (task) => OPEN_STATUSES.includes(task.status);
const isCancelled = (task) => task.status === 'CANCELLED';

/**
 * Today, for a student in `timeZone`.
 *
 * `overdue` is open work whose deadline has already passed — it stays on Today
 * until it is dealt with, because a missed deadline that scrolls off the screen
 * is how it gets missed twice.
 *
 * `dueToday` keeps COMPLETED tasks. A Today list that empties itself as work is
 * finished takes away the only evidence the day went well, and a student
 * checking what is left can read status.
 *
 * Cancelled tasks appear in neither: cancelled is the answer to "this is not
 * happening", and re-listing it every morning argues with that.
 */
export function selectToday(tasks, nowMs, timeZone) {
  const { startUtc, endUtc } = dayWindowUtc(nowMs, timeZone);
  const overdue = [];
  const dueToday = [];

  for (const task of tasks) {
    if (isCancelled(task) || task.dueAt === null || task.dueAt === undefined) continue;
    const due = Date.parse(task.dueAt);
    if (Number.isNaN(due)) continue;
    if (due < startUtc) {
      if (isOpen(task)) overdue.push(task);
    } else if (due < endUtc) {
      dueToday.push(task);
    }
  }

  return { overdue: sortTasks(overdue), dueToday: sortTasks(dueToday) };
}

/**
 * The next `days` days, starting tomorrow.
 *
 * Today is excluded because Today has its own view; a task appearing in both
 * would be double-counted by any caller that adds the two lists together.
 *
 * Completed work is excluded here, unlike in Today. Upcoming answers "what is
 * ahead of me", and something already finished is not ahead of anybody.
 */
export function selectUpcoming(tasks, nowMs, timeZone, days = DEFAULT_UPCOMING_DAYS) {
  const { endUtc } = dayWindowUtc(nowMs, timeZone);
  const horizon = endUtc + days * 24 * 60 * 60 * 1000;

  const window = tasks.filter((task) => {
    if (!isOpen(task)) return false;
    if (task.dueAt === null || task.dueAt === undefined) return false;
    const due = Date.parse(task.dueAt);
    return !Number.isNaN(due) && due >= endUtc && due < horizon;
  });

  return sortTasks(window);
}

/** Clamp a caller-supplied day count to something the backend will answer. */
export function upcomingDays(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_UPCOMING_DAYS;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1) return null;
  return Math.min(days, MAX_UPCOMING_DAYS);
}
