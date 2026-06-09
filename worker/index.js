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
//
// Bindings (configured in wrangler.toml)
//   PAPERS_BUCKET         R2 bucket binding
//   FIREBASE_PROJECT_ID   string env var (e.g. "shohoj")
//   ALLOWED_ORIGINS       comma-separated CORS origins
//   ADMIN_EMAIL/etc.      optional, for upload notifications
//   PAPERS_RATE_LIMIT     Cloudflare Rate Limiting binding (per-UID)
//
// Secrets (set with `wrangler secret put`)
//   RESEND_API_KEY          for upload notifications
//   SERVICE_ACCOUNT_JSON    Firebase service-account JSON, used to mint
//                           OAuth2 access tokens that authorize the
//                           Firestore REST writes for /upload metadata and
//                           /reviews

import { jwtVerify, createRemoteJWKSet, createLocalJWKSet, SignJWT, importPKCS8 } from 'jose';

const BRACU_EMAIL_RE      = /^[^@]+@g\.bracu\.ac\.bd$/;
const MAX_UPLOAD_BYTES    = 10 * 1024 * 1024;
const ALLOWED_MIME_RE     = /^application\/pdf$|^image\/(?:png|jpeg|webp|gif)$/;
const OWNED_STORAGE_PATH_RE  = /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
// Legacy paths (no uploader segment) still exist in R2 from earlier uploads.
// Reads/deletes must accept them so already-uploaded papers stay accessible.
// NEW uploads always use the owned form (handleUpload constructs that path
// explicitly), so this regex is read-only legacy support, not a write surface.
const LEGACY_STORAGE_PATH_RE = /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9._-]+$/;
const PAPER_ID_RE         = /^[A-Za-z0-9_-]{1,200}$/;
const REVIEW_INITIALS_RE  = /^[A-Z]{2,6}$/;
const REVIEW_COURSE_RE    = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const REVIEW_TYPE_KEYS    = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];
const PAPER_TYPES         = new Set(['midterm', 'final', 'quiz', 'notes', 'assignment', 'lab', 'lab-quiz']);

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
      : createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  }
  return _jwks;
}

export class AuthError extends Error {}

