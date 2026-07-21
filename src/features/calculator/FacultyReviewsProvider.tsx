// src/features/calculator/FacultyReviewsProvider.tsx
//
// Live faculty chip scores on /calculator (#337, Phase 5G slice d2). Ports
// render.js `_populateFacultyChips`: for each visible chip (keyed by faculty
// initials + course code) it fetches that pair's reviews through the typed
// reviewsRepo (d1, #335), aggregates them with the pure facultyChipScore model,
// caches the result, and hands the label back to the chip. Fetch is lazy and
// deduped per key; a submitted review invalidates its key so the next render
// refetches.
//
// The repo is resolved from the runtime config (createReviewsRepo, mirroring
// CloudSyncProvider) — so an unconfigured/offline shell has no repo and every
// chip stays `–`, exactly like a signed-out legacy session where
// fetchReviewsForFaculty returns empty. e2e injects a fake repo via
// window.__shohojReviewsRepo. The context defaults to null, so useFacultyChipScore
// is safe even where no provider is mounted (the React island path).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { normalizeCourseCode, normalizeInitials } from '../../core/reviews';
import {
  createReviewsRepo,
  type ReviewDoc,
  type ReviewsRepo,
} from '../../platform/firebase/reviewsRepo';
import {
  createReviewReportRepo,
  submitReviewRelay,
  type ReviewRelayOptions,
  type ReviewReportRepo,
  type ReviewReportResult,
  type ReviewSubmission,
  type ReviewSubmitResult,
} from '../../platform/firebase/reviewsWriteRepo';
import { runReviewSubmit } from './reviewSubmitFlow';
import { recordMyReview } from './myReviewsReceipt';
import { useRuntimeConfig } from '../../app/providers/RuntimeConfigProvider';
import { useAuth, useIdToken } from '../../app/providers/AuthProvider';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';
import { CHIP_PLACEHOLDER, chipScoreLabel, computeChipAggregate } from './facultyChipScore';

/** How many reviews the legacy chip fetch pulls per faculty+course. */
const CHIP_PAGE_SIZE = 100;

interface FacultyReviewsApi {
  /** Kick off (once) the fetch for a chip's faculty+course pair. */
  request(initials: string, courseCode: string): void;
  /** The current score label for the pair (`–` until ready / when unavailable). */
  labelFor(initials: string, courseCode: string): string;
  /** Drop a pair's cache so the next request refetches (after a submit). */
  invalidate(initials: string, courseCode: string): void;
  /** Fetch a review doc by canonical id (the existing-review probe); null when no repo. */
  fetchReviewById(id: string): Promise<ReviewDoc | null>;
  /** All reviews for a course (the course-reviews viewer); empty when no repo. */
  fetchReviewsByCourse(courseCode: string): Promise<ReviewDoc[]>;
  /** The recent-reviews feed (the Browse Reviews directory); empty when no repo. */
  fetchRecentReviews(limit?: number): Promise<ReviewDoc[]>;
  /** Submit a review through the worker relay; invalidates the pair's chip on ok. */
  submitReview(submission: ReviewSubmission): Promise<ReviewSubmitResult>;
  /** Report a review for moderation (reviewReports write); no-op when signed out. */
  reportReview(reviewId: string, reason: string): Promise<ReviewReportResult>;
}

/** The relay call, injectable so tests drive submit without a live worker. */
export type ReviewRelay = (
  submission: ReviewSubmission,
  options: ReviewRelayOptions,
) => Promise<ReviewSubmitResult>;

const FacultyReviewsContext = createContext<FacultyReviewsApi | null>(null);

declare global {
  interface Window {
    /** e2e seam: a stub repo the provider uses in place of the config-built one. */
    __shohojReviewsRepo?: ReviewsRepo;
    /** e2e seam: a stub relay driving submit without a live worker. */
    __shohojSubmitRelay?: ReviewRelay;
    /** e2e seam: a stub report repo driving reports without Firestore. */
    __shohojReportRepo?: ReviewReportRepo;
  }
}

const keyOf = (initials: string, courseCode: string) =>
  `${normalizeInitials(initials)}|${normalizeCourseCode(courseCode)}`;

export interface FacultyReviewsProviderProps {
  /** Explicit repo (tests); otherwise resolved from window override / config. */
  readonly repo?: ReviewsRepo | null;
  /** Explicit relay (tests); defaults to the live worker POST. */
  readonly submitRelay?: ReviewRelay;
  /** Explicit report repo (tests); otherwise window override / config. */
  readonly reportRepo?: ReviewReportRepo | null;
  readonly children: ReactNode;
}

