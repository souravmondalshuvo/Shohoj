// tests/reviewSubmitFlow.test.js — unit tests for the provider's pure submit
// flow (#353): the relay is threaded the config workerUrl + token getter, and
// the pair's chip is invalidated only after a successful write.

import test from 'node:test';
import assert from 'node:assert/strict';

import { runReviewSubmit } from '../src/features/calculator/reviewSubmitFlow.ts';

const submission = () => ({
  facultyInitials: 'MRA',
  courseCode: 'CSE110',
  semester: 'Summer 2025',
  text: 'ok',
  ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 3, workload: 2 },
});

function deps(result, overrides = {}) {
  const calls = { relay: [], invalidated: [] };
  const getToken = async () => 'tok';
  return {
    calls,
    getToken,
    deps: {
      relay: async (sub, options) => {
        calls.relay.push({ sub, options });
        return result;
      },
      workerUrl: 'https://worker.example',
      getToken,
      onSubmitted: (initials, code) => calls.invalidated.push([initials, code]),
      ...overrides,
    },
  };
}

test('threads workerUrl + token getter into the relay', async () => {
  const { deps: d, calls, getToken } = deps({ ok: true, id: 'x' });
  await runReviewSubmit(submission(), d);
  assert.equal(calls.relay.length, 1);
  assert.equal(calls.relay[0].options.workerUrl, 'https://worker.example');
  assert.equal(calls.relay[0].options.getToken, getToken);
  assert.deepEqual(calls.relay[0].sub, submission());
});

test('an ok write invalidates exactly the submitted pair and returns the result', async () => {
  const { deps: d, calls } = deps({ ok: true, id: 'MRA_CSE110_abc' });
  const res = await runReviewSubmit(submission(), d);
  assert.deepEqual(res, { ok: true, id: 'MRA_CSE110_abc' });
  assert.deepEqual(calls.invalidated, [['MRA', 'CSE110']]);
});

test('a failed write does not invalidate the chip', async () => {
  const { deps: d, calls } = deps({ ok: false, error: 'Submission failed' });
  const res = await runReviewSubmit(submission(), d);
  assert.equal(res.ok, false);
  assert.deepEqual(calls.invalidated, [], 'no invalidation on failure');
});

test('a 409 duplicate does not invalidate the chip', async () => {
  const { deps: d, calls } = deps({ ok: false, code: 'already-exists', error: 'dup' });
  await runReviewSubmit(submission(), d);
  assert.deepEqual(calls.invalidated, [], 'a duplicate is not a new write');
});
