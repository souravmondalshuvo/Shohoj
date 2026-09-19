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

/**
 * Where the built rating map is cached, and for how long.
 *
 * Deliberately NOT personal data — it is public aggregate, which is why both
 * `personalData` copies exclude it from the sign-out wipe. The key, the TTL and
 * the shape below live here rather than in a tab because two front ends write
 * this one key, and a format that drifts between them is a cache that poisons
 * whichever side reads it second (#688).
 */
export const RATING_CACHE_KEY = 'shohoj_routine_ratings_v1';
export const RATING_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** The JSON shape stored under RATING_CACHE_KEY. */
export interface RatingCachePayload {
  at: number;
  entries: FacultyRating[];
}

/** FacultyRating is flat and JSON-safe, so the map serializes as its values. */
export function serializeRatingCache(
  ratingMap: Map<string, FacultyRating>,
  now: number = Date.now(),
): RatingCachePayload {
  return { at: now, entries: Array.from(ratingMap.values()) };
}

/**
 * Rebuild the map from a cached string, or null when there is nothing usable:
 * absent, unparseable, the wrong shape, expired, or empty. Callers treat null
 * as "not cached" and fetch — so a corrupt entry costs a read, not an error.
 */
export function parseRatingCache(
  raw: string | null | undefined,
  now: number = Date.now(),
  ttlMs: number = RATING_CACHE_TTL_MS,
): Map<string, FacultyRating> | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<RatingCachePayload>;
  if (typeof payload.at !== 'number' || !Array.isArray(payload.entries)) return null;
  if (now - payload.at > ttlMs) return null;

  const map = new Map<string, FacultyRating>();
  for (const entry of payload.entries) {
    if (entry && typeof entry.initials === 'string' && entry.initials !== '') {
      map.set(entry.initials, entry);
    }
  }
  return map.size > 0 ? map : null;
}
