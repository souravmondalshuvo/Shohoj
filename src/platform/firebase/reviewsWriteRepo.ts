// src/platform/firebase/reviewsWriteRepo.ts
//
// Typed submit relay for faculty reviews (Phase 5G/6, #347). The write
// counterpart of the read repo (reviewsRepo.ts, #335): where reads hit Firestore
// directly, a create is *denied* to clients by the Firestore rules, so the only
// path is the Cloudflare Worker (`POST /reviews`, worker/index.js handleReview),
// which mints the deterministic doc id server-side and writes with a service
// account. This module is therefore a plain HTTP relay, not a Firestore backend:
// it POSTs the review with the caller's Firebase ID token and maps the worker's
// status codes to a typed result.
//
// Parity target: js/auth/firebase.js window._shohoj_submitReview — same request
// body (facultyInitials/courseCode/semester/text/ratings), the same 409
// "already reviewed" message, `.error` extraction on other failures, and the
// `{ ok, id }` success shape. The workerUrl (config.papersWorkerUrl) and the
// token getter are injected; the provider wiring (a later slice) supplies the
// live values and `fetch` is injectable so the relay is unit-testable offline.

import type { ReviewRatings } from '../../core/reviews.ts';

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
