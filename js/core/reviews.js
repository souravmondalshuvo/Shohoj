// ── js/core/reviews.js ────────────────────────────────────────────────────────
// Pure data layer for faculty reviews. Wraps the Firestore hooks that
// firebase.js exposes on window._shohoj_* so the rest of the bundled code can
// submit and read reviews without knowing about Firebase.

import { normalizeInitials, upsertFacultyProfile } from './faculty.js';
import { COURSE_DB } from './catalog.js';

const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];
const REVIEW_ID_RE = /^[A-Z]{2,6}_[A-Z]{2,4}[0-9]{3}[A-Z]?_[a-f0-9]{64}$/;
const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const SEEDED_REVIEWS = [
  {
    id: 'SDL_CSE250_1111111111111111111111111111111111111111111111111111111111111111',
    facultyInitials: 'SDL',
    courseCode: 'CSE250',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'She explains complex circuit concepts in a very simple and understandable way. Her class feels calm, and she makes students comfortable asking basic questions.',
    createdAt: 1760400000000,
    seeded: true,
  },
  {
    id: 'SDL_CSE250_2222222222222222222222222222222222222222222222222222222222222222',
    facultyInitials: 'SDL',
    courseCode: 'CSE250',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 2 },
    text: 'She is highly patient and clears confusion during class and consultation. Students keep saying her soft notes are the main resource they rely on before quizzes and exams.',
    createdAt: 1760486400000,
    seeded: true,
  },
  {
    id: 'SDL_CSE250_3333333333333333333333333333333333333333333333333333333333333333',
    facultyInitials: 'SDL',
    courseCode: 'CSE250',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Her marking is described as lenient and fair. If the working steps are mostly right, she gives solid partial marks even when the final answer is slightly off.',
    createdAt: 1760572800000,
    seeded: true,
  },
  {
    id: 'SDL_CSE250_4444444444444444444444444444444444444444444444444444444444444444',
    facultyInitials: 'SDL',
    courseCode: 'CSE250',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Quiz questions are usually manageable if you practice regularly. She is responsive outside class too, especially when students need last-minute clarification.',
    createdAt: 1760659200000,
    seeded: true,
  },
  {
    id: 'SDL_CSE250_5555555555555555555555555555555555555555555555555555555555555555',
    facultyInitials: 'SDL',
    courseCode: 'CSE250',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 1, workload: 2 },
    text: 'Students often describe her as kind, approachable, and genuinely helpful. For CSE250, she feels like one of those faculty members you are lucky to get.',
    createdAt: 1760745600000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_6666666666666666666666666666666666666666666666666666666666666666',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'He is consistently described as extremely beginner-friendly. His class examples, coding walkthroughs, and step-by-step explanations make CSE110 feel much easier to follow for first-time programmers.',
    createdAt: 1760832000000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_7777777777777777777777777777777777777777777777777777777777777777',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Students often say his marking is generous and partial-credit-friendly. Even when the final code is not perfect, he is known to reward the right logic and working steps.',
    createdAt: 1760918400000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_8888888888888888888888888888888888888888888888888888888888888888',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Behavior-wise he gets strong praise for being approachable during consultations. Reviewers describe him as cooperative, supportive, and genuinely helpful when students are stuck.',
    createdAt: 1761004800000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_9999999999999999999999999999999999999999999999999999999999999999',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 3, workload: 3 },
    text: 'One repeated caution is to double-check your shown work and script details, because a few students mention occasional grading slips when a solution is unconventional.',
    createdAt: 1761091200000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Students who perform well keep mentioning that his class examples and practice problems are the main resources for quizzes. If you keep up with those, the course feels manageable.',
    createdAt: 1761177600000,
    seeded: true,
  },
  {
    id: 'MSI_CSE110_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    facultyInitials: 'MSI',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 2, workload: 3 },
    text: 'Multiple reviews suggest that following his class logic carefully and using consultation hours well gives students a strong shot at both understanding the material and securing a top grade.',
    createdAt: 1761264000000,
    seeded: true,
  },
];

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

function _mergeReviews(primary, secondary) {
  const byId = new Map();
  [...secondary, ...primary].forEach(review => {
    if (!review || !review.id) return;
    byId.set(review.id, review);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const aTs = _reviewTimestampMs(a.createdAt);
    const bTs = _reviewTimestampMs(b.createdAt);
    return bTs - aTs;
  });
}

function _reviewTimestampMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function _seededReviewsForFaculty(initials, courseCode = '') {
  const norm = normalizeInitials(initials);
  const scope = normalizeCourseCode(courseCode);
  return SEEDED_REVIEWS.filter(r => {
    if (r.facultyInitials !== norm) return false;
    if (scope && r.courseCode !== scope) return false;
    return true;
  });
}

