// tests/reviewDocId.test.js — parity of the typed canonical review doc-id
// helpers (#339) against the runtime js/core/reviews.js they mirror.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReviewDoc as jsBuildReviewDoc,
  reviewKeyHash as jsReviewKeyHash,
  sha256Hex as jsSha256Hex,
} from '../js/core/reviews.js';
import {
  buildReviewDocId,
  reviewKeyHash,
  sha256Hex,
} from '../src/core/reviews.ts';

// (uid, initials, course) triples incl. the anon fallback, lowercase, and
// odd spacing that normalization must absorb identically on both sides.
const TRIPLES = [
  ['uid-123', 'MNR', 'CSE220'],
  ['uid-123', 'mnr', 'cse220'], // lowercase → same normalized hash
  ['', 'ABC', 'CSE110'], //        falsy uid → 'anon'
  [null, 'A.B.C', 'ENG101'], //    non-letters stripped from initials
  ['u', 'XyZ', ' phy111 '], //     surrounding space in the code
];

test('sha256Hex matches the runtime hasher', async () => {
  for (const input of ['', 'anon|MNR|CSE220', 'hello world']) {
    assert.equal(await sha256Hex(input), await jsSha256Hex(input));
  }
});

test('reviewKeyHash matches js/core reviewKeyHash for every triple', async () => {
  for (const [uid, initials, course] of TRIPLES) {
    assert.equal(
      await reviewKeyHash(uid, initials, course),
      await jsReviewKeyHash(uid, initials, course),
      `hash mismatch for ${uid}|${initials}|${course}`,
    );
  }
});

test('buildReviewDocId equals the js buildReviewDoc id (canonical, probe target)', async () => {
  for (const [uid, initials, course] of TRIPLES) {
    // The id ignores ratings, but the js builder reads them — supply a full set.
    const ratings = { teaching: 4, marking: 4, behavior: 4, difficulty: 3, workload: 3 };
    const jsDoc = await jsBuildReviewDoc({ facultyInitials: initials, courseCode: course, ratings }, uid);
    assert.equal(
      await buildReviewDocId(uid, initials, course),
      jsDoc.id,
      `doc-id mismatch for ${uid}|${initials}|${course}`,
    );
  }
});

test('buildReviewDocId shape is INITIALS_COURSE_<64 hex>', async () => {
  const id = await buildReviewDocId('u', 'MNR', 'CSE220');
  assert.match(id, /^MNR_CSE220_[a-f0-9]{64}$/);
});
