/**
 * worker/test/worker.test.js
 * Tests for the papers Worker. Run with:
 *   npm run test:worker
 *
 * Covers pure validators, CORS, route dispatch, origin enforcement, auth-first
 * failures, and the full upload success path with mocked JWKS/OAuth/Firestore
 * calls so the test stays offline.
 */

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import worker, {
  AuthError,
  __setTestJwksForTests,
  corsHeaders,
  isAllowedFirebasePayload,
  isValidCourseCode,
  isValidStoragePath,
  safeFilename,
  validateReviewPayload,
  parseFeedSeatMap,
  detectSeatDrops,
  buildSeatAlertEmail,
} from '../index.js';

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
  if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const ENV = {
  FIREBASE_PROJECT_ID: 'shohoj-test',
  ALLOWED_ORIGINS: 'https://shohoj.example,http://localhost:5173',
  PAPERS_BUCKET: {
    async put() { throw new Error('PAPERS_BUCKET.put should not be reached without auth'); },
    async get() { throw new Error('PAPERS_BUCKET.get should not be reached without auth'); },
    async delete() { throw new Error('PAPERS_BUCKET.delete should not be reached without auth'); },
  },
};

const ALLOWED_ORIGIN = 'https://shohoj.example';
const DISALLOWED_ORIGIN = 'https://attacker.example';

