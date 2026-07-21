/**
 * Routine ↔ Faculty Reviews bridge.
 *
 * Cross-references the live CONNECT feed (which only gives us faculty
 * initials like "ABC") with the existing review aggregations so the
 * Routine Builder can show a ★ next to each section's faculty.
 *
 * Pure: takes a normalized reviews-aggregation list, returns a lookup map.
 * The async fetch lives in the runtime (`routineTab.js`).
 */

import type { NormalizedSection } from './connectFeed';

export interface AggregatedFacultyEntry {
  facultyInitials: string;
  count: number;
  overall: number | null;
  ratings?: {
    teaching: number | null;
    marking: number | null;
    behavior: number | null;
    difficulty: number | null;
    workload: number | null;
  };
}

export interface FacultyRating {
  initials: string;
  overall: number | null;
  count: number;
  /** Bucket name for CSS class selection. */
  tier: RatingTier;
}

export type RatingTier = 'excellent' | 'good' | 'mid' | 'warn' | 'bad' | 'low-sample' | 'unknown';

export const LOW_SAMPLE_THRESHOLD = 3;

export function ratingTier(overall: number | null, count: number): RatingTier {
  if (overall === null) return 'unknown';
  if (count < LOW_SAMPLE_THRESHOLD) return 'low-sample';
  if (overall >= 4.3) return 'excellent';
  if (overall >= 3.7) return 'good';
  if (overall >= 3.0) return 'mid';
  if (overall >= 2.0) return 'warn';
  return 'bad';
}

function normalizeKey(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}

/**
 * Turn the output of `aggregateByFaculty(reviews)` (or any list with the same
 * shape) into a Map keyed by normalized initials, with a precomputed tier.
 * Empty / invalid entries are silently skipped.
 */
export function buildFacultyRatingMap(
  aggregated: readonly AggregatedFacultyEntry[],
): Map<string, FacultyRating> {
  const out = new Map<string, FacultyRating>();
  if (!Array.isArray(aggregated)) return out;
  for (const entry of aggregated) {
    if (!entry || typeof entry !== 'object') continue;
    const key = normalizeKey(entry.facultyInitials);
    if (!key) continue;
    const count = typeof entry.count === 'number' && entry.count > 0 ? entry.count : 0;
    const overall = typeof entry.overall === 'number' ? entry.overall : null;
    out.set(key, {
      initials: key,
      overall,
      count,
      tier: ratingTier(overall, count),
    });
  }
  return out;
}

export function getRatingForSection(
  section: Pick<NormalizedSection, 'facultyInitials'>,
  ratingMap: Map<string, FacultyRating>,
): FacultyRating | null {
  const key = normalizeKey(section.facultyInitials);
  if (!key) return null;
  return ratingMap.get(key) ?? null;
}

export function formatRatingScore(value: number | null, digits: number = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}
