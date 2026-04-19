// ── js/core/reviews.js ────────────────────────────────────────────────────────
// Pure data layer for faculty reviews. Wraps the Firestore hooks that
// firebase.js exposes on window._shohoj_* so the rest of the bundled code can
// submit and read reviews without knowing about Firebase.

import { normalizeInitials, upsertFacultyProfile } from './faculty.js';

const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];

export function validateReview(payload) {
  if (!payload || typeof payload !== 'object') return 'Invalid payload';
  const initials = normalizeInitials(payload.facultyInitials);
  if (!initials || initials.length < 2) return 'Faculty initials required';
  if (payload.courseCode && String(payload.courseCode).length > 10) return 'Course code too long';
  const r = payload.ratings || {};
  for (const key of RATING_KEYS) {
    const v = r[key];
    if (typeof v !== 'number' || v < 1 || v > 5) return `Rating "${key}" must be 1–5`;
  }
  if (payload.text && String(payload.text).length > 500) return 'Review text too long';
  return null;
}

// SHA-256 a string using the browser's SubtleCrypto. Returns 64-char hex.
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input ?? ''));
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Build the Firestore-bound review document. Strips any undefined fields
// so Firestore doesn't reject the write.
export async function buildReviewDoc(payload, uid) {
  const uidHash = await sha256Hex(uid || 'anon');
  const doc = {
    facultyInitials: normalizeInitials(payload.facultyInitials),
    courseCode:      String(payload.courseCode || '').toUpperCase().trim(),
    semester:        payload.semester ? String(payload.semester).slice(0, 40) : '',
    ratings: {
      teaching:   Math.round(payload.ratings.teaching),
      marking:    Math.round(payload.ratings.marking),
      behavior:   Math.round(payload.ratings.behavior),
      difficulty: Math.round(payload.ratings.difficulty),
      workload:   Math.round(payload.ratings.workload),
    },
    text:    payload.text ? String(payload.text).slice(0, 500) : '',
    uidHash,
    createdAt: Date.now(),
  };
  return doc;
}

// Submit a review via the firebase.js hook. Returns { ok, error? }.
export async function submitReview(payload) {
  const err = validateReview(payload);
  if (err) return { ok: false, error: err };

  const hook = window._shohoj_submitReview;
  if (typeof hook !== 'function') {
    return { ok: false, error: 'Sign in to submit a review' };
  }

  const uid = window._shohoj_currentUid && window._shohoj_currentUid();
  if (!uid) return { ok: false, error: 'Sign in to submit a review' };

  try {
    const doc = await buildReviewDoc(payload, uid);
    const res = await hook(doc);
    if (res && res.ok) {
      // Optimistically bump the local faculty profile so the UI updates
      // without waiting for a refetch.
      upsertFacultyProfile({
        initials: doc.facultyInitials,
        courses:  doc.courseCode ? [doc.courseCode] : [],
      });
      return { ok: true };
    }
    return { ok: false, error: (res && res.error) || 'Submission failed' };
  } catch (e) {
    console.error('[Shohoj] submitReview failed:', e);
    return { ok: false, error: e.message || 'Submission failed' };
  }
}

// Fetch reviews for a faculty (optionally scoped to a course code).
// Returns an array of review docs. Silently returns [] on failure.
export async function fetchReviewsForFaculty(initials, courseCode = '') {
  const hook = window._shohoj_fetchReviews;
  if (typeof hook !== 'function') return [];
  try {
    return await hook({
      facultyInitials: normalizeInitials(initials),
      courseCode:      courseCode ? String(courseCode).toUpperCase() : '',
    });
  } catch (e) {
    console.warn('[Shohoj] fetchReviews failed:', e);
    return [];
  }
}

// Fetch every review for a course code across all faculty.
// Returns an array of review docs. Silently returns [] on failure.
export async function fetchReviewsForCourse(courseCode) {
  const hook = window._shohoj_fetchReviewsByCourse;
  if (typeof hook !== 'function') return [];
  if (!courseCode) return [];
  try {
    return await hook(String(courseCode).toUpperCase());
  } catch (e) {
    console.warn('[Shohoj] fetchReviewsByCourse failed:', e);
    return [];
  }
}

// Fetch recent reviews site-wide.
export async function fetchRecentReviews(n = 50) {
  const hook = window._shohoj_fetchRecentReviews;
  if (typeof hook !== 'function') return [];
  try {
    return await hook(n);
  } catch (e) {
    console.warn('[Shohoj] fetchRecentReviews failed:', e);
    return [];
  }
}

// Group a flat list of reviews by facultyInitials and compute aggregates
// per faculty. Returns [{ facultyInitials, count, ratings, overall }]
// sorted by count descending.
export function aggregateByFaculty(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];
  const byFac = new Map();
  for (const r of reviews) {
    const key = normalizeInitials(r.facultyInitials);
    if (!key) continue;
    if (!byFac.has(key)) byFac.set(key, []);
    byFac.get(key).push(r);
  }
  const out = [];
  for (const [initials, list] of byFac) {
    const agg = aggregateRatings(list);
    if (!agg) continue;
    const r = agg.ratings;
    const overallVals = RATING_KEYS.slice(0, 3).map(k => r[k]).filter(v => v !== null);
    const overall = overallVals.length
      ? overallVals.reduce((s, v) => s + v, 0) / overallVals.length
      : null;
    out.push({ facultyInitials: initials, count: list.length, ratings: r, overall });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

// Aggregate a list of reviews into average ratings per dimension.
export function aggregateRatings(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;
  const totals = { teaching: 0, marking: 0, behavior: 0, difficulty: 0, workload: 0 };
  const counts = { teaching: 0, marking: 0, behavior: 0, difficulty: 0, workload: 0 };
  for (const r of reviews) {
    const rt = r.ratings || {};
    for (const k of RATING_KEYS) {
      if (typeof rt[k] === 'number') {
        totals[k] += rt[k];
        counts[k]++;
      }
    }
  }
  const avg = {};
  for (const k of RATING_KEYS) {
    avg[k] = counts[k] ? totals[k] / counts[k] : null;
  }
  return { ratings: avg, count: reviews.length };
}

export { RATING_KEYS };
