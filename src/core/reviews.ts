// src/core/reviews.ts
//
// Typed, browser-independent core for faculty reviews (migration Step 2).
// Pure logic only — no DOM, no Firebase. The course catalog is injected by the
// caller (mirroring planner.ts) instead of imported, so this module stays free
// of the large generated catalog. The runtime js/core/reviews.js keeps the same
// behavior; parity is guarded by tests/typedCoreParity.test.js.

import type { CourseCatalog } from './types';

export const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

const REVIEW_ID_RE = /^[A-Z]{2,6}_[A-Z]{2,4}[0-9]{3}[A-Z]?_[a-f0-9]{64}$/;
const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;

export type ReviewRatings = Partial<Record<RatingKey, number>>;

export interface ReviewLike {
  id?: string;
  facultyInitials?: string;
  courseCode?: string;
  semester?: string;
  text?: string;
  ratings?: ReviewRatings;
}

export interface RatingsAggregate {
  ratings: Record<RatingKey, number | null>;
  count: number;
}

export interface FacultyAggregate {
  facultyInitials: string;
  count: number;
  ratings: Record<RatingKey, number | null>;
  overall: number | null;
}

export interface ReviewOverviewOptions {
  facultyInitials?: string;
  facultyName?: string;
  courseCode?: string;
}

export interface ReviewOverview {
  headline: string;
  summary: string;
  basis: string;
}

export function normalizeInitials(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}

export function normalizeCourseCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .trim();
}

export function isValidReviewId(reviewId: unknown): boolean {
  return REVIEW_ID_RE.test(String(reviewId ?? '').trim());
}

