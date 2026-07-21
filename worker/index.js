// ── Shohoj papers Worker ─────────────────────────────────────────────────────
// Auth-proxy in front of an R2 bucket + server-mediated faculty-review writes.
// Every request must carry a Firebase ID token belonging to a BRACU student
// (email matches *@g.bracu.ac.bd) or an admin (custom claim `admin === true`).
//
// Endpoints
//   POST   /upload                multipart-less file upload to R2 (BRACU only)
//   GET    /download?paperId=…    streams the R2 object backing a Firestore
//                                 paper doc, after re-checking that the caller
//                                 can read the doc (Firestore rules enforce
//                                 approved/uploader/admin)
//   DELETE /file?path=…           admin-only R2 delete
//   POST   /reviews               creates a facultyReviews doc with the
//                                 canonical sha256(uid|initials|course) ID
//                                 via a service-account write — clients are
//                                 denied direct writes by the rules
//   POST   /api/assistant         Shohoj Assistant chat turn (#435): verifies
//                                 the caller's token, then runs a Claude
//                                 tool-use loop whose read-only tools are
//                                 scoped server-side to the caller's own
//                                 users/{uid} doc + the public seat feed
//
// Bindings (configured in wrangler.toml)
//   PAPERS_BUCKET         R2 bucket binding
//   FIREBASE_PROJECT_ID   string env var (e.g. "shohoj")
//   ALLOWED_ORIGINS       comma-separated CORS origins
//   ADMIN_EMAIL/etc.      optional, for upload notifications
//   PAPERS_RATE_LIMIT     Cloudflare Rate Limiting binding (per-UID)
//   ASSISTANT_RATE_LIMIT  Cloudflare Rate Limiting binding (per-UID, /api/assistant)
//
// Secrets (set with `wrangler secret put`)
//   RESEND_API_KEY          for upload notifications
//   SERVICE_ACCOUNT_JSON    Firebase service-account JSON, used to mint
//                           OAuth2 access tokens that authorize the
//                           Firestore REST writes for /upload metadata and
//                           /reviews
//   ANTHROPIC_API_KEY       Claude API key for /api/assistant — lives only
//                           here, never shipped to the client

import Anthropic from '@anthropic-ai/sdk';
import { jwtVerify, createRemoteJWKSet, createLocalJWKSet, SignJWT, importPKCS8 } from 'jose';
import { loadSeatIndexFromFeed, runAssistantLoop, validateAssistantMessages } from './assistant.js';
import { isKnownCourse } from './catalog.generated.js';

const BRACU_EMAIL_RE = /^[^@]+@g\.bracu\.ac\.bd$/;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_RE = /^application\/pdf$|^image\/(?:png|jpeg|webp|gif)$/;
const OWNED_STORAGE_PATH_RE = /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
// Legacy paths (no uploader segment) still exist in R2 from earlier uploads.
// Reads/deletes must accept them so already-uploaded papers stay accessible.
// NEW uploads always use the owned form (handleUpload constructs that path
// explicitly), so this regex is read-only legacy support, not a write surface.
const LEGACY_STORAGE_PATH_RE = /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9._-]+$/;
const PAPER_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const REVIEW_INITIALS_RE = /^[A-Z]{2,6}$/;
const REVIEW_COURSE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const REVIEW_TYPE_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];
const PAPER_TYPES = new Set(['midterm', 'final', 'quiz', 'notes', 'assignment', 'lab', 'lab-quiz']);
const MAX_REVIEW_SEMESTER_CHARS = 40;
const MAX_REVIEW_TEXT_CHARS = 500;

let _jwks = null;
let _jwksSource = null;
let _testJwks = null;

export function __setTestJwksForTests(jwks) {
  _testJwks = jwks || null;
  _jwks = null;
  _jwksSource = null;
}

function getJwks() {
  const source = _testJwks || 'firebase';
  if (!_jwks || _jwksSource !== source) {
    _jwksSource = source;
    _jwks = _testJwks
      ? createLocalJWKSet(_testJwks)
      : createRemoteJWKSet(
          new URL(
            'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
          ),
        );
  }
  return _jwks;
}

export class AuthError extends Error {}

export function isAllowedFirebasePayload(payload) {
  const isAdmin = payload?.admin === true;
  const isVerifiedBracuGoogleUser =
    !!payload?.email &&
    payload.email_verified === true &&
    payload.firebase?.sign_in_provider === 'google.com' &&
    BRACU_EMAIL_RE.test(payload.email);
  return isAdmin || isVerifiedBracuGoogleUser;
}

async function verifyFirebaseToken(token, env) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    }));
  } catch (e) {
    throw new AuthError(e?.message || 'Token verification failed');
  }
  if (!isAllowedFirebasePayload(payload)) {
    throw new AuthError('Verified BRACU Google account required');
  }
  return payload;
}

export function corsHeaders(env, origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isOriginAllowed(env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function isOriginAllowed(env, origin) {
  if (!origin) return false;
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

// Browser cross-origin requests carry an Origin header. If it's set and isn't
// in the allow-list, this is an unauthorized cross-origin call from a browser
// — reject it. Origin omitted is treated as non-browser (curl, server-side)
// where bearer-token auth is the only line of defense; we still allow those.
function requireBrowserOriginAllowed(request, env, origin) {
  if (request.headers.has('Origin') && !isOriginAllowed(env, origin)) {
    return jsonResponse({ error: 'Forbidden origin' }, { status: 403 }, env, origin);
  }
  return null;
}

function jsonResponse(body, init = {}, env, origin) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, origin),
      ...(init.headers || {}),
    },
  });
}

export function isValidStoragePath(p) {
  return typeof p === 'string' && (OWNED_STORAGE_PATH_RE.test(p) || LEGACY_STORAGE_PATH_RE.test(p));
}

// Course codes are validated for EXISTENCE, not merely shape. The regex alone
// accepts "ZZZ999", which would let a caller mint review rows and R2 object
// prefixes for courses that do not exist. `isKnownCourse` checks the generated
// catalogue (worker/catalog.generated.js, from js/core/catalog.js) — a
// server-controlled list the client cannot influence.
//
// The shape test is kept as a cheap pre-filter so a junk string never reaches
// the Set lookup, and so the error stays the same for malformed input.
export function isValidCourseCode(c) {
  return typeof c === 'string' && /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.test(c) && isKnownCourse(c);
}

