// ── Shohoj papers Worker ─────────────────────────────────────────────────────
// Auth-proxy in front of an R2 bucket. Every request must carry a Firebase ID
// token belonging to a BRACU student (email matches *@g.bracu.ac.bd) or an
// admin (custom claim `admin === true`). Uploads are size-capped (10 MB) and
// MIME-restricted (PDF + images). Only admins can delete files.
//
// Bindings (configured in wrangler.toml):
//   PAPERS_BUCKET         — R2 bucket binding
//   FIREBASE_PROJECT_ID   — string env var (e.g. "shohoj")
//   ALLOWED_ORIGINS       — comma-separated CORS origins (e.g. "https://souravmondalshuvo.github.io,http://localhost:5173")

import { jwtVerify, createRemoteJWKSet } from 'jose';

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

export class AuthError extends Error {}

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
  const isBracu = !!payload.email && BRACU_EMAIL_RE.test(payload.email);
  const isAdmin = payload.admin === true;
  if (!isBracu && !isAdmin) {
    throw new AuthError('Email not in BRACU domain');
  }
  return payload;
}

export function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
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
    && /^papers\/[A-Z]{2,4}[0-9]{3}[A-Z]?\/[A-Za-z0-9._-]+$/.test(p);
}

export function isValidCourseCode(c) {
  return typeof c === 'string' && /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.test(c);
}

export function safeFilename(name) {
  return String(name || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

async function readAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new AuthError('Missing bearer token');
  return verifyFirebaseToken(m[1], env);
}

async function handleUpload(request, env, origin, ctx) {
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

  const claims = await readAuth(request, env);

  const path = `papers/${courseCode}/${filename}`;
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'File larger than 10 MB' }, { status: 413 }, env, origin);
  }
  await env.PAPERS_BUCKET.put(path, body, {
    httpMetadata: { contentType },
  });

  // Fire-and-forget admin notification. Wrapped in ctx.waitUntil so the
  // upload response returns immediately even if Resend is slow / down.
  // Failures are logged but never fail the upload.
  const notifyPromise = notifyAdminOfUpload(env, {
    courseCode, path, fileSize: body.byteLength, contentType,
    uploaderEmail: claims?.email || '(unknown)',
    uploaderUid: claims?.user_id || claims?.sub || '(unknown)',
  }).catch(err => console.error('admin notify failed:', err?.message || err));
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(notifyPromise);
  }

  return jsonResponse({ ok: true, path }, { status: 200 }, env, origin);
}

async function notifyAdminOfUpload(env, info) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;
  const sizeMb = (info.fileSize / (1024 * 1024)).toFixed(2);
  const modUrl = env.ADMIN_MODERATION_URL || '';
  const from = env.EMAIL_FROM || 'Shohoj <onboarding@resend.dev>';
  const subject = `[Shohoj] New paper pending review: ${info.courseCode}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; line-height: 1.5;">
      <h2 style="margin:0 0 12px;color:#0b0f0d;">📚 New paper uploaded</h2>
      <p style="margin:0 0 16px;color:#444;">A student just uploaded a new paper to Shohoj. It's waiting for admin review.</p>
      <table style="border-collapse:collapse;font-size:14px;color:#222;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Course</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(info.courseCode)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Storage path</td><td style="padding:4px 0;font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(info.path)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">File size</td><td style="padding:4px 0;">${sizeMb} MB · ${escapeHtml(info.contentType)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Uploader</td><td style="padding:4px 0;">${escapeHtml(info.uploaderEmail)}<br><span style="font-family:ui-monospace,monospace;font-size:12px;color:#888;">${escapeHtml(info.uploaderUid)}</span></td></tr>
      </table>
      ${modUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(modUrl)}" style="display:inline-block;background:#2ECC71;color:#0b0f0d;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open admin dashboard →</a></p>` : ''}
      <p style="margin:24px 0 0;color:#888;font-size:12px;">You're getting this because you're listed as the admin for Shohoj.</p>
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
  if (claims.admin !== true) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 }, env, origin);
  }
  await env.PAPERS_BUCKET.delete(path);
  return jsonResponse({ ok: true }, { status: 200 }, env, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/upload') {
        return await handleUpload(request, env, origin, ctx);
      }
      if (request.method === 'GET' && url.pathname === '/download') {
        return await handleDownload(request, env, origin);
      }
      if (request.method === 'DELETE' && url.pathname === '/file') {
        return await handleDelete(request, env, origin);
      }
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
