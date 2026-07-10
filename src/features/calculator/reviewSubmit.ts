// src/features/calculator/reviewSubmit.ts
//
// Typed submit boundary for the shell's faculty-review modal (#319): the
// orchestration half of js/core/reviews.js submitReview, with the environment
// injected. Validation mirrors the core's validateReview in the same order,
// with catalog membership as a predicate (the record-shaped catalog data stays
// on the legacy side, like reviewableCourse.ts). CalculatorRoute builds the
// environment: the transport is the typed provider relay (#353 — useSubmitReview
// → runReviewSubmit → submitReviewRelay), not a window hook. Absent transport
// or signed out it fails with the legacy 'Sign in to submit a review', so a
// shell without cloud capability still degrades like a signed-out session.

import { upsertFacultyProfile } from '../../core/faculty.ts';
import { RATING_KEYS } from '../../core/reviews.ts';
import type { ReviewPayload } from './reviewDraft.ts';

export interface ReviewSubmitResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly code?: string;
}

/** The injected write transport (legacy window._shohoj_submitReview's shape). */
export type ReviewSubmitHook = (payload: ReviewPayload) => Promise<ReviewSubmitResult | undefined>;

export interface ReviewSubmitEnv {
  /** Catalog membership check (validateReview's `!catalog[code]` step). */
  readonly isKnownCode: (code: string) => boolean;
  /** The transport (the provider relay), or null when unavailable. */
  readonly hook: ReviewSubmitHook | null;
  /** Current signed-in uid, or '' (legacy: window._shohoj_currentUid()). */
  readonly currentUid: () => string;
}

// The shell's only Window declaration for the legacy uid hook — still read by
// CalculatorRoute, FacultyReviewsProvider and CourseReviewsModal as the
// signed-in fallback (and the e2e uid seam).
declare global {
  interface Window {
    _shohoj_currentUid?: () => string | null | undefined;
  }
}

const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;

/** validateReview (src/core/reviews.ts), same checks and order, predicate-injected. */
export function validateReviewPayload(
  payload: ReviewPayload,
  isKnownCode: (code: string) => boolean,
): string | null {
  if (!payload.facultyInitials || payload.facultyInitials.length < 2) {
    return 'Faculty initials required';
  }
  if (!payload.courseCode) return 'Course code required';
  if (!COURSE_CODE_RE.test(payload.courseCode)) return 'Invalid course code';
  if (!isKnownCode(payload.courseCode)) return 'Unknown course code';
  for (const key of RATING_KEYS) {
    const v = payload.ratings[key];
    if (typeof v !== 'number' || v < 1 || v > 5) return `Rating "${key}" must be 1–5`;
  }
  if (payload.semester.length > 40) return 'Semester label too long';
  if (payload.text.length > 500) return 'Review text too long';
  return null;
}

/**
 * Submit a review through the injected environment. Mirrors the legacy
 * submitReview flow: validate, refuse without a signed-in transport, clamp the
 * payload (semester 40, text 500, ratings rounded — the draft already yields
 * integers; the clamp keeps parity for any caller), map the hook's result.
 */
export async function submitReview(
  payload: ReviewPayload,
  env: ReviewSubmitEnv,
): Promise<ReviewSubmitResult> {
  const err = validateReviewPayload(payload, env.isKnownCode);
  if (err) return { ok: false, error: err };

  if (!env.hook || !env.currentUid()) {
    return { ok: false, error: 'Sign in to submit a review' };
  }

  try {
    const res = await env.hook({
      facultyInitials: payload.facultyInitials,
      courseCode: payload.courseCode,
      semester: payload.semester.slice(0, 40),
      text: payload.text.slice(0, 500),
      ratings: {
        teaching: Math.round(payload.ratings.teaching),
        marking: Math.round(payload.ratings.marking),
        behavior: Math.round(payload.ratings.behavior),
        difficulty: Math.round(payload.ratings.difficulty),
        workload: Math.round(payload.ratings.workload),
      },
    });
    if (res && res.ok) {
      // Legacy parity: a successful review enriches the local faculty cache.
      upsertFacultyProfile({
        initials: payload.facultyInitials,
        courses: payload.courseCode ? [payload.courseCode] : [],
      });
      return { ok: true };
    }
    return { ok: false, error: res?.error || 'Submission failed', code: res?.code };
  } catch (e) {
    return { ok: false, error: (e instanceof Error && e.message) || 'Submission failed' };
  }
}
