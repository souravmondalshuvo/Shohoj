/**
 * worker/test/apiV1.test.js
 * Tests for the /api/v1 namespace (#710). Run with:
 *   npm run test:worker    (or via the auto-discovering `npm test`)
 *
 * Two layers:
 *   * the pure record logic in apiV1.js, tested directly with no I/O at all;
 *   * the wired GET /api/v1/me endpoint, driven through worker.fetch with a
 *     locally-signed Firebase token and every network call mocked, so the test
 *     stays offline and deterministic.
 *
 * What these are really guarding is the two rules Tasks depends on and cannot
 * check for itself: identity comes only from the verified token, and resolving
 * a returning user performs no write.
 */

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import worker, { __setTestJwksForTests } from '../index.js';
import {
  API_ERROR_CODES,
  SHOHOJ_USERS_COLLECTION,
  USER_RECORD_SCHEMA_VERSION,
  displayNameFromClaims,
  identityFromClaims,
  resolveShohojUser,
  shapeUserRecord,
  shohojUserId,
  userDto,
} from '../apiV1.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.stack?.split('\n').slice(0, 3).join('\n      ') || err}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) {
    throw new Error(
      `${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
    );
  }
}

const ENV = {
  FIREBASE_PROJECT_ID: 'shohoj-test',
  ALLOWED_ORIGINS: 'https://shohoj.example,http://localhost:5173',
};
const ALLOWED_ORIGIN = 'https://shohoj.example';
const DISALLOWED_ORIGIN = 'https://attacker.example';

/** Real sha256, so the derived ids under test are the ones production computes. */
async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input ?? ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** An in-memory stand-in for the two Firestore calls, recording every write. */
function fakeStore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const writes = [];
  return {
    docs,
    writes,
    getDoc: async (path) => (docs.has(path) ? { ...docs.get(path) } : null),
    patchDoc: async (path, obj) => {
      writes.push({ path, obj });
      docs.set(path, { ...(docs.get(path) || {}), ...obj });
    },
  };
}

function depsFor(store, nowIso = '2026-09-20T10:00:00.000Z') {
  return {
    getDoc: store.getDoc,
    patchDoc: store.patchDoc,
    sha256Hex,
    now: () => new Date(nowIso),
  };
}

const BRACU_CLAIMS = {
  sub: 'firebase-uid-abc',
  email: 'student@g.bracu.ac.bd',
  email_verified: true,
  name: 'Student Name',
  firebase: { sign_in_provider: 'google.com' },
};

function req(method, path, { origin = ALLOWED_ORIGIN, headers = {} } = {}) {
  const h = new Headers(headers);
  if (origin) h.set('Origin', origin);
  return new Request(`https://worker.local${path}`, { method, headers: h });
}

async function makeFirebaseToken(claims) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-firebase-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(`https://securetoken.google.com/${ENV.FIREBASE_PROJECT_ID}`)
    .setAudience(ENV.FIREBASE_PROJECT_ID)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, jwk };
}

