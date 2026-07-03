// tests/reviewSubmit.test.js — unit tests for the shell review submit boundary
// (#319), the environment-injected port of js/core/reviews.js submitReview.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clearFacultyCache, getFacultyProfile } from '../src/core/faculty.ts';
import {
  submitReview,
  validateReviewPayload,
} from '../src/features/calculator/reviewSubmit.ts';

const KNOWN = new Set(['CSE220', 'PHY111']);
const isKnownCode = (c) => KNOWN.has(c);

function validPayload(overrides = {}) {
  return {
    facultyInitials: 'MNR',
    courseCode: 'CSE220',
    semester: 'Fall 2024',
    text: 'solid teacher',
    ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 3, workload: 2 },
    ...overrides,
  };
}

function env(overrides = {}) {
  return { isKnownCode, hook: null, currentUid: () => '', ...overrides };
}

test('validateReviewPayload mirrors the core order at each boundary', () => {
  assert.equal(validateReviewPayload(validPayload(), isKnownCode), null);
  assert.equal(
    validateReviewPayload(validPayload({ facultyInitials: 'M' }), isKnownCode),
    'Faculty initials required',
  );
  assert.equal(
    validateReviewPayload(validPayload({ courseCode: '' }), isKnownCode),
    'Course code required',
  );
  assert.equal(
    validateReviewPayload(validPayload({ courseCode: 'NOPE' }), isKnownCode),
    'Invalid course code',
  );
  assert.equal(
    validateReviewPayload(validPayload({ courseCode: 'ZZZ999' }), isKnownCode),
    'Unknown course code',
  );
  assert.equal(
    validateReviewPayload(
      validPayload({ ratings: { ...validPayload().ratings, marking: 0 } }),
      isKnownCode,
    ),
    'Rating "marking" must be 1–5',
  );
  assert.equal(
    validateReviewPayload(validPayload({ semester: 'x'.repeat(41) }), isKnownCode),
    'Semester label too long',
  );
  assert.equal(
    validateReviewPayload(validPayload({ text: 'x'.repeat(501) }), isKnownCode),
    'Review text too long',
  );
});

test('submitReview refuses without a hook or uid — the signed-out parity path', async () => {
  // No hook at all (standalone shell).
  let res = await submitReview(validPayload(), env());
  assert.deepEqual(res, { ok: false, error: 'Sign in to submit a review' });

  // Hook present but signed out.
  res = await submitReview(
    validPayload(),
    env({ hook: async () => ({ ok: true }) }),
  );
  assert.deepEqual(res, { ok: false, error: 'Sign in to submit a review' });
});

test('submitReview validates before touching the transport', async () => {
  let hookCalls = 0;
  const res = await submitReview(
    validPayload({ courseCode: 'ZZZ999' }),
    env({ hook: async () => { hookCalls += 1; return { ok: true }; }, currentUid: () => 'uid1' }),
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Unknown course code');
  assert.equal(hookCalls, 0);
});

test('submitReview rounds ratings, passes boundary lengths, maps success', async () => {
  clearFacultyCache();
  let seen = null;
  const res = await submitReview(
    validPayload({
      semester: 'S'.repeat(40), // exactly the cap — valid, passed through
      text: 't'.repeat(500),
      ratings: { teaching: 4.4, marking: 3.6, behavior: 5, difficulty: 1, workload: 2 },
    }),
    env({ hook: async (p) => { seen = p; return { ok: true }; }, currentUid: () => 'uid1' }),
  );
  assert.deepEqual(res, { ok: true });
  assert.equal(seen.semester.length, 40);
  assert.equal(seen.text.length, 500);
  assert.equal(seen.ratings.teaching, 4); // rounded like the legacy hook call
  assert.equal(seen.ratings.marking, 4);
  // Legacy parity: success enriches the local faculty cache.
  const prof = getFacultyProfile('MNR');
  assert.ok(prof);
  assert.ok(prof.courses.includes('CSE220'));
  clearFacultyCache();
});

test('submitReview maps hook failures and thrown errors', async () => {
  const uid = () => 'uid1';
  let res = await submitReview(
    validPayload(),
    env({ hook: async () => ({ ok: false, error: 'permission-denied', code: 'perm' }), currentUid: uid }),
  );
  assert.deepEqual(res, { ok: false, error: 'permission-denied', code: 'perm' });

  // An empty/undefined hook result falls back to the generic message.
  res = await submitReview(validPayload(), env({ hook: async () => undefined, currentUid: uid }));
  assert.equal(res.error, 'Submission failed');

  res = await submitReview(
    validPayload(),
    env({ hook: async () => { throw new Error('network down'); }, currentUid: uid }),
  );
  assert.deepEqual(res, { ok: false, error: 'network down' });
});
