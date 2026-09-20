/**
 * tests/apiClient.test.js
 *
 * The typed API client (#710) — src/platform/api/apiClient.ts and shohojUser.ts.
 *
 * No network and no browser: `fetch` and the token getter are injected, so every
 * case here is deterministic. What is being pinned down is the behaviour the
 * rest of Tasks will assume without checking:
 *
 *   * a signed-out call to a protected endpoint never reaches the network;
 *   * the bearer token goes to the configured origin and nowhere else;
 *   * a response the schema rejects is a failure, not a half-rendered screen;
 *   * every failure is a typed Result carrying a displayable userMessage.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { API_V1_PREFIX, createApiClient } from '../src/platform/api/apiClient.ts';
import { MeResponseSchema, fetchShohojUser } from '../src/platform/api/shohojUser.ts';
import { z } from '../src/shared/validation/schema.ts';

const BASE = 'https://worker.example';
const TOKEN = 'id-token-123';

const VALID_USER = {
  id: 'usr_0123456789abcdef0123456789abcdef',
  email: 'student@g.bracu.ac.bd',
  displayName: 'Student Name',
  university: 'bracu',
  studentId: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch stand-in that records every call and replies from a queue. */
function recordingFetch(...responses) {
  const calls = [];
  let index = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return typeof next === 'function' ? next() : next;
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function clientWith(fetchFn, { token = TOKEN, ...rest } = {}) {
  return createApiClient({
    baseUrl: BASE,
    getIdToken: async () => token,
    fetchFn,
    ...rest,
  });
}

const EchoSchema = z.object({ ok: z.boolean() });

test('a signed-out call to a protected endpoint never reaches the network', async () => {
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn, { token: null });

  const result = await client.get('/me', EchoSchema);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'permission');
  assert.equal(result.error.userMessage, 'Please sign in to continue.');
  assert.equal(fetchFn.calls.length, 0, 'no request may be sent without a token');
});

test('auth: none sends no Authorization header even when a token exists', async () => {
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn);

  await client.get('/health', EchoSchema, { auth: 'none' });

  assert.equal(fetchFn.calls.length, 1);
  assert.equal(fetchFn.calls[0].init.headers.get('Authorization'), null);
});

test('the token is attached, and only to the configured origin', async () => {
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn);

  await client.get('/me', EchoSchema);

  const { url, init } = fetchFn.calls[0];
  assert.equal(url, `${BASE}${API_V1_PREFIX}/me`);
  assert.equal(init.headers.get('Authorization'), `Bearer ${TOKEN}`);
});

test('an absolute path in the caller cannot redirect the request off-origin', async () => {
  // The token is on this request. A path that was parsed as a URL of its own
  // would send it to attacker.example; joined to the base, it cannot.
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn);

  await client.get('https://attacker.example/steal', EchoSchema);

  assert.ok(
    fetchFn.calls[0].url.startsWith(`${BASE}${API_V1_PREFIX}/`),
    `request escaped the base URL: ${fetchFn.calls[0].url}`,
  );
});

test('query params omit undefined and null rather than stringifying them', async () => {
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn);

  await client.get('/tasks', EchoSchema, {
    query: { status: 'TODO', dueBefore: undefined, courseId: null, limit: 20 },
  });

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.searchParams.get('status'), 'TODO');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.has('dueBefore'), false, 'undefined must be omitted');
  assert.equal(url.searchParams.has('courseId'), false, 'null must be omitted');
});

test('a body is JSON-encoded with the right content type', async () => {
  const fetchFn = recordingFetch(jsonResponse({ ok: true }));
  const client = clientWith(fetchFn);

  await client.post('/tasks', { title: 'Quiz 3' }, EchoSchema);

  const { init } = fetchFn.calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(init.body), { title: 'Quiz 3' });
});

test('the API error envelope becomes a typed error with the server message', async () => {
  const fetchFn = recordingFetch(
    jsonResponse({ error: { code: 'not_found', message: 'That task no longer exists.' } }, 404),
  );
  const client = clientWith(fetchFn);

  const result = await client.get('/tasks/abc', EchoSchema);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'not_found');
  // The contract says the envelope's message is user-safe, so it is shown
  // rather than replaced by a generic line.
  assert.equal(result.error.userMessage, 'That task no longer exists.');
});

test('401 and 403 map to a permission error', async () => {
  for (const status of [401, 403]) {
    const client = clientWith(
      recordingFetch(jsonResponse({ error: { code: 'forbidden', message: 'Nope.' } }, status)),
    );
    const result = await client.get('/tasks', EchoSchema);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'permission', `status ${status}`);
  }
});

test('a non-JSON failure body still produces a displayable error', async () => {
  // An edge 502 with an HTML body, a proxy's plain-text timeout — the status
  // alone has to carry it.
  const fetchFn = recordingFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
  const client = clientWith(fetchFn);

  const result = await client.get('/tasks', EchoSchema);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'worker');
  assert.match(result.error.userMessage, /try again/i);
});

test('a transport failure is a Result, not a throw', async () => {
  // Shohoj's offline tools must keep working when the backend is unreachable.
  // A throw at this seam is how that stops being true.
  const fetchFn = recordingFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  const client = clientWith(fetchFn);

  const result = await client.get('/tasks', EchoSchema);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'worker');
  assert.match(result.error.userMessage, /reach the server/i);
});

test('a success body that does not match the schema is a failure', async () => {
  // Never a half-rendered screen of undefined: the contract is only real if the
  // client checks it.
  const fetchFn = recordingFetch(jsonResponse({ ok: 'yes please' }));
  const client = clientWith(fetchFn);

  const result = await client.get('/tasks', EchoSchema);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation');
});

test('fetchShohojUser unwraps the envelope', async () => {
  const fetchFn = recordingFetch(jsonResponse({ user: VALID_USER }));
  const client = clientWith(fetchFn);

  const result = await fetchShohojUser(client);

  assert.equal(result.ok, true);
  assert.equal(result.value.id, VALID_USER.id);
  assert.equal(result.value.university, 'bracu');
  assert.equal(fetchFn.calls[0].url, `${BASE}${API_V1_PREFIX}/me`);
});

test('a malformed Shohoj user id is rejected at the boundary', async () => {
  // This value becomes the owner key on every task. A malformed one must fail
  // here, not at write time deep inside a feature.
  const fetchFn = recordingFetch(jsonResponse({ user: { ...VALID_USER, id: 'not-a-user-id' } }));
  const client = clientWith(fetchFn);

  const result = await fetchShohojUser(client);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation');
});

test('an unrecognised campus reads as null rather than crashing', async () => {
  // A client that has not shipped support for a newly-added campus should say
  // "not one I know", not fail and not pretend.
  const parsed = MeResponseSchema.safeParse({
    user: { ...VALID_USER, university: 'some-new-campus' },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.user.university, null);
});

test('a null campus survives — an admin on no registered campus is valid', async () => {
  const parsed = MeResponseSchema.safeParse({ user: { ...VALID_USER, university: null } });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.user.university, null);
});

test('unknown fields the server adds later do not break an older client', async () => {
  const fetchFn = recordingFetch(
    jsonResponse({ user: { ...VALID_USER, onboardingComplete: true }, entitlements: [] }),
  );
  const client = clientWith(fetchFn);

  const result = await fetchShohojUser(client);

  assert.equal(result.ok, true);
  assert.equal(result.value.id, VALID_USER.id);
});
