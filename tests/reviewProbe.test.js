// tests/reviewProbe.test.js — the existing-review probe (#341): guard order and
// the canonical-id lookup, over a fake env.

import test from 'node:test';
import assert from 'node:assert/strict';

import { probeExistingReview } from '../src/features/calculator/reviewProbe.ts';
import { buildReviewDocId } from '../src/core/reviews.ts';

function fakeEnv({ uid = 'uid-1', result = null, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    env: {
      currentUid: () => uid,
      fetchById: async (id) => {
        calls.push(id);
        if (throws) throw new Error('offline');
        return result;
      },
    },
  };
}

test('returns null (no fetch) without initials or course', async () => {
  const { env, calls } = fakeEnv();
  assert.equal(await probeExistingReview('', 'CSE220', env), null);
  assert.equal(await probeExistingReview('MNR', '', env), null);
  assert.equal(calls.length, 0);
});

test('returns null (no fetch) when signed out', async () => {
  const { env, calls } = fakeEnv({ uid: '' });
  assert.equal(await probeExistingReview('MNR', 'CSE220', env), null);
  assert.equal(calls.length, 0);
});

test('fetches the canonical doc id and returns the review when found', async () => {
  const review = { id: 'x', ratings: { teaching: 5 }, text: 'hi' };
  const { env, calls } = fakeEnv({ uid: 'uid-1', result: review });
  const got = await probeExistingReview('MNR', 'CSE220', env);
  assert.deepEqual(got, review);
  assert.equal(calls[0], await buildReviewDocId('uid-1', 'MNR', 'CSE220'));
});

test('returns null when the pair has no review', async () => {
  const { env } = fakeEnv({ result: null });
  assert.equal(await probeExistingReview('MNR', 'CSE220', env), null);
});

test('swallows fetch errors (probe never blocks the form)', async () => {
  const { env } = fakeEnv({ throws: true });
  assert.equal(await probeExistingReview('MNR', 'CSE220', env), null);
});
