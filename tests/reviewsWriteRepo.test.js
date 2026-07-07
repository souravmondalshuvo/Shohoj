// tests/reviewsWriteRepo.test.js — unit tests for the typed submit relay (#347)
// over a fake fetch. Covers the guard order (missing workerUrl / token), the
// posted request (URL, Bearer header, legacy body), and the status-code mapping:
// success (+id), the 409 immutable-duplicate case, a non-ok error-body parse,
// and a network throw. Parity target: js/auth/firebase.js _shohoj_submitReview.

import test from 'node:test';
import assert from 'node:assert/strict';

import { submitReviewRelay } from '../src/platform/firebase/reviewsWriteRepo.ts';

const WORKER = 'https://worker.example';

const submission = () => ({
  facultyInitials: 'MRA',
  courseCode: 'CSE110',
  semester: 'Summer 2025',
  text: 'Great',
  ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 3, workload: 2 },
});

// A fake fetch recording its call and returning a canned Response-like object.
function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (typeof response === 'function') return response();
    return response;
  };
  return { impl, calls };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('success: posts the legacy body with a Bearer token and returns the id', async () => {
  const { impl, calls } = fakeFetch(jsonResponse(200, { id: 'MRA_CSE110_abc' }));
  const res = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok-123',
    fetchImpl: impl,
  });

  assert.deepEqual(res, { ok: true, id: 'MRA_CSE110_abc' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${WORKER}/reviews`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-123');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    facultyInitials: 'MRA',
    courseCode: 'CSE110',
    semester: 'Summer 2025',
    text: 'Great',
    ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 3, workload: 2 },
  });
});

test('success: a missing id in the response resolves to id null', async () => {
  const { impl } = fakeFetch(jsonResponse(200, {}));
  const res = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok',
    fetchImpl: impl,
  });
  assert.deepEqual(res, { ok: true, id: null });
});

test('409: the immutable-duplicate case carries the already-exists code', async () => {
  const { impl } = fakeFetch(jsonResponse(409, { error: 'ignored' }));
  const res = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok',
    fetchImpl: impl,
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'already-exists');
  assert.match(res.error, /already submitted a review/);
});

test('non-ok: surfaces the worker error body, or a generic message on non-JSON', async () => {
  const withError = fakeFetch(jsonResponse(400, { error: 'Unknown course code' }));
  const res1 = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok',
    fetchImpl: withError.impl,
  });
  assert.deepEqual(res1, { ok: false, error: 'Unknown course code' });

  const nonJson = fakeFetch({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json');
    },
  });
  const res2 = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok',
    fetchImpl: nonJson.impl,
  });
  assert.deepEqual(res2, { ok: false, error: 'Submission failed' });
});

test('network throw degrades to a generic failure, never throws', async () => {
  const impl = async () => {
    throw new Error('offline');
  };
  const res = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => 'tok',
    fetchImpl: impl,
  });
  assert.deepEqual(res, { ok: false, error: 'offline' });
});

test('guards before any network call: missing workerUrl and missing token', async () => {
  const { impl, calls } = fakeFetch(jsonResponse(200, { id: 'x' }));

  const noUrl = await submitReviewRelay(submission(), {
    workerUrl: '',
    getToken: async () => 'tok',
    fetchImpl: impl,
  });
  assert.deepEqual(noUrl, { ok: false, error: 'Review service not configured' });

  const noToken = await submitReviewRelay(submission(), {
    workerUrl: WORKER,
    getToken: async () => null,
    fetchImpl: impl,
  });
  assert.deepEqual(noToken, { ok: false, error: 'Could not get auth token' });

  assert.equal(calls.length, 0, 'neither guard reaches fetch');
});
