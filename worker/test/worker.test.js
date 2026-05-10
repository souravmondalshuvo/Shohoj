/**
 * worker/test/worker.test.js
 * Tests for the papers Worker. Run with:
 *   npm run test:worker
 *
 * Covers pure validators, CORS, route dispatch, and the validation
 * gates that run before Firebase token verification. Auth-success
 * paths are not exercised (would require live JWKS) — instead we
 * confirm that missing/malformed tokens reach the AuthError → 401
 * branch as expected.
 */

import worker, {
  AuthError,
  corsHeaders,
  isValidCourseCode,
  isValidStoragePath,
  safeFilename,
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

  await test('isValidStoragePath accepts well-formed paper paths', () => {
    assert(isValidStoragePath('papers/CSE110/midterm-fall24.pdf'));
    assert(isValidStoragePath('papers/MAT215/quiz_1.png'));
    assert(isValidStoragePath('papers/CSE470L/final.PDF'));
  });

  await test('isValidStoragePath rejects traversal and bad shapes', () => {
    assert(!isValidStoragePath('papers/CSE110/../etc/passwd'));
    assert(!isValidStoragePath('papers/CSE110/sub/dir/file.pdf'));
    assert(!isValidStoragePath('papers/cse110/file.pdf'));
    assert(!isValidStoragePath('other/CSE110/file.pdf'));
    assert(!isValidStoragePath('papers/CSE110/file with space.pdf'));
    assert(!isValidStoragePath(''));
    assert(!isValidStoragePath(null));
    assert(!isValidStoragePath({ path: 'papers/CSE110/x.pdf' }));
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

  console.log('\nUpload validation:');

  await test('upload with invalid courseCode → 400', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=bad&filename=test.pdf'),
      ENV,
    );
    assertEq(res.status, 400);
    const body = await res.json();
    assertEq(body.error, 'Invalid course code');
  });

  await test('upload with too-short filename → 400', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=ab'),
      ENV,
    );
    assertEq(res.status, 400);
    const body = await res.json();
    assertEq(body.error, 'Invalid filename');
  });

  await test('upload with missing Content-Length → 413', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf', {
        headers: { 'Content-Type': 'application/pdf' },
      }),
      ENV,
    );
    assertEq(res.status, 413);
  });

  await test('upload over 10 MB → 413', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.pdf', {
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(11 * 1024 * 1024) },
      }),
      ENV,
    );
    assertEq(res.status, 413);
  });

  await test('upload with disallowed MIME → 415', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=midterm.exe', {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '100' },
      }),
      ENV,
    );
    assertEq(res.status, 415);
  });

  await test('upload allows PDF through validation, fails at auth → 401', async () => {
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

  await test('upload allows image/png through validation, fails at auth → 401', async () => {
    const res = await worker.fetch(
      req('POST', '/upload?courseCode=CSE110&filename=quiz1.png', {
        headers: { 'Content-Type': 'image/png', 'Content-Length': '100' },
      }),
      ENV,
    );
    assertEq(res.status, 401);
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

  console.log('\nDownload validation:');

  await test('download with invalid path → 400', async () => {
    const res = await worker.fetch(
      req('GET', '/download?path=../etc/passwd'),
      ENV,
    );
    assertEq(res.status, 400);
  });

  await test('download with no path → 400', async () => {
    const res = await worker.fetch(req('GET', '/download'), ENV);
    assertEq(res.status, 400);
  });

  await test('download with valid path but no auth → 401', async () => {
    const res = await worker.fetch(
      req('GET', '/download?path=papers/CSE110/midterm.pdf'),
      ENV,
    );
    assertEq(res.status, 401);
  });

  console.log('\nDelete validation:');

  await test('delete with invalid path → 400', async () => {
    const res = await worker.fetch(
      req('DELETE', '/file?path=other/CSE110/x.pdf'),
      ENV,
    );
    assertEq(res.status, 400);
  });

  await test('delete with valid path but no auth → 401', async () => {
    const res = await worker.fetch(
      req('DELETE', '/file?path=papers/CSE110/midterm.pdf'),
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
      req('GET', '/download?path=bad', { origin: ALLOWED_ORIGIN }),
      ENV,
    );
    assertEq(res.status, 400);
    assertEq(res.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
