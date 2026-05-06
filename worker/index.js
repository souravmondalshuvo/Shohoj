// ── Shohoj papers Worker ─────────────────────────────────────────────────────
// Auth-proxy in front of an R2 bucket. Every request must carry a Firebase ID
// token belonging to a BRACU student (email matches *@g.bracu.ac.bd). Uploads
// are size-capped (10 MB) and MIME-restricted (PDF + images). Admin UID can
// delete files.
//
// Bindings (configured in wrangler.toml):
//   PAPERS_BUCKET         — R2 bucket binding
//   FIREBASE_PROJECT_ID   — string env var (e.g. "shohoj")
//   ADMIN_UID             — string env var, the Firebase UID allowed to delete
//   ALLOWED_ORIGINS       — comma-separated CORS origins (e.g. "https://souravmondalshuvo.github.io,http://localhost:5173")

import { jwtVerify, createRemoteJWKSet } from 'jose';

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const BRACU_EMAIL_RE = /^[^@]+@g\.bracu\.ac\.bd$/;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_RE = /^application\/pdf$|^image\//;

let _jwks = null;
function getJwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  }
  return _jwks;
}

async function verifyFirebaseToken(token, env) {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience: env.FIREBASE_PROJECT_ID,
  });
  if (!payload.email || !BRACU_EMAIL_RE.test(payload.email)) {
    throw new Error('Email not in BRACU domain');
  }
  return payload;
}

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
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

function isValidStoragePath(p) {
  return typeof p === 'string'
    && /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9._-]+$/.test(p);
}

function isValidCourseCode(c) {
  return typeof c === 'string' && /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.test(c);
}

function safeFilename(name) {
  return String(name || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

async function readAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new Error('Missing bearer token');
  return verifyFirebaseToken(m[1], env);
}

async function handleUpload(request, env, origin) {
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

  await readAuth(request, env);

  const path = `papers/${courseCode}/${filename}`;
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'File larger than 10 MB' }, { status: 413 }, env, origin);
  }
  await env.PAPERS_BUCKET.put(path, body, {
    httpMetadata: { contentType },
  });
  return jsonResponse({ ok: true, path }, { status: 200 }, env, origin);
}

async function handleDownload(request, env, origin) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  if (!isValidStoragePath(path)) {
    return jsonResponse({ error: 'Invalid path' }, { status: 400 }, env, origin);
  }
  await readAuth(request, env);
  const obj = await env.PAPERS_BUCKET.get(path);
  if (!obj) {
    return jsonResponse({ error: 'Not found' }, { status: 404 }, env, origin);
  }
  const headers = new Headers(corsHeaders(env, origin));
  if (obj.httpMetadata?.contentType) {
    headers.set('Content-Type', obj.httpMetadata.contentType);
  }
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(obj.body, { status: 200, headers });
}

async function handleDelete(request, env, origin) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  if (!isValidStoragePath(path)) {
    return jsonResponse({ error: 'Invalid path' }, { status: 400 }, env, origin);
  }
  const claims = await readAuth(request, env);
  if (!env.ADMIN_UID || claims.user_id !== env.ADMIN_UID) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 }, env, origin);
  }
  await env.PAPERS_BUCKET.delete(path);
  return jsonResponse({ ok: true }, { status: 200 }, env, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/upload') {
        return await handleUpload(request, env, origin);
      }
      if (request.method === 'GET' && url.pathname === '/download') {
        return await handleDownload(request, env, origin);
      }
      if (request.method === 'DELETE' && url.pathname === '/file') {
        return await handleDelete(request, env, origin);
      }
      return jsonResponse({ error: 'Not found' }, { status: 404 }, env, origin);
    } catch (e) {
      const msg = e && e.message ? e.message : 'Server error';
      const status = /token|email|domain|bearer/i.test(msg) ? 401 : 500;
      return jsonResponse({ error: msg }, { status }, env, origin);
    }
  },
};