async function makeServiceAccountJson() {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  return JSON.stringify({
    client_email: 'worker-test@shohoj-test.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

async function withMockedFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

(async function run() {
  console.log('\n/api/v1 — internal user id:');

  await test('id is derived, prefixed, and stable for a uid', async () => {
    const a = await shohojUserId('firebase-uid-abc', sha256Hex);
    const b = await shohojUserId('firebase-uid-abc', sha256Hex);
    assertEq(a, b, 'same uid must give the same id');
    assert(/^usr_[0-9a-f]{32}$/.test(a), `unexpected id shape: ${a}`);
  });

  await test('different uids give different ids', async () => {
    const a = await shohojUserId('uid-one', sha256Hex);
    const b = await shohojUserId('uid-two', sha256Hex);
    assert(a !== b, 'distinct uids must not collide');
  });

  await test('the id is not a bare hash of the uid (domain separation)', async () => {
    // Deterministic review ids hash `uid|initials|course`. If a user id were an
    // unprefixed sha256 of the uid alone, the same number would mean two things
    // in two systems. The prefix is what stops that, so assert it is applied.
    const derived = await shohojUserId('firebase-uid-abc', sha256Hex);
    const bare = await sha256Hex('firebase-uid-abc');
    assert(!derived.includes(bare.slice(0, 32)), 'id must not be a bare hash of the uid');
  });

  console.log('\n/api/v1 — identity from claims:');

  await test('display name prefers the name claim', () => {
    assertEq(displayNameFromClaims(BRACU_CLAIMS), 'Student Name');
  });

  await test('display name falls back to the email local part', () => {
    // A Workspace account with the profile scope withheld arrives with no name.
    assertEq(displayNameFromClaims({ email: 'someone@g.bracu.ac.bd' }), 'someone');
  });

  await test('display name is null when there is nothing to build one from', () => {
    assertEq(displayNameFromClaims({}), null);
    assertEq(displayNameFromClaims({ name: '   ', email: '' }), null);
  });

  await test('display name is bounded', () => {
    const long = 'x'.repeat(500);
    assertEq(displayNameFromClaims({ name: long }).length, 100);
  });

  await test('university is resolved from the verified email, not supplied', () => {
    assertEq(identityFromClaims(BRACU_CLAIMS).university, 'bracu');
    assertEq(identityFromClaims({ email: 'someone@northsouth.edu' }).university, 'nsu');
    // An address no campus claims yields null rather than a guess.
    assertEq(identityFromClaims({ email: 'someone@gmail.com' }).university, null);
    // And a claimed campus in the token body is ignored entirely — the email decides.
    assertEq(
      identityFromClaims({ email: 'someone@gmail.com', university: 'bracu' }).university,
      null,
    );
  });

  console.log('\n/api/v1 — record shaping:');

  await test('a first sight creates a fully-stamped record', () => {
    const out = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing: null,
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    assert(out.created, 'should report created');
    assert(out.changed, 'a creation is a change');
    assertEq(out.record.schemaVersion, USER_RECORD_SCHEMA_VERSION);
    assertEq(out.record.id, 'usr_x');
    assertEq(out.record.university, 'bracu');
    assertEq(out.record.studentId, null);
    assertEq(out.record.createdAt, '2026-09-20T10:00:00.000Z');
    assertEq(out.record.updatedAt, '2026-09-20T10:00:00.000Z');
  });

  await test('an unchanged returning user is NOT a write', () => {
    // The whole reason /api/v1/me is cheap. Called on every shell boot, an
    // unconditional patch would be a Firestore write per page load per student.
    const first = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing: null,
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    const second = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing: first.record,
      nowIso: '2026-09-21T11:00:00.000Z',
    });
    assert(!second.changed, 'identical identity must not mark the record changed');
    assertEq(second.record.updatedAt, '2026-09-20T10:00:00.000Z', 'updatedAt must not move');
  });

  await test('a changed display name updates and stamps updatedAt', () => {
    const existing = {
      schemaVersion: USER_RECORD_SCHEMA_VERSION,
      id: 'usr_x',
      firebaseUid: 'uid',
      email: 'student@g.bracu.ac.bd',
      displayName: 'Old Name',
      university: 'bracu',
      studentId: '21301234',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing,
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    assert(out.changed, 'a renamed user is a change');
    assertEq(out.record.displayName, 'Student Name');
    assertEq(out.record.updatedAt, '2026-09-20T10:00:00.000Z');
    assertEq(out.record.createdAt, '2026-01-01T00:00:00.000Z', 'createdAt must be preserved');
  });

  await test('studentId survives a sign-in', () => {
    // It comes from the student's own transcript import, never from the token.
    // A sign-in that cleared it would silently discard their data.
    const existing = {
      schemaVersion: USER_RECORD_SCHEMA_VERSION,
      id: 'usr_x',
      firebaseUid: 'uid',
      email: 'student@g.bracu.ac.bd',
      displayName: 'Old Name',
      university: 'bracu',
      studentId: '21301234',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing,
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    assertEq(out.record.studentId, '21301234');
  });

  await test('a tampered stored id or uid is overwritten by the derived value', () => {
    const existing = {
      schemaVersion: USER_RECORD_SCHEMA_VERSION,
      id: 'usr_SOMEONE_ELSE',
      firebaseUid: 'someone-elses-uid',
      email: 'student@g.bracu.ac.bd',
      displayName: 'Student Name',
      university: 'bracu',
      studentId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = shapeUserRecord({
      id: 'usr_derived',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing,
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    assertEq(out.record.id, 'usr_derived');
    assertEq(out.record.firebaseUid, 'uid');
  });

  await test('an unversioned legacy record is re-stamped', () => {
    const out = shapeUserRecord({
      id: 'usr_x',
      firebaseUid: 'uid',
      identity: identityFromClaims(BRACU_CLAIMS),
      existing: {
        email: 'student@g.bracu.ac.bd',
        displayName: 'Student Name',
        university: 'bracu',
      },
      nowIso: '2026-09-20T10:00:00.000Z',
    });
    assert(out.changed, 'a missing schemaVersion must trigger a write');
    assertEq(out.record.schemaVersion, USER_RECORD_SCHEMA_VERSION);
  });

  await test('the DTO withholds firebaseUid and schemaVersion', () => {
    const dto = userDto({
      schemaVersion: 1,
      id: 'usr_x',
      firebaseUid: 'uid',
      email: 'e',
      displayName: 'd',
      university: 'bracu',
      studentId: null,
      createdAt: 'c',
      updatedAt: 'u',
    });
    assert(!('firebaseUid' in dto), 'firebaseUid must not be returned');
    assert(!('schemaVersion' in dto), 'schemaVersion must not be returned');
    assertEq(
      Object.keys(dto).sort().join(','),
      'createdAt,displayName,email,id,studentId,university,updatedAt',
    );
  });

  console.log('\n/api/v1 — resolution:');

  await test('resolution bootstraps a new user with one write', async () => {
    const store = fakeStore();
    const { user, created } = await resolveShohojUser(depsFor(store), BRACU_CLAIMS);
    assert(created, 'first sight is a creation');
    assertEq(store.writes.length, 1);
    assertEq(store.writes[0].path, `${SHOHOJ_USERS_COLLECTION}/firebase-uid-abc`);
    assertEq(user.university, 'bracu');
    assert(/^usr_[0-9a-f]{32}$/.test(user.id), 'user carries a derived id');
  });

  await test('resolving the same user again performs no write', async () => {
    const store = fakeStore();
    await resolveShohojUser(depsFor(store), BRACU_CLAIMS);
    const before = store.writes.length;
    const { created } = await resolveShohojUser(
      depsFor(store, '2026-10-01T00:00:00.000Z'),
      BRACU_CLAIMS,
    );
    assert(!created, 'second call is not a creation');
    assertEq(store.writes.length, before, 'no second write');
  });

  await test('the record is keyed by uid, so concurrent first calls converge', async () => {
    const store = fakeStore();
    const [a, b] = await Promise.all([
      resolveShohojUser(depsFor(store), BRACU_CLAIMS),
      resolveShohojUser(depsFor(store), BRACU_CLAIMS),
    ]);
    assertEq(a.user.id, b.user.id, 'both calls must resolve the same user id');
    assertEq(store.docs.size, 1, 'only one document may exist');
  });

  await test('resolution refuses a token with no subject', async () => {
    const store = fakeStore();
    let threw = false;
    try {
      await resolveShohojUser(depsFor(store), { email: 'student@g.bracu.ac.bd' });
    } catch {
      threw = true;
    }
    assert(threw, 'a subject-less token must not resolve to a user');
    assertEq(store.writes.length, 0);
  });

  console.log('\nGET /api/v1/me (wired):');

  await test('refuses an unauthenticated request with the v1 error envelope', async () => {
    const res = await worker.fetch(req('GET', '/api/v1/me'), ENV, {});
    assertEq(res.status, 401);
    const body = await res.json();
    assertEq(body.error.code, API_ERROR_CODES.UNAUTHENTICATED);
    assert(typeof body.error.message === 'string' && body.error.message.length > 0);
  });

  await test('refuses a disallowed browser origin before touching auth', async () => {
    const res = await worker.fetch(
      req('GET', '/api/v1/me', { origin: DISALLOWED_ORIGIN }),
      ENV,
      {},
    );
    assertEq(res.status, 403);
  });

  await test('an authenticated call resolves the user and returns 201 on first sight', async () => {
    const { token, jwk } = await makeFirebaseToken(BRACU_CLAIMS);
    __setTestJwksForTests({ keys: [jwk] });
    const env = { ...ENV, SERVICE_ACCOUNT_JSON: await makeServiceAccountJson() };

    const patched = [];
    const res = await withMockedFetch(
      async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'sa-token', expires_in: 3600 }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes(`/documents/${SHOHOJ_USERS_COLLECTION}/`)) {
          if ((init?.method || 'GET') === 'PATCH') {
            patched.push(JSON.parse(init.body));
            return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
          }
          return new Response('{}', { status: 404 }); // no record yet
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
      () =>
        worker.fetch(
          req('GET', '/api/v1/me', { headers: { Authorization: `Bearer ${token}` } }),
          env,
          {},
        ),
    );

    assertEq(res.status, 201, 'first sight creates the record');
    const body = await res.json();
    assertEq(body.user.email, 'student@g.bracu.ac.bd');
    assertEq(body.user.university, 'bracu');
    assertEq(body.user.displayName, 'Student Name');
    assert(/^usr_[0-9a-f]{32}$/.test(body.user.id), 'a derived id is returned');
    assert(!('firebaseUid' in body.user), 'the Firebase uid is never returned');
    assertEq(patched.length, 1, 'exactly one Firestore write');
    __setTestJwksForTests(null);
  });

  await test('a non-campus Google account is refused', async () => {
    // isAllowedFirebasePayload gates every authenticated endpoint; /api/v1 must
    // not become the hole in it.
    const { token, jwk } = await makeFirebaseToken({
      sub: 'uid-outsider',
      email: 'someone@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    __setTestJwksForTests({ keys: [jwk] });
    const res = await worker.fetch(
      req('GET', '/api/v1/me', { headers: { Authorization: `Bearer ${token}` } }),
      ENV,
      {},
    );
    assertEq(res.status, 401);
    assertEq((await res.json()).error.code, API_ERROR_CODES.UNAUTHENTICATED);
    __setTestJwksForTests(null);
  });

  await test('POST /api/v1/me is not a route', async () => {
    const res = await worker.fetch(req('POST', '/api/v1/me'), ENV, {});
    assertEq(res.status, 404);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
