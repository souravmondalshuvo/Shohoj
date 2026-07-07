// src/features/calculator/reviewSubmitFlow.ts
//
// The pure half of the provider's submitReview (#353): submit through the
// injected worker relay (reviewsWriteRepo.ts, #347), and on a successful write
// invalidate the faculty+course pair's cached chip score so the live label
// refetches. Kept out of the React component so the "invalidate only on ok"
// rule is unit-testable without a renderer — the same pure-first split as
// facultyChipScore / reviewsDirectory. FacultyReviewsProvider supplies the live
// relay, workerUrl (config.papersWorkerUrl), token getter (useIdToken), and the
// invalidate callback.

import type {
  ReviewRelayOptions,
  ReviewSubmission,
  ReviewSubmitResult,
} from '../../platform/firebase/reviewsWriteRepo';

export interface ReviewSubmitFlowDeps {
  /** The relay transport (submitReviewRelay), injectable for tests. */
  readonly relay: (
    submission: ReviewSubmission,
    options: ReviewRelayOptions,
  ) => Promise<ReviewSubmitResult>;
  /** The reviews Worker base URL (config.papersWorkerUrl). */
  readonly workerUrl: string | null | undefined;
  /** Current Firebase ID token getter (the auth boundary's getIdToken). */
  readonly getToken: () => Promise<string | null>;
  /** Invalidate the pair's cached chip score — called only after an ok write. */
  readonly onSubmitted: (facultyInitials: string, courseCode: string) => void;
}

/**
 * Submit a review, then invalidate the pair's chip on success. A failed or
 * duplicate (409) submission leaves the cache untouched — only a real new write
 * changes the aggregate. Returns the relay's result unchanged.
 */
export async function runReviewSubmit(
  submission: ReviewSubmission,
  deps: ReviewSubmitFlowDeps,
): Promise<ReviewSubmitResult> {
  const result = await deps.relay(submission, {
    workerUrl: deps.workerUrl,
    getToken: deps.getToken,
  });
  if (result.ok) deps.onSubmitted(submission.facultyInitials, submission.courseCode);
  return result;
}
