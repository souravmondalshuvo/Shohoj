#!/usr/bin/env node
// Post-deployment Worker smoke test / readiness preflight — and the Worker half
// of the daily production check (.github/workflows/production-check.yml).
//
// Verifies a LIVE Shohoj Worker deployment without touching user data or
// spending money: it only issues unauthenticated GETs to /health and /ready,
// neither of which reads user documents or calls a model provider.
//
//   1. Liveness — /health answers, so the Worker is deployed and routing.
//
//   2. Readiness — /ready reports which feature dependencies are configured,
//      judged against the capability manifest in scripts/lib/readiness.mjs.
//      This began as the guard for #455, when the Assistant UI shipped with its
//      key unset and nothing noticed. It did not catch #674 — email off in
//      production — because it only ever enforced `assistant`, and because the
//      deploy step that runs it was gated on a variable that was never set. Now
//      every required capability is enforced, and a gap that already has an
//      issue (KNOWN_GAPS) warns instead of failing (#675).
//
// Usage:
//   node scripts/smoke-worker.mjs                  # production
//   WORKER_URL=https://… node scripts/smoke-worker.mjs
//
// Env:
//   WORKER_URL          Base Worker URL. Defaults to production's, which is not a
//                       secret: the app's CSP names it.
//   SMOKE_RESULT_FILE   When set, write a booleans-only JSON verdict here for the
//                       scheduled workflow to act on.
//   REQUIRE_ASSISTANT   Accepted for compatibility and now redundant: `assistant`
//                       is a required capability in the manifest.
//   SMOKE_MAX_ATTEMPTS  Propagation poll attempts (default 10).
//   SMOKE_DELAY_MS      Delay between attempts (default 3000).
//
// NOTE: this script never prints response bodies wholesale, because /ready is
// the one endpoint whose job is to describe secrets' presence. It prints, and
// writes, only the booleans it judges.

import { writeFileSync } from 'node:fs';
import { containsKeyMaterial, evaluateReadiness } from './lib/readiness.mjs';

const PRODUCTION_WORKER_URL = 'https://shohoj-papers.souravmondal033.workers.dev';
const WORKER_URL = (process.env.WORKER_URL || PRODUCTION_WORKER_URL).replace(/\/+$/, '');
const RESULT_FILE = process.env.SMOKE_RESULT_FILE || '';
const MAX_ATTEMPTS = Number(process.env.SMOKE_MAX_ATTEMPTS || 10);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 3000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(ok, label, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
  return ok;
}

async function getJson(path) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'GET',
    // Identify the probe. (Cloudflare's bot protection 403s some default agents,
    // such as Python's; an explicit one keeps a probe from reading as an outage.)
    headers: { Accept: 'application/json', 'User-Agent': 'shohoj-smoke-worker/1.0' },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, requestId: res.headers.get('X-Request-Id') };
}

// The Worker may take a moment to become routable right after a deploy.
async function pollUntilLive(path) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      last = await getJson(path);
      if (last.status === 200) return last;
    } catch (e) {
      last = { status: 0, body: null, error: e?.message || String(e) };
    }
    if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
  }
  return last;
}

console.log(`\nWorker smoke test → ${WORKER_URL}\n`);

console.log('Liveness:');
const health = await pollUntilLive('/health');
const healthOk = [
  check(
    health?.status === 200,
    'GET /health returns 200',
    `got ${health?.status ?? 'no response'}`,
  ),
  check(health?.body?.status === 'ok', 'health reports status ok'),
  check(!!health?.requestId, 'health carries an X-Request-Id correlation id'),
].every(Boolean);

console.log('\nReadiness:');
let ready;
try {
  ready = await getJson('/ready');
} catch (e) {
  ready = { status: 0, body: null, error: e?.message || String(e) };
}
const readyOk = check(ready.status === 200, 'GET /ready returns 200', `got ${ready.status}`);
const caps = ready.body?.capabilities;
const shapeOk = check(caps && typeof caps === 'object', 'readiness reports a capabilities object');

// Guard against the endpoint ever regressing into leaking key material.
const keyMaterial = containsKeyMaterial(JSON.stringify(ready.body));
check(!keyMaterial, 'readiness response contains no key material');

const verdict = shapeOk ? evaluateReadiness(caps) : null;
if (verdict) {
  console.log('\nCapabilities (booleans only):');
  for (const r of verdict.results) {
    if (r.status === 'ok') console.log(`  ✓ ${r.path}`);
    if (r.status === 'restored') {
      console.log(`  ✓ ${r.path} — back on`);
      console.log(
        `::notice::${r.path} is back on — #${r.issue} can be closed, and its KNOWN_GAPS entry removed.`,
      );
    }
    if (r.status === 'known-gap') {
      console.log(`  ! ${r.path} is off — known gap, tracked in #${r.issue}`);
      console.log(`::warning::${r.path} is off in production — known gap, tracked in #${r.issue}.`);
    }
    if (r.status === 'missing')
      check(false, `${r.path} is configured`, 'it is off, and no issue tracks it');
    if (r.status === 'invalid')
      check(false, `${r.path} is reported as a boolean`, 'absent or not a boolean');
  }
  for (const { path, value } of verdict.info) console.log(`  · ${path}=${value} (informational)`);
  for (const path of verdict.unknown) {
    console.log(
      `::warning::/ready reports ${path}, which scripts/lib/readiness.mjs does not list.`,
    );
  }
}

if (RESULT_FILE) {
  const result = {
    probeOk: healthOk && readyOk && shapeOk && !keyMaterial,
    liveness: { status: health?.status ?? 0, ok: healthOk },
    readiness: verdict && {
      status: ready.status,
      results: verdict.results.map(({ path, value, status, issue }) => ({
        path,
        value,
        status,
        issue,
      })),
      info: verdict.info,
      unknown: verdict.unknown,
    },
    keyMaterial,
  };
  writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
}

console.log('');
if (failures > 0) {
  console.error(`✗ Worker smoke test failed (${failures} check${failures === 1 ? '' : 's'}).\n`);
  process.exit(1);
}
console.log('✅ Worker smoke test passed.\n');