export function safeFilename(name) {
  return String(name || '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 80);
}

// Map a file's leading magic bytes to a renderable MIME type. Used as a last
// resort on /download when neither the Firestore doc nor the R2 object carries
// a usable contentType (pre-migration objects): serving such a file as
// application/octet-stream makes the browser preview render blank. `bytes` is a
// Uint8Array of at least the first 12 bytes. Returns null when unrecognized.
export function sniffMimeFromBytes(bytes) {
  const b = bytes;
  if (!b || b.length < 4) return null;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'; // JPEG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'; // GIF
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp'; // RIFF…WEBP
  return null;
}

function uniqueUploadObjectName(filename) {
  const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14);
  return `${Date.now()}-${randomId}-${filename}`;
}

function safePathSegment(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 128);
}

function cleanPaperType(value) {
  const type = String(value || '')
    .toLowerCase()
    .trim();
  return PAPER_TYPES.has(type) ? type : '';
}

function cleanOptionalSemester(value) {
  return String(value || '')
    .trim()
    .slice(0, 40);
}

function cleanOptionalFacultyInitials(value) {
  const initials = String(value || '')
    .toUpperCase()
    .trim()
    .slice(0, 40);
  return /^[A-Z]{2,6}(, ?[A-Z]{2,6})*$/.test(initials) ? initials : '';
}

// Strip control chars (incl. CR/LF) and clamp length. Used for any uploader-
// controlled string that ends up in an outbound HTTP header value (e.g. the
// Resend email subject line).
function sanitizeHeaderValue(s, max = 200) {
  // Matching control characters is the whole point here (CR/LF header injection
  // defence), so no-control-regex is intentionally disabled for this line.
  // eslint-disable-next-line no-control-regex
  return String(s ?? '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .slice(0, max);
}

async function readAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new AuthError('Missing bearer token');
  return { claims: await verifyFirebaseToken(m[1], env), token: m[1] };
}

// ── Magic-byte sniffing ─────────────────────────────────────────────────────
// Defense against a client that lies in Content-Type. Buffer the request body,
// peek at the first few bytes, and confirm the file actually starts with the
// magic for the declared MIME type before persisting to R2.
function sniffMime(buf) {
  const u = new Uint8Array(buf);
  if (u.length >= 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) {
    return 'application/pdf';
  }
  if (
    u.length >= 8 &&
    u[0] === 0x89 &&
    u[1] === 0x50 &&
    u[2] === 0x4e &&
    u[3] === 0x47 &&
    u[4] === 0x0d &&
    u[5] === 0x0a &&
    u[6] === 0x1a &&
    u[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    u.length >= 6 &&
    u[0] === 0x47 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x38 &&
    (u[4] === 0x37 || u[4] === 0x39) &&
    u[5] === 0x61
  ) {
    return 'image/gif';
  }
  return null;
}

function mimeMatches(declared, sniffed) {
  if (!sniffed) return false;
  if (declared === sniffed) return true;
  // Allow image/jpeg variants: declared image/jpg is invalid per ALLOWED_MIME
  // but accept image/jpeg ↔ jpeg sniff. (We already validated declared upstream.)
  return false;
}

// ── Service-account auth (for server-mediated Firestore writes) ──────────────
// Mints a short-lived OAuth2 access token from the SERVICE_ACCOUNT_JSON secret
// and caches it across invocations within a single isolate. The token grants
// the worker the `datastore` scope, which is sufficient to call the Firestore
// REST API as a privileged identity (bypassing rules) for /upload metadata and
// /reviews writes.
let _saTokenCache = { token: null, expiresAt: 0 };

async function getServiceAccountAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_saTokenCache.token && _saTokenCache.expiresAt - now > 60) {
    return _saTokenCache.token;
  }
  if (!env.SERVICE_ACCOUNT_JSON) {
    throw new Error('SERVICE_ACCOUNT_JSON secret is not configured');
  }
  let sa;
  try {
    sa = JSON.parse(env.SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!sa.client_email || !sa.private_key || !sa.token_uri) {
    throw new Error('SERVICE_ACCOUNT_JSON missing required fields');
  }
  const pk = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/datastore',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(sa.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Service-account token exchange failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  _saTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return _saTokenCache.token;
}

// ── Firestore REST helpers ──────────────────────────────────────────────────
function firestoreDocsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

// Convert a plain JS object to the Firestore REST `fields` shape.
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: toFirestoreFields(v) } };
  }
  throw new Error(`Cannot encode value: ${typeof v}`);
}

// Decode `fields` returned by Firestore REST back into plain JS.
function fromFirestoreValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue?.fields || {});
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
  return null;
}

function fromFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

// SHA-256 a string → 64-char lowercase hex.
async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input ?? ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Per-UID rate limiting ───────────────────────────────────────────────────
// Cloudflare's Workers Rate Limiting binding (PAPERS_RATE_LIMIT) is keyed on
// any string we pass. We key on the Firebase UID so abuse is bounded per
// account, not per IP. The limits are configured in wrangler.toml.
//
// Failure policy (deliberate, per-endpoint — see docs/SECURITY.md):
//
//   `failClosed: true`  — used by /api/assistant. That endpoint spends real
//     money per call (Anthropic tokens), so a limiter that *throws* must deny
//     rather than hand out unmetered paid capacity. A throwing limiter is a
//     runtime condition an attacker can plausibly induce by hammering it, so
//     it is the exploitable case and it fails closed.
//
//   `failClosed: false` — used by /upload and /reviews. Those are already
//     gated behind a verified BRACU Google account and hard size/shape limits,
//     they cost us storage rather than metered spend, and denying them during
//     a limiter blip breaks legitimate coursework uploads. They fail open and
//     log.
//
// A *missing* binding is treated separately from a *throwing* one: it is a
// static deploy-time misconfiguration, so it is allowed-with-a-loud-log here
// and reported by `readinessReport()` (surfaced on GET /ready) where a deploy
// preflight can catch it deterministically. Failing closed on a missing
// binding would instead turn one bad deploy into a silent total outage.
async function rateLimit(env, uid, namespace, options = {}) {
  const { binding = env.PAPERS_RATE_LIMIT, failClosed = false } = options;
  if (!binding || typeof binding.limit !== 'function') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'rate_limit_binding_missing',
        namespace,
      }),
    );
    return true;
  }
  try {
    const { success } = await binding.limit({ key: `${namespace}:${uid}` });
    return success;
  } catch (e) {
    // Log only safe operational metadata — never the uid or the key.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'rate_limit_check_failed',
        namespace,
        policy: failClosed ? 'fail_closed' : 'fail_open',
        errorMessage: e?.message || String(e),
      }),
    );
    return !failClosed;
  }
}

