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
  sniffMimeFromBytes,
  validateReviewPayload,
  parseFeedSeatMap,
  detectSeatDrops,
  buildSeatAlertEmail,
  resolveEmailFrom,
  seatAlertEmailConfig,
  runSeatAlertCron,
  buildLostFoundClaimEmail,
  runLostFoundCron,
  RESEND_TEST_SENDER,
  SEAT_FEED_URL,
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

  await test('sniffMimeFromBytes detects supported preview types', () => {
    const u = (...bytes) => new Uint8Array(bytes);
    assertEq(sniffMimeFromBytes(u(0x25, 0x50, 0x44, 0x46, 0x2D)), 'application/pdf'); // %PDF-
    assertEq(sniffMimeFromBytes(u(0x89, 0x50, 0x4E, 0x47, 0x0D)), 'image/png');
    assertEq(sniffMimeFromBytes(u(0xFF, 0xD8, 0xFF, 0xE0)), 'image/jpeg');
    assertEq(sniffMimeFromBytes(u(0x47, 0x49, 0x46, 0x38, 0x39)), 'image/gif');
    assertEq(
      sniffMimeFromBytes(u(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
      'image/webp',
    );
  });

  await test('sniffMimeFromBytes returns null for unknown or short input', () => {
    assertEq(sniffMimeFromBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03])), null);
    assertEq(sniffMimeFromBytes(new Uint8Array([0x25, 0x50])), null); // too short
    assertEq(sniffMimeFromBytes(null), null);
    // RIFF header without the WEBP tag (e.g. a WAV) must not match
    assertEq(
      sniffMimeFromBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
      null,
    );
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

  // ── Sender configuration (fail-safe) ──────────────────────────────────────
  console.log('\nSeat-alert sender configuration:');

  await test('resolveEmailFrom: missing → not ok', () => {
    const r = resolveEmailFrom({});
    assert(!r.ok && /not set/i.test(r.reason), 'missing EMAIL_FROM must be rejected');
  });
  await test('resolveEmailFrom: Resend test sender → not ok (even with display name)', () => {
    assert(!resolveEmailFrom({ EMAIL_FROM: RESEND_TEST_SENDER }).ok);
    const r = resolveEmailFrom({ EMAIL_FROM: 'Shohoj <onboarding@resend.dev>' });
    assert(!r.ok && /test sender/i.test(r.reason), 'test sender must be rejected');
  });
  await test('resolveEmailFrom: verified-domain sender → ok, value preserved', () => {
    const r = resolveEmailFrom({ EMAIL_FROM: 'Shohoj Alerts <alerts@shohoj.example>' });
    assert(r.ok);
    assertEq(r.from, 'Shohoj Alerts <alerts@shohoj.example>');
  });
  await test('seatAlertEmailConfig: needs both key and real sender', () => {
    assert(!seatAlertEmailConfig({ EMAIL_FROM: 'a@shohoj.example' }).ok, 'no key → not ok');
    assert(/RESEND_API_KEY/.test(seatAlertEmailConfig({ EMAIL_FROM: 'a@shohoj.example' }).reason));
    assert(!seatAlertEmailConfig({ RESEND_API_KEY: 'k', EMAIL_FROM: RESEND_TEST_SENDER }).ok, 'test sender → not ok');
    assert(seatAlertEmailConfig({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@shohoj.example' }).ok, 'key + real sender → ok');
  });

  // ── Cron orchestration ────────────────────────────────────────────────────
  console.log('\nSeat-alert cron orchestration:');

  const SA_JSON = await makeServiceAccountJson();
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${ENV.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const VERIFIED_SENDER = 'Shohoj Alerts <alerts@shohoj.example>';

  // Local mirror of the worker's Firestore field encoder so mock list/get
  // responses are shaped exactly like the REST API returns them.
  function fsValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
    if (typeof v === 'object') return { mapValue: { fields: fsFields(v) } };
    throw new Error('cannot encode');
  }
  function fsFields(obj) {
    const f = {};
    for (const [k, val] of Object.entries(obj)) f[k] = fsValue(val);
    return f;
  }

  function cronEnv(extra = {}) {
    return { FIREBASE_PROJECT_ID: ENV.FIREBASE_PROJECT_ID, RESEND_API_KEY: 'rk_test', EMAIL_FROM: VERIFIED_SENDER, SERVICE_ACCOUNT_JSON: SA_JSON, ...extra };
  }

  // Build a mock fetch router + recorder for one cron run.
  function cronRouter({ feed = [], feedStatus = 200, watches = [], states = {}, resend = async () => ({ ok: true }) }) {
    const calls = { resend: [], patched: {}, gets: [], listed: 0 };
    const handler = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init.method || 'GET').toUpperCase();
      if (url === SEAT_FEED_URL) {
        if (feedStatus !== 200) return new Response('feed error', { status: feedStatus });
        return json(feed);
      }
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'sa-token', expires_in: 3600 });
      if (url.startsWith(`${FS_BASE}/seatAlertWatches`)) {
        calls.listed += 1;
        return json({ documents: watches.map(w => ({ name: `${FS_BASE}/seatAlertWatches/${w.uid}`, fields: fsFields(w.fields) })) });
      }
      const m = url.match(/\/seatAlertState\/([^?]+)$/);
      if (m) {
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          calls.gets.push(uid);
          const st = states[uid];
          if (st === undefined || st === null) return new Response('not found', { status: 404 });
          return json({ name: url, fields: fsFields(st) });
        }
        if (method === 'PATCH') { calls.patched[uid] = JSON.parse(init.body); return json({}); }
      }
      if (url === 'https://api.resend.com/emails') {
        const body = JSON.parse(init.body);
        calls.resend.push(body);
        const r = await resend(body);
        return r.ok ? json({ id: 'email_1' }) : new Response(JSON.stringify({ error: 'x' }), { status: r.status || 500, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    };
    return { handler, calls };
  }

  const OPEN_1 = [{ sectionId: 1, courseCode: 'CSE220', sectionName: '01', capacity: 30, consumedSeat: 28 }];
  const OPEN_1_2 = [
    { sectionId: 1, courseCode: 'CSE220', sectionName: '01', capacity: 30, consumedSeat: 28 },
    { sectionId: 2, courseCode: 'MAT110', sectionName: '05', capacity: 40, consumedSeat: 39 },
  ];
  const mkWatch = (uid, sections, fields = {}) => ({ uid, fields: { email: `${uid}@g.bracu.ac.bd`, sections, ...fields } });

  await test('cron: missing RESEND_API_KEY → not configured, no I/O', async () => {
    const { handler } = cronRouter({ feed: OPEN_1 });
    const throwing = async () => { throw new Error('no fetch should happen when unconfigured'); };
    await withMockedFetch(throwing, async () => {
      const r = await runSeatAlertCron(cronEnv({ RESEND_API_KEY: undefined }));
      assert(!r.configured, 'must report not configured');
      assert(/RESEND_API_KEY/.test(r.reason));
      assertEq(r.emailed, 0);
    });
    void handler;
  });

  await test('cron: EMAIL_FROM set to test sender → not configured', async () => {
    const throwing = async () => { throw new Error('no fetch should happen'); };
    await withMockedFetch(throwing, async () => {
      const r = await runSeatAlertCron(cronEnv({ EMAIL_FROM: 'Shohoj <onboarding@resend.dev>' }));
      assert(!r.configured && /test sender/i.test(r.reason));
    });
  });

  await test('cron: feed fetch failure rejects', async () => {
    const { handler } = cronRouter({ feedStatus: 503 });
    let threw = false;
    await withMockedFetch(handler, async () => {
      try { await runSeatAlertCron(cronEnv()); } catch { threw = true; }
    });
    assert(threw, 'feed failure must throw so scheduled() logs it');
  });

  await test('cron: full→open drop emails once from the verified sender and advances state', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1,
      watches: [mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }])],
      states: { u1: { seen: { '1': false } } },
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.configured, true);
      assertEq(r.transitions, 1);
      assertEq(r.emailed, 1);
      assertEq(r.failed, 0);
    });
    assertEq(calls.resend.length, 1);
    assertEq(calls.resend[0].from, VERIFIED_SENDER);
    assertEq(calls.resend[0].to[0], 'u1@g.bracu.ac.bd');
    assert(calls.patched.u1, 'delivered drop must advance state');
  });

  await test('cron: first run seeds state silently, never emails', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1,
      watches: [mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }])],
      states: {}, // 404 → first run
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.emailed, 0);
      assertEq(r.transitions, 0);
    });
    assertEq(calls.resend.length, 0);
    assert(calls.patched.u1, 'first run still seeds baseline state');
  });

  await test('cron: disabled user is skipped entirely', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1,
      watches: [mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }], { enabled: false })],
      states: { u1: { seen: { '1': false } } },
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.watches, 0);
      assertEq(r.emailed, 0);
    });
    assertEq(calls.resend.length, 0);
  });

  await test('cron: one user watching multiple sections fires only the section that flipped', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1_2,
      watches: [mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }, { id: 2, code: 'MAT110', name: '05' }])],
      states: { u1: { seen: { '1': false, '2': true } } }, // s1 full→open, s2 already open
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.transitions, 1);
      assertEq(r.emailed, 1);
    });
    assertEq(calls.resend.length, 1);
  });

  await test('cron: Resend failure does NOT advance state (retried next tick)', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1,
      watches: [mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }])],
      states: { u1: { seen: { '1': false } } },
      resend: async () => ({ ok: false, status: 500 }),
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.transitions, 1);
      assertEq(r.emailed, 0);
      assertEq(r.failed, 1);
    });
    assertEq(calls.resend.length, 1);
    assert(!calls.patched.u1, 'failed delivery must leave state untouched so the drop is retried');
  });

  await test('cron: multiple watchers, partial delivery — one ok, one fails', async () => {
    const { handler, calls } = cronRouter({
      feed: OPEN_1_2,
      watches: [
        mkWatch('u1', [{ id: 1, code: 'CSE220', name: '01' }]),
        mkWatch('u2', [{ id: 2, code: 'MAT110', name: '05' }]),
      ],
      states: { u1: { seen: { '1': false } }, u2: { seen: { '2': false } } },
      resend: async (body) => ({ ok: body.to[0] === 'u1@g.bracu.ac.bd', status: 500 }),
    });
    await withMockedFetch(handler, async () => {
      const r = await runSeatAlertCron(cronEnv());
      assertEq(r.users, 2);
      assertEq(r.transitions, 2);
      assertEq(r.emailed, 1);
      assertEq(r.failed, 1);
    });
    assert(calls.patched.u1, 'delivered user advances');
    assert(!calls.patched.u2, 'failed user does not advance');
  });

  await test('scheduled(): runs via waitUntil and swallows a feed failure', async () => {
    const { handler } = cronRouter({ feedStatus: 503 });
    const captured = [];
    const ctx = { waitUntil(p) { captured.push(p); } };
    await withMockedFetch(handler, async () => {
      worker.scheduled({}, cronEnv(), ctx);
      // Both crons must resolve, not reject — the handler catches internally.
      await Promise.all(captured);
    });
    assert(captured.length >= 2, 'seat + lost&found crons both scheduled');
  });

  // ── Lost & found claim delivery (#371) ─────────────────────────────────

  await test('buildLostFoundClaimEmail: subject reads per type, body escapes and links the sender', () => {
    const lost = buildLostFoundClaimEmail(
      { type: 'lost', title: 'Black umbrella' },
      { fromEmail: 'finder@g.bracu.ac.bd', note: 'It has a <b>sticker</b>' },
    );
    assert(/lost item — Black umbrella/.test(lost.subject), lost.subject);
    assert(lost.html.includes('says they found it'));
    assert(lost.html.includes('&lt;b&gt;sticker&lt;/b&gt;'), 'note must be escaped');
    assert(lost.html.includes('mailto:finder@g.bracu.ac.bd'));

    const found = buildLostFoundClaimEmail(
      { type: 'found', title: 'ID card <script>' },
      { fromEmail: 'owner@g.bracu.ac.bd' },
    );
    assert(/found item/.test(found.subject));
    assert(found.html.includes('says it belongs to them'));
    assert(found.html.includes('&lt;script&gt;'), 'title must be escaped');
  });

  // Mock fetch router for the lost & found cron.
  function lfRouter({ claims = [], posts = {}, contacts = {}, resend = async () => ({ ok: true }) }) {
    const calls = { resend: [], deleted: [] };
    const handler = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init.method || 'GET').toUpperCase();
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'sa-token', expires_in: 3600 });
      if (url.startsWith(`${FS_BASE}/lostFoundClaims?`)) {
        return json({ documents: claims.map(c => ({ name: `${FS_BASE}/lostFoundClaims/${c.id}`, fields: fsFields(c.fields) })) });
      }
      let m = url.match(/\/lostFoundClaims\/([^?]+)$/);
      if (m && method === 'DELETE') { calls.deleted.push(decodeURIComponent(m[1])); return json({}); }
      m = url.match(/\/lostFoundPosts\/([^?]+)$/);
      if (m) {
        const p = posts[decodeURIComponent(m[1])];
        return p ? json({ name: url, fields: fsFields(p) }) : new Response('nf', { status: 404 });
      }
      m = url.match(/\/lostFoundContacts\/([^?]+)$/);
      if (m) {
        const c = contacts[decodeURIComponent(m[1])];
        return c ? json({ name: url, fields: fsFields(c) }) : new Response('nf', { status: 404 });
      }
      if (url === 'https://api.resend.com/emails') {
        const body = JSON.parse(init.body);
        calls.resend.push(body);
        const r = await resend(body);
        return r.ok ? json({ id: 'email_1' }) : new Response(JSON.stringify({ error: 'x' }), { status: r.status || 500, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    };
    return { handler, calls };
  }

  const LF_CLAIM = { id: 'p1_u2', fields: { postId: 'p1', fromUid: 'u2', fromEmail: 'finder@g.bracu.ac.bd', note: 'red one?' } };
  const LF_POST = { type: 'lost', title: 'Umbrella', status: 'open', creatorUid: 'u1' };
  const LF_CONTACT = { email: 'poster@g.bracu.ac.bd', uid: 'u1' };

  await test('lf cron: unconfigured email channel → no I/O', async () => {
    const throwing = async () => { throw new Error('no fetch should happen when unconfigured'); };
    await withMockedFetch(throwing, async () => {
      const r = await runLostFoundCron(cronEnv({ RESEND_API_KEY: undefined }));
      assert(!r.configured && /RESEND_API_KEY/.test(r.reason));
    });
  });

  await test('lf cron: empty queue → zero counts, no emails', async () => {
    const { handler, calls } = lfRouter({});
    await withMockedFetch(handler, async () => {
      const r = await runLostFoundCron(cronEnv());
      assertEq(r.claims, 0);
      assertEq(r.emailed, 0);
    });
    assertEq(calls.resend.length, 0);
  });

  await test('lf cron: delivers to the poster contact and dequeues the claim', async () => {
    const { handler, calls } = lfRouter({
      claims: [LF_CLAIM],
      posts: { p1: LF_POST },
      contacts: { p1: LF_CONTACT },
    });
    await withMockedFetch(handler, async () => {
      const r = await runLostFoundCron(cronEnv());
      assertEq(r.claims, 1);
      assertEq(r.emailed, 1);
      assertEq(r.failed, 0);
      assertEq(r.dropped, 0);
    });
    assertEq(calls.resend.length, 1);
    assertEq(calls.resend[0].to[0], 'poster@g.bracu.ac.bd');
    assertEq(calls.resend[0].from, VERIFIED_SENDER);
    assert(calls.resend[0].html.includes('finder@g.bracu.ac.bd'), 'shares the claimer address');
    assertEq(calls.deleted.length, 1);
    assertEq(calls.deleted[0], 'p1_u2');
  });

  await test('lf cron: Resend failure leaves the claim queued for retry', async () => {
    const { handler, calls } = lfRouter({
      claims: [LF_CLAIM],
      posts: { p1: LF_POST },
      contacts: { p1: LF_CONTACT },
      resend: async () => ({ ok: false, status: 500 }),
    });
    await withMockedFetch(handler, async () => {
      const r = await runLostFoundCron(cronEnv());
      assertEq(r.emailed, 0);
      assertEq(r.failed, 1);
    });
    assertEq(calls.deleted.length, 0, 'failed delivery must not dequeue');
  });

  await test('lf cron: orphaned claim (post gone) is dropped without an email', async () => {
    const { handler, calls } = lfRouter({ claims: [LF_CLAIM], posts: {}, contacts: {} });
    await withMockedFetch(handler, async () => {
      const r = await runLostFoundCron(cronEnv());
      assertEq(r.emailed, 0);
      assertEq(r.dropped, 1);
    });
    assertEq(calls.resend.length, 0);
    assertEq(calls.deleted.length, 1);
    assertEq(calls.deleted[0], 'p1_u2');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
