// src/features/calculator/difficultyMap.ts
//
// Pure model for the Course Difficulty Map route — the typed port of the data +
// classification logic in the legacy js/ui/difficultyMap.js tab. It aggregates
// the difficulty + workload dimensions of every review, grouped by course, and
// exposes the tier/label/sort helpers the route renders. No I/O and no DOM: the
// route fetches the recent-reviews feed (the same FacultyReviewsProvider seam the
// /reviews route uses) and passes it in, so this stays unit-testable in isolation.

import { aggregateRatings, type ReviewLike } from '../../core/reviews';
import { getCourseDept, getCoursePrefix } from '../../core/catalog';
import type { CourseCatalog } from '../../core/types';

// A course with fewer than this many reviews is flagged "limited sample".
export const LOW_SAMPLE_UNDER = 3;

export interface DifficultyEntry {
  readonly code: string;
  readonly name: string;
  readonly credits: number | null;
  readonly dept: string;
  readonly count: number;
  readonly difficulty: number | null;
  readonly workload: number | null;
  readonly lowSample: boolean;
}

export type DifficultySort = 'code' | 'difficulty' | 'workload';

/** Score tier — 5 buckets from easiest (great) to hardest (bad). Drives the
 * colour classes in CSS; kept as data so both the bar fill and the tag agree. */
export type ScoreTier = '' | 'great' | 'good' | 'mid' | 'warn' | 'bad';

/** Groups reviews by course and aggregates each group's difficulty + workload.
 * Byte-for-byte the legacy _buildIndex: same low-sample cutoff, same dept
 * fallback (dept → prefix → '?'), same catalogue name/credits fallback. */
export function buildDifficultyIndex(
  reviews: readonly ReviewLike[],
  catalog: CourseCatalog,
): DifficultyEntry[] {
  const byCourse = new Map<string, ReviewLike[]>();
  for (const review of reviews) {
    const code = review.courseCode;
    if (!code) continue;
    const list = byCourse.get(code);
    if (list) list.push(review);
    else byCourse.set(code, [review]);
  }

  const entries: DifficultyEntry[] = [];
  for (const [code, revs] of byCourse) {
    const agg = aggregateRatings(revs);
    if (!agg) continue;
    const info = catalog[code];
    const dept = getCourseDept(code) || getCoursePrefix(code) || '?';
    entries.push({
      code,
      name: info?.name || code,
      credits: info?.credits ?? null,
      dept,
      count: revs.length,
      difficulty: agg.ratings.difficulty,
      workload: agg.ratings.workload,
      lowSample: revs.length < LOW_SAMPLE_UNDER,
    });
  }
  return entries;
}

/** The department filter list: 'ALL' plus every distinct dept, sorted. */
export function difficultyDepts(entries: readonly DifficultyEntry[]): string[] {
  return ['ALL', ...Array.from(new Set(entries.map((e) => e.dept))).sort()];
}

/** Applies the department filter (ALL = passthrough), leaving order untouched. */
export function filterByDept(entries: readonly DifficultyEntry[], dept: string): DifficultyEntry[] {
  return dept === 'ALL' ? [...entries] : entries.filter((e) => e.dept === dept);
}

/** Sorts by code (natural, case-insensitive) or by a numeric score descending
 * (null scores sink to the bottom), matching the legacy comparator exactly. */
export function sortDifficultyEntries(
  entries: readonly DifficultyEntry[],
  sortBy: DifficultySort,
): DifficultyEntry[] {
  return [...entries].sort((a, b) =>
    sortBy === 'code'
      ? a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
      : (b[sortBy] ?? 0) - (a[sortBy] ?? 0),
  );
}

/** Total reviews behind the whole index — the "Based on N reviews" subtitle. */
export function totalReviewCount(entries: readonly DifficultyEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count, 0);
}

export function scoreTier(value: number | null): ScoreTier {
  if (value === null) return '';
  if (value <= 2.0) return 'great';
  if (value <= 3.0) return 'good';
  if (value <= 3.7) return 'mid';
  if (value <= 4.3) return 'warn';
  return 'bad';
}

export function difficultyLabel(value: number | null): string {
  if (value === null) return '—';
  if (value <= 2.0) return 'Easy';
  if (value <= 3.0) return 'Moderate';
  if (value <= 3.7) return 'Challenging';
  if (value <= 4.3) return 'Hard';
  return 'Brutal';
}

export function workloadLabel(value: number | null): string {
  if (value === null) return '—';
  if (value <= 2.0) return 'Light';
  if (value <= 3.0) return 'Moderate';
  if (value <= 3.7) return 'Heavy';
  if (value <= 4.3) return 'Very Heavy';
  return 'Extreme';
}

/** Bar fill width as a 0–100 percentage of the 5-point scale. */
export function scorePct(value: number | null): number {
  return value !== null ? Math.round((value / 5) * 100) : 0;
}

/** Formats a score for display: one decimal, or an em dash when unrated. */
export function formatScore(value: number | null): string {
  return value !== null ? value.toFixed(1) : '—';
}
