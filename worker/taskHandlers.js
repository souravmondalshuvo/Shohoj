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
import { MAX_TASKS } from './academicRepo.js';
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

  return ok({ items: sortTasks(filtered).map(taskDto) });
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
  return ok({ task: taskDto(record) });
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
  await ctx.repo.deleteTask(id);
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
    overdue: overdue.map(taskDto),
    dueToday: dueToday.map(taskDto),
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

  return ok({ days, items: items.map(taskDto) });
}
