// src/platform/firebase/reviewsRepo.ts
//
// Typed Firestore read repo for faculty reviews (#335, Phase 5G slice d1).
// Mirrors the userDocRepo pattern (#333): a repo interface over an injected
// Firestore surface (ReviewsBackend), defaulting to the lazy npm SDK via the
// shared firebaseClient, unit-testable with a fake, and loading the SDK chunk
// only when a signed-in shell actually reads reviews. The pure aggregation
// (aggregateByFaculty / buildReviewOverview) lives in src/core/reviews.ts — this
// module only fetches the docs to feed it.
//
// Parity target: the legacy window._shohoj_fetch{Reviews,ReviewsByCourse,
// ReviewById,FacultyProfiles} hooks in js/auth/firebase.js — same collection
// names (`facultyReviews`, `facultyProfiles`), createdAt-desc ordering, 200 cap,
// uppercased course codes, and 30-id chunking. Auth gating stays with the
// caller (like userDocRepo); this layer guards only on empty inputs so the SDK
// never loads for a no-op call. Firestore RULES remain the authorization
// boundary — this is a client convenience layer.
//
// TWO deliberate divergences from legacy parity (production-hardening pass):
//
//   1. Paging. Legacy measured page-fullness against the *requested* pageSize
//      while capping the query at 200, so any request over the cap dropped its
//      cursor and silently truncated. Both now use resolvePageSize().
//
//   2. Failures. Legacy (and this repo until now) swallowed every read error
//      into an empty array, making "permission denied" and "no reviews yet"
//      indistinguishable to the UI. Reads now reject with a typed ShohojError
//      so routes can render a real unavailable state. Callers MUST handle
//      rejection; an empty page/array now means genuinely-no-data only.

import type { QueryConstraint } from 'firebase/firestore';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import {
  FirebaseUnavailableError,
  PermissionError,
  type ShohojError,
} from '../../core/errors.ts';
import { normalizeCourseCode, normalizeInitials } from '../../core/reviews.ts';
import type { ReviewLike } from '../../core/reviews.ts';

/** A review doc as stored: the review shape plus its Firestore id. */
export type ReviewDoc = ReviewLike & { id: string };

/** A faculty profile doc: the initials (doc id) plus arbitrary profile fields. */
export type FacultyProfileDoc = { initials: string } & Record<string, unknown>;

/**
 * Opaque paging token, round-tripped from a page's `nextCursor` back into the
 * next call's `after`. Carries the backend's own last-doc handle (a Firestore
 * DocumentSnapshot for the real SDK, anything for a fake) — callers never
 * inspect it.
 */
export type ReviewCursor = unknown;

export interface ReviewPage {
  readonly reviews: readonly ReviewDoc[];
  readonly nextCursor: ReviewCursor | null;
}

const EMPTY_PAGE: ReviewPage = { reviews: [], nextCursor: null };

/**
 * Map a raw Firestore/SDK rejection onto the typed error hierarchy.
 *
 * These reads used to `catch { return [] }`, which made "the query failed" and
 * "this faculty genuinely has no reviews" the same value — the UI showed a
 * cheerful empty state while permission was denied or an index was missing.
 * Failures now surface as ShohojError so routes can render a distinct
 * unavailable state, and so the technical code reaches logs while only
 * `userMessage` reaches the user (docs/SECURITY.md).
 */
function toReviewsError(cause: unknown): ShohojError {
  const code = typeof (cause as { code?: unknown })?.code === 'string'
    ? (cause as { code: string }).code
    : '';
  // Firestore codes: https://firebase.google.com/docs/reference/js/firestore_.md
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return new PermissionError(`reviews read denied: ${code}`, { cause });
  }
  // 'failed-precondition' is overwhelmingly the missing-composite-index case
  // here; it is a deployment fault, not a user fault, so it must not read as
  // "no data".
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'failed-precondition') {
    return new FirebaseUnavailableError(`reviews read failed: ${code}`, { cause });
  }
  return new FirebaseUnavailableError(
    `reviews read failed: ${code || (cause instanceof Error ? cause.message : String(cause))}`,
    { cause },
  );
}

