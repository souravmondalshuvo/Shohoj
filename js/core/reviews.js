// ── js/core/reviews.js ────────────────────────────────────────────────────────
// Pure data layer for faculty reviews. Wraps the Firestore hooks that
// firebase.js exposes on window._shohoj_* so the rest of the bundled code can
// submit and read reviews without knowing about Firebase.

import { normalizeInitials, upsertFacultyProfile } from './faculty.js';
import { COURSE_DB } from './catalog.js';

const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];
const REVIEW_ID_RE = /^[A-Z]{2,6}_[A-Z]{2,4}[0-9]{3}[A-Z]?_[a-f0-9]{64}$/;
const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;

export function normalizeCourseCode(raw) {
  return String(raw || '').toUpperCase().trim();
}

export function isKnownCourseCode(raw) {
  const code = normalizeCourseCode(raw);
  return COURSE_CODE_RE.test(code) && !!COURSE_DB[code];
}

export function isValidReviewId(reviewId) {
  return REVIEW_ID_RE.test(String(reviewId || '').trim());
}

export function buildReviewReportId(reviewId, uid) {
  const safeReviewId = String(reviewId || '').trim();
  const safeUid = String(uid || '').trim();
  if (!safeReviewId || !safeUid) return '';
  return `${safeUid}_${safeReviewId}`;
}

export function validateReview(payload) {
  if (!payload || typeof payload !== 'object') return 'Invalid payload';
  const initials = normalizeInitials(payload.facultyInitials);
  const courseCode = normalizeCourseCode(payload.courseCode);
  if (!initials || initials.length < 2) return 'Faculty initials required';
  if (!courseCode) return 'Course code required';
  if (!COURSE_CODE_RE.test(courseCode)) return 'Invalid course code';
  if (!COURSE_DB[courseCode]) return 'Unknown course code';
  const r = payload.ratings || {};
  for (const key of RATING_KEYS) {
    const v = r[key];
    if (typeof v !== 'number' || v < 1 || v > 5) return `Rating "${key}" must be 1–5`;
  }
  if (payload.semester && String(payload.semester).length > 40) return 'Semester label too long';
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

// Salted per-(user, faculty, course) hash. Two reviews by the same user for
// different courses produce uncorrelated hashes, which makes cross-review
// linkage by hash harder than a single uid-only hash would be.
export async function reviewKeyHash(uid, facultyInitials, courseCode) {
  return sha256Hex(
    `${uid || 'anon'}|${normalizeInitials(facultyInitials)}|${String(courseCode || '').toUpperCase()}`
  );
}

// Build both the deterministic doc ID and the Firestore-bound body.
// The uid is encoded into the doc ID (as a salted hash) and is NOT stored
// in the body — this avoids shipping a reusable user identifier in public docs.
export async function buildReviewDoc(payload, uid) {
  const facultyInitials = normalizeInitials(payload.facultyInitials);
  const courseCode      = normalizeCourseCode(payload.courseCode);
  const hash            = await reviewKeyHash(uid, facultyInitials, courseCode);
  const id              = `${facultyInitials}_${courseCode}_${hash}`;

  const body = {
    facultyInitials,
    courseCode,
    semester: payload.semester ? String(payload.semester).slice(0, 40) : '',
    ratings: {
      teaching:   Math.round(payload.ratings.teaching),
      marking:    Math.round(payload.ratings.marking),
      behavior:   Math.round(payload.ratings.behavior),
      difficulty: Math.round(payload.ratings.difficulty),
      workload:   Math.round(payload.ratings.workload),
    },
    text: payload.text ? String(payload.text).slice(0, 500) : '',
    createdAt: Date.now(),
  };
  return { id, body };
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
    const { id, body } = await buildReviewDoc(payload, uid);
    const res = await hook({ id, data: body });
    if (res && res.ok) {
      // Optimistically bump the local faculty profile so the UI updates
      // without waiting for a refetch.
      upsertFacultyProfile({
        initials: body.facultyInitials,
        courses:  body.courseCode ? [body.courseCode] : [],
      });
      return { ok: true };
    }
    return { ok: false, error: (res && res.error) || 'Submission failed' };
  } catch (e) {
    console.error('[Shohoj] submitReview failed:', e);
    return { ok: false, error: e.message || 'Submission failed' };
  }
}

// Report a review for moderation. Writes to a separate `reviewReports`
// collection that only admins can read.
export async function reportReview(reviewId, reason) {
  const hook = window._shohoj_reportReview;
  if (typeof hook !== 'function') return { ok: false, error: 'Sign in to report a review' };
  const uid = window._shohoj_currentUid && window._shohoj_currentUid();
  if (!uid) return { ok: false, error: 'Sign in to report a review' };
  if (!isValidReviewId(reviewId)) return { ok: false, error: 'Invalid review reference' };
  const trimmed = String(reason || '').trim().slice(0, 300);
  if (trimmed.length < 3) return { ok: false, error: 'Please describe the issue' };
  try {
    return await hook({
      id: buildReviewReportId(reviewId, uid),
      reviewId: String(reviewId || '').trim(),
      reason: trimmed,
      reporterUid: uid,
    });
  } catch (e) {
    console.error('[Shohoj] reportReview failed:', e);
    return { ok: false, error: e.message || 'Report failed' };
  }
}

// Normalize the hook response to always return { reviews, nextCursor }.
function _toPage(res) {
  if (Array.isArray(res)) return { reviews: res, nextCursor: null };
  if (res && Array.isArray(res.reviews)) return { reviews: res.reviews, nextCursor: res.nextCursor || null };
  return { reviews: [], nextCursor: null };
}

// Fetch a page of reviews for a faculty (optionally scoped to a course code).
// Returns { reviews, nextCursor }. `nextCursor` is null when there are no
// more pages; pass it back as `opts.after` to load the next page.
export async function fetchReviewsForFaculty(initials, courseCode = '', opts = {}) {
  const hook = window._shohoj_fetchReviews;
  if (typeof hook !== 'function') return { reviews: [], nextCursor: null };
  try {
    return _toPage(await hook({
      facultyInitials: normalizeInitials(initials),
      courseCode:      courseCode ? String(courseCode).toUpperCase() : '',
      pageSize:        opts.pageSize || 50,
      after:           opts.after   || null,
    }));
  } catch (e) {
    console.warn('[Shohoj] fetchReviews failed:', e);
    return { reviews: [], nextCursor: null };
  }
}

// Fetch a page of reviews for a course code across all faculty.
// Returns { reviews, nextCursor }.
export async function fetchReviewsForCourse(courseCode, opts = {}) {
  const hook = window._shohoj_fetchReviewsByCourse;
  if (typeof hook !== 'function') return { reviews: [], nextCursor: null };
  if (!courseCode) return { reviews: [], nextCursor: null };
  try {
    return _toPage(await hook(String(courseCode).toUpperCase(), {
      pageSize: opts.pageSize || 200,
      after:    opts.after   || null,
    }));
  } catch (e) {
    console.warn('[Shohoj] fetchReviewsByCourse failed:', e);
    return { reviews: [], nextCursor: null };
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