export function FacultyReviewsProvider({
  repo,
  submitRelay,
  reportRepo,
  children,
}: FacultyReviewsProviderProps) {
  const config = useRuntimeConfig();
  const getIdToken = useIdToken();
  const auth = useAuth();
  // One store for the receipt writes over the provider's lifetime.
  const store = useMemo(() => createBrowserStore(), []);

  // Resolve the relay like the repo: an explicit prop wins, then the e2e window
  // stub, then the live worker POST.
  const resolvedSubmitRelay = useMemo<ReviewRelay>(() => {
    if (submitRelay) return submitRelay;
    if (typeof window !== 'undefined' && window.__shohojSubmitRelay)
      return window.__shohojSubmitRelay;
    return submitReviewRelay;
  }, [submitRelay]);

  // Resolve the repo once: an explicit prop wins (tests), then the e2e window
  // stub, then a config-built repo; null when the shell isn't configured.
  const resolvedRepo = useMemo<ReviewsRepo | null>(() => {
    if (repo !== undefined) return repo;
    if (typeof window !== 'undefined' && window.__shohojReviewsRepo)
      return window.__shohojReviewsRepo;
    if (config)
      return createReviewsRepo({
        config: config.firebase,
        recaptchaV3SiteKey: config.recaptchaV3SiteKey,
      });
    return null;
  }, [repo, config]);

  // The report repo resolves the same way (prop → e2e stub → config-built).
  const resolvedReportRepo = useMemo<ReviewReportRepo | null>(() => {
    if (reportRepo !== undefined) return reportRepo;
    if (typeof window !== 'undefined' && window.__shohojReportRepo)
      return window.__shohojReportRepo;
    if (config)
      return createReviewReportRepo({
        config: config.firebase,
        recaptchaV3SiteKey: config.recaptchaV3SiteKey,
      });
    return null;
  }, [reportRepo, config]);

  // Keyed label cache; a state version bump makes the context value change
  // identity so consumers (chips) re-render when labels land — the provider's
  // children element is otherwise stable and would bail out of re-rendering.
  const labels = useRef(new Map<string, string>());
  const inflight = useRef(new Set<string>());
  const [version, bump] = useState(0);

  // A fresh repo (sign-in/out, config change) clears everything.
  useEffect(() => {
    labels.current.clear();
    inflight.current.clear();
    bump((n) => n + 1);
  }, [resolvedRepo]);

  const request = useCallback(
    (initials: string, courseCode: string) => {
      const norm = keyOf(initials, courseCode);
      const [fac, code] = norm.split('|');
      if (!fac || !code || !resolvedRepo) return;
      if (labels.current.has(norm) || inflight.current.has(norm)) return;
      inflight.current.add(norm);
      void resolvedRepo
        .fetchByFaculty({ facultyInitials: fac, courseCode: code, pageSize: CHIP_PAGE_SIZE })
        .then(({ reviews }) => {
          const { overall, count } = computeChipAggregate(reviews);
          labels.current.set(norm, chipScoreLabel(overall, count));
        })
        .catch(() => {
          // Legacy parity: a failed fetch drops the key so a later render retries.
        })
        .finally(() => {
          inflight.current.delete(norm);
          bump((n) => n + 1);
        });
    },
    [resolvedRepo],
  );

  const labelFor = useCallback(
    (initials: string, courseCode: string) =>
      labels.current.get(keyOf(initials, courseCode)) ?? CHIP_PLACEHOLDER,
    [],
  );

  const invalidate = useCallback((initials: string, courseCode: string) => {
    const norm = keyOf(initials, courseCode);
    labels.current.delete(norm);
    inflight.current.delete(norm);
    bump((n) => n + 1);
  }, []);

  const fetchReviewById = useCallback(
    async (id: string): Promise<ReviewDoc | null> => {
      if (!resolvedRepo) return null;
      return resolvedRepo.fetchById(id);
    },
    [resolvedRepo],
  );

  const fetchReviewsByCourse = useCallback(
    async (courseCode: string): Promise<ReviewDoc[]> => {
      if (!resolvedRepo) return [];
      const { reviews } = await resolvedRepo.fetchByCourse(courseCode);
      return [...reviews];
    },
    [resolvedRepo],
  );

  const fetchRecentReviews = useCallback(
    async (limit?: number): Promise<ReviewDoc[]> => {
      if (!resolvedRepo) return [];
      return resolvedRepo.fetchRecent(limit);
    },
    [resolvedRepo],
  );

  const submitReview = useCallback(
    async (submission: ReviewSubmission): Promise<ReviewSubmitResult> => {
      const result = await runReviewSubmit(submission, {
        relay: resolvedSubmitRelay,
        workerUrl: config?.papersWorkerUrl,
        getToken: getIdToken,
        onSubmitted: invalidate,
      });
      if (result.ok) {
        // Legacy _recordMyReview: stamp the local receipt the Profile tab reads.
        const uid =
          auth.uid || (typeof window !== 'undefined' ? window._shohoj_currentUid?.() : '') || '';
        recordMyReview(store, uid, {
          id: result.id ?? null,
          facultyInitials: submission.facultyInitials,
          courseCode: submission.courseCode,
          semester: submission.semester,
          at: Date.now(),
        });
      }
      return result;
    },
    [resolvedSubmitRelay, config, getIdToken, invalidate, auth.uid, store],
  );

  const reportReview = useCallback(
    async (reviewId: string, reason: string): Promise<ReviewReportResult> => {
      if (!resolvedReportRepo) return { ok: false, error: 'Sign in to report a review' };
      const uid =
        auth.uid || (typeof window !== 'undefined' ? window._shohoj_currentUid?.() : '') || '';
      return resolvedReportRepo.reportReview({ reviewId, reason, uid });
    },
    [resolvedReportRepo, auth.uid],
  );

  // `version` is a dep so each bump yields a new value object → chips re-render
  // and re-read labelFor (which reads the mutable label cache).
  const api = useMemo<FacultyReviewsApi>(
    () => ({
      request,
      labelFor,
      invalidate,
      fetchReviewById,
      fetchReviewsByCourse,
      fetchRecentReviews,
      submitReview,
      reportReview,
    }),
    [
      request,
      labelFor,
      invalidate,
      fetchReviewById,
      fetchReviewsByCourse,
      fetchRecentReviews,
      submitReview,
      reportReview,
      version,
    ],
  );

  return <FacultyReviewsContext.Provider value={api}>{children}</FacultyReviewsContext.Provider>;
}