/** Run a read, translating any rejection into a typed ShohojError. */
async function readOrThrow<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    const error = toReviewsError(cause);
    // Log the machine-readable code only — never document contents or the
    // raw SDK message, which can carry query parameters.
    console.warn(`[reviewsRepo] ${error.code}`);
    throw error;
  }
}

/** Firestore's hard cap for a single reviews page (legacy Math.min(_, 200)). */
export const MAX_PAGE_SIZE = 200;

/** Page size used when the caller supplies a nonsensical one. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Resolve the page size actually used for a query.
 *
 * This exists because the requested size and the effective size used to be
 * allowed to diverge: the query was capped at MAX_PAGE_SIZE but page-fullness
 * was then measured against the *requested* size, so asking for 500 issued a
 * 200-row query, compared `200 === 500`, concluded the page was not full, and
 * dropped the cursor — silently truncating the result set at 200 with no way to
 * page further. Both the query limit and the fullness test must use this single
 * resolved value.
 *
 * Nonsensical inputs (0, negative, NaN, Infinity, fractional, non-numeric) fall
 * back to DEFAULT_PAGE_SIZE rather than throwing: this is a read path, and a
 * bad page size is a caller bug that should degrade to a sane page, not blank
 * the UI.
 */
export function resolvePageSize(requested: unknown, fallback: number = DEFAULT_PAGE_SIZE): number {
  const n = typeof requested === 'number' ? requested : Number(requested);
  if (!Number.isInteger(n) || n < 1) return Math.min(fallback, MAX_PAGE_SIZE);
  return Math.min(n, MAX_PAGE_SIZE);
}

/** Cap for the recent-reviews feed (legacy Math.min(_, 1000)). */
export const MAX_RECENT = 1000;

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface ReviewsBackend {
  /** where(facultyInitials ==) [+ where(courseCode ==)] orderBy createdAt desc. */
  queryByFaculty(args: {
    facultyInitials: string;
    courseCode?: string;
    limit: number;
    after: ReviewCursor | null;
  }): Promise<{ docs: ReviewDoc[]; last: ReviewCursor | null }>;
  /** where(courseCode ==) orderBy createdAt desc. */
  queryByCourse(args: {
    courseCode: string;
    limit: number;
    after: ReviewCursor | null;
  }): Promise<{ docs: ReviewDoc[]; last: ReviewCursor | null }>;
  /** A single facultyReviews doc by id, or null when absent. */
  getById(id: string): Promise<ReviewDoc | null>;
  /** orderBy createdAt desc, limited — the recent-reviews feed. */
  queryRecent(limit: number): Promise<ReviewDoc[]>;
  /** facultyProfiles for up to 30 ids via a single `in` query. */
  getFacultyProfiles(idsChunk: readonly string[]): Promise<FacultyProfileDoc[]>;
}

