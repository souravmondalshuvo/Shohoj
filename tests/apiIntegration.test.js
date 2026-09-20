/**
 * tests/apiIntegration.test.js
 *
 * Phase 1's acceptance criterion, proven end to end (#710):
 *
 *   "An authenticated frontend request reaches GET /api/v1/me and resolves the
 *    correct Shohoj user, including on the very first call for a new account."
 *
 * The REAL frontend API client (src/platform/api) is pointed at the REAL Worker
 * handler (worker/index.js) by giving the client a `fetchFn` that invokes
 * `worker.fetch` directly. Both halves of the contract are the shipping code:
 * the client builds the URL, attaches the bearer token and validates the
 * response schema; the Worker verifies the token against a locally-signed JWKS,
 * resolves the record, and answers in the /api/v1 envelope.
 *
 * Only the two things that genuinely leave the process are faked — Google's
 * OAuth token exchange and the Firestore REST API. Nothing here touches a
 * network, a browser or an emulator.
 *
 * This is what a Playwright spec would otherwise have to prove against a
 * deployed Worker, and it proves it faster and without credentials. What it
 * deliberately does NOT cover is the browser: CORS preflight and real Firebase
 * token minting belong to the shell e2e suite.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests } from '../worker/index.js';
import { SHOHOJ_USERS_COLLECTION } from '../worker/apiV1.js';
import { createApiClient } from '../src/platform/api/apiClient.ts';
import { fetchShohojUser } from '../src/platform/api/shohojUser.ts';

const PROJECT_ID = 'shohoj-test';
const BASE_URL = 'https://worker.example';
const ORIGIN = 'https://shohoj.example';

const WORKER_ENV = {
  FIREBASE_PROJECT_ID: PROJECT_ID,
  ALLOWED_ORIGINS: ORIGIN,
};

async function signToken(claims, kid = 'integration-key') {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(PROJECT_ID)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, jwk };
}

async function serviceAccountJson() {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  return JSON.stringify({
    client_email: 'integration@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

/**
 * The two calls that really would leave the process: Google's OAuth token
 * exchange and Firestore REST. Backed by a plain Map, so the "database"
 * persists across requests within a test exactly as Firestore would.
 */
function fakeGoogle(docs = new Map()) {
  const writes = [];
  const handler = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const docMatch = /\/documents\/(.+)$/.exec(url);
    if (docMatch) {
      const path = decodeURIComponent(docMatch[1]);
      if (method === 'PATCH') {
        const body = JSON.parse(init.body);
        writes.push({ path, fields: body.fields });
        docs.set(path, body.fields);
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const stored = docs.get(path);
      if (stored === undefined) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ fields: stored }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected outbound fetch: ${method} ${url}`);
  };
  return { handler, docs, writes };
}

/**
 * An API client whose transport is the Worker itself.
 *
 * The Origin header is set here because the Worker enforces a browser-origin
 * allowlist and a real browser would always send one. `globalThis.fetch` is
 * swapped for the duration of the call so the Worker's own outbound calls hit
 * the Google fake rather than the network.
 */
function clientAgainstWorker({ token, env, google }) {
  return createApiClient({
    baseUrl: BASE_URL,
    getIdToken: async () => token,
    fetchFn: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Origin', ORIGIN);
      const request = new Request(url, { ...init, headers });
      const realFetch = globalThis.fetch;
      globalThis.fetch = google.handler;
      try {
        return await worker.fetch(request, env, {});
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  });
}

const STUDENT = {
  sub: 'integration-uid-1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Integration Student',
  firebase: { sign_in_provider: 'google.com' },
};

test('an authenticated request resolves the Shohoj user, bootstrapping it on first call', async () => {
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();
    const client = clientAgainstWorker({ token, env, google });

    const first = await fetchShohojUser(client);

    assert.equal(first.ok, true, `expected a user, got ${first.error?.message}`);
    assert.match(first.value.id, /^usr_[0-9a-f]{32}$/);
    assert.equal(first.value.email, 'student@g.bracu.ac.bd');
    assert.equal(first.value.displayName, 'Integration Student');
    assert.equal(first.value.university, 'bracu');
    assert.equal(first.value.studentId, null);

    // The record was actually written, keyed by the Firebase uid.
    assert.equal(google.writes.length, 1);
    assert.equal(google.writes[0].path, `${SHOHOJ_USERS_COLLECTION}/${STUDENT.sub}`);

    // ...and the Firebase uid never reached the client.
    assert.equal('firebaseUid' in first.value, false);
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a second request returns the same user and writes nothing', async () => {
  const { token, jwk } = await signToken(STUDENT);
  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();
    const client = clientAgainstWorker({ token, env, google });

    const first = await fetchShohojUser(client);
    const writesAfterBootstrap = google.writes.length;
    const second = await fetchShohojUser(client);

    assert.equal(second.ok, true);
    assert.equal(second.value.id, first.value.id, 'the id must be stable across calls');
    assert.equal(second.value.createdAt, first.value.createdAt);
    assert.equal(
      google.writes.length,
      writesAfterBootstrap,
      'resolving a returning student must not write',
    );
  } finally {
    __setTestJwksForTests(null);
  }
});

test('two students get different Shohoj user ids and separate records', async () => {
  const other = {
    ...STUDENT,
    sub: 'integration-uid-2',
    email: 'other@g.bracu.ac.bd',
    name: 'Other Student',
  };
  const a = await signToken(STUDENT, 'integration-key-a');
  const b = await signToken(other, 'integration-key-b');
  // One JWKS serving both keys, which is what Google actually does.
  __setTestJwksForTests({ keys: [a.jwk, b.jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();

    const first = await fetchShohojUser(clientAgainstWorker({ token: a.token, env, google }));
    const second = await fetchShohojUser(clientAgainstWorker({ token: b.token, env, google }));

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.value.id, second.value.id, 'two students must not share an id');
    assert.equal(second.value.email, 'other@g.bracu.ac.bd');
    assert.equal(google.docs.size, 2, 'each student gets their own record');
  } finally {
    __setTestJwksForTests(null);
  }
});

test('a signed-out shell never reaches the Worker', async () => {
  let reached = false;
  const client = createApiClient({
    baseUrl: BASE_URL,
    getIdToken: async () => null,
    fetchFn: async () => {
      reached = true;
      return new Response('{}', { status: 200 });
    },
  });

  const result = await fetchShohojUser(client);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'permission');
  assert.equal(reached, false);
});

test('an expired token is refused, and the client reports it as a permission failure', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'expired-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const expired = await new SignJWT(STUDENT)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(PROJECT_ID)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(privateKey);

  __setTestJwksForTests({ keys: [jwk] });
  try {
    const env = { ...WORKER_ENV, SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
    const google = fakeGoogle();
    const client = clientAgainstWorker({ token: expired, env, google });

    const result = await fetchShohojUser(client);

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'permission');
    // The envelope's message is contractually user-safe, so it is what the UI shows.
    assert.match(result.error.userMessage, /sign in/i);
    assert.equal(google.writes.length, 0, 'a refused request must not write');
  } finally {
    __setTestJwksForTests(null);
  }
});
