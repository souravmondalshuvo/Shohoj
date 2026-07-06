// src/features/calculator/reviewProbe.ts
//
// The existing-review probe for the rate-faculty modal (#341, Phase 5G slice
// d3b). Mirrors the head of js/ui/reviews.js openReviewModal: before showing the
// form, look up whether this user already has a public review for the faculty+
// course pair, so an immutable review is shown read-only instead of an
// un-submittable form. The canonical doc id comes from the typed core
// (buildReviewDocId, #339); the uid + fetch are injected so the standalone shell
// (no uid) simply skips the probe and the config/e2e repo drives the lookup.

import { buildReviewDocId } from '../../core/reviews.ts';
import type { ReviewLike } from '../../core/reviews.ts';

/** The environment the probe reads (legacy: window._shohoj_currentUid + fetch). */
export interface ReviewProbeEnv {
  /** Signed-in uid, or '' when signed out (probe skipped). */
  readonly currentUid: () => string;
  /** Fetch a review doc by canonical id, or null (the typed repo's fetchById). */
  readonly fetchById: (id: string) => Promise<ReviewLike | null>;
}

/**
 * Return this user's existing review for the pair, or null. Mirrors the legacy
 * guard order: needs initials + course + a uid; any lookup error is swallowed
 * (a failed probe just shows the form, never blocks reviewing).
 */
export async function probeExistingReview(
  initials: string,
  courseCode: string,
  env: ReviewProbeEnv,
): Promise<ReviewLike | null> {
  if (!initials || !courseCode) return null;
  const uid = env.currentUid();
  if (!uid) return null;
  try {
    const id = await buildReviewDocId(uid, initials, courseCode);
    return await env.fetchById(id);
  } catch {
    return null;
  }
}
