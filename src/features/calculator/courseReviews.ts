// src/features/calculator/courseReviews.ts
//
// Pure model for the course-reviews viewer (#343, Phase 5G slice d3c-i). Mirrors
// the row build in js/ui/reviews.js openCourseReviewsPanel: group a course's
// reviews by faculty (aggregateByFaculty) and attach up to two latest text
// snippets per faculty, each capped at 220 chars with an ellipsis. Framework-
// free; the modal renders these, the repo fetches them.

import { aggregateByFaculty, normalizeInitials } from '../../core/reviews.ts';
import type { FacultyAggregate, ReviewLike } from '../../core/reviews.ts';

/** How many recent snippets to show per faculty, and their character cap. */
export const MAX_SNIPPETS = 2;
export const SNIPPET_MAX = 220;

/** A shown review snippet: the clamped text plus its review id (for Report). */
export interface CourseReviewSnippet {
  readonly text: string;
  /** The review doc id, or null when the source review carried none. */
  readonly id: string | null;
}

export interface CourseReviewGroup extends FacultyAggregate {
  /** Up to MAX_SNIPPETS latest review snippets, each text clamped to SNIPPET_MAX. */
  readonly snippets: readonly CourseReviewSnippet[];
}

function clampSnippet(text: string): string {
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
}

/**
 * Group a course's reviews by faculty (aggregateByFaculty order: count desc)
 * and attach the latest text snippets. `reviews` is assumed newest-first (the
 * repo returns createdAt desc), matching the legacy panel's snippet order.
 */
export function buildCourseReviewGroups(reviews: readonly ReviewLike[]): CourseReviewGroup[] {
  const groups = aggregateByFaculty(reviews);
  return groups.map((group) => {
    const snippets = reviews
      .filter(
        (review) =>
          normalizeInitials(review.facultyInitials) === group.facultyInitials &&
          typeof review.text === 'string' &&
          review.text.length > 0,
      )
      .slice(0, MAX_SNIPPETS)
      .map((review) => ({ text: clampSnippet(review.text as string), id: review.id ?? null }));
    return { ...group, snippets };
  });
}
