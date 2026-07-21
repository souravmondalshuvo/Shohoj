// src/platform/firebase/reviewsWriteRepo.ts
//
// Typed write path for faculty reviews (Phase 5G/6). The write counterpart of
// the read repo (reviewsRepo.ts, #335), holding the two client writes:
//
//  - submitReviewRelay (#347): a *review create* is denied to clients by the
//    Firestore rules, so it goes through the Cloudflare Worker (`POST /reviews`,
//    worker/index.js handleReview), which mints the deterministic doc id
//    server-side and writes with a service account. A plain HTTP relay.
//  - createReviewReportRepo (#359): a *report* is a client-allowed write to the
//    separate `reviewReports` collection, so it's a direct Firestore setDoc at
//    the deterministic id (buildReviewReportId), lazy-loading the SDK like the
//    read repo.
//
// Parity: js/auth/firebase.js window._shohoj_submitReview (relay body, 409
// "already reviewed", `.error` extraction, `{ ok, id }`) and _shohoj_reportReview
// + js/core/reviews.js reportReview (uid/id/reason validation, the
// permission-denied message). Config, token getter, fetch, and the Firestore
// backend are injected so both writes are unit-testable offline.

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import { buildReviewReportId, isValidReviewId, type ReviewRatings } from '../../core/reviews.ts';

/** The review body posted to the worker (legacy _shohoj_submitReview payload). */
export interface ReviewSubmission {
  readonly facultyInitials: string;
  readonly courseCode: string;
  readonly semester: string;
  readonly text: string;
  readonly ratings: ReviewRatings;
}

/**
 * The relay outcome. `id` is the worker-assigned doc id on success (or null when
 * the worker omits it); `code` carries `already-exists` for the 409 case so a
 * caller can distinguish the immutable-duplicate outcome from a generic failure.
 */
export interface ReviewSubmitResult {
  readonly ok: boolean;
  readonly id?: string | null;
  readonly error?: string;
  readonly code?: string;
}

export interface ReviewRelayOptions {
  /** The papers/reviews Worker base URL (config.papersWorkerUrl). */
  readonly workerUrl: string | null | undefined;
  /** Current Firebase ID token, or null when signed out / unavailable. */
  readonly getToken: () => Promise<string | null>;
  /** Injectable fetch (tests); defaults to the global. */
  readonly fetchImpl?: typeof fetch;
}

/** Legacy message for a 409 — a review is immutable once created. */
const ALREADY_EXISTS_MESSAGE =
  'You have already submitted a review for this faculty-course pair. Reviews cannot be edited from the client.';

/**
 * Relay a review submission to the Worker. Mirrors the legacy hook's guard order
 * and result mapping: missing config or token fail before any network call; a
 * 409 is the immutable-duplicate case; any other non-2xx surfaces the worker's
 * `.error`; a network throw degrades to a generic failure. Never throws.
 */
export async function submitReviewRelay(
  submission: ReviewSubmission,
  options: ReviewRelayOptions,
): Promise<ReviewSubmitResult> {
  const base = options.workerUrl;
  if (!base) return { ok: false, error: 'Review service not configured' };

  const token = await options.getToken();
  if (!token) return { ok: false, error: 'Could not get auth token' };

  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${base}/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facultyInitials: submission.facultyInitials,
        courseCode: submission.courseCode,
        semester: submission.semester || '',
        text: submission.text || '',
        ratings: submission.ratings,
      }),
    });

    if (res.status === 409) {
      return { ok: false, code: 'already-exists', error: ALREADY_EXISTS_MESSAGE };
    }
    if (!res.ok) {
      let message = 'Submission failed';
      try {
        message = ((await res.json()) as { error?: string }).error || message;
      } catch {
        /* non-JSON body — keep the generic message */
      }
      return { ok: false, error: message };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string | null };
    return { ok: true, id: data.id ?? null };
  } catch (e) {
    return { ok: false, error: (e instanceof Error && e.message) || 'Submission failed' };
  }
}

// ── Report a review (direct Firestore write to `reviewReports`) ───────────────

/** A report to file against a review (legacy _shohoj_reportReview args). */
export interface ReviewReportInput {
  readonly reviewId: string;
  readonly reason: string;
  /** The reporting user's uid; the report id + reporterUid derive from it. */
  readonly uid: string;
}

/** The report outcome (same shape as a submit result; no id). */
export type ReviewReportResult = ReviewSubmitResult;

/** The Firestore surface the report write needs (real SDK or a test fake). */
export interface ReviewReportBackend {
  /** setDoc(reviewReports/{id}) with the report fields + a server createdAt. */
  createReport(
    id: string,
    data: { reviewId: string; reason: string; reporterUid: string },
  ): Promise<void>;
}

/** Legacy _shohoj_reportReview permission-denied copy. */
const REPORT_DENIED_MESSAGE =
  'Report could not be submitted. The review may have already been removed or you may have reported it already.';

/** Max report reason length (legacy slice(0, 300)); min 3 chars after trim. */
export const REPORT_REASON_MAX = 300;

async function defaultReportBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<ReviewReportBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore(app);
  return {
    async createReport(id, data) {
      await setDoc(doc(db, 'reviewReports', id), { ...data, createdAt: serverTimestamp() });
    },
  };
}

export interface ReviewReportRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<ReviewReportBackend>;
}

export interface ReviewReportRepo {
  /** File a moderation report against a review; deterministic id, never throws. */
  reportReview(input: ReviewReportInput): Promise<ReviewReportResult>;
}

/**
 * Create the report repo; the Firestore SDK loads on first use, shared after.
 * Mirrors js/core/reviews.js reportReview's guard order — signed-out and an
 * invalid review reference fail before any load; a too-short reason is rejected;
 * a Firestore permission-denied maps to the legacy moderation copy.
 */
export function createReviewReportRepo(options: ReviewReportRepoOptions): ReviewReportRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultReportBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<ReviewReportBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async reportReview({ reviewId, reason, uid }) {
      if (!uid) return { ok: false, error: 'Sign in to report a review' };
      if (!isValidReviewId(reviewId)) return { ok: false, error: 'Invalid review reference' };
      const trimmed = String(reason ?? '')
        .trim()
        .slice(0, REPORT_REASON_MAX);
      if (trimmed.length < 3) return { ok: false, error: 'Please describe the issue' };
      try {
        await (
          await load()
        ).createReport(buildReviewReportId(reviewId, uid), {
          reviewId: String(reviewId).trim(),
          reason: trimmed,
          reporterUid: uid,
        });
        return { ok: true };
      } catch (e) {
        if ((e as { code?: string } | null)?.code === 'permission-denied') {
          return { ok: false, error: REPORT_DENIED_MESSAGE };
        }
        return { ok: false, error: (e instanceof Error && e.message) || 'Report failed' };
      }
    },
  };
}
