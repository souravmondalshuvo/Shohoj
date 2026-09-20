// worker/academicHandlers.js
//
// The academic core's handler layer (#712): one function per endpoint.
//
// These return a plain `{ status, body }` rather than a `Response`. index.js
// turns that into one, adding CORS headers and the correlation id in the single
// place those belong. The payoff is that every endpoint below can be tested by
// calling it with an object and reading the result — no Request, no Response,
// no headers, no fetch — while the HTTP concerns stay tested once, where they
// live.
//
// `ctx` is the whole world a handler gets:
//
//   repo        a repository already bound to the signed-in student
//   userId      their Shohoj `usr_…` id, from the verified token
//   university  their campus, resolved server-side from the verified email
//   sha256Hex   for deriving enrolment ids
//   now()       injectable clock
//
// Note what is absent: there is no way to name a different owner. The repo is
// bound before a handler sees it, so "read another student's semester" is not a
// bug you can write here — it is a call you cannot make.

import { API_ERROR_CODES, apiError } from './apiV1.js';
import {
  applyEnrollmentPatch,
  applySemesterPatch,
  buildEnrollmentRecord,
  buildSemesterRecord,
  enrollmentDto,
  enrollmentId,
  semesterDto,
  semesterId,
  semestersToDemote,
  sortSemesters,
  validateEnrollmentInput,
  validateSemesterInput,
} from './academic.js';
import { MAX_ENROLLMENTS, MAX_SEMESTERS, deleteSemesterCascade } from './academicRepo.js';

const ok = (body, status = 200) => ({ status, body });

const fail = (status, code, message) => ({ status, body: apiError(code, message) });

/**
 * A validation failure, carrying the offending field.
 *
 * The field is inside `error` rather than alongside it so the envelope stays
 * the shape every other endpoint uses — a client that only reads `code` and
 * `message` is unaffected, and a form that wants to highlight an input has
 * something to go on.
 */
function invalidRequest({ field, message }) {
  const body = apiError(API_ERROR_CODES.INVALID_REQUEST, message);
  return { status: 400, body: { error: { ...body.error, field } } };
}

/**
 * A resource that is not there, or not theirs.
 *
 * Both answer 404, and that is the point: 403 would confirm the thing exists,
 * which on a per-student resource tells one student something true about
 * another. Since the repository is bound to the caller, "not theirs" and "not
 * there" are literally the same read — the leak is closed structurally rather
 * than by remembering to check.
 */
const notFound = (what) => fail(404, API_ERROR_CODES.NOT_FOUND, `That ${what} could not be found.`);

// ── Semesters ───────────────────────────────────────────────────────────────

export async function listSemesters(ctx) {
  const all = await ctx.repo.listSemesters();
  return ok({ items: sortSemesters(all).map(semesterDto) });
}

/**
 * Create a semester, or update the one that already exists for that term.
 *
 * The id is derived from campus, year and season, so a second POST for Fall
 * 2026 is not a duplicate — it is the same semester. Rather than answering 409
 * and making the client resolve it, this treats the repeat as the intent it
 * almost always is ("make sure I have this semester, set as active") and
 * returns 200 instead of 201. Idempotent, which is what a mobile client
 * retrying a dropped request needs.
 */
export async function createSemester(ctx, payload) {
  const parsed = validateSemesterInput(payload);
  if (parsed.error) return invalidRequest(parsed.error);

  const id = semesterId(ctx.university, parsed.value.year, parsed.value.season);
  const existing = await ctx.repo.getSemester(id);

  if (existing === null) {
    const all = await ctx.repo.listSemesters();
    if (all.length >= MAX_SEMESTERS) {
      return fail(
        400,
        API_ERROR_CODES.INVALID_REQUEST,
        `Shohoj keeps up to ${MAX_SEMESTERS} semesters. Remove one you no longer need.`,
      );
    }
  }

  const nowIso = ctx.now().toISOString();
  const record =
    existing === null
      ? buildSemesterRecord({
          university: ctx.university,
          userId: ctx.userId,
          input: parsed.value,
          nowIso,
        })
      : {
          ...existing,
          status: parsed.value.status,
          sessionId: parsed.value.sessionId ?? existing.sessionId ?? null,
          startDate: parsed.value.startDate ?? existing.startDate ?? null,
          endDate: parsed.value.endDate ?? existing.endDate ?? null,
          updatedAt: nowIso,
        };

  await ctx.repo.putSemester(record);
  if (record.status === 'ACTIVE') await demoteOtherActive(ctx, record.id, nowIso);

  return ok({ semester: semesterDto(record) }, existing === null ? 201 : 200);
}

export async function getSemester(ctx, id) {
  const record = await ctx.repo.getSemester(id);
  if (record === null) return notFound('semester');
  return ok({ semester: semesterDto(record) });
}