export interface ReviewsRepo {
  /** Reviews for a faculty, optionally narrowed to a course. Paged, newest first. */
  fetchByFaculty(args: {
    facultyInitials: string;
    courseCode?: string;
    pageSize?: number;
    after?: ReviewCursor | null;
  }): Promise<ReviewPage>;
  /** Reviews for a course across all faculty. Paged, newest first. */
  fetchByCourse(
    courseCode: string,
    opts?: { pageSize?: number; after?: ReviewCursor | null },
  ): Promise<ReviewPage>;
  /** The existing-review probe: a single review doc by canonical id, or null. */
  fetchById(id: string): Promise<ReviewDoc | null>;
  /** The most recent reviews across all faculty (the directory feed). */
  fetchRecent(limit?: number): Promise<ReviewDoc[]>;
  /** Faculty profile docs for the given initials (deduped, 30-id chunked). */
  fetchFacultyProfiles(initials: readonly string[]): Promise<FacultyProfileDoc[]>;
}

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<ReviewsBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    startAfter,
    limit: qLimit,
    documentId,
  } = await import('firebase/firestore');
  const db = getFirestore(app);
  const reviews = collection(db, 'facultyReviews');
  const profiles = collection(db, 'facultyProfiles');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toDoc = (d: any): ReviewDoc => ({ id: d.id, ...d.data() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastOf = (docs: any[]): ReviewCursor | null =>
    docs.length ? docs[docs.length - 1] : null;

  return {
    async queryByFaculty({ facultyInitials, courseCode, limit, after }) {
      const constraints: QueryConstraint[] = [where('facultyInitials', '==', facultyInitials)];
      if (courseCode) constraints.push(where('courseCode', '==', courseCode));
      constraints.push(orderBy('createdAt', 'desc'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (after) constraints.push(startAfter(after as any));
      constraints.push(qLimit(limit));
      const snap = await getDocs(query(reviews, ...constraints));
      return { docs: snap.docs.map(toDoc), last: lastOf(snap.docs) };
    },
    async queryByCourse({ courseCode, limit, after }) {
      const constraints: QueryConstraint[] = [
        where('courseCode', '==', courseCode),
        orderBy('createdAt', 'desc'),
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (after) constraints.push(startAfter(after as any));
      constraints.push(qLimit(limit));
      const snap = await getDocs(query(reviews, ...constraints));
      return { docs: snap.docs.map(toDoc), last: lastOf(snap.docs) };
    },
    async getById(id) {
      const snap = await getDoc(doc(db, 'facultyReviews', id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
    async queryRecent(limit) {
      const snap = await getDocs(query(reviews, orderBy('createdAt', 'desc'), qLimit(limit)));
      return snap.docs.map(toDoc);
    },
    async getFacultyProfiles(idsChunk) {
      const snap = await getDocs(
        query(profiles, where(documentId(), 'in', idsChunk as string[])),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return snap.docs.map((d: any) => ({ initials: d.id, ...d.data() }));
    },
  };
}

export interface ReviewsRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<ReviewsBackend>;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createReviewsRepo(options: ReviewsRepoOptions): ReviewsRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<ReviewsBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async fetchByFaculty({ facultyInitials, courseCode, pageSize = DEFAULT_PAGE_SIZE, after = null }) {
      const initials = normalizeInitials(facultyInitials);
      if (!initials) return EMPTY_PAGE;
      const code = courseCode ? normalizeCourseCode(courseCode) : undefined;
      const effectivePageSize = resolvePageSize(pageSize);
      const { docs, last } = await readOrThrow(async () =>
        (await load()).queryByFaculty({
          facultyInitials: initials,
          courseCode: code || undefined,
          limit: effectivePageSize,
          after,
        }),
      );
      // Fullness is measured against the SAME size the query used, so paging
      // no longer dies when the caller asks for more than the 200-row cap.
      const nextCursor = docs.length === effectivePageSize && last ? last : null;
      return { reviews: docs, nextCursor };
    },

    async fetchByCourse(courseCode, { pageSize = MAX_PAGE_SIZE, after = null } = {}) {
      const code = normalizeCourseCode(courseCode);
      if (!code) return EMPTY_PAGE;
      const effectivePageSize = resolvePageSize(pageSize, MAX_PAGE_SIZE);
      const { docs, last } = await readOrThrow(async () =>
        (await load()).queryByCourse({ courseCode: code, limit: effectivePageSize, after }),
      );
      const nextCursor = docs.length === effectivePageSize && last ? last : null;
      return { reviews: docs, nextCursor };
    },

    async fetchById(id) {
      if (!id || typeof id !== 'string') return null;
      return await readOrThrow(async () => (await load()).getById(id));
    },

    async fetchRecent(limit = 200) {
      // Legacy _shohoj_fetchRecentReviews cap: Math.min(n, 1000).
      const effective = Number.isInteger(limit) && limit > 0
        ? Math.min(limit, MAX_RECENT)
        : Math.min(200, MAX_RECENT);
      return await readOrThrow(async () => (await load()).queryRecent(effective));
    },

    async fetchFacultyProfiles(initials) {
      const normalized = [
        ...new Set((initials ?? []).map((i) => String(i).toUpperCase().trim()).filter(Boolean)),
      ];
      if (!normalized.length) return [];
      return await readOrThrow(async () => {
        const loaded = await load();
        const results: FacultyProfileDoc[] = [];
        for (let i = 0; i < normalized.length; i += 30) {
          const chunk = normalized.slice(i, i + 30);
          results.push(...(await loaded.getFacultyProfiles(chunk)));
        }
        return results;
      });
    },
  };
}