/** SHA-256 → lowercase hex (js/core/reviews.js sha256Hex parity). */
export async function sha256Hex(input: unknown): Promise<string> {
  const data = new TextEncoder().encode(String(input ?? ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Salted per-(user, faculty, course) hash — the doc-id suffix. Mirrors
 * js/core/reviews.js reviewKeyHash byte-for-byte: `anon` uid fallback,
 * normalized initials, and the code uppercased (NOT trimmed) inside the salt.
 */
export async function reviewKeyHash(
  uid: unknown,
  facultyInitials: unknown,
  courseCode: unknown,
): Promise<string> {
  return sha256Hex(
    `${uid || 'anon'}|${normalizeInitials(facultyInitials)}|${String(courseCode || '').toUpperCase()}`,
  );
}

/**
 * The canonical review doc id `${INITIALS}_${COURSE}_${hash}` a client probes
 * with (the doc-id half of js/core/reviews.js buildReviewDoc). Segments use the
 * normalized initials + course code the worker writes; the hash mirrors
 * reviewKeyHash exactly, so this matches the server-authored id for clean input.
 */
export async function buildReviewDocId(
  uid: unknown,
  facultyInitials: unknown,
  courseCode: unknown,
): Promise<string> {
  const initials = normalizeInitials(facultyInitials);
  const code = normalizeCourseCode(courseCode);
  // buildReviewDoc hashes the *normalized* values, not the raw args.
  const hash = await reviewKeyHash(uid, initials, code);
  return `${initials}_${code}_${hash}`;
}

export function buildReviewReportId(reviewId: unknown, uid: unknown): string {
  const safeReviewId = String(reviewId ?? '').trim();
  const safeUid = String(uid ?? '').trim();
  if (!safeReviewId || !safeUid) return '';
  return `${safeUid}_${safeReviewId}`;
}

export function isKnownCourseCode(raw: unknown, catalog: CourseCatalog): boolean {
  const code = normalizeCourseCode(raw);
  return COURSE_CODE_RE.test(code) && !!catalog[code];
}

export function validateReview(
  payload: ReviewLike | null | undefined,
  catalog: CourseCatalog,
): string | null {
  if (!payload || typeof payload !== 'object') return 'Invalid payload';
  const initials = normalizeInitials(payload.facultyInitials);
  const courseCode = normalizeCourseCode(payload.courseCode);
  if (!initials || initials.length < 2) return 'Faculty initials required';
  if (!courseCode) return 'Course code required';
  if (!COURSE_CODE_RE.test(courseCode)) return 'Invalid course code';
  if (!catalog[courseCode]) return 'Unknown course code';
  const r = payload.ratings || {};
  for (const key of RATING_KEYS) {
    const v = r[key];
    if (typeof v !== 'number' || v < 1 || v > 5) return `Rating "${key}" must be 1–5`;
  }
  if (payload.semester && String(payload.semester).length > 40) return 'Semester label too long';
  if (payload.text && String(payload.text).length > 500) return 'Review text too long';
  return null;
}

// Aggregate a list of reviews into average ratings per dimension.
export function aggregateRatings(reviews: readonly ReviewLike[]): RatingsAggregate | null {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;
  const totals: Record<RatingKey, number> = {
    teaching: 0,
    marking: 0,
    behavior: 0,
    difficulty: 0,
    workload: 0,
  };
  const counts: Record<RatingKey, number> = {
    teaching: 0,
    marking: 0,
    behavior: 0,
    difficulty: 0,
    workload: 0,
  };
  for (const review of reviews) {
    const rt = review.ratings || {};
    for (const key of RATING_KEYS) {
      const value = rt[key];
      if (typeof value === 'number') {
        totals[key] += value;
        counts[key] += 1;
      }
    }
  }
  const avg = {} as Record<RatingKey, number | null>;
  for (const key of RATING_KEYS) {
    avg[key] = counts[key] ? totals[key] / counts[key] : null;
  }
  return { ratings: avg, count: reviews.length };
}

export function aggregateByFaculty(reviews: readonly ReviewLike[]): FacultyAggregate[] {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];
  const byFac = new Map<string, ReviewLike[]>();
  for (const review of reviews) {
    const key = normalizeInitials(review.facultyInitials);
    if (!key) continue;
    const list = byFac.get(key);
    if (list) list.push(review);
    else byFac.set(key, [review]);
  }

  const out: FacultyAggregate[] = [];
  for (const [initials, list] of byFac) {
    const agg = aggregateRatings(list);
    if (!agg) continue;
    const ratings = agg.ratings;
    const overallVals = RATING_KEYS.slice(0, 3)
      .map((key) => ratings[key])
      .filter((value): value is number => value !== null);
    const overall = overallVals.length
      ? overallVals.reduce((sum, value) => sum + value, 0) / overallVals.length
      : null;
    out.push({ facultyInitials: initials, count: list.length, ratings, overall });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

export function buildReviewOverview(
  reviews: readonly ReviewLike[],
  opts: ReviewOverviewOptions = {},
): ReviewOverview | null {
  if (!Array.isArray(reviews) || !reviews.length) return null;
  const agg = aggregateRatings(reviews);
  if (!agg) return null;

  const ratings = agg.ratings;
  const qualityVals = (['teaching', 'marking', 'behavior'] as const)
    .map((key) => ratings[key])
    .filter((value): value is number => typeof value === 'number');
  const overall = qualityVals.length
    ? qualityVals.reduce((sum, value) => sum + value, 0) / qualityVals.length
    : null;
  if (overall === null) return null;

  const facultyInitials = normalizeInitials(opts.facultyInitials || '');
  const facultyName = String(opts.facultyName || '').trim();
  const courseCode = normalizeCourseCode(opts.courseCode || '');
  const label = facultyName
    ? `${facultyName}${facultyInitials ? ` (${facultyInitials})` : ''}`
    : facultyInitials || 'This faculty';

  let headline = 'Student sentiment is mixed';
  if (overall >= 4.6) headline = 'Highly recommended';
  else if (overall >= 4.1) headline = 'Strongly recommended';
  else if (overall >= 3.4) headline = 'Mostly positive feedback';
  else if (overall >= 2.6) headline = 'Mixed reactions';
  else headline = 'Proceed with caution';

  const corpus = reviews.map((review) => String(review.text || '').toLowerCase()).join(' ');

  const teachingThemes = /(clear|simple|understand|explain|concept|note|organized)/.test(corpus);
  const supportThemes = /(patient|help|consult|discord|responsive|support|available)/.test(corpus);
  const markingThemes = /(mark|partial|lenient|fair)/.test(corpus);
  const examThemes = /(quiz|exam|practice|easy|manageable)/.test(corpus);

  const parts: string[] = [];
  const context = courseCode ? ` for ${courseCode}` : '';

  if (overall >= 4.1) {
    parts.push(`${label} is drawing very strong feedback from students${context}.`);
  } else if (overall >= 3.4) {
    parts.push(
      `${label} is getting mostly positive feedback from students${context}, though the signal is not unanimous.`,
    );
  } else {
    parts.push(`${label} is generating mixed student feedback${context}.`);
  }

  if (teachingThemes && ratings.teaching !== null) {
    parts.push(
      `Teaching stands out most: reviewers repeatedly mention clear explanations, approachable delivery, and better-than-average classroom clarity (${ratings.teaching.toFixed(1)}/5).`,
    );
  }
  if (supportThemes && ratings.behavior !== null) {
    parts.push(
      `Behavior and support are another strength, with students describing the faculty as patient, helpful, and easy to reach when they get stuck (${ratings.behavior.toFixed(1)}/5).`,
    );
  }
  if (markingThemes && ratings.marking !== null) {
    parts.push(
      `Marking is generally described as fair and partial-credit-friendly, which aligns with the strong marking score (${ratings.marking.toFixed(1)}/5).`,
    );
  }
  if (examThemes) {
    const difficulty = ratings.difficulty !== null ? ratings.difficulty.toFixed(1) : null;
    parts.push(
      `Assessment difficulty seems manageable when students stay prepared${difficulty ? `, with a course-difficulty signal of ${difficulty}/5` : ''}.`,
    );
  }

  const summary = parts.join(' ');
  return {
    headline,
    summary,
    basis: `Generated from ${reviews.length} student review${reviews.length !== 1 ? 's' : ''}.`,
  };
}