// ── Readiness / capabilities ────────────────────────────────────────────────
// Liveness (`/health`) answers "is the Worker running". Readiness answers "is
// each feature's backing dependency actually configured", so the UI can hide a
// feature it cannot deliver (#455) and a deploy preflight can fail loudly.
//
// SECURITY: booleans only. This endpoint is unauthenticated, so it must never
// leak key material, prefixes, lengths, provider names, or account identifiers
// — only whether a given dependency is present.
export function readinessReport(env) {
  const e = env || {};
  const emailCfg = seatAlertEmailConfig(e);
  return {
    assistant: !!e.ANTHROPIC_API_KEY,
    papers: !!e.SERVICE_ACCOUNT_JSON && !!e.PAPERS_BUCKET,
    email: emailCfg.ok,
    rateLimits: {
      papers: typeof e.PAPERS_RATE_LIMIT?.limit === 'function',
      assistant: typeof e.ASSISTANT_RATE_LIMIT?.limit === 'function',
    },
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────
async function handleUpload(request, env, origin, ctx) {
  const originErr = requireBrowserOriginAllowed(request, env, origin);
  if (originErr) return originErr;

  // Auth FIRST — unauthenticated callers should not be able to probe accepted
  // course codes, MIME types, or filenames.
  const { claims } = await readAuth(request, env);

  const uploaderUid = String(claims?.user_id || claims?.sub || '');
  const ownerSegment = safePathSegment(uploaderUid);
  if (!ownerSegment) {
    return jsonResponse({ error: 'Invalid auth token' }, { status: 401 }, env, origin);
  }

  if (!(await rateLimit(env, ownerSegment, 'upload', { failClosed: false }))) {
    return jsonResponse({ error: 'Rate limit exceeded' }, { status: 429 }, env, origin);
  }

  const url = new URL(request.url);
  const courseCode = url.searchParams.get('courseCode') || '';
  const rawName = url.searchParams.get('filename') || '';
  if (!isValidCourseCode(courseCode)) {
    return jsonResponse({ error: 'Invalid course code' }, { status: 400 }, env, origin);
  }
  const filename = safeFilename(rawName);
  if (!filename || filename.length < 5) {
    return jsonResponse({ error: 'Invalid filename' }, { status: 400 }, env, origin);
  }
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (!contentLength || contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) {
    return jsonResponse(
      { error: 'File missing or larger than 10 MB' },
      { status: 413 },
      env,
      origin,
    );
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!ALLOWED_MIME_RE.test(contentType)) {
    return jsonResponse(
      { error: 'Only PDFs and images are allowed' },
      { status: 415 },
      env,
      origin,
    );
  }
  const paperType = cleanPaperType(url.searchParams.get('type'));
  if (!paperType) {
    return jsonResponse({ error: 'Invalid paper type' }, { status: 400 }, env, origin);
  }
  const title = String(url.searchParams.get('title') || '')
    .trim()
    .slice(0, 120);
  if (title.length < 3) {
    return jsonResponse({ error: 'Invalid title' }, { status: 400 }, env, origin);
  }
  const semester = cleanOptionalSemester(url.searchParams.get('semester'));
  const facultyInitials = cleanOptionalFacultyInitials(url.searchParams.get('facultyInitials'));

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'File larger than 10 MB' }, { status: 413 }, env, origin);
  }

  // Magic-byte sniff: reject files whose declared MIME type doesn't match
  // their actual content. Closes the polyglot/HTML-as-PDF angle.
  const sniffed = sniffMime(body);
  if (!mimeMatches(contentType, sniffed)) {
    return jsonResponse(
      { error: 'File contents do not match declared type' },
      { status: 415 },
      env,
      origin,
    );
  }

  const objectName = uniqueUploadObjectName(filename);
  const path = `papers/${courseCode}/${ownerSegment}/${objectName}`;
  await env.PAPERS_BUCKET.put(path, body, {
    httpMetadata: { contentType },
  });

  const paperDoc = {
    courseCode,
    type: paperType,
    title,
    storagePath: path,
    fileSize: body.byteLength,
    mimeType: contentType,
    uploaderUid,
    downloads: 0,
    flagCount: 0,
    approved: false,
    createdAt: new Date(),
  };
  if (semester) paperDoc.semester = semester;
  if (facultyInitials) paperDoc.facultyInitials = facultyInitials;

  let paperId = null;
  try {
    const accessToken = await getServiceAccountAccessToken(env);
    const docRes = await fetch(`${firestoreDocsBase(env)}/papers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: toFirestoreFields(paperDoc) }),
    });
    if (!docRes.ok) {
      const txt = await docRes.text().catch(() => '');
      throw new Error(`Firestore paper create failed: ${docRes.status} ${txt.slice(0, 200)}`);
    }
    const docJson = await docRes.json();
    paperId =
      String(docJson?.name || '')
        .split('/')
        .pop() || null;
    if (!paperId) throw new Error('Firestore paper create returned no document id');
  } catch (e) {
    console.error('paper metadata create failed; deleting uploaded object:', e?.message || e);
    try {
      await env.PAPERS_BUCKET.delete(path);
    } catch (deleteErr) {
      console.error('uploaded object cleanup failed:', deleteErr?.message || deleteErr);
    }
    return jsonResponse(
      { error: 'Upload metadata could not be saved' },
      { status: 502 },
      env,
      origin,
    );
  }

  // Fire-and-forget admin notification. Wrapped in ctx.waitUntil so the
  // upload response returns immediately even if Resend is slow / down.
  // Failures are logged but never fail the upload. The metadata fields
  // (title, type, semester, facultyInitials) come from the metadata validated
  // above; the Worker also writes the authoritative Firestore paper doc before
  // returning, so R2 objects are not orphaned if metadata persistence fails.
  const notifyPromise = notifyAdminOfUpload(env, {
    courseCode,
    path,
    fileSize: body.byteLength,
    contentType,
    title: sanitizeHeaderValue(title, 120),
    type: sanitizeHeaderValue(paperType, 20),
    semester: sanitizeHeaderValue(semester, 40),
    facultyInitials: sanitizeHeaderValue(facultyInitials, 20),
    uploaderEmail: claims?.email || '(unknown)',
    uploaderUid: uploaderUid || '(unknown)',
  }).catch((err) => console.error('admin notify failed:', err?.message || err));
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(notifyPromise);
  }

  return jsonResponse({ ok: true, id: paperId, path }, { status: 200 }, env, origin);
}

// Resend's onboarding sender only delivers to the Resend account owner, so
// treating it (or a missing value) as a usable sender silently drops mail for
// every real recipient. Production must set EMAIL_FROM to a verified-domain
// sender. Keep this as a substring check so it also catches a display-name form
// like "Shohoj <onboarding@resend.dev>".
export const RESEND_TEST_SENDER = 'onboarding@resend.dev';

// Resolve and validate the From header. Returns { ok, from, reason }; never
// falls back to a hardcoded sender so misconfiguration fails loud, not silent.
export function resolveEmailFrom(env) {
  const raw = typeof env?.EMAIL_FROM === 'string' ? env.EMAIL_FROM.trim() : '';
  if (!raw) return { ok: false, from: '', reason: 'EMAIL_FROM is not set' };
  if (raw.toLowerCase().includes(RESEND_TEST_SENDER)) {
    return {
      ok: false,
      from: raw,
      reason:
        'EMAIL_FROM uses the Resend test sender, which only delivers to the Resend account owner; set a verified-domain sender',
    };
  }
  return { ok: true, from: raw, reason: '' };
}

async function notifyAdminOfUpload(env, info) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;
  const sender = resolveEmailFrom(env);
  if (!sender.ok) {
    console.error(`admin upload notify skipped: ${sender.reason}`);
    return;
  }
  const sizeMb = (info.fileSize / (1024 * 1024)).toFixed(2);
  const modUrl = env.ADMIN_MODERATION_URL || '';
  const from = sender.from;
  const typeLabel = info.type ? info.type.charAt(0).toUpperCase() + info.type.slice(1) : '';
  const titleStr = info.title || '(untitled)';
  const subject = sanitizeHeaderValue(
    `[Shohoj] New ${info.type || 'paper'} pending review: ${info.courseCode}${info.title ? ' — ' + info.title : ''}`,
    200,
  );

  const row = (label, value, mono = false) =>
    value
      ? `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;${mono ? 'font-family:ui-monospace,monospace;font-size:13px;' : 'font-weight:500;'}">${escapeHtml(value)}</td></tr>`
      : '';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; line-height: 1.5; color:#222;">
      <h2 style="margin:0 0 8px;color:#0b0f0d;">📚 New paper pending review</h2>
      <p style="margin:0 0 20px;color:#555;">A student just uploaded a paper to Shohoj. Review it and approve or delete from the admin dashboard.</p>

      <div style="background:#f6f8f7;border:1px solid #e3e8e6;border-radius:10px;padding:14px 18px;margin-bottom:18px;">
        <div style="font-size:11px;color:#666;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(info.courseCode)}${typeLabel ? ' · ' + escapeHtml(typeLabel) : ''}</div>
        <div style="font-size:17px;font-weight:600;color:#0b0f0d;">${escapeHtml(titleStr)}</div>
      </div>

      <table style="border-collapse:collapse;font-size:14px;width:100%;">
        ${row('Course code', info.courseCode)}
        ${row('Paper type', typeLabel || info.type)}
        ${row('Title', info.title)}
        ${row('Semester', info.semester)}
        ${row('Faculty initials', info.facultyInitials)}
        ${row('File size', `${sizeMb} MB`)}
        ${row('MIME type', info.contentType, true)}
        ${row('Storage path', info.path, true)}
        ${row('Uploader email', info.uploaderEmail)}
        ${row('Uploader UID', info.uploaderUid, true)}
      </table>

      ${modUrl ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(modUrl)}" style="display:inline-block;background:#2ECC71;color:#0b0f0d;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open admin dashboard →</a></p>` : ''}
      <p style="margin:28px 0 0;color:#999;font-size:12px;">You're getting this because admin.shohoj@gmail.com is listed as the admin for Shohoj.</p>
    </div>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [env.ADMIN_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

async function handleDownload(request, env, origin) {
  const originErr = requireBrowserOriginAllowed(request, env, origin);
  if (originErr) return originErr;

  const { claims } = await readAuth(request, env);
  const callerUid = claims?.user_id || claims?.sub;
  const isAdmin = claims?.admin === true;

  const url = new URL(request.url);
  const paperId = url.searchParams.get('paperId') || '';
  if (!PAPER_ID_RE.test(paperId)) {
    return jsonResponse({ error: 'Invalid paperId' }, { status: 400 }, env, origin);
  }

  // Fetch the paper doc via the service account so the call is independent
  // of how Firebase ID tokens interact with Firestore REST and any App Check
  // enforcement turned on for the project. The worker re-enforces the read
  // rule against the verified ID-token claims:
  //   admin claim || uploaderUid == self || approved == true
  let accessToken;
  try {
    accessToken = await getServiceAccountAccessToken(env);
  } catch (e) {
    console.error('SA token fetch failed:', e?.message || e);
    return jsonResponse({ error: 'Service unavailable' }, { status: 503 }, env, origin);
  }
  const docRes = await fetch(`${firestoreDocsBase(env)}/papers/${encodeURIComponent(paperId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (docRes.status === 404) {
    return jsonResponse({ error: 'Not found' }, { status: 404 }, env, origin);
  }
  if (!docRes.ok) {
    const txt = await docRes.text().catch(() => '');
    console.error('download: Firestore doc fetch failed:', docRes.status, txt.slice(0, 200));
    return jsonResponse({ error: 'Lookup failed' }, { status: 502 }, env, origin);
  }
  const docJson = await docRes.json();
  const fields = fromFirestoreFields(docJson?.fields || {});

  const approved = fields.approved === true;
  const uploaderUid = String(fields.uploaderUid || '');
  if (!isAdmin && !approved && uploaderUid !== callerUid) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 }, env, origin);
  }

  const storagePath = fields.storagePath;
  if (!isValidStoragePath(storagePath)) {
    console.error('download: bad storagePath in doc:', storagePath);
    return jsonResponse({ error: 'Bad storage path' }, { status: 500 }, env, origin);
  }

  const obj = await env.PAPERS_BUCKET.get(storagePath);
  if (!obj) {
    return jsonResponse({ error: 'Not found' }, { status: 404 }, env, origin);
  }
  // Prefer the mimeType stored in the Firestore doc (authoritative — set by
  // the uploading client). Pre-migration R2 objects often lack the metadata
  // entry, in which case `obj.httpMetadata.contentType` is undefined and the
  // browser receives a typeless blob — that's what makes the preview iframe
  // render blank.
  let contentType = String(fields.mimeType || '').match(
    /^(?:application\/pdf|image\/(?:png|jpeg|webp|gif))$/,
  )
    ? fields.mimeType
    : obj.httpMetadata?.contentType || 'application/octet-stream';
  // Last resort for pre-migration objects with no authoritative type: buffer the
  // object and sniff its magic bytes so the browser preview renders inline
  // instead of blank. Uploads are capped at MAX_UPLOAD_BYTES, so buffering is
  // bounded. arrayBuffer() consumes obj.body, so serve the buffer we read.
  let body = obj.body;
  if (contentType === 'application/octet-stream') {
    const buf = await obj.arrayBuffer();
    const sniffed = sniffMimeFromBytes(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
    if (sniffed) contentType = sniffed;
    body = buf;
  }
  const headers = new Headers(corsHeaders(env, origin));
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'private, max-age=300');
  // Serve the exact declared type and forbid MIME-sniffing. Uploads are
  // magic-byte validated, but this is the response that hands untrusted
  // user content to a browser, so pin the type defensively: without nosniff
  // a browser could sniff the bytes and render the blob as an active type.
  headers.set('X-Content-Type-Options', 'nosniff');
  // `inline` keeps the browser rendering in-place (iframe/<embed>) rather
  // than triggering a download dialog.
  headers.set('Content-Disposition', 'inline');
  return new Response(body, { status: 200, headers });
}

async function handleDelete(request, env, origin) {
  const originErr = requireBrowserOriginAllowed(request, env, origin);
  if (originErr) return originErr;

  const { claims } = await readAuth(request, env);
  if (claims.admin !== true) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 }, env, origin);
  }

  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  if (!isValidStoragePath(path)) {
    return jsonResponse({ error: 'Invalid path' }, { status: 400 }, env, origin);
  }
  await env.PAPERS_BUCKET.delete(path);
  return jsonResponse({ ok: true }, { status: 200 }, env, origin);
}

// ── /reviews: server-mediated review write ──────────────────────────────────
// Computes the canonical sha256(uid|initials|course) review ID and writes the
// doc via Firestore REST using the service-account access token. Firestore
// rules deny all client creates on facultyReviews, so this is the only path
// for new reviews — guarantees one-review-per-(user, faculty, course) without
// exposing the uid in the doc body.
async function handleReview(request, env, origin) {
  const originErr = requireBrowserOriginAllowed(request, env, origin);
  if (originErr) return originErr;

  const { claims } = await readAuth(request, env);
  const uid = claims?.user_id || claims?.sub;
  if (!uid) return jsonResponse({ error: 'Invalid auth token' }, { status: 401 }, env, origin);

  if (!(await rateLimit(env, uid, 'review', { failClosed: false }))) {
    return jsonResponse({ error: 'Rate limit exceeded' }, { status: 429 }, env, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }, env, origin);
  }

  const validation = validateReviewPayload(payload);
  if (validation.error) {
    return jsonResponse({ error: validation.error }, { status: 400 }, env, origin);
  }
  const { facultyInitials, courseCode, ratings, semester, text } = validation.value;

  const hash = await sha256Hex(`${uid}|${facultyInitials}|${courseCode}`);
  const docId = `${facultyInitials}_${courseCode}_${hash}`;

  const fields = toFirestoreFields({
    facultyInitials,
    courseCode,
    semester: semester || '',
    text: text || '',
    ratings,
    createdAt: new Date(),
  });

  let accessToken;
  try {
    accessToken = await getServiceAccountAccessToken(env);
  } catch (e) {
    console.error('SA token fetch failed:', e?.message || e);
    return jsonResponse({ error: 'Service unavailable' }, { status: 503 }, env, origin);
  }

  const createUrl = `${firestoreDocsBase(env)}/facultyReviews?documentId=${encodeURIComponent(docId)}`;
  const res = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (res.status === 409) {
    return jsonResponse(
      { error: 'You have already reviewed this faculty for this course' },
      { status: 409 },
      env,
      origin,
    );
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('Firestore createDocument failed:', res.status, txt.slice(0, 200));
    return jsonResponse({ error: 'Write failed' }, { status: 502 }, env, origin);
  }
  return jsonResponse({ ok: true, id: docId }, { status: 201 }, env, origin);
}

export function validateReviewPayload(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid payload' };
  const facultyInitials = String(p.facultyInitials || '')
    .toUpperCase()
    .trim();
  const courseCode = String(p.courseCode || '')
    .toUpperCase()
    .trim();
  // Faculty initials are shape-checked only, deliberately. The authoritative
  // set of teaching faculty is the live CONNECT feed, not anything in this
  // repo: data/faculty_profiles.jsonl is an explicitly partial seed (116 rows
  // against a far larger faculty body — see src/core/faculty.ts), so gating on
  // it would reject legitimate reviews for most professors, and gating on the
  // feed would reject reviews of faculty who no longer teach the course.
  // Tracked as a known limitation in docs/SECURITY.md rather than silently
  // presented as an existence check.
  if (!REVIEW_INITIALS_RE.test(facultyInitials)) return { error: 'Invalid faculty initials' };
  // Course codes, by contrast, ARE checked against the authoritative catalogue.
  if (!REVIEW_COURSE_RE.test(courseCode)) return { error: 'Invalid course code' };
  if (!isKnownCourse(courseCode)) return { error: 'Unknown course code' };

  const r = p.ratings;
  if (!r || typeof r !== 'object') return { error: 'Missing ratings' };
  const ratings = {};
  for (const k of REVIEW_TYPE_KEYS) {
    const v = Math.round(Number(r[k]));
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: `Rating "${k}" must be 1–5` };
    ratings[k] = v;
  }

  // Length is validated against the ORIGINAL string, before any truncation.
  // The previous order sliced first and then compared the already-clamped
  // value against the same bound, so both checks were unreachable and an
  // over-long review was silently truncated instead of rejected. Rejecting is
  // the correct behaviour: silently storing a different review than the one
  // the student wrote is worse than telling them it was too long.
  const semester = p.semester != null ? String(p.semester) : '';
  const text = p.text != null ? String(p.text) : '';
  if (semester.length > MAX_REVIEW_SEMESTER_CHARS) return { error: 'Semester too long' };
  if (text.length > MAX_REVIEW_TEXT_CHARS) return { error: 'Review text too long' };

  return { value: { facultyInitials, courseCode, ratings, semester, text } };
}

// ── Seat-drop email alerts (cron) ────────────────────────────────────────────
// A scheduled handler polls the CONNECT feed once for every user, edge-detects
// watched sections flipping full→open against persisted per-user state, and
// emails via Resend. Parsing / detection / formatting are pure and exported for
// tests; the orchestration below does the Firestore + Resend I/O.

export const SEAT_FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
const SEAT_ALERT_WATCHES = 'seatAlertWatches';
const SEAT_ALERT_STATE = 'seatAlertState';

// Build sectionId → seat info from the raw CONNECT array. Tolerant of junk.
export function parseFeedSeatMap(payload) {
  const map = new Map();
  if (!Array.isArray(payload)) return map;
  for (const s of payload) {
    const id = s?.sectionId;
    if (typeof id !== 'number') continue;
    const capacity = Number.isFinite(s.capacity) ? Number(s.capacity) : 0;
    const consumed = Number.isFinite(s.consumedSeat) ? Number(s.consumedSeat) : 0;
    map.set(id, {
      code: String(s.courseCode || '').toUpperCase(),
      name: String(s.sectionName || ''),
      hasSeat: capacity > 0 && consumed < capacity,
      seatsLeft: Math.max(0, capacity - consumed),
    });
  }
  return map;
}

// Edge-triggered drop detection for one user's watchlist.
//   watched   : [{ id, code, name }]
//   seatMap   : Map<id, {code,name,hasSeat,seatsLeft}>
//   priorSeen : { "<id>": boolean }  worker-managed state (string keys)
// Returns { drops:[{id,label,seatsLeft}], nextSeen, changed }. A drop fires only
// on an observed false→true flip; an unknown prior state is seeded (no email),
// so first-run or newly-added sections that are already open never spam.
export function detectSeatDrops(watched, seatMap, priorSeen = {}) {
  const drops = [];
  const nextSeen = {};
  let changed = false;
  for (const w of watched || []) {
    const id = w?.id;
    if (typeof id !== 'number') continue;
    const key = String(id);
    const info = seatMap.get(id);
    if (!info) {
      // Not in the current feed — preserve any prior state, never drop.
      if (key in priorSeen) nextSeen[key] = priorSeen[key];
      continue;
    }
    if (priorSeen[key] === false && info.hasSeat) {
      const label = `${info.code || w.code || ''} Section ${info.name || w.name || ''}`.trim();
      drops.push({ id, label, seatsLeft: info.seatsLeft });
    }
    nextSeen[key] = info.hasSeat;
    if (priorSeen[key] !== info.hasSeat) changed = true;
  }
  // A pruned section (no longer watched) also counts as a state change.
  if (!changed && Object.keys(priorSeen).length !== Object.keys(nextSeen).length) {
    changed = true;
  }
  return { drops, nextSeen, changed };
}

// Plain, escaped email for one user's freed seats.
export function buildSeatAlertEmail(drops) {
  const items = drops
    .map(
      (d) =>
        `<li style="margin:6px 0;"><strong>${escapeHtml(d.label)}</strong> — ${d.seatsLeft} seat${d.seatsLeft === 1 ? '' : 's'} left</li>`,
    )
    .join('');
  const n = drops.length;
  const subject = sanitizeHeaderValue(
    n === 1 ? `[Shohoj] Seat open: ${drops[0].label}` : `[Shohoj] ${n} watched seats just opened`,
    200,
  );
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; line-height: 1.5; color:#222;">
      <h2 style="margin:0 0 8px;color:#0b0f0d;">🎉 A seat just opened</h2>
      <p style="margin:0 0 16px;color:#555;">A section you're watching on Shohoj has a free seat. Grab it on USIS before it fills again:</p>
      <ul style="padding-left:20px;margin:0 0 20px;">${items}</ul>
      <p style="margin:0;color:#999;font-size:12px;">You're getting this because you enabled seat-drop email alerts in Shohoj. Remove the section from your watchlist to stop these.</p>
    </div>
  `;
  return { subject, html };
}

// Is the seat-alert email channel fully configured? Both an API key and a real
// (non-test) sender are required; missing either means we must fail safe rather
// than report alerts as operational. Pure so it's unit-testable.
export function seatAlertEmailConfig(env) {
  const hasKey = !!(env && env.RESEND_API_KEY);
  const sender = resolveEmailFrom(env);
  return {
    ok: hasKey && sender.ok,
    from: sender.from,
    reason: !hasKey ? 'RESEND_API_KEY is not set' : sender.reason,
  };
}

// ── Shohoj Assistant (#435) ─────────────────────────────────────────────────
// Chat turn for the in-app assistant. The security boundary lives entirely in
// this handler: the uid comes ONLY from the verified Firebase ID token, and
// the tool loaders below close over that uid — the model (and the client)
// never supply a user identifier, so a prompt-injected tool call cannot be
// redirected at another student's document.
async function handleAssistant(request, env, origin) {
  const originCheck = requireBrowserOriginAllowed(request, env, origin);
  if (originCheck) return originCheck;

  const { claims } = await readAuth(request, env); // throws AuthError → 401
  const uid = safePathSegment(claims?.user_id || claims?.sub);
  if (!uid) throw new AuthError('Token carries no uid');

  // Configuration check BEFORE the rate limit: when the assistant is not
  // configured at all (#455) every turn is going to 503 anyway, so burning the
  // caller's rate-limit quota on it would be pure punishment.
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'assistant_unavailable' }, { status: 503 }, env, origin);
  }
  // Paid endpoint: a throwing limiter denies rather than granting unmetered
  // Anthropic spend. See the rateLimit() policy note.
  if (
    !(await rateLimit(env, uid, 'assistant', {
      binding: env.ASSISTANT_RATE_LIMIT,
      failClosed: true,
    }))
  ) {
    return jsonResponse({ error: 'Too many requests' }, { status: 429 }, env, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 }, env, origin);
  }
  const messages = validateAssistantMessages(body?.messages);
  if (!messages) {
    return jsonResponse({ error: 'Invalid messages payload' }, { status: 400 }, env, origin);
  }

  // Capability-style loaders: the uid is interpolated into the Firestore path
  // HERE, server-side. assistant.js never sees a uid at all.
  const ctx = {
    loadUserSnapshot: async () => {
      const saToken = await getServiceAccountAccessToken(env);
      const fields = await firestoreGetFields(env, saToken, `users/${uid}`);
      if (!fields || typeof fields.data !== 'string') return null;
      try {
        return JSON.parse(fields.data);
      } catch {
        return null;
      }
    },
    loadSeatIndex: () => loadSeatIndexFromFeed(SEAT_FEED_URL),
  };

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  try {
    const reply = await runAssistantLoop({ anthropic, messages, ctx });
    return jsonResponse({ reply }, { status: 200 }, env, origin);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'assistant_error',
        errorMessage: e?.message || String(e),
      }),
    );
    return jsonResponse({ error: 'assistant_unavailable' }, { status: 502 }, env, origin);
  }
}