export async function patchSemester(ctx, id, payload) {
  const existing = await ctx.repo.getSemester(id);
  if (existing === null) return notFound('semester');

  const nowIso = ctx.now().toISOString();
  const patched = applySemesterPatch(existing, payload, nowIso);
  if (patched.error) return invalidRequest(patched.error);

  await ctx.repo.putSemester(patched.value);
  if (patched.value.status === 'ACTIVE') await demoteOtherActive(ctx, id, nowIso);

  return ok({ semester: semesterDto(patched.value) });
}

/**
 * Keep "which semester am I in" to one answer.
 *
 * Read-then-write rather than a transaction: the document store cannot give one
 * cheaply here, and the cost of losing the race is bounded and self-healing — a
 * second ACTIVE semester that the next promotion clears. The alternative,
 * blocking every promotion on a transaction, is a worse trade for an invariant
 * only one person can violate and only by using two devices in the same second.
 */
async function demoteOtherActive(ctx, activeId, nowIso) {
  const all = await ctx.repo.listSemesters();
  for (const id of semestersToDemote(all, activeId)) {
    const record = all.find((semester) => semester.id === id);
    await ctx.repo.putSemester({ ...record, status: 'COMPLETED', updatedAt: nowIso });
  }
}

/**
 * Delete a semester and everything enrolled in it.
 *
 * The cascade is not optional and there is no flag to skip it — an enrolment
 * whose semester is gone appears in no view that lists by semester, so it can
 * never be found or removed again. The count comes back so the client can say
 * what went, rather than a student discovering afterwards that four courses
 * left with it.
 */
export async function deleteSemester(ctx, id) {
  const existing = await ctx.repo.getSemester(id);
  if (existing === null) return notFound('semester');
  const removedEnrollments = await deleteSemesterCascade(ctx.repo, id);
  return ok({ deleted: { id, removedEnrollments } });
}

// ── Enrollments ─────────────────────────────────────────────────────────────

/** List enrolments, optionally for one semester. */
export async function listEnrollments(ctx, query = {}) {
  const all = await ctx.repo.listEnrollments();
  const filtered =
    query.semesterId === undefined || query.semesterId === null
      ? all
      : all.filter((enrollment) => enrollment.semesterId === query.semesterId);
  // Course code, so a list reads the way a student's registration slip does.
  const sorted = [...filtered].sort((a, b) =>
    String(a.courseCode).localeCompare(String(b.courseCode)),
  );
  return ok({ items: sorted.map(enrollmentDto) });
}

/**
 * Enrol a course in a semester.
 *
 * Idempotent by construction: the id is derived from student + semester +
 * course, so a double-tapped button rewrites one document instead of creating
 * two enrolments to clean up. A repeat answers 200; the first answers 201.
 *
 * The semester is verified to exist and to be THIS student's before anything is
 * written — which, because the repository is bound to them, is the same check.
 * Without it a client could enrol into a semester id it guessed, creating a
 * record that no semester view can reach.
 */
export async function createEnrollment(ctx, payload) {
  const parsed = validateEnrollmentInput(payload);
  if (parsed.error) return invalidRequest(parsed.error);

  const semester = await ctx.repo.getSemester(parsed.value.semesterId);
  if (semester === null) return notFound('semester');

  const id = await enrollmentId(
    ctx.userId,
    parsed.value.semesterId,
    parsed.value.courseCode,
    ctx.sha256Hex,
  );
  const existing = await ctx.repo.getEnrollment(id);

  if (existing === null) {
    const all = await ctx.repo.listEnrollments();
    if (all.length >= MAX_ENROLLMENTS) {
      return fail(
        400,
        API_ERROR_CODES.INVALID_REQUEST,
        `Shohoj keeps up to ${MAX_ENROLLMENTS} course enrolments.`,
      );
    }
  }

  const nowIso = ctx.now().toISOString();
  const record =
    existing === null
      ? buildEnrollmentRecord({ id, userId: ctx.userId, input: parsed.value, nowIso })
      : {
          ...existing,
          section: parsed.value.section ?? existing.section ?? null,
          facultyInitials: parsed.value.facultyInitials ?? existing.facultyInitials ?? null,
          status: parsed.value.status,
          updatedAt: nowIso,
        };

  await ctx.repo.putEnrollment(record);
  return ok({ enrollment: enrollmentDto(record) }, existing === null ? 201 : 200);
}

export async function getEnrollment(ctx, id) {
  const record = await ctx.repo.getEnrollment(id);
  if (record === null) return notFound('enrolment');
  return ok({ enrollment: enrollmentDto(record) });
}

export async function patchEnrollment(ctx, id, payload) {
  const existing = await ctx.repo.getEnrollment(id);
  if (existing === null) return notFound('enrolment');

  const patched = applyEnrollmentPatch(existing, payload, ctx.now().toISOString());
  if (patched.error) return invalidRequest(patched.error);

  await ctx.repo.putEnrollment(patched.value);
  return ok({ enrollment: enrollmentDto(patched.value) });
}

export async function deleteEnrollment(ctx, id) {
  const existing = await ctx.repo.getEnrollment(id);
  if (existing === null) return notFound('enrolment');
  await ctx.repo.deleteEnrollment(id);
  return ok({ deleted: { id } });
}