function req(method, path, { origin = ALLOWED_ORIGIN, headers = {}, body = null } = {}) {
  const h = new Headers(headers);
  if (origin) h.set('Origin', origin);
  return new Request(`https://worker.local${path}`, { method, headers: h, body });
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
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
    .setSubject(claims.user_id || claims.sub)
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

(async function run() {
  console.log('\nWorker pure validators:');

  await test('isValidCourseCode accepts CSE110 / MAT215 / CSE470L', () => {
    assert(isValidCourseCode('CSE110'));
    assert(isValidCourseCode('MAT215'));
    assert(isValidCourseCode('CSE470L'));
    assert(isValidCourseCode('PHY111'));
  });

  await test('isValidCourseCode rejects malformed codes', () => {
    assert(!isValidCourseCode(''));
    assert(!isValidCourseCode('cse110'));
    assert(!isValidCourseCode('CSE 110'));
    assert(!isValidCourseCode('CSE11'));
    assert(!isValidCourseCode('CSE1100'));
    assert(!isValidCourseCode('C110'));
    assert(!isValidCourseCode(null));
    assert(!isValidCourseCode(123));
    assert(!isValidCourseCode('../etc'));
  });

  await test('isValidStoragePath accepts owner-scoped and legacy paper paths', () => {
    // Owner-scoped (current upload format)
    assert(isValidStoragePath('papers/CSE110/bracu_user/midterm-fall24.pdf'));
    assert(isValidStoragePath('papers/CSE470L/firebaseUid_123/final.PDF'));
    // Legacy two-segment (still in R2 from pre-migration uploads — read-only)
    assert(isValidStoragePath('papers/CSE110/midterm-fall24.pdf'));
    assert(isValidStoragePath('papers/MAT215/quiz_1.png'));
    assert(isValidStoragePath('papers/CSE470L/final.PDF'));
  });

  await test('isValidStoragePath rejects traversal and bad shapes', () => {
    assert(!isValidStoragePath('papers/CSE110/uid/../etc/passwd'));
    assert(!isValidStoragePath('papers/CSE110/sub/dir/file.pdf'));
    assert(!isValidStoragePath('papers/cse110/uid/file.pdf'));
    assert(!isValidStoragePath('other/CSE110/uid/file.pdf'));
    assert(!isValidStoragePath('papers/CSE110/uid/file with space.pdf'));
    assert(!isValidStoragePath(''));
    assert(!isValidStoragePath(null));
    assert(!isValidStoragePath({ path: 'papers/CSE110/uid/x.pdf' }));
  });

  await test('safeFilename strips disallowed chars and caps at 80', () => {
    assertEq(safeFilename('hello world!.pdf'), 'helloworld.pdf');
    // slashes stripped, dots kept (they're allowed); enough to defang traversal
    // since the resulting string can no longer escape its directory
    assertEq(safeFilename('../../../etc/passwd'), '......etcpasswd');
    assert(!safeFilename('../../../etc/passwd').includes('/'));
    assertEq(safeFilename(''), '');
    assertEq(safeFilename(null), '');
    assertEq(safeFilename(undefined), '');
    const long = 'a'.repeat(200) + '.pdf';
    assertEq(safeFilename(long).length, 80);
  });

  console.log('\nAuth payload policy:');

  await test('verified BRACU Google account is allowed', () => {
    assert(isAllowedFirebasePayload({
      email: 'student@g.bracu.ac.bd',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }));
  });

  await test('unverified BRACU email is rejected', () => {
    assert(!isAllowedFirebasePayload({
      email: 'student@g.bracu.ac.bd',
      email_verified: false,
      firebase: { sign_in_provider: 'google.com' },
    }));
  });

  await test('non-Google BRACU email is rejected', () => {
    assert(!isAllowedFirebasePayload({
      email: 'student@g.bracu.ac.bd',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    }));
  });

  await test('admin claim bypasses BRACU Google policy', () => {
    assert(isAllowedFirebasePayload({
      email: 'admin@example.com',
      email_verified: false,
      admin: true,
      firebase: { sign_in_provider: 'password' },
    }));
  });

  console.log('\nReview payload validation:');

  function basePayload(extra = {}) {
    return {
      facultyInitials: 'AAA',
      courseCode: 'CSE110',
      semester: 'Spring 2026',
      text: 'Solid lectures.',
      ratings: { teaching: 4, marking: 4, behavior: 5, difficulty: 3, workload: 3 },
      ...extra,
    };
  }

  await test('validateReviewPayload accepts a well-formed payload', () => {
    const r = validateReviewPayload(basePayload());
    assert(!r.error, r.error);
    assertEq(r.value.facultyInitials, 'AAA');
    assertEq(r.value.courseCode, 'CSE110');
    assertEq(r.value.ratings.teaching, 4);
  });

  await test('validateReviewPayload normalizes case', () => {
    const r = validateReviewPayload(basePayload({
      facultyInitials: 'aaa',
      courseCode: 'cse110',
    }));
    assert(!r.error);
    assertEq(r.value.facultyInitials, 'AAA');
    assertEq(r.value.courseCode, 'CSE110');
  });

  await test('validateReviewPayload rejects bad faculty initials', () => {
    assert(validateReviewPayload(basePayload({ facultyInitials: 'A' })).error);
    assert(validateReviewPayload(basePayload({ facultyInitials: 'TOOLONGNAME' })).error);
    assert(validateReviewPayload(basePayload({ facultyInitials: 'A1B' })).error);
  });

  await test('validateReviewPayload rejects bad course code', () => {
    assert(validateReviewPayload(basePayload({ courseCode: '110' })).error);
    assert(validateReviewPayload(basePayload({ courseCode: 'CSE' })).error);
  });

  await test('validateReviewPayload rejects out-of-range ratings', () => {
    assert(validateReviewPayload(basePayload({
      ratings: { teaching: 0, marking: 4, behavior: 5, difficulty: 3, workload: 3 },
    })).error);
    assert(validateReviewPayload(basePayload({
      ratings: { teaching: 6, marking: 4, behavior: 5, difficulty: 3, workload: 3 },
    })).error);
  });

  await test('validateReviewPayload rejects missing rating dimension', () => {
    assert(validateReviewPayload(basePayload({
      ratings: { teaching: 4, marking: 4, behavior: 5, difficulty: 3 },
    })).error);
  });

  await test('validateReviewPayload truncates long text/semester', () => {
    const r = validateReviewPayload(basePayload({
      text: 'x'.repeat(1000),
      semester: 'y'.repeat(80),
    }));
    assert(!r.error);
    assertEq(r.value.text.length, 500);
    assertEq(r.value.semester.length, 40);
  });

  console.log('\nCORS:');

  await test('corsHeaders echoes allowed origin', () => {
    const h = corsHeaders(ENV, ALLOWED_ORIGIN);
    assertEq(h['Access-Control-Allow-Origin'], ALLOWED_ORIGIN);
    assertEq(h['Vary'], 'Origin');
  });

  await test('corsHeaders omits Allow-Origin for disallowed origin', () => {
    const h = corsHeaders(ENV, DISALLOWED_ORIGIN);
    assert(!('Access-Control-Allow-Origin' in h), 'should not echo disallowed origin');
  });

  await test('corsHeaders handles missing ALLOWED_ORIGINS env', () => {
    const h = corsHeaders({}, ALLOWED_ORIGIN);
    assert(!('Access-Control-Allow-Origin' in h));
  });

  console.log('\nDispatch:');

  await test('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await worker.fetch(req('OPTIONS', '/upload'), ENV);
    assertEq(res.status, 204);
    assertEq(res.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
    assertEq(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, DELETE, OPTIONS');
  });

  await test('OPTIONS from disallowed origin omits Allow-Origin', async () => {
    const res = await worker.fetch(req('OPTIONS', '/upload', { origin: DISALLOWED_ORIGIN }), ENV);
    assertEq(res.status, 204);
    assert(!res.headers.get('Access-Control-Allow-Origin'));
  });

  await test('unknown route returns 404', async () => {
    const res = await worker.fetch(req('GET', '/wat'), ENV);
    assertEq(res.status, 404);
    const body = await res.json();
    assertEq(body.error, 'Not found');
  });

  await test('GET /upload (wrong method) returns 404', async () => {
    const res = await worker.fetch(req('GET', '/upload'), ENV);
    assertEq(res.status, 404);
  });

  console.log('\nOrigin enforcement (writes from disallowed browser origin):');

  await test('POST /upload from disallowed Origin → 403', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf', {
        origin: DISALLOWED_ORIGIN,
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': '100' },
      }),
      ENV,
    );
    assertEq(res.status, 403);
  });

  await test('POST /reviews from disallowed Origin → 403', async () => {
    const res = await worker.fetch(
      req('POST', '/reviews', {
        origin: DISALLOWED_ORIGIN,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      ENV,
    );
    assertEq(res.status, 403);
  });

  await test('DELETE /file from disallowed Origin → 403', async () => {
    const res = await worker.fetch(
      req('DELETE', '/file?path=papers/CSE110/uid/x.pdf', {
        origin: DISALLOWED_ORIGIN,
      }),
      ENV,
    );
    assertEq(res.status, 403);
  });

  await test('GET /download from disallowed Origin → 403', async () => {
    const res = await worker.fetch(
      req('GET', '/download?paperId=abc', { origin: DISALLOWED_ORIGIN }),
      ENV,
    );
    assertEq(res.status, 403);
  });

  console.log('\nUpload (auth runs before payload validation):');

  await test('upload without auth → 401 (auth-first)', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf', {
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': '100' },
      }),
      ENV,
    );
    assertEq(res.status, 401);
    const body = await res.json();
    assertEq(body.error, 'Unauthorized');
  });

  await test('upload with malformed bearer → 401', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf', {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': '100',
          'Authorization': 'NotBearer xyz',
        },
      }),
      ENV,
    );
    assertEq(res.status, 401);
  });

  await test('upload with bad courseCode without auth → 401 (still auth-first)', async () => {
    // Important: payload-shape errors must NOT leak before authentication.
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=bad&filename=test.pdf'),
      ENV,
    );
    assertEq(res.status, 401);
  });

  await test('upload success writes R2 object and Firestore metadata', async () => {
    const claims = {
      user_id: 'uid_123',
      email: 'student@g.bracu.ac.bd',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    };
    const { token, jwk } = await makeFirebaseToken(claims);
    const puts = [];
    const firestoreCreates = [];
    const expectedFirestoreUrl = `https://firestore.googleapis.com/v1/projects/${ENV.FIREBASE_PROJECT_ID}/databases/(default)/documents/papers`;
    const mockFetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://oauth2.googleapis.com/token') {
        return json({ access_token: 'service-account-token', expires_in: 3600 });
      }
      if (url === expectedFirestoreUrl) {
        assertEq(init.method, 'POST');
        assertEq(init.headers.Authorization, 'Bearer service-account-token');
        const body = JSON.parse(init.body);
        firestoreCreates.push(body);
        return json({ name: `${expectedFirestoreUrl}/paper_abc123` });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const env = {
      ...ENV,
      SERVICE_ACCOUNT_JSON: await makeServiceAccountJson(),
      PAPERS_BUCKET: {
        async put(path, body, options) {
          puts.push({ path, byteLength: body.byteLength, contentType: options?.httpMetadata?.contentType });
        },
        async delete() { throw new Error('delete should not run on success'); },
      },
    };
    let uploadedPath = '';

    __setTestJwksForTests({ keys: [jwk] });
    try {
      await withMockedFetch(mockFetch, async () => {
        const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
        const res = await worker.fetch(
          req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf&type=midterm&title=Midterm%202024&semester=Spring%202024&facultyInitials=ABC', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/pdf',
              'Content-Length': String(body.byteLength),
            },
            body,
          }),
          env,
          { waitUntil(promise) { promise.catch(() => {}); } },
        );

        assertEq(res.status, 200);
        const responseBody = await res.json();
        assertEq(responseBody.ok, true);
        assertEq(responseBody.id, 'paper_abc123');
        uploadedPath = responseBody.path;
        assert(
          /^papers\/CSE110\/uid_123\/\d+-[A-Za-z0-9-]+-midterm\.pdf$/.test(uploadedPath),
          `unexpected generated path: ${uploadedPath}`,
        );
      });
    } finally {
      __setTestJwksForTests(null);
    }

    assertEq(puts.length, 1);
    assertEq(puts[0].path, uploadedPath);
    assertEq(puts[0].byteLength, 8);
    assertEq(puts[0].contentType, 'application/pdf');
    assertEq(firestoreCreates.length, 1);
    const fields = firestoreCreates[0].fields;
    assertEq(fields.courseCode.stringValue, 'CSE110');
    assertEq(fields.type.stringValue, 'midterm');
    assertEq(fields.title.stringValue, 'Midterm 2024');
    assertEq(fields.storagePath.stringValue, uploadedPath);
    assertEq(fields.uploaderUid.stringValue, 'uid_123');
    assertEq(fields.approved.booleanValue, false);
    assertEq(fields.fileSize.integerValue, '8');
    assertEq(fields.mimeType.stringValue, 'application/pdf');
    assertEq(fields.semester.stringValue, 'Spring 2024');
    assertEq(fields.facultyInitials.stringValue, 'ABC');
  });

  await test('same filename uploads produce distinct R2 paths', async () => {
    const claims = {
      user_id: 'uid_repeat',
      email: 'student@g.bracu.ac.bd',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    };
    const { token, jwk } = await makeFirebaseToken(claims);
    const puts = [];
    const firestoreCreates = [];
    const expectedFirestoreUrl = `https://firestore.googleapis.com/v1/projects/${ENV.FIREBASE_PROJECT_ID}/databases/(default)/documents/papers`;
    const mockFetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://oauth2.googleapis.com/token') {
        return json({ access_token: 'service-account-token', expires_in: 3600 });
      }
      if (url === expectedFirestoreUrl) {
        firestoreCreates.push(JSON.parse(init.body));
        return json({ name: `${expectedFirestoreUrl}/paper_${firestoreCreates.length}` });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const env = {
      ...ENV,
      SERVICE_ACCOUNT_JSON: await makeServiceAccountJson(),
      PAPERS_BUCKET: {
        async put(path, body, options) {
          puts.push({ path, byteLength: body.byteLength, contentType: options?.httpMetadata?.contentType });
        },
        async delete() { throw new Error('delete should not run on success'); },
      },
    };

    __setTestJwksForTests({ keys: [jwk] });
    try {
      await withMockedFetch(mockFetch, async () => {
        for (let i = 0; i < 2; i++) {
          const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
          const res = await worker.fetch(
            req('POST', '/upload?courseCode=CSE220&filename=quiz.pdf&type=quiz&title=Quiz%201', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/pdf',
                'Content-Length': String(body.byteLength),
              },
              body,
            }),
            env,
            { waitUntil(promise) { promise.catch(() => {}); } },
          );
          assertEq(res.status, 200);
          const responseBody = await res.json();
          assertEq(responseBody.ok, true);
        }
      });
    } finally {
      __setTestJwksForTests(null);
    }

    assertEq(puts.length, 2);
    assertEq(firestoreCreates.length, 2);
    assert(puts[0].path !== puts[1].path, 'same filename uploads should not reuse an R2 path');
    for (const put of puts) {
      assert(
        /^papers\/CSE220\/uid_repeat\/\d+-[A-Za-z0-9-]+-quiz\.pdf$/.test(put.path),
        `unexpected generated path: ${put.path}`,
      );
    }
    assertEq(firestoreCreates[0].fields.storagePath.stringValue, puts[0].path);
    assertEq(firestoreCreates[1].fields.storagePath.stringValue, puts[1].path);
  });

  await test('upload metadata failure deletes uploaded R2 object', async () => {
    const claims = {
      user_id: 'uid_cleanup',
      email: 'student@g.bracu.ac.bd',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    };
    const { token, jwk } = await makeFirebaseToken(claims);
    const puts = [];
    const deletes = [];
    const firestoreCreates = [];
    const expectedFirestoreUrl = `https://firestore.googleapis.com/v1/projects/${ENV.FIREBASE_PROJECT_ID}/databases/(default)/documents/papers`;
    const mockFetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://oauth2.googleapis.com/token') {
        return json({ access_token: 'service-account-token', expires_in: 3600 });
      }
      if (url === expectedFirestoreUrl) {
        assertEq(init.method, 'POST');
        firestoreCreates.push(JSON.parse(init.body));
        return new Response('firestore unavailable', { status: 503 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const env = {
      ...ENV,
      SERVICE_ACCOUNT_JSON: await makeServiceAccountJson(),
      PAPERS_BUCKET: {
        async put(path, body, options) {
          puts.push({ path, byteLength: body.byteLength, contentType: options?.httpMetadata?.contentType });
        },
        async delete(path) {
          deletes.push(path);
        },
      },
    };

    __setTestJwksForTests({ keys: [jwk] });
    try {
      await withMockedFetch(mockFetch, async () => {
        const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
        const res = await worker.fetch(
          req('POST', '/upload?courseCode=CSE111&filename=cleanup.pdf&type=final&title=Cleanup%20Final', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/pdf',
              'Content-Length': String(body.byteLength),
            },
            body,
          }),
          env,
          { waitUntil(promise) { promise.catch(() => {}); } },
        );

        assertEq(res.status, 502);
        const responseBody = await res.json();
        assertEq(responseBody.error, 'Upload metadata could not be saved');
      });
    } finally {
      __setTestJwksForTests(null);
    }

    assertEq(puts.length, 1);
    assert(
      /^papers\/CSE111\/uid_cleanup\/\d+-[A-Za-z0-9-]+-cleanup\.pdf$/.test(puts[0].path),
      `unexpected generated path: ${puts[0].path}`,
    );
    assertEq(puts[0].byteLength, 8);
    assertEq(puts[0].contentType, 'application/pdf');
    assertEq(firestoreCreates.length, 1);
    assertEq(firestoreCreates[0].fields.storagePath.stringValue, puts[0].path);
    assertEq(deletes.length, 1);
    assertEq(deletes[0], puts[0].path);
  });

  console.log('\nDownload validation:');

  await test('download with no auth → 401', async () => {
    const res = await worker.fetch(
      req('GET', '/download?paperId=abc'),
      ENV,
    );
    assertEq(res.status, 401);
  });

  await test('download with no paperId reaches auth first → 401', async () => {
    const res = await worker.fetch(req('GET', '/download'), ENV);
    assertEq(res.status, 401);
  });

  console.log('\nDelete validation:');

  await test('delete without auth → 401', async () => {
    const res = await worker.fetch(
      req('DELETE', '/file?path=papers/CSE110/uid/midterm.pdf'),
      ENV,
    );
    assertEq(res.status, 401);
  });

  console.log('\nReviews dispatch:');

  await test('POST /reviews without auth → 401', async () => {
    const res = await worker.fetch(
      req('POST', '/reviews', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload()),
      }),
      ENV,
    );
    assertEq(res.status, 401);
  });

  console.log('\nMisc:');

  await test('AuthError is constructible', () => {
    const e = new AuthError('nope');
    assert(e instanceof Error);
    assertEq(e.message, 'nope');
  });

  await test('error response includes CORS headers for allowed origin', async () => {
    const res = await worker.fetch(
      req('GET', '/download', { origin: ALLOWED_ORIGIN }),
      ENV,
    );
    // Auth-first ⇒ 401 (no token). CORS still echoed for allowed origin.
    assertEq(res.status, 401);
    assertEq(res.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  });

  // ── Seat-drop email alerts (cron) ──────────────────────────────────────────
  console.log('\nSeat-drop alerts:');

  const FEED = [
    { sectionId: 1, courseCode: 'cse220', sectionName: '01', capacity: 30, consumedSeat: 30 }, // full
    { sectionId: 2, courseCode: 'CSE220', sectionName: '02', capacity: 30, consumedSeat: 29 }, // 1 left
    { sectionId: 3, courseCode: 'MAT110', sectionName: '05', capacity: 0,  consumedSeat: 0  }, // unknown cap → no seat
    { sectionId: 'x', courseCode: 'BAD' }, // junk, dropped
  ];

  await test('parseFeedSeatMap: seat math + tolerance', () => {
    const m = parseFeedSeatMap(FEED);
    assertEq(m.size, 3, 'junk entry dropped');
    assertEq(m.get(1).hasSeat, false);
    assertEq(m.get(1).code, 'CSE220'); // uppercased
    assertEq(m.get(2).hasSeat, true);
    assertEq(m.get(2).seatsLeft, 1);
    assertEq(m.get(3).hasSeat, false, 'zero capacity is never "open"');
  });
  await test('parseFeedSeatMap: non-array → empty map', () => {
    assertEq(parseFeedSeatMap(null).size, 0);
    assertEq(parseFeedSeatMap({}).size, 0);
  });

  const seatMap = parseFeedSeatMap(FEED);
  const watch = [{ id: 1, code: 'CSE220', name: '01' }];

  await test('detectSeatDrops: first sighting seeds state, never drops', () => {
    const { drops, nextSeen, changed } = detectSeatDrops(watch, seatMap, {});
    assertEq(drops.length, 0, 'no email on first observation');
    assertEq(nextSeen['1'], false, 'seeded as full');
    assertEq(changed, true);
  });
  await test('detectSeatDrops: false→true flip fires exactly one drop', () => {
    // Section 1 was full last tick; feed now shows it open.
    const openMap = parseFeedSeatMap([{ sectionId: 1, courseCode: 'CSE220', sectionName: '01', capacity: 30, consumedSeat: 28 }]);
    const { drops, nextSeen } = detectSeatDrops(watch, openMap, { '1': false });
    assertEq(drops.length, 1);
    assertEq(drops[0].label, 'CSE220 Section 01');
    assertEq(drops[0].seatsLeft, 2);
    assertEq(nextSeen['1'], true);
  });
  await test('detectSeatDrops: staying open does not re-fire', () => {
    const openMap = parseFeedSeatMap([{ sectionId: 1, courseCode: 'CSE220', sectionName: '01', capacity: 30, consumedSeat: 28 }]);
    const { drops, changed } = detectSeatDrops(watch, openMap, { '1': true });
    assertEq(drops.length, 0);
    assertEq(changed, false, 'no state change while it stays open');
  });
  await test('detectSeatDrops: section missing from feed preserves state, no drop', () => {
    const { drops, nextSeen } = detectSeatDrops(watch, parseFeedSeatMap([]), { '1': false });
    assertEq(drops.length, 0);
    assertEq(nextSeen['1'], false, 'prior state retained');
  });
  await test('detectSeatDrops: dropping a watched section counts as a change', () => {
    const { changed } = detectSeatDrops([], seatMap, { '1': true });
    assertEq(changed, true);
  });

  await test('buildSeatAlertEmail: subject + escaped body for one and many', () => {
    const one = buildSeatAlertEmail([{ id: 1, label: 'CSE220 Section 01', seatsLeft: 1 }]);
    assert(one.subject.includes('Seat open: CSE220 Section 01'));
    assert(one.html.includes('1 seat left'));
    const many = buildSeatAlertEmail([
      { id: 1, label: 'CSE220 Section 01', seatsLeft: 2 },
      { id: 2, label: 'MAT110 Section 05', seatsLeft: 5 },
    ]);
    assert(many.subject.includes('2 watched seats'));
    assert(many.html.includes('2 seats left') && many.html.includes('5 seats left'));
  });
  await test('buildSeatAlertEmail: escapes HTML in labels', () => {
    const { html } = buildSeatAlertEmail([{ id: 9, label: '<b>X</b> Section 01', seatsLeft: 1 }]);
    assert(!html.includes('<b>X</b>'), 'label HTML must be escaped');
    assert(html.includes('&lt;b&gt;'));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