async function resendSeatAlert(env, to, subject, html) {
  const cfg = seatAlertEmailConfig(env);
  if (!cfg.ok) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return false;
  }
  return true;
}

async function firestoreListAll(env, token, collection) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${firestoreDocsBase(env)}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Firestore list ${collection} ${res.status}`);
    const data = await res.json();
    for (const d of data.documents || []) {
      const name = d.name || '';
      out.push({
        id: name.slice(name.lastIndexOf('/') + 1),
        fields: fromFirestoreFields(d.fields || {}),
      });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function firestoreGetFields(env, token, path) {
  const res = await fetch(`${firestoreDocsBase(env)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${path} ${res.status}`);
  return fromFirestoreFields((await res.json()).fields || {});
}

async function firestorePatchFields(env, token, path, obj) {
  const res = await fetch(`${firestoreDocsBase(env)}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(obj) }),
  });
  if (!res.ok) throw new Error(`Firestore patch ${path} ${res.status}`);
}

// Poll the feed once, fan out over every user's watchlist, email on drops, and
// persist updated state. Resolves to a small summary for logging. All counts are
// aggregate — no UID or email is returned or logged.
export async function runSeatAlertCron(env) {
  // Fail safe before any I/O: if mail can't be delivered, do nothing and report
  // it, rather than reading watches and silently dropping every email.
  const cfg = seatAlertEmailConfig(env);
  if (!cfg.ok) {
    return {
      configured: false,
      reason: cfg.reason,
      users: 0,
      watches: 0,
      transitions: 0,
      emailed: 0,
      failed: 0,
    };
  }

  const feedRes = await fetch(SEAT_FEED_URL, { headers: { Accept: 'application/json' } });
  if (!feedRes.ok) throw new Error(`Feed fetch ${feedRes.status}`);
  const seatMap = parseFeedSeatMap(await feedRes.json());
  if (seatMap.size === 0) {
    return {
      configured: true,
      feedEmpty: true,
      users: 0,
      watches: 0,
      transitions: 0,
      emailed: 0,
      failed: 0,
    };
  }

  const token = await getServiceAccountAccessToken(env);
  const watchDocs = await firestoreListAll(env, token, SEAT_ALERT_WATCHES);

  let watches = 0; // active watch docs actually processed
  let transitions = 0; // full→open drops detected across all users
  let emailed = 0; // users successfully emailed this run
  let failed = 0; // users whose drop email failed to send
  for (const { id: uid, fields } of watchDocs) {
    if (fields.enabled === false) continue;
    const email = typeof fields.email === 'string' ? fields.email : '';
    const sections = Array.isArray(fields.sections) ? fields.sections : [];
    if (!email || sections.length === 0) continue;
    watches += 1;

    const state = await firestoreGetFields(env, token, `${SEAT_ALERT_STATE}/${uid}`);
    const firstRun = state === null;
    const priorSeen = state && state.seen && typeof state.seen === 'object' ? state.seen : {};

    const { drops, nextSeen, changed } = detectSeatDrops(sections, seatMap, priorSeen);

    // First run has no baseline → seed state silently, never email.
    let delivered = true;
    if (!firstRun && drops.length > 0) {
      transitions += drops.length;
      const { subject, html } = buildSeatAlertEmail(drops);
      delivered = await resendSeatAlert(env, email, subject, html);
      if (delivered) emailed += 1;
      else failed += 1;
    }

    // Only advance persisted state when delivery succeeded (or there was nothing
    // to deliver). A transient Resend failure must not "consume" the transition:
    // leaving state untouched means the next tick re-detects the same drop and
    // retries, instead of silently swallowing the alert.
    if (delivered && (firstRun || changed)) {
      await firestorePatchFields(env, token, `${SEAT_ALERT_STATE}/${uid}`, {
        seen: nextSeen,
        updatedAt: new Date(),
      });
    }
  }
  return { configured: true, users: watchDocs.length, watches, transitions, emailed, failed };
}