export function isAllowedFirebasePayload(payload) {
  const isAdmin = payload?.admin === true;
  const isVerifiedBracuGoogleUser = !!payload?.email
    && payload.email_verified === true
    && payload.firebase?.sign_in_provider === 'google.com'
    && BRACU_EMAIL_RE.test(payload.email);
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
    'Vary': 'Origin',
  };
  if (isOriginAllowed(env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function isOriginAllowed(env, origin) {
  if (!origin) return false;
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
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
  return typeof p === 'string'
    && (OWNED_STORAGE_PATH_RE.test(p) || LEGACY_STORAGE_PATH_RE.test(p));
}

export function isValidCourseCode(c) {
  return typeof c === 'string' && /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.test(c);
}

export function safeFilename(name) {
  return String(name || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

function uniqueUploadObjectName(filename) {
  const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14);
  return `${Date.now()}-${randomId}-${filename}`;
}

function safePathSegment(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
}

function cleanPaperType(value) {
  const type = String(value || '').toLowerCase().trim();
  return PAPER_TYPES.has(type) ? type : '';
}

function cleanOptionalSemester(value) {
  return String(value || '').trim().slice(0, 40);
}

function cleanOptionalFacultyInitials(value) {
  const initials = String(value || '').toUpperCase().trim().slice(0, 40);
  return /^[A-Z]{2,6}(, ?[A-Z]{2,6})*$/.test(initials) ? initials : '';
}

// Strip control chars (incl. CR/LF) and clamp length. Used for any uploader-
// controlled string that ends up in an outbound HTTP header value (e.g. the
// Resend email subject line).
function sanitizeHeaderValue(s, max = 200) {
  return String(s ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, max);
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
  if (u.length >= 8
      && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47
      && u[4] === 0x0D && u[5] === 0x0A && u[6] === 0x1A && u[7] === 0x0A) {
    return 'image/png';
  }
  if (u.length >= 3 && u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (u.length >= 12
      && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46
      && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) {
    return 'image/webp';
  }
  if (u.length >= 6
      && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38
      && (u[4] === 0x37 || u[4] === 0x39) && u[5] === 0x61) {
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
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
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
  if ('stringValue'   in v) return v.stringValue;
  if ('integerValue'  in v) return Number(v.integerValue);
  if ('doubleValue'   in v) return v.doubleValue;
  if ('booleanValue'  in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue'     in v) return null;
  if ('mapValue'      in v) return fromFirestoreFields(v.mapValue?.fields || {});
  if ('arrayValue'    in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
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
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Per-UID rate limiting ───────────────────────────────────────────────────
// Cloudflare's Workers Rate Limiting binding (PAPERS_RATE_LIMIT) is keyed on
// any string we pass. We key on the Firebase UID so abuse is bounded per
// account, not per IP. The limits are configured in wrangler.toml.
async function rateLimit(env, uid, namespace) {
  if (!env.PAPERS_RATE_LIMIT || typeof env.PAPERS_RATE_LIMIT.limit !== 'function') return true;
  try {
    const { success } = await env.PAPERS_RATE_LIMIT.limit({ key: `${namespace}:${uid}` });
    return success;
  } catch (e) {
    console.warn('rate-limit check failed; failing open:', e?.message || e);
    return true;
  }
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

  if (!(await rateLimit(env, ownerSegment, 'upload'))) {
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
    return jsonResponse({ error: 'File missing or larger than 10 MB' }, { status: 413 }, env, origin);
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!ALLOWED_MIME_RE.test(contentType)) {
    return jsonResponse({ error: 'Only PDFs and images are allowed' }, { status: 415 }, env, origin);
  }
  const paperType = cleanPaperType(url.searchParams.get('type'));
  if (!paperType) {
    return jsonResponse({ error: 'Invalid paper type' }, { status: 400 }, env, origin);
  }
  const title = String(url.searchParams.get('title') || '').trim().slice(0, 120);
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
      { status: 415 }, env, origin,
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
    paperId = String(docJson?.name || '').split('/').pop() || null;
    if (!paperId) throw new Error('Firestore paper create returned no document id');
  } catch (e) {
    console.error('paper metadata create failed; deleting uploaded object:', e?.message || e);
    try {
      await env.PAPERS_BUCKET.delete(path);
    } catch (deleteErr) {
      console.error('uploaded object cleanup failed:', deleteErr?.message || deleteErr);
    }
    return jsonResponse({ error: 'Upload metadata could not be saved' }, { status: 502 }, env, origin);
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
    title:           sanitizeHeaderValue(title, 120),
    type:            sanitizeHeaderValue(paperType, 20),
    semester:        sanitizeHeaderValue(semester, 40),
    facultyInitials: sanitizeHeaderValue(facultyInitials, 20),
    uploaderEmail:   claims?.email || '(unknown)',
    uploaderUid:     uploaderUid || '(unknown)',
  }).catch(err => console.error('admin notify failed:', err?.message || err));
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(notifyPromise);
  }

  return jsonResponse({ ok: true, id: paperId, path }, { status: 200 }, env, origin);
}

async function notifyAdminOfUpload(env, info) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;
  const sizeMb = (info.fileSize / (1024 * 1024)).toFixed(2);
  const modUrl = env.ADMIN_MODERATION_URL || '';
  const from = env.EMAIL_FROM || 'Shohoj <onboarding@resend.dev>';
  const typeLabel = info.type ? info.type.charAt(0).toUpperCase() + info.type.slice(1) : '';
  const titleStr  = info.title || '(untitled)';
  const subject = sanitizeHeaderValue(
    `[Shohoj] New ${info.type || 'paper'} pending review: ${info.courseCode}${info.title ? ' — ' + info.title : ''}`,
    200,
  );

  const row = (label, value, mono = false) => value
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
        ${row('Course code',       info.courseCode)}
        ${row('Paper type',        typeLabel || info.type)}
        ${row('Title',             info.title)}
        ${row('Semester',          info.semester)}
        ${row('Faculty initials',  info.facultyInitials)}
        ${row('File size',         `${sizeMb} MB`)}
        ${row('MIME type',         info.contentType, true)}
        ${row('Storage path',      info.path, true)}
        ${row('Uploader email',    info.uploaderEmail)}
        ${row('Uploader UID',      info.uploaderUid, true)}
      </table>

      ${modUrl ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(modUrl)}" style="display:inline-block;background:#2ECC71;color:#0b0f0d;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open admin dashboard →</a></p>` : ''}
      <p style="margin:28px 0 0;color:#999;font-size:12px;">You're getting this because admin.shohoj@gmail.com is listed as the admin for Shohoj.</p>
    </div>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
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
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function handleDownload(request, env, origin) {
  const originErr = requireBrowserOriginAllowed(request, env, origin);
  if (originErr) return originErr;

  const { claims } = await readAuth(request, env);
  const callerUid = claims?.user_id || claims?.sub;
  const isAdmin  = claims?.admin === true;

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
  const docRes = await fetch(
    `${firestoreDocsBase(env)}/papers/${encodeURIComponent(paperId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
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

  const approved    = fields.approved === true;
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
  const fallbackType = String(fields.mimeType || '').match(/^(?:application\/pdf|image\/(?:png|jpeg|webp|gif))$/)
    ? fields.mimeType
    : (obj.httpMetadata?.contentType || 'application/octet-stream');
  const headers = new Headers(corsHeaders(env, origin));
  headers.set('Content-Type', fallbackType);
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'private, max-age=300');
  // `inline` keeps the browser rendering in-place (iframe/<embed>) rather
  // than triggering a download dialog.
  headers.set('Content-Disposition', 'inline');
  return new Response(obj.body, { status: 200, headers });
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

  if (!(await rateLimit(env, uid, 'review'))) {
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
    text:     text || '',
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
    return jsonResponse({ error: 'You have already reviewed this faculty for this course' }, { status: 409 }, env, origin);
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
  const facultyInitials = String(p.facultyInitials || '').toUpperCase().trim();
  const courseCode      = String(p.courseCode || '').toUpperCase().trim();
  if (!REVIEW_INITIALS_RE.test(facultyInitials)) return { error: 'Invalid faculty initials' };
  if (!REVIEW_COURSE_RE.test(courseCode))        return { error: 'Invalid course code' };

  const r = p.ratings;
  if (!r || typeof r !== 'object') return { error: 'Missing ratings' };
  const ratings = {};
  for (const k of REVIEW_TYPE_KEYS) {
    const v = Math.round(Number(r[k]));
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: `Rating "${k}" must be 1–5` };
    ratings[k] = v;
  }

  const semester = p.semester != null ? String(p.semester).slice(0, 40) : '';
  const text     = p.text     != null ? String(p.text).slice(0, 500)    : '';
  if (semester && semester.length > 40) return { error: 'Semester too long' };
  if (text && text.length > 500)        return { error: 'Review text too long' };

  return { value: { facultyInitials, courseCode, ratings, semester, text } };
}

// ── Seat-drop email alerts (cron) ────────────────────────────────────────────
// A scheduled handler polls the CONNECT feed once for every user, edge-detects
// watched sections flipping full→open against persisted per-user state, and
// emails via Resend. Parsing / detection / formatting are pure and exported for
// tests; the orchestration below does the Firestore + Resend I/O.

export const SEAT_FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
const SEAT_ALERT_WATCHES = 'seatAlertWatches';
const SEAT_ALERT_STATE   = 'seatAlertState';

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
  for (const w of (watched || [])) {
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
      const label = `${info.code || w.code || ''} §${info.name || w.name || ''}`.trim();
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
  const items = drops.map(d =>
    `<li style="margin:6px 0;"><strong>${escapeHtml(d.label)}</strong> — ${d.seatsLeft} seat${d.seatsLeft === 1 ? '' : 's'} left</li>`,
  ).join('');
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

async function resendSeatAlert(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.EMAIL_FROM || 'Shohoj <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
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
    for (const d of (data.documents || [])) {
      const name = d.name || '';
      out.push({ id: name.slice(name.lastIndexOf('/') + 1), fields: fromFirestoreFields(d.fields || {}) });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function firestoreGetFields(env, token, path) {
  const res = await fetch(`${firestoreDocsBase(env)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
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
// persist updated state. Resolves to a small summary for logging.
export async function runSeatAlertCron(env) {
  const feedRes = await fetch(SEAT_FEED_URL, { headers: { Accept: 'application/json' } });
  if (!feedRes.ok) throw new Error(`Feed fetch ${feedRes.status}`);
  const seatMap = parseFeedSeatMap(await feedRes.json());
  if (seatMap.size === 0) return { users: 0, emailed: 0 };

  const token = await getServiceAccountAccessToken(env);
  const watchDocs = await firestoreListAll(env, token, SEAT_ALERT_WATCHES);

  let emailed = 0;
  for (const { id: uid, fields } of watchDocs) {
    if (fields.enabled === false) continue;
    const email = typeof fields.email === 'string' ? fields.email : '';
    const sections = Array.isArray(fields.sections) ? fields.sections : [];
    if (!email || sections.length === 0) continue;

    const state = await firestoreGetFields(env, token, `${SEAT_ALERT_STATE}/${uid}`);
    const firstRun = state === null;
    const priorSeen = (state && state.seen && typeof state.seen === 'object') ? state.seen : {};

    const { drops, nextSeen, changed } = detectSeatDrops(sections, seatMap, priorSeen);

    // First run has no baseline → seed state silently, never email.
    if (!firstRun && drops.length > 0) {
      const { subject, html } = buildSeatAlertEmail(drops);
      if (await resendSeatAlert(env, email, subject, html)) emailed += 1;
    }
    if (firstRun || changed) {
      await firestorePatchFields(env, token, `${SEAT_ALERT_STATE}/${uid}`, { seen: nextSeen, updatedAt: new Date() });
    }
  }
  return { users: watchDocs.length, emailed };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const r = await runSeatAlertCron(env);
        console.log(`seat-alert cron: users=${r.users} emailed=${r.emailed}`);
      } catch (e) {
        console.error('seat-alert cron failed:', e?.message || e);
      }
    })());
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST'   && url.pathname === '/upload')   return await handleUpload(request, env, origin, ctx);
      if (request.method === 'GET'    && url.pathname === '/download') return await handleDownload(request, env, origin);
      if (request.method === 'DELETE' && url.pathname === '/file')     return await handleDelete(request, env, origin);
      if (request.method === 'POST'   && url.pathname === '/reviews')  return await handleReview(request, env, origin);
      return jsonResponse({ error: 'Not found' }, { status: 404 }, env, origin);
    } catch (e) {
      const isAuthErr = e instanceof AuthError;
      console.error('worker error:', e?.message || e);
      return jsonResponse(
        { error: isAuthErr ? 'Unauthorized' : 'Server error' },
        { status: isAuthErr ? 401 : 500 },
        env,
        origin,
      );
    }
  },
};
