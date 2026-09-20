// src/platform/api/academic.ts
//
// The frontend half of the academic core's contract (#712): Semester and
// Enrollment as the API returns them, and the typed calls that fetch them.
//
// This is the client's side of docs/api/. Every response is `unknown` until a
// schema here accepts it, so a backend that changes shape fails loudly and
// locally rather than half-rendering a screen. The schemas are deliberately
// strict about the fields the app depends on and tolerant about everything
// else — an unknown field is IGNORED rather than rejected, so a field the
// server adds tomorrow does not break a client that shipped today.
//
// Ignored, not preserved: Zod strips what a schema does not name, so a new
// field is invisible here until it is added below. That is the safe direction
// (nothing silently half-typed reaches the app) but it does mean a server
// field nobody adds to a schema is a field nobody can use — which is exactly
// how `removedTasks` went missing between the Worker and the UI once already.
//
// Note what is NOT here: a courses endpoint. Shohoj already ships the full
// BRACU catalogue in the bundle (src/core/catalog.ts), so fetching course names
// and credits over the network would be a slower path to data the client
// already holds. The server keeps its own copy only to validate what it is
// told and to stamp credits it can vouch for.

import type { ShohojError } from '../../core/errors.ts';
import type { Result } from '../../core/result.ts';
import { z } from '../../shared/validation/schema.ts';
import type { ApiClient, ApiRequestOptions } from './apiClient.ts';

// ── Enums ───────────────────────────────────────────────────────────────────
//
// Mirrors of the sets in worker/academic.js. Duplicated rather than imported:
// the Worker is a separate package built for another runtime, and pulling its
// module graph into the browser bundle to share five string literals would be a
// bad trade. The schemas below are what enforce agreement at runtime.

export const SEMESTER_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export const ENROLLMENT_STATUSES = ['ENROLLED', 'COMPLETED', 'DROPPED', 'WITHDRAWN'] as const;
export const ENROLLMENT_SOURCES = ['MANUAL', 'CALCULATOR', 'CONNECT_IMPORT', 'ROUTINE'] as const;
export const SEASONS = ['Spring', 'Summer', 'Fall'] as const;

export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];
export type Season = (typeof SEASONS)[number];

// ── Schemas ─────────────────────────────────────────────────────────────────

const SemesterIdSchema = z.string().regex(/^sem_[a-z]+_\d{5,6}$/, 'malformed semester id');
const EnrollmentIdSchema = z.string().regex(/^enr_[0-9a-f]{32}$/, 'malformed enrolment id');