// ── Lost & found claim delivery (cron, #371) ─────────────────────────────────
// The board's privacy model: posts show no contact info. A claim ("I found
// this / this is mine") is a client-written doc in lostFoundClaims; this cron
// joins it to the poster's client-unreadable contact doc and emails the
// poster, sharing the claimer's (consenting) address so they can talk
// directly. A claim doc is deleted only after Resend accepts the email —
// a transient failure leaves it queued for the next tick, mirroring the
// seat-alert retry semantics. Formatting is pure and exported for tests.

const LOST_FOUND_POSTS = 'lostFoundPosts';
const LOST_FOUND_CONTACTS = 'lostFoundContacts';
const LOST_FOUND_CLAIMS = 'lostFoundClaims';

export function buildLostFoundClaimEmail(post, claim) {
  const kind = post.type === 'lost' ? 'lost' : 'found';
  const verb = kind === 'lost' ? 'says they found it' : 'says it belongs to them';
  const title = String(post.title || '(untitled)');
  const subject = `Someone responded to your ${kind} item — ${title}`;
  const note =
    typeof claim.note === 'string' && claim.note.trim() !== ''
      ? `<p style="margin:12px 0;padding:10px 12px;background:#f5f5f5;border-radius:8px;">${escapeHtml(claim.note.trim())}</p>`
      : '';
  const html = `
    <div style="font-family:sans-serif;max-width:520px;">
      <h2 style="color:#1c7c45;">Your lost &amp; found post got a response</h2>
      <p><strong>${escapeHtml(title)}</strong> — a fellow BRACU student ${verb}.</p>
      ${note}
      <p>Reply to them directly at
        <a href="mailto:${escapeHtml(String(claim.fromEmail || ''))}">${escapeHtml(String(claim.fromEmail || ''))}</a>.
        Shohoj never shows your email on the board; only they receive this address exchange.</p>
      <p style="margin-top:16px;color:#999;font-size:12px;">You're getting this because someone responded to your post on the Shohoj lost &amp; found board. Delete the post to stop responses.</p>
    </div>`;
  return { subject, html };
}

