/**
 * worker/test/worker.test.js
 * Tests for the papers Worker. Run with:
 *   npm run test:worker
 *
 * Covers pure validators, CORS, route dispatch, origin enforcement, and the
 * fact that auth now runs before any request-shape validation. Auth-success
 * paths are not exercised (would require live JWKS) — instead we confirm that
 * missing/malformed tokens reach the AuthError → 401 branch as expected.
 */

import worker, {
  AuthError,
  corsHeaders,
  isAllowedFirebasePayload,
  isValidCourseCode,
  isValidStoragePath,
  safeFilename,
  validateReviewPayload,
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

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