function _seededReviewsForCourse(courseCode) {
  const scope = normalizeCourseCode(courseCode);
  return SEEDED_REVIEWS.filter(r => r.courseCode === scope);
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

export function buildReviewOverview(reviews, opts = {}) {
  if (!Array.isArray(reviews) || !reviews.length) return null;
  const agg = aggregateRatings(reviews);
  if (!agg) return null;

  const ratings = agg.ratings;
  const qualityVals = ['teaching', 'marking', 'behavior']
    .map(k => ratings[k])
    .filter(v => typeof v === 'number');
  const overall = qualityVals.length
    ? qualityVals.reduce((s, v) => s + v, 0) / qualityVals.length
    : null;
  if (overall === null) return null;

  const facultyInitials = normalizeInitials(opts.facultyInitials || '');
  const facultyName = String(opts.facultyName || '').trim();
  const courseCode = normalizeCourseCode(opts.courseCode || '');
  const label = facultyName
    ? `${facultyName}${facultyInitials ? ` (${facultyInitials})` : ''}`
    : (facultyInitials || 'This faculty');

  let headline = 'Student sentiment is mixed';
  if (overall >= 4.6) headline = 'Highly recommended';
  else if (overall >= 4.1) headline = 'Strongly recommended';
  else if (overall >= 3.4) headline = 'Mostly positive feedback';
  else if (overall >= 2.6) headline = 'Mixed reactions';
  else headline = 'Proceed with caution';

  const corpus = reviews
    .map(r => String(r.text || '').toLowerCase())
    .join(' ');

  const teachingThemes = /(clear|simple|understand|explain|concept|note|organized)/.test(corpus);
  const supportThemes  = /(patient|help|consult|discord|responsive|support|available)/.test(corpus);
  const markingThemes  = /(mark|partial|lenient|fair)/.test(corpus);
  const examThemes     = /(quiz|exam|practice|easy|manageable)/.test(corpus);

  const parts = [];
  const context = courseCode ? ` for ${courseCode}` : '';

  if (overall >= 4.1) {
    parts.push(`${label} is drawing very strong feedback from students${context}.`);
  } else if (overall >= 3.4) {
    parts.push(`${label} is getting mostly positive feedback from students${context}, though the signal is not unanimous.`);
  } else {
    parts.push(`${label} is generating mixed student feedback${context}.`);
  }

  if (teachingThemes && ratings.teaching !== null) {
    parts.push(`Teaching stands out most: reviewers repeatedly mention clear explanations, approachable delivery, and better-than-average classroom clarity (${ratings.teaching.toFixed(1)}/5).`);
  }
  if (supportThemes && ratings.behavior !== null) {
    parts.push(`Behavior and support are another strength, with students describing the faculty as patient, helpful, and easy to reach when they get stuck (${ratings.behavior.toFixed(1)}/5).`);
  }
  if (markingThemes && ratings.marking !== null) {
    parts.push(`Marking is generally described as fair and partial-credit-friendly, which aligns with the strong marking score (${ratings.marking.toFixed(1)}/5).`);
  }
  if (examThemes) {
    const difficulty = ratings.difficulty !== null ? ratings.difficulty.toFixed(1) : null;
    parts.push(`Assessment difficulty seems manageable when students stay prepared${difficulty ? `, with a course-difficulty signal of ${difficulty}/5` : ''}.`);
  }

  const summary = parts.join(' ');
  return {
    headline,
    summary,
    basis: `Generated from ${reviews.length} student review${reviews.length !== 1 ? 's' : ''}.`,
  };
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
  const seeded = _seededReviewsForFaculty(initials, courseCode);
  if (typeof hook !== 'function') return { reviews: seeded, nextCursor: null };
  try {
    const page = _toPage(await hook({
      facultyInitials: normalizeInitials(initials),
      courseCode:      courseCode ? String(courseCode).toUpperCase() : '',
      pageSize:        opts.pageSize || 50,
      after:           opts.after   || null,
    }));
    return { reviews: _mergeReviews(page.reviews, seeded), nextCursor: page.nextCursor };
  } catch (e) {
    console.warn('[Shohoj] fetchReviews failed:', e);
    return { reviews: seeded, nextCursor: null };
  }
}

// Fetch a page of reviews for a course code across all faculty.
// Returns { reviews, nextCursor }.
export async function fetchReviewsForCourse(courseCode, opts = {}) {
  const hook = window._shohoj_fetchReviewsByCourse;
  if (!courseCode) return { reviews: [], nextCursor: null };
  const seeded = _seededReviewsForCourse(courseCode);
  if (typeof hook !== 'function') return { reviews: seeded, nextCursor: null };
  try {
    const page = _toPage(await hook(String(courseCode).toUpperCase(), {
      pageSize: opts.pageSize || 200,
      after:    opts.after   || null,
    }));
    return { reviews: _mergeReviews(page.reviews, seeded), nextCursor: page.nextCursor };
  } catch (e) {
    console.warn('[Shohoj] fetchReviewsByCourse failed:', e);
    return { reviews: seeded, nextCursor: null };
  }
}

// Fetch recent reviews site-wide.
export async function fetchRecentReviews(n = 50) {
  const hook = window._shohoj_fetchRecentReviews;
  if (typeof hook !== 'function') return SEEDED_REVIEWS.slice(0, n);
  try {
    return _mergeReviews(await hook(n), SEEDED_REVIEWS).slice(0, n);
  } catch (e) {
    console.warn('[Shohoj] fetchRecentReviews failed:', e);
    return SEEDED_REVIEWS.slice(0, n);
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