async function firestoreDeleteDoc(env, token, path) {
  const res = await fetch(`${firestoreDocsBase(env)}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 = already gone (a previous partially-failed tick); that's success.
  if (!res.ok && res.status !== 404) throw new Error(`Firestore delete ${path} ${res.status}`);
}

export async function runLostFoundCron(env) {
  const cfg = seatAlertEmailConfig(env);
  if (!cfg.ok) {
    return { configured: false, reason: cfg.reason, claims: 0, emailed: 0, failed: 0, dropped: 0 };
  }

  const token = await getServiceAccountAccessToken(env);
  const claimDocs = await firestoreListAll(env, token, LOST_FOUND_CLAIMS);
  if (claimDocs.length === 0) {
    return { configured: true, claims: 0, emailed: 0, failed: 0, dropped: 0 };
  }

  let emailed = 0; // claims delivered and dequeued this run
  let failed = 0; // Resend rejections — left queued for retry
  let dropped = 0; // malformed/orphaned claims removed without an email
  for (const { id, fields } of claimDocs) {
    const postId = typeof fields.postId === 'string' ? fields.postId : '';
    const fromEmail = typeof fields.fromEmail === 'string' ? fields.fromEmail : '';
    const post = postId
      ? await firestoreGetFields(env, token, `${LOST_FOUND_POSTS}/${postId}`)
      : null;
    const contact = postId
      ? await firestoreGetFields(env, token, `${LOST_FOUND_CONTACTS}/${postId}`)
      : null;

    // Post deleted / contact missing / junk claim → nothing deliverable; drop
    // the queue doc so it can't loop forever.
    if (!fromEmail || !post || !contact || typeof contact.email !== 'string' || !contact.email) {
      await firestoreDeleteDoc(env, token, `${LOST_FOUND_CLAIMS}/${id}`);
      dropped += 1;
      continue;
    }

    const { subject, html } = buildLostFoundClaimEmail(post, fields);
    const delivered = await resendSeatAlert(env, contact.email, subject, html);
    if (delivered) {
      await firestoreDeleteDoc(env, token, `${LOST_FOUND_CLAIMS}/${id}`);
      emailed += 1;
    } else {
      failed += 1;
    }
  }
  return { configured: true, claims: claimDocs.length, emailed, failed, dropped };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const r = await runSeatAlertCron(env);
          if (!r.configured) {
            // Loud, non-PII operational error — alerts are NOT being delivered.
            console.error(
              `seat-alert cron: email channel not configured — ${r.reason}; skipped (no emails sent)`,
            );
            return;
          }
          console.log(
            `seat-alert cron: users=${r.users} watches=${r.watches} transitions=${r.transitions} emailed=${r.emailed} failed=${r.failed}`,
          );
        } catch (e) {
          console.error('seat-alert cron failed:', e?.message || e);
        }
      })(),
    );
    ctx.waitUntil(
      (async () => {
        try {
          const r = await runLostFoundCron(env);
          if (!r.configured) {
            console.error(
              `lost-found cron: email channel not configured — ${r.reason}; skipped (no emails sent)`,
            );
            return;
          }
          if (r.claims > 0) {
            console.log(
              `lost-found cron: claims=${r.claims} emailed=${r.emailed} failed=${r.failed} dropped=${r.dropped}`,
            );
          }
        } catch (e) {
          console.error('lost-found cron failed:', e?.message || e);
        }
      })(),
    );
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    // Correlation id for this request: echoed back in a header and included in
    // any error log so a client-reported failure can be traced to its log line.
    // Never contains user data — just a random opaque token.
    const requestId = newRequestId();
    try {
      // Unauthenticated health probe for uptime monitoring. No secrets, no user
      // data, no side effects — safe to expose publicly.
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(
          { status: 'ok', service: 'shohoj-papers', time: new Date().toISOString() },
          { status: 200, headers: { 'X-Request-Id': requestId } },
          env,
          origin,
        );
      }
      // Unauthenticated readiness probe. Reports, as booleans only, whether
      // each feature's backing dependency is configured — never any key
      // material. The shell calls this to avoid offering a feature that would
      // only fail (#455); the deploy preflight calls it to fail loudly.
      if (request.method === 'GET' && url.pathname === '/ready') {
        const capabilities = readinessReport(env);
        return jsonResponse(
          { status: 'ok', service: 'shohoj-papers', time: new Date().toISOString(), capabilities },
          { status: 200, headers: { 'X-Request-Id': requestId } },
          env,
          origin,
        );
      }
      if (request.method === 'POST' && url.pathname === '/upload')
        return await handleUpload(request, env, origin, ctx);
      if (request.method === 'GET' && url.pathname === '/download')
        return await handleDownload(request, env, origin);
      if (request.method === 'DELETE' && url.pathname === '/file')
        return await handleDelete(request, env, origin);
      if (request.method === 'POST' && url.pathname === '/reviews')
        return await handleReview(request, env, origin);
      if (request.method === 'POST' && url.pathname === '/api/assistant')
        return await handleAssistant(request, env, origin);
      return jsonResponse(
        { error: 'Not found' },
        { status: 404, headers: { 'X-Request-Id': requestId } },
        env,
        origin,
      );
    } catch (e) {
      const isAuthErr = e instanceof AuthError;
      // Structured, machine-readable error log (no request body / PII), keyed by
      // the correlation id, path and method so failures are greppable.
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'worker_error',
          requestId,
          method: request.method,
          path: url.pathname,
          errorCode: isAuthErr ? 'unauthorized' : 'server_error',
          errorMessage: e?.message || String(e),
        }),
      );
      return jsonResponse(
        { error: isAuthErr ? 'Unauthorized' : 'Server error', requestId },
        { status: isAuthErr ? 401 : 500, headers: { 'X-Request-Id': requestId } },
        env,
        origin,
      );
    }
  },
};

// crypto.randomUUID is available in the Workers runtime; fall back defensively
// so tests running on older Node still get a unique-enough token.
function newRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
