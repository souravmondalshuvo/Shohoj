// src/features/calculator/facultyChipScore.ts
//
// Pure chip-score model for the faculty chip on /calculator (#337, Phase 5G
// slice d2). Mirrors render.js `_populateFacultyChips` / `_applyChipScore`: a
// faculty+course review list is aggregated into an `overall` (the mean of the
// first three rating dimensions — teaching/marking/behavior) and a `count`, and
// the chip shows `overall.toFixed(1)` only once at least CHIP_HIDE_UNDER reviews
// exist, else the `–` placeholder. The fetch/cache orchestration lives in the
// FacultyReviewsProvider; this module is the framework-free half.

import { RATING_KEYS, aggregateRatings } from '../../core/reviews.ts';
import type { ReviewLike } from '../../core/reviews.ts';

/** The `–` placeholder shown before scores load and while under the threshold. */
export const CHIP_PLACEHOLDER = '–';

/** Legacy HIDE_UNDER: fewer than this many reviews hides the aggregate. */
export const CHIP_HIDE_UNDER = 3;

export interface ChipAggregate {
  /** Mean of teaching/marking/behavior, or null when none are present. */
  readonly overall: number | null;
  /** Number of reviews behind the aggregate. */
  readonly count: number;
}

/**
 * Aggregate a faculty+course review list exactly as `_populateFacultyChips`:
 * average ratings across the list, then mean the first three dimensions.
 */
export function computeChipAggregate(reviews: readonly ReviewLike[]): ChipAggregate {
  const agg = aggregateRatings(reviews);
  if (!agg) return { overall: null, count: 0 };
  const vals = RATING_KEYS.slice(0, 3)
    .map((key) => agg.ratings[key])
    .filter((value): value is number => value !== null);
  const overall = vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : null;
  return { overall, count: agg.count };
}

/** The chip's score text: `overall.toFixed(1)` once past the threshold, else `–`. */
export function chipScoreLabel(overall: number | null, count: number): string {
  if (overall === null || count < CHIP_HIDE_UNDER) return CHIP_PLACEHOLDER;
  return overall.toFixed(1);
}
