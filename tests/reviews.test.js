/**
 * tests/reviews.test.js
 * Tests for Shohoj's Faculty Reviews data layer (pure logic — no Firestore).
 */

import {
  validateReview,
  submitReview,
  reviewKeyHash,
  sha256Hex,
  buildReviewDoc,
  isKnownCourseCode,
  isValidReviewId,
  buildReviewReportId,
  aggregateRatings,
  aggregateByFaculty,
  RATING_KEYS,
} from '../js/core/reviews.js';
import { normalizeInitials, isValidInitials } from '../js/core/faculty.js';

// ── Minimal async-aware test runner ──────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const queue = [];

function test(description, fn) {
  queue.push({ description, fn });
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const factor = Math.pow(10, precision);
      const a = Math.round(actual * factor) / factor;
      const e = Math.round(expected * factor) / factor;
      if (a !== e) throw new Error(`Expected ~${expected}, got ${actual}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toMatch(re) {
      if (!re.test(actual)) throw new Error(`Expected ${JSON.stringify(actual)} to match ${re}`);
    },
  };
}

async function run() {
  for (const { description, fn } of queue) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${description}`);
      console.error(`    → ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed ✓');
    process.exit(0);
  }
}

// ── FACULTY INITIALS ─────────────────────────────────────────────────────────
console.log('\nFaculty initials normalization:');

test('uppercases and strips non-letters', () => {
  expect(normalizeInitials('mak-2')).toBe('MAK');
});

test('trims whitespace', () => {
  expect(normalizeInitials('  abc  ')).toBe('ABC');
});

test('clamps to 6 characters', () => {
  expect(normalizeInitials('ABCDEFGH')).toBe('ABCDEF');
});

test('returns empty string for non-string', () => {
  expect(normalizeInitials(null)).toBe('');
  expect(normalizeInitials(undefined)).toBe('');
  expect(normalizeInitials(42)).toBe('');
});

test('isValidInitials requires 2-6 letters', () => {
  expect(isValidInitials('A')).toBe(false);
  expect(isValidInitials('AB')).toBe(true);
  expect(isValidInitials('ABCDEF')).toBe(true);
  expect(isValidInitials('ABCDEFG')).toBe(true); // clamped to 6 letters → still valid
  expect(isValidInitials('')).toBe(false);
});

// ── VALIDATE REVIEW ──────────────────────────────────────────────────────────
console.log('\nReview validation:');

const goodReview = () => ({
  facultyInitials: 'MAK',
  courseCode: 'CSE220',
  semester: 'Fall 2025',
  ratings: { teaching: 4, marking: 3, behavior: 5, difficulty: 3, workload: 4 },
  text: 'Good prof.',
});

test('accepts a valid review', () => {
  expect(validateReview(goodReview())).toBeNull();
});

test('accepts lowercase known course codes after normalization', () => {
  const r = goodReview();
  r.courseCode = 'cse220';
  expect(validateReview(r)).toBeNull();
});

test('rejects missing payload', () => {
  expect(validateReview(null)).toBeTruthy();
  expect(validateReview(undefined)).toBeTruthy();
  expect(validateReview('not an object')).toBeTruthy();
});

test('rejects empty faculty initials', () => {
  const r = goodReview(); r.facultyInitials = '';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects too-short faculty initials', () => {
  const r = goodReview(); r.facultyInitials = 'A';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects out-of-range rating (0)', () => {
  const r = goodReview(); r.ratings.teaching = 0;
  expect(validateReview(r)).toBeTruthy();
});

test('rejects out-of-range rating (6)', () => {
  const r = goodReview(); r.ratings.marking = 6;
  expect(validateReview(r)).toBeTruthy();
});

test('rejects non-numeric rating', () => {
  const r = goodReview(); r.ratings.workload = '4';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects missing rating dimension', () => {
  const r = goodReview(); delete r.ratings.behavior;
  expect(validateReview(r)).toBeTruthy();
});

test('rejects missing course code', () => {
  const r = goodReview(); r.courseCode = '';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects malformed course code', () => {
  const r = goodReview(); r.courseCode = 'CSE22';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects unknown course code', () => {
  const r = goodReview(); r.courseCode = 'CSE999';
  expect(validateReview(r)).toBeTruthy();
});

test('rejects review text > 500 chars', () => {
  const r = goodReview(); r.text = 'x'.repeat(501);
  expect(validateReview(r)).toBeTruthy();
});

test('rejects semester label > 40 chars', () => {
  const r = goodReview(); r.semester = 'S'.repeat(41);
  expect(validateReview(r)).toBeTruthy();
});

test('accepts all boundary rating values (1 and 5)', () => {
  const r = goodReview();
  r.ratings = { teaching: 1, marking: 5, behavior: 1, difficulty: 5, workload: 3 };
  expect(validateReview(r)).toBeNull();
});

// ── SHA-256 ──────────────────────────────────────────────────────────────────
console.log('\nsha256Hex helper:');

test('produces 64-char hex for a known input', async () => {
  // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
  const h = await sha256Hex('abc');
  expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('produces 64-char hex for empty string', async () => {
  const h = await sha256Hex('');
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});

// ── REVIEW KEY HASH ──────────────────────────────────────────────────────────
console.log('\nreviewKeyHash:');

test('produces 64-char lowercase hex', async () => {
  const h = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});

test('is deterministic for the same (uid, initials, course)', async () => {
  const a = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  const b = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  expect(a).toBe(b);
});

test('differs across courses for the same user', async () => {
  const a = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  const b = await reviewKeyHash('uid-1', 'MAK', 'CSE221');
  expect(a === b).toBe(false);
});

test('differs across users for the same course', async () => {
  const a = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  const b = await reviewKeyHash('uid-2', 'MAK', 'CSE220');
  expect(a === b).toBe(false);
});

test('normalizes initials before hashing (mak == MAK)', async () => {
  const a = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  const b = await reviewKeyHash('uid-1', 'mak', 'CSE220');
  expect(a).toBe(b);
});

test('uppercases course code before hashing', async () => {
  const a = await reviewKeyHash('uid-1', 'MAK', 'CSE220');
  const b = await reviewKeyHash('uid-1', 'MAK', 'cse220');
  expect(a).toBe(b);
});

// ── COURSE / REVIEW ID HELPERS ──────────────────────────────────────────────
console.log('\ncourse and review id helpers:');

test('recognizes a known course code from the catalog', () => {
  expect(isKnownCourseCode('CSE220')).toBe(true);
  expect(isKnownCourseCode('cse220')).toBe(true);
});

test('rejects unknown or malformed course codes', () => {
  expect(isKnownCourseCode('CSE999')).toBe(false);
  expect(isKnownCourseCode('INVALID')).toBe(false);
});

test('accepts a valid review doc id', async () => {
  const { id } = await buildReviewDoc(goodReview(), 'uid-1');
  expect(isValidReviewId(id)).toBe(true);
});

test('rejects an invalid review doc id', () => {
  expect(isValidReviewId('bad-id')).toBe(false);
});

test('builds a deterministic one-report-per-user doc id', async () => {
  const { id } = await buildReviewDoc(goodReview(), 'uid-1');
  expect(buildReviewReportId(id, 'uid-2')).toBe(`uid-2_${id}`);
});

// ── BUILD REVIEW DOC ─────────────────────────────────────────────────────────
console.log('\nbuildReviewDoc:');

test('produces deterministic ID matching expected format', async () => {
  const { id } = await buildReviewDoc(goodReview(), 'uid-1');
  expect(id).toMatch(/^[A-Z]{2,6}_[A-Z0-9]+_[0-9a-f]{64}$/);
});

test('ID starts with normalized initials and course code', async () => {
  const { id } = await buildReviewDoc({ ...goodReview(), facultyInitials: 'mak', courseCode: 'cse220' }, 'uid-1');
  expect(id.startsWith('MAK_CSE220_')).toBe(true);
});

test('body does NOT leak uid or uidHash', async () => {
  const { body } = await buildReviewDoc(goodReview(), 'uid-1');
  expect('uid' in body).toBe(false);
  expect('uidHash' in body).toBe(false);
  expect('reporterUid' in body).toBe(false);
});

test('body contains exactly the expected keys', async () => {
  const { body } = await buildReviewDoc(goodReview(), 'uid-1');
  const keys = Object.keys(body).sort();
  expect(keys.join(',')).toBe('courseCode,createdAt,facultyInitials,ratings,semester,text');
});

test('ratings are rounded to integers', async () => {
  const payload = goodReview();
  payload.ratings = { teaching: 4.7, marking: 3.2, behavior: 4.5, difficulty: 2.6, workload: 3.4 };
  const { body } = await buildReviewDoc(payload, 'uid-1');
  expect(body.ratings.teaching).toBe(5);
  expect(body.ratings.marking).toBe(3);
  expect(body.ratings.behavior).toBe(5);
  expect(body.ratings.difficulty).toBe(3);
  expect(body.ratings.workload).toBe(3);
});

test('normalizes course code in the review body', async () => {
  const payload = goodReview();
  payload.courseCode = 'cse220';
  const { body } = await buildReviewDoc(payload, 'uid-1');
  expect(body.courseCode).toBe('CSE220');
});

test('text is truncated to 500 chars', async () => {
  const payload = goodReview();
  payload.text = 'a'.repeat(600);
  const { body } = await buildReviewDoc(payload, 'uid-1');
  expect(body.text.length).toBe(500);
});

test('semester is truncated to 40 chars', async () => {
  const payload = goodReview();
  payload.semester = 'S'.repeat(60);
  const { body } = await buildReviewDoc(payload, 'uid-1');
  expect(body.semester.length).toBe(40);
});

test('same user for same faculty+course produces the same ID', async () => {
  const a = await buildReviewDoc(goodReview(), 'uid-1');
  const b = await buildReviewDoc(goodReview(), 'uid-1');
  expect(a.id).toBe(b.id);
});

test('same user cannot get a new doc ID by changing text or ratings', async () => {
  const a = await buildReviewDoc(goodReview(), 'uid-1');
  const b = await buildReviewDoc({
    ...goodReview(),
    text: 'Completely different note.',
    ratings: { teaching: 1, marking: 1, behavior: 1, difficulty: 5, workload: 5 },
  }, 'uid-1');
  expect(a.id).toBe(b.id);
});

// ── SUBMIT REVIEW ────────────────────────────────────────────────────────────
console.log('\nsubmitReview:');

test('returns backend duplicate message when immutable review already exists', async () => {
  const prevWindow = globalThis.window;
  const stubWindow = prevWindow || {};
  globalThis.window = stubWindow;

  const prevHook = stubWindow._shohoj_submitReview;
  const prevUidHook = stubWindow._shohoj_currentUid;
  stubWindow._shohoj_currentUid = () => 'uid-1';
  stubWindow._shohoj_submitReview = async () => ({
    ok: false,
    error: 'You have already submitted a review for this faculty-course pair. Reviews cannot be edited from the client.',
    code: 'already-exists',
  });

  const res = await submitReview(goodReview());
  expect(res.ok).toBe(false);
  expect(res.error).toMatch(/already submitted a review/i);

  stubWindow._shohoj_submitReview = prevHook;
  stubWindow._shohoj_currentUid = prevUidHook;
  globalThis.window = prevWindow;
});

// ── AGGREGATE RATINGS ────────────────────────────────────────────────────────
console.log('\naggregateRatings:');

test('returns null for empty list', () => {
  expect(aggregateRatings([])).toBeNull();
  expect(aggregateRatings(null)).toBeNull();
});

test('averages ratings across reviews', () => {
  const reviews = [
    { ratings: { teaching: 4, marking: 3, behavior: 5, difficulty: 3, workload: 4 } },
    { ratings: { teaching: 2, marking: 5, behavior: 3, difficulty: 5, workload: 2 } },
  ];
  const agg = aggregateRatings(reviews);
  expect(agg.count).toBe(2);
  expect(agg.ratings.teaching).toBeCloseTo(3.0);
  expect(agg.ratings.marking).toBeCloseTo(4.0);
  expect(agg.ratings.behavior).toBeCloseTo(4.0);
  expect(agg.ratings.difficulty).toBeCloseTo(4.0);
  expect(agg.ratings.workload).toBeCloseTo(3.0);
});

test('skips missing rating dimensions', () => {
  const reviews = [
    { ratings: { teaching: 4, marking: 3, behavior: 5, difficulty: 3, workload: 4 } },
    { ratings: { teaching: 2 } },
  ];
  const agg = aggregateRatings(reviews);
  expect(agg.count).toBe(2);
  expect(agg.ratings.teaching).toBeCloseTo(3.0);
  expect(agg.ratings.marking).toBeCloseTo(3.0);
});

test('returns null rating when no reviews provide that dimension', () => {
  const reviews = [{ ratings: { teaching: 4 } }];
  const agg = aggregateRatings(reviews);
  expect(agg.ratings.marking).toBeNull();
});

// ── AGGREGATE BY FACULTY ─────────────────────────────────────────────────────
console.log('\naggregateByFaculty:');

test('returns empty array for empty input', () => {
  const out = aggregateByFaculty([]);
  expect(Array.isArray(out)).toBe(true);
  expect(out.length).toBe(0);
});

test('groups by faculty and sorts by count descending', () => {
  const reviews = [
    { facultyInitials: 'MAK', ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 3, workload: 3 } },
    { facultyInitials: 'MAK', ratings: { teaching: 3, marking: 3, behavior: 3, difficulty: 3, workload: 3 } },
    { facultyInitials: 'JRH', ratings: { teaching: 5, marking: 5, behavior: 5, difficulty: 1, workload: 1 } },
  ];
  const out = aggregateByFaculty(reviews);
  expect(out.length).toBe(2);
  expect(out[0].facultyInitials).toBe('MAK');
  expect(out[0].count).toBe(2);
  expect(out[1].facultyInitials).toBe('JRH');
  expect(out[1].count).toBe(1);
});

test('computes overall as average of teaching+marking+behavior only', () => {
  const reviews = [
    { facultyInitials: 'MAK', ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 1, workload: 1 } },
  ];
  const out = aggregateByFaculty(reviews);
  // overall = (4+4+4)/3 = 4.0, not influenced by difficulty/workload
  expect(out[0].overall).toBeCloseTo(4.0);
});

test('skips reviews with invalid faculty initials', () => {
  const reviews = [
    { facultyInitials: '', ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 3, workload: 3 } },
    { facultyInitials: 'MAK', ratings: { teaching: 4, marking: 4, behavior: 4, difficulty: 3, workload: 3 } },
  ];
  const out = aggregateByFaculty(reviews);
  expect(out.length).toBe(1);
  expect(out[0].facultyInitials).toBe('MAK');
});

// ── RATING_KEYS EXPORT ───────────────────────────────────────────────────────
console.log('\nRATING_KEYS export:');

test('exposes the five review dimensions in stable order', () => {
  expect(RATING_KEYS.join(',')).toBe('teaching,marking,behavior,difficulty,workload');
});

run();
