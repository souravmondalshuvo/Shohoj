// tests/reviewsWriteRepo.test.js — unit tests for the typed submit relay (#347)
// over a fake fetch. Covers the guard order (missing workerUrl / token), the
// posted request (URL, Bearer header, legacy body), and the status-code mapping:
// success (+id), the 409 immutable-duplicate case, a non-ok error-body parse,
// and a network throw. Parity target: js/auth/firebase.js _shohoj_submitReview.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReviewReportRepo,
  submitReviewRelay,
} from '../src/platform/firebase/reviewsWriteRepo.ts';

const WORKER = 'https://worker.example';
const CONFIG = { apiKey: 'k', authDomain: 'a', projectId: 'p', storageBucket: 'b', messagingSenderId: 'm', appId: 'i' };

// A fake report backend recording createReport calls; can be told to reject.
function fakeReportBackend({ error } = {}) {
  const calls = [];
  return {
    calls,
    backend: {
      async createReport(id, data) {
        calls.push({ id, data });
        if (error) throw error;
      },
    },
  };
}

function reportRepoWith(backend, { spyLoads } = {}) {
  let loads = 0;
  const repo = createReviewReportRepo({
    config: CONFIG,
    loadBackend: async () => {
      loads++;
      return backend;
    },
  });
  return spyLoads ? { repo, loads: () => loads } : repo;
}

const VALID_ID = 'MRA_CSE110_' + 'a'.repeat(64);

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

// ── createReviewReportRepo ────────────────────────────────────────────────────

test('reportReview: writes reviewReports at the deterministic id with trimmed fields', async () => {
  const { backend, calls } = fakeReportBackend();
  const repo = reportRepoWith(backend);

  const res = await repo.reportReview({ reviewId: VALID_ID, reason: '  spam review  ', uid: 'u1' });
  assert.deepEqual(res, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, `u1_${VALID_ID}`, 'buildReviewReportId = uid_reviewId');
  assert.deepEqual(calls[0].data, { reviewId: VALID_ID, reason: 'spam review', reporterUid: 'u1' });
});

test('reportReview: guards signed-out and an invalid id before loading the backend', async () => {
  const { backend, calls } = fakeReportBackend();
  const { repo, loads } = reportRepoWith(backend, { spyLoads: true });

  assert.deepEqual(await repo.reportReview({ reviewId: VALID_ID, reason: 'bad', uid: '' }), {
    ok: false,
    error: 'Sign in to report a review',
  });
  assert.deepEqual(await repo.reportReview({ reviewId: 'not-an-id', reason: 'bad', uid: 'u1' }), {
    ok: false,
    error: 'Invalid review reference',
  });
  assert.equal(calls.length, 0);
  assert.equal(loads(), 0, 'SDK never loads for a guarded call');
});

test('reportReview: a too-short reason is rejected (min 3 after trim)', async () => {
  const { backend, calls } = fakeReportBackend();
  const repo = reportRepoWith(backend);
  assert.deepEqual(await repo.reportReview({ reviewId: VALID_ID, reason: ' x ', uid: 'u1' }), {
    ok: false,
    error: 'Please describe the issue',
  });
  assert.equal(calls.length, 0);
});

test('reportReview: reason is capped at 300 chars', async () => {
  const { backend, calls } = fakeReportBackend();
  const repo = reportRepoWith(backend);
  await repo.reportReview({ reviewId: VALID_ID, reason: 'y'.repeat(400), uid: 'u1' });
  assert.equal(calls[0].data.reason.length, 300);
});

test('reportReview: permission-denied maps to the legacy moderation copy', async () => {
  const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
  const { backend } = fakeReportBackend({ error: denied });
  const repo = reportRepoWith(backend);
  const res = await repo.reportReview({ reviewId: VALID_ID, reason: 'spam', uid: 'u1' });
  assert.equal(res.ok, false);
  assert.match(res.error, /already been removed or you may have reported it already/);
});

test('reportReview: an unexpected error degrades to a generic message, never throws', async () => {
  const { backend } = fakeReportBackend({ error: new Error('offline') });
  const repo = reportRepoWith(backend);
  assert.deepEqual(await repo.reportReview({ reviewId: VALID_ID, reason: 'spam', uid: 'u1' }), {
    ok: false,
    error: 'offline',
  });
});
