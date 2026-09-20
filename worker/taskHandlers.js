// worker/taskHandlers.js
//
// Shohoj Tasks' handler layer (#715). Same shape as the academic core's: one
// function per endpoint, each returning a plain `{ status, body }` that
// index.js turns into a Response.
//
// `ctx` carries a repository already bound to the signed-in student, so
// ownership is structural here exactly as it is there — no handler takes an
// owner, and reaching another student's task is not a call that can be written.

import { API_ERROR_CODES, apiError } from './apiV1.js';
import { MAX_TASKS, assessmentsByTaskId, deleteTaskCascade } from './academicRepo.js';
import { assessmentDto, buildAssessmentRecord, validateAssessmentInput } from './assessments.js';
import { scoreTasks } from './priority.js';
import {
  applyTaskPatch,
  buildTaskRecord,
  selectToday,
  selectUpcoming,
  sortTasks,
  taskDto,
  taskId,
  upcomingDays,
  validateTaskInput,
} from './tasks.js';
import { isValidTimeZone } from './taskTime.js';

const ok = (body, status = 200) => ({ status, body });
const fail = (status, code, message) => ({ status, body: apiError(code, message) });

function invalidRequest({ field, message }) {
  const body = apiError(API_ERROR_CODES.INVALID_REQUEST, message);
  return { status: 400, body: { error: { ...body.error, field } } };
}

const notFound = () => fail(404, API_ERROR_CODES.NOT_FOUND, 'That task could not be found.');

/**
 * Resolve the caller's timezone.
 *
 * Required rather than defaulted, for Today and Upcoming only. A default of UTC
 * would silently answer the wrong day for every student in Bangladesh after
 * 6pm — which is exactly when they would be checking. Better to refuse and have
 * the client send the one line of `Intl` that answers it.
 */
function resolveTimeZone(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return {
      error: {
        field: 'tz',
        message: 'Send your timezone (tz) so Shohoj can work out which day it is for you.',
      },
    };
  }
  if (!isValidTimeZone(raw)) {
    return { error: { field: 'tz', message: 'That is not a timezone Shohoj recognises.' } };
  }
  return { value: raw };
}

/**
 * Check that an enrolment belongs to the caller before a task points at it.
 *
 * Without this a client could attach a task to an enrolment id it guessed,
 * producing a task that no course-filtered view can reach. Because the
 * repository is bound to the caller, "does it exist" and "is it theirs" are the
 * same read.
 */