export const SemesterSchema = z.object({
  id: SemesterIdSchema,
  name: z.string(),
  year: z.number().int(),
  season: z.enum(SEASONS),
  /** The CONNECT session id when the semester has one, e.g. 20263. */
  sessionId: z.number().int().nullable(),
  status: z.enum(SEMESTER_STATUSES),
  /** `YYYY-MM-DD`, or null when the term dates are not known yet. */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EnrollmentSchema = z.object({
  id: EnrollmentIdSchema,
  semesterId: SemesterIdSchema,
  courseCode: z.string(),
  /** From the server's catalogue, not the request. Null for a course it cannot price. */
  credits: z.number().nullable(),
  section: z.string().nullable(),
  facultyInitials: z.string().nullable(),
  status: z.enum(ENROLLMENT_STATUSES),
  source: z.enum(ENROLLMENT_SOURCES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Semester = z.infer<typeof SemesterSchema>;
export type Enrollment = z.infer<typeof EnrollmentSchema>;

const SemesterListSchema = z.object({ items: z.array(SemesterSchema) });
const SemesterResponseSchema = z.object({ semester: SemesterSchema });
const EnrollmentListSchema = z.object({ items: z.array(EnrollmentSchema) });
const EnrollmentResponseSchema = z.object({ enrollment: EnrollmentSchema });
const DeletedSemesterSchema = z.object({
  deleted: z.object({
    id: z.string(),
    removedEnrollments: z.number().int(),
    /** Tasks that went with those enrolments (#715). */
    removedTasks: z.number().int(),
  }),
});
const DeletedEnrollmentSchema = z.object({
  deleted: z.object({ id: z.string(), removedTasks: z.number().int() }),
});

// ── Request shapes ──────────────────────────────────────────────────────────

/**
 * What creating a semester takes.
 *
 * Either `year` + `season`, or a CONNECT `sessionId` to derive both from. The
 * server refuses the pair when they disagree rather than picking one, so a
 * caller that has both should only send both when it is sure.
 */
export interface CreateSemesterInput {
  readonly year?: number;
  readonly season?: Season;
  readonly sessionId?: number;
  readonly status?: SemesterStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

/** Year and season are absent on purpose: they are what the id is derived from. */
export interface UpdateSemesterInput {
  readonly status?: SemesterStatus;
  readonly sessionId?: number | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

export interface CreateEnrollmentInput {
  readonly semesterId: string;
  readonly courseCode: string;
  readonly section?: string | null;
  readonly facultyInitials?: string | null;
  readonly status?: EnrollmentStatus;
  readonly source?: EnrollmentSource;
}

/** Course, semester and credits are absent: the first two define the id, the last is the server's. */
export interface UpdateEnrollmentInput {
  readonly section?: string | null;
  readonly facultyInitials?: string | null;
  readonly status?: EnrollmentStatus;
}

// ── Calls ───────────────────────────────────────────────────────────────────

type Call<T> = Promise<Result<T, ShohojError>>;

/** Unwrap `{ items }` / `{ semester }` / `{ enrollment }` without losing the error. */
function unwrap<T, K extends string>(
  response: Result<Record<K, T>, ShohojError>,
  key: K,
): Result<T, ShohojError> {
  return response.ok ? { ok: true, value: response.value[key] } : response;
}

export function listSemesters(client: ApiClient, options?: ApiRequestOptions): Call<Semester[]> {
  return client
    .get('/semesters', SemesterListSchema, options)
    .then((response) => unwrap(response, 'items'));
}

/**
 * Create a semester, or update the one that already exists for that term.
 *
 * Idempotent server-side: the id is derived from the term, so calling this
 * twice for Fall 2026 leaves one semester. A caller does not need to check
 * first, and a retried request after a dropped connection is safe.
 */
export function createSemester(
  client: ApiClient,
  input: CreateSemesterInput,
  options?: ApiRequestOptions,
): Call<Semester> {
  return client
    .post('/semesters', input, SemesterResponseSchema, options)
    .then((response) => unwrap(response, 'semester'));
}

export function updateSemester(
  client: ApiClient,
  id: string,
  input: UpdateSemesterInput,
  options?: ApiRequestOptions,
): Call<Semester> {
  return client
    .patch(`/semesters/${encodeURIComponent(id)}`, input, SemesterResponseSchema, options)
    .then((response) => unwrap(response, 'semester'));
}

/**
 * Delete a semester, everything enrolled in it, and every task on those
 * enrolments.
 *
 * The cascade is not optional, so the result reports both counts — a student
 * should be told that four courses and thirty tasks left with the semester,
 * not discover it later.
 */
export function deleteSemester(
  client: ApiClient,
  id: string,
  options?: ApiRequestOptions,
): Call<{ id: string; removedEnrollments: number; removedTasks: number }> {
  return client
    .delete(`/semesters/${encodeURIComponent(id)}`, DeletedSemesterSchema, options)
    .then((response) => unwrap(response, 'deleted'));
}

export function listEnrollments(
  client: ApiClient,
  query: { semesterId?: string } = {},
  options?: ApiRequestOptions,
): Call<Enrollment[]> {
  const requestOptions: ApiRequestOptions =
    query.semesterId === undefined
      ? { ...options }
      : { ...options, query: { ...options?.query, semesterId: query.semesterId } };
  return client
    .get('/enrollments', EnrollmentListSchema, requestOptions)
    .then((response) => unwrap(response, 'items'));
}

/** Enrol a course. Idempotent: one course, one semester, one enrolment. */
export function createEnrollment(
  client: ApiClient,
  input: CreateEnrollmentInput,
  options?: ApiRequestOptions,
): Call<Enrollment> {
  return client
    .post('/enrollments', input, EnrollmentResponseSchema, options)
    .then((response) => unwrap(response, 'enrollment'));
}

export function updateEnrollment(
  client: ApiClient,
  id: string,
  input: UpdateEnrollmentInput,
  options?: ApiRequestOptions,
): Call<Enrollment> {
  return client
    .patch(`/enrollments/${encodeURIComponent(id)}`, input, EnrollmentResponseSchema, options)
    .then((response) => unwrap(response, 'enrollment'));
}

/** Drop a course. Its tasks go too; the count comes back so the UI can say so. */
export function deleteEnrollment(
  client: ApiClient,
  id: string,
  options?: ApiRequestOptions,
): Call<{ id: string; removedTasks: number }> {
  return client
    .delete(`/enrollments/${encodeURIComponent(id)}`, DeletedEnrollmentSchema, options)
    .then((response) => unwrap(response, 'deleted'));
}

// ── Derived views ───────────────────────────────────────────────────────────

/**
 * The student's active semester, or null.
 *
 * The server keeps at most one ACTIVE semester, but this does not assume it: a
 * race between two devices can briefly leave two, and picking the newest is a
 * stable answer rather than whichever the list happened to put first. The list
 * already arrives newest-first, so this is the first match.
 */
export function activeSemester(semesters: readonly Semester[]): Semester | null {
  return semesters.find((semester) => semester.status === 'ACTIVE') ?? null;
}

/** Total credits a student is carrying in a semester. Dropped courses do not count. */
export function enrolledCredits(enrollments: readonly Enrollment[]): number {
  return enrollments
    .filter((enrollment) => enrollment.status === 'ENROLLED' || enrollment.status === 'COMPLETED')
    .reduce((total, enrollment) => total + (enrollment.credits ?? 0), 0);
}
