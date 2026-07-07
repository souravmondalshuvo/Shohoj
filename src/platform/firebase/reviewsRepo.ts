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
// pageSize-vs-cursor quirk, uppercased course codes, and 30-id chunking. Auth
// gating stays with the caller (like userDocRepo); this layer guards only on
// empty inputs so the SDK never loads for a no-op call. Firestore RULES remain
// the authorization boundary — this is a client convenience layer.

import type { QueryConstraint } from 'firebase/firestore';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
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

/** Firestore's hard cap for a single reviews page (legacy Math.min(_, 200)). */
export const MAX_PAGE_SIZE = 200;

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
    async fetchByFaculty({ facultyInitials, courseCode, pageSize = 50, after = null }) {
      const initials = normalizeInitials(facultyInitials);
      if (!initials) return EMPTY_PAGE;
      const code = courseCode ? normalizeCourseCode(courseCode) : undefined;
      try {
        const { docs, last } = await (await load()).queryByFaculty({
          facultyInitials: initials,
          courseCode: code || undefined,
          limit: Math.min(pageSize, MAX_PAGE_SIZE),
          after,
        });
        // Legacy quirk: fullness is measured against the *requested* pageSize,
        // not the 200-cap — so paging silently stops when pageSize > 200.
        const nextCursor = docs.length === pageSize && last ? last : null;
        return { reviews: docs, nextCursor };
      } catch {
        // Legacy parity: a failed read behaves like "no reviews".
        return EMPTY_PAGE;
      }
    },

    async fetchByCourse(courseCode, { pageSize = MAX_PAGE_SIZE, after = null } = {}) {
      const code = normalizeCourseCode(courseCode);
      if (!code) return EMPTY_PAGE;
      try {
        const { docs, last } = await (await load()).queryByCourse({
          courseCode: code,
          limit: Math.min(pageSize, MAX_PAGE_SIZE),
          after,
        });
        const nextCursor = docs.length === pageSize && last ? last : null;
        return { reviews: docs, nextCursor };
      } catch {
        return EMPTY_PAGE;
      }
    },

    async fetchById(id) {
      if (!id || typeof id !== 'string') return null;
      try {
        return await (await load()).getById(id);
      } catch {
        return null;
      }
    },

    async fetchRecent(limit = 200) {
      try {
        // Legacy _shohoj_fetchRecentReviews cap: Math.min(n, 1000).
        return await (await load()).queryRecent(Math.min(Math.max(limit, 0), MAX_RECENT));
      } catch {
        return [];
      }
    },

    async fetchFacultyProfiles(initials) {
      const normalized = [
        ...new Set((initials ?? []).map((i) => String(i).toUpperCase().trim()).filter(Boolean)),
      ];
      if (!normalized.length) return [];
      try {
        const loaded = await load();
        const results: FacultyProfileDoc[] = [];
        for (let i = 0; i < normalized.length; i += 30) {
          const chunk = normalized.slice(i, i + 30);
          results.push(...(await loaded.getFacultyProfiles(chunk)));
        }
        return results;
      } catch {
        return [];
      }
    },
  };
}