async function enrollmentMissing(ctx, enrollmentId) {
  if (enrollmentId === null) return false;
  return (await ctx.repo.getEnrollment(enrollmentId)) === null;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * List tasks, optionally filtered.
 *
 * `enrollmentId` filters to one course; `status` to one state. Both are applied
 * in memory rather than as Firestore queries, deliberately: the collection is
 * already scoped to one student and capped, so it is small, and a composite
 * index per filter combination would be real operational cost for a list that
 * is a few dozen rows.
 */
export async function listTasks(ctx, query = {}) {
  const all = await ctx.repo.listTasks();
  let filtered = all;

  if (query.enrollmentId !== undefined && query.enrollmentId !== null) {
    filtered = filtered.filter((task) => task.enrollmentId === query.enrollmentId);
  }
  if (query.status !== undefined && query.status !== null) {
    filtered = filtered.filter((task) => task.status === query.status);
  }

  return ok({ items: await scored(ctx, sortTasks(filtered)) });
}

/**
 * Attach the automatic priority score to a list of tasks.
 *
 * Computed on read, never stored: urgency changes every hour, so a stored score
 * is wrong the moment it is written, and keeping one current would mean a job
 * rewriting every task in the database hourly for a number that is arithmetic.
 *
 * The assessments are fetched once per request and joined in memory rather than
 * per task — see assessmentsByTaskId. A list of fifty tasks costs one extra
 * read, not fifty.
 *
 * Ordering is left alone. The score rides ALONGSIDE the due-date order the API
 * has always returned, so a client can sort by it or ignore it; silently
 * reordering every existing response would change what every current caller
 * sees without asking.
 */
async function scored(ctx, tasks) {
  if (tasks.length === 0) return [];
  const byTask = await assessmentsByTaskId(ctx.repo);
  return scoreTasks(tasks, { assessmentsByTaskId: byTask, nowMs: ctx.now().getTime() }).map(
    (task) => ({
      ...taskDto(task),
      priorityScore: task.priorityScore,
      priorityFactors: task.priorityFactors,
    }),
  );
}

export async function createTask(ctx, payload) {
  const parsed = validateTaskInput(payload);
  if (parsed.error) return invalidRequest(parsed.error);

  if (await enrollmentMissing(ctx, parsed.value.enrollmentId)) {
    return fail(404, API_ERROR_CODES.NOT_FOUND, 'That course could not be found.');
  }

  const all = await ctx.repo.listTasks();
  if (all.length >= MAX_TASKS) {
    return fail(
      400,
      API_ERROR_CODES.INVALID_REQUEST,
      `Shohoj keeps up to ${MAX_TASKS} tasks. Clear some completed ones first.`,
    );
  }

  const record = buildTaskRecord({
    id: taskId(ctx.randomHex),
    userId: ctx.userId,
    input: parsed.value,
    nowIso: ctx.now().toISOString(),
  });

  await ctx.repo.putTask(record);
  return ok({ task: taskDto(record) }, 201);
}

export async function getTask(ctx, id) {
  const record = await ctx.repo.getTask(id);
  if (record === null) return notFound();
  const [withScore] = await scored(ctx, [record]);
  return ok({ task: withScore });
}

export async function patchTask(ctx, id, payload) {
  const existing = await ctx.repo.getTask(id);
  if (existing === null) return notFound();

  const patched = applyTaskPatch(existing, payload, ctx.now().toISOString());
  if (patched.error) return invalidRequest(patched.error);

  // Re-checked on patch as well as create: moving a task to another course is
  // an edit like any other, and an unchecked one could point it anywhere.
  if (await enrollmentMissing(ctx, patched.value.enrollmentId)) {
    return fail(404, API_ERROR_CODES.NOT_FOUND, 'That course could not be found.');
  }

  await ctx.repo.putTask(patched.value);
  return ok({ task: taskDto(patched.value) });
}

export async function deleteTask(ctx, id) {
  const existing = await ctx.repo.getTask(id);
  if (existing === null) return notFound();
  await deleteTaskCascade(ctx.repo, id);
  return ok({ deleted: { id } });
}

/**
 * Mark a task done, or not done.
 *
 * A dedicated endpoint rather than leaving it to PATCH, because completing is
 * the single most common write in the product — a checkbox — and it deserves to
 * be one call with no body to assemble and nothing else it could accidentally
 * change. PATCH still works for anyone who prefers it; this routes through the
 * same patch logic, so `completedAt` is stamped and cleared identically.
 */
export async function setTaskCompletion(ctx, id, completed) {
  const existing = await ctx.repo.getTask(id);
  if (existing === null) return notFound();

  // Reopening returns a task to TODO rather than to whatever it was before.
  // Restoring IN_PROGRESS would be guessing at a state the student left behind
  // some time ago, and TODO is the honest floor.
  const patched = applyTaskPatch(
    existing,
    { status: completed ? 'COMPLETED' : 'TODO' },
    ctx.now().toISOString(),
  );
  if (patched.error) return invalidRequest(patched.error);

  await ctx.repo.putTask(patched.value);
  return ok({ task: taskDto(patched.value) });
}

// ── Today and Upcoming ──────────────────────────────────────────────────────

/**
 * Today: work due today, plus everything already overdue.
 *
 * Two lists rather than one merged list, because they mean different things to
 * a student and a UI should be able to treat them differently — overdue is a
 * warning, today is a plan. Merging them would also lose the distinction
 * entirely once both are sorted by due date.
 */
export async function todayTasks(ctx, query = {}) {
  const tz = resolveTimeZone(query.tz);
  if (tz.error) return invalidRequest(tz.error);

  const all = await ctx.repo.listTasks();
  const { overdue, dueToday } = selectToday(all, ctx.now().getTime(), tz.value);

  return ok({
    overdue: await scored(ctx, overdue),
    dueToday: await scored(ctx, dueToday),
  });
}

/** The next N days, starting tomorrow. Today has its own view. */
export async function upcomingTasks(ctx, query = {}) {
  const tz = resolveTimeZone(query.tz);
  if (tz.error) return invalidRequest(tz.error);

  const days = upcomingDays(query.days);
  if (days === null) {
    return invalidRequest({ field: 'days', message: 'Days must be a whole number of at least 1.' });
  }

  const all = await ctx.repo.listTasks();
  const items = selectUpcoming(all, ctx.now().getTime(), tz.value, days);

  return ok({ days, items: await scored(ctx, items) });
}

// ── Assessments ─────────────────────────────────────────────────────────────
//
// Addressed as a sub-resource of their task — /tasks/{id}/assessment — because
// that is what they are: 0..1 per task, keyed by task id, with no identity of
// their own. PUT rather than POST for the same reason: there is one slot, and
// writing to it twice should leave one assessment, not two.

export async function getAssessment(ctx, taskId) {
  if ((await ctx.repo.getTask(taskId)) === null) return notFound();
  const record = await ctx.repo.getAssessment(taskId);
  if (record === null) {
    return fail(404, API_ERROR_CODES.NOT_FOUND, 'This task has no assessment.');
  }
  return ok({ assessment: assessmentDto(record) });
}

/** Create or replace the task's assessment. */
export async function putAssessment(ctx, taskId, payload) {
  // The task is checked first, so an assessment cannot be attached to a task
  // that does not exist or is not the caller's — which, because the repository
  // is bound to them, is the same read.
  if ((await ctx.repo.getTask(taskId)) === null) return notFound();

  const parsed = validateAssessmentInput(payload);
  if (parsed.error) return invalidRequest(parsed.error);

  const existing = await ctx.repo.getAssessment(taskId);
  const record = buildAssessmentRecord({
    taskId,
    userId: ctx.userId,
    input: parsed.value,
    nowIso: ctx.now().toISOString(),
    existing,
  });

  await ctx.repo.putAssessment(record);
  return ok({ assessment: assessmentDto(record) }, existing === null ? 201 : 200);
}

export async function deleteAssessment(ctx, taskId) {
  if ((await ctx.repo.getTask(taskId)) === null) return notFound();
  if ((await ctx.repo.getAssessment(taskId)) === null) {
    return fail(404, API_ERROR_CODES.NOT_FOUND, 'This task has no assessment.');
  }
  await ctx.repo.deleteAssessment(taskId);
  return ok({ deleted: { taskId } });
}