/**
 * The chip's live score label. Requests the faculty+course pair on mount and
 * returns `–` until it resolves — or always, where no provider is mounted.
 */
export function useFacultyChipScore(initials: string, courseCode: string): string {
  const ctx = useContext(FacultyReviewsContext);
  useEffect(() => {
    ctx?.request(initials, courseCode);
  }, [ctx, initials, courseCode]);
  return ctx?.labelFor(initials, courseCode) ?? CHIP_PLACEHOLDER;
}

/** Invalidate a pair's cached score (e.g. after submitting a review for it). */
export function useInvalidateFacultyChipScore(): (initials: string, courseCode: string) => void {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback(
    (initials: string, courseCode: string) => ctx?.invalidate(initials, courseCode),
    [ctx],
  );
}

/** Fetch a review by canonical id through the resolved repo (the modal probe). */
export function useFetchReviewById(): (id: string) => Promise<ReviewDoc | null> {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback((id: string) => ctx?.fetchReviewById(id) ?? Promise.resolve(null), [ctx]);
}

/** Fetch a course's reviews through the resolved repo (the course-reviews viewer). */
export function useFetchReviewsByCourse(): (courseCode: string) => Promise<ReviewDoc[]> {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback(
    (code: string) => ctx?.fetchReviewsByCourse(code) ?? Promise.resolve([]),
    [ctx],
  );
}

/** Fetch the recent-reviews feed through the resolved repo (the Browse directory). */
export function useFetchRecentReviews(): (limit?: number) => Promise<ReviewDoc[]> {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback((limit) => ctx?.fetchRecentReviews(limit) ?? Promise.resolve([]), [ctx]);
}

/**
 * Submit a review through the provider's worker relay. Resolves `{ ok:false }`
 * with the legacy signed-out message where no provider is mounted (standalone
 * island), so callers get a uniform result shape.
 */
export function useSubmitReview(): (submission: ReviewSubmission) => Promise<ReviewSubmitResult> {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback(
    (submission: ReviewSubmission) =>
      ctx?.submitReview(submission) ??
      Promise.resolve({ ok: false, error: 'Sign in to submit a review' }),
    [ctx],
  );
}

/**
 * Report a review through the provider (the reviewReports write). Resolves the
 * signed-out message where no provider/report repo is available.
 */
export function useReportReview(): (
  reviewId: string,
  reason: string,
) => Promise<ReviewReportResult> {
  const ctx = useContext(FacultyReviewsContext);
  return useCallback(
    (reviewId: string, reason: string) =>
      ctx?.reportReview(reviewId, reason) ??
      Promise.resolve({ ok: false, error: 'Sign in to report a review' }),
    [ctx],
  );
}
