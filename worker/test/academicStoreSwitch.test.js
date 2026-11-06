// worker/test/academicStoreSwitch.test.js
//
// The one configuration switch between the two academic stores (#908): what
// `ACADEMIC_STORE` selects, what it refuses, and that a request served from D1
// answers the way the same request served from Firestore does.

import assert from 'node:assert/strict';
import test from 'node:test';

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

import worker, { __setTestJwksForTests, academicStore } from '../index.js';
import { createFakeD1 } from './helpers/fakeD1.js';

const PROJECT = 'shohoj-test';
const ORIGIN = 'https://shohoj.example';
const BASE_ENV = { FIREBASE_PROJECT_ID: PROJECT, ALLOWED_ORIGINS: ORIGIN };
const CLAIMS = {
  sub: 'firebase-uid-d1',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Student Name',
  firebase: { sign_in_provider: 'google.com' },
};

/** A D1 binding that fails the test if anything touches it. */
const UNTOUCHABLE_DB = {
  prepare() {
    throw new Error('the D1 binding must not be used');
  },
};

async function signedIn() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'switch-test', alg: 'RS256', use: 'sig' };
  const token = await new SignJWT(CLAIMS)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setSubject(CLAIMS.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  __setTestJwksForTests({ keys: [jwk] });

  const { privateKey: saKey } = await generateKeyPair('RS256', { extractable: true });
  const serviceAccount = JSON.stringify({
    client_email: 'worker-test@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(saKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  return { token, serviceAccount };
}

/**
 * Mock the network: Google's token endpoint answers, and every Firestore path
 * reads as empty and accepts writes. `firestoreCalls` records each one, so a
 * D1-backed request can prove it made none.
 */
async function withNetwork(fn) {
  const firestoreCalls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'sa-token', expires_in: 3600 });
    }
    if (url.includes('firestore.googleapis.com')) {
      firestoreCalls.push(`${init?.method ?? 'GET'} ${url}`);
      if ((init?.method ?? 'GET') === 'GET') return new Response('{}', { status: 404 });
      return Response.json({});
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  try {
    return { result: await fn(), firestoreCalls };
  } finally {
    globalThis.fetch = original;
  }
}

function call(method, path, token, body) {
  const headers = new Headers({ Origin: ORIGIN, Authorization: `Bearer ${token}` });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://worker.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A response body with its clock-dependent fields blanked, for comparison. */
function timeless(body) {
  return JSON.parse(
    JSON.stringify(body, (key, value) =>
      key === 'createdAt' || key === 'updatedAt' ? '<t>' : value,
    ),
  );
}

// ── Selection ───────────────────────────────────────────────────────────────

test('unset, the switch keeps Firestore and leaves the D1 binding alone', async () => {
  const { result, firestoreCalls } = await withNetwork(() =>
    academicStore({ ...BASE_ENV, ACADEMIC_DB: UNTOUCHABLE_DB }, 'sa-token').users.get('uid_x'),
  );
  assert.equal(result, null);
  assert.equal(firestoreCalls.length, 1);
});

test('"d1" selects the ACADEMIC_DB binding', async () => {
  const db = createFakeD1();
  const store = academicStore({ ...BASE_ENV, ACADEMIC_STORE: 'd1', ACADEMIC_DB: db }, 'sa-token');
  assert.equal(await store.users.get('uid_x'), null);
  assert.ok(db.statements.length > 0);
});

test('"d1" without a binding refuses instead of falling back to Firestore', () => {
  assert.throws(
    () => academicStore({ ...BASE_ENV, ACADEMIC_STORE: 'd1' }, 'sa-token'),
    /ACADEMIC_DB binding is missing/,
  );
});

test('an unknown backend name refuses instead of guessing', () => {
  for (const name of ['D1', 'sqlite', '']) {
    assert.throws(
      () => academicStore({ ...BASE_ENV, ACADEMIC_STORE: name }, 'sa-token'),
      /must be "firestore" or "d1"/,
    );
  }
});

// ── Served from D1 ──────────────────────────────────────────────────────────

test('/api/v1 on D1 answers as it does on Firestore, without touching Firestore', async () => {
  const { token, serviceAccount } = await signedIn();
  try {
    const firestoreEnv = { ...BASE_ENV, SERVICE_ACCOUNT_JSON: serviceAccount };
    const db = createFakeD1();
    const d1Env = { ...firestoreEnv, ACADEMIC_STORE: 'd1', ACADEMIC_DB: db };

    const onFirestore = await withNetwork(async () => {
      const res = await worker.fetch(call('GET', '/api/v1/me', token), firestoreEnv, {});
      return { status: res.status, body: await res.json() };
    });

    const onD1 = await withNetwork(async () => {
      const first = await worker.fetch(call('GET', '/api/v1/me', token), d1Env, {});
      const again = await worker.fetch(call('GET', '/api/v1/me', token), d1Env, {});
      const created = await worker.fetch(
        call('POST', '/api/v1/semesters', token, { year: 2026, season: 'Fall' }),
        d1Env,
        {},
      );
      const listed = await worker.fetch(call('GET', '/api/v1/semesters', token), d1Env, {});
      return {
        first: { status: first.status, body: await first.json() },
        again: { status: again.status, body: await again.json() },
        created: { status: created.status, body: await created.json() },
        listed: { status: listed.status, body: await listed.json() },
      };
    });

    // Same contract: first sight is 201 with the same user, field for field.
    assert.equal(onD1.result.first.status, onFirestore.result.status);
    assert.deepEqual(timeless(onD1.result.first.body), timeless(onFirestore.result.body));
    // And the record persisted: the second call finds it.
    assert.equal(onD1.result.again.status, 200);
    assert.deepEqual(onD1.result.again.body, onD1.result.first.body);

    assert.equal(onD1.result.created.status, 201);
    assert.equal(onD1.result.listed.status, 200);
    assert.deepEqual(
      onD1.result.listed.body.items.map((semester) => semester.id),
      [onD1.result.created.body.semester.id],
    );
    assert.equal(db.raw.prepare('SELECT count(*) AS n FROM semesters').get().n, 1);

    assert.deepEqual(onD1.firestoreCalls, []);
  } finally {
    __setTestJwksForTests(null);
  }
});
