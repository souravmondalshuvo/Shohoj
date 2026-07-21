#!/usr/bin/env node
// Post-deployment Worker smoke test / readiness preflight.
//
// Verifies a LIVE Shohoj Worker deployment without touching user data or
// spending money: it only issues unauthenticated GETs to /health and /ready,
// neither of which reads user documents or calls Anthropic.
//
// Two jobs:
//
//   1. Liveness — /health answers, so the Worker is deployed and routing.
//
//   2. Readiness — /ready reports which feature dependencies are configured.
//      This is the automated guard for #455: the Assistant UI shipped while
//      ANTHROPIC_API_KEY was unset on the deployed Worker, so a visible feature
//      failed on every turn and nothing in CI noticed. With REQUIRE_ASSISTANT=1
//      a deploy fails loudly instead.
//
// Usage:
//   WORKER_URL=https://papers.example.workers.dev node scripts/smoke-worker.mjs
//
// Env:
//   WORKER_URL         Base Worker URL (required).
//   REQUIRE_ASSISTANT  When '1'/'true', a Worker reporting the Assistant as
//                      unconfigured fails this check. Leave unset while the
//                      secret is still pending so the deploy is not blocked.
//   SMOKE_MAX_ATTEMPTS Propagation poll attempts (default 10).
//   SMOKE_DELAY_MS     Delay between attempts (default 3000).
//
// NOTE: this script never prints response bodies wholesale, because /ready is
// the one endpoint whose job is to describe secrets' presence. It prints only
// the booleans it asserts on.

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const REQUIRE_ASSISTANT = /^(1|true|yes)$/i.test(process.env.REQUIRE_ASSISTANT || '');
const MAX_ATTEMPTS = Number(process.env.SMOKE_MAX_ATTEMPTS || 10);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 3000);

if (!WORKER_URL) {
  console.error('✗ WORKER_URL is not set — nothing to smoke test.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(ok, label, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

async function getJson(path) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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
check(health?.status === 200, 'GET /health returns 200', `got ${health?.status ?? 'no response'}`);
check(health?.body?.status === 'ok', 'health reports status ok');
check(!!health?.requestId, 'health carries an X-Request-Id correlation id');

console.log('\nReadiness:');
const ready = await getJson('/ready');
check(ready.status === 200, 'GET /ready returns 200', `got ${ready.status}`);

const caps = ready.body?.capabilities;
check(caps && typeof caps === 'object', 'readiness reports a capabilities object');

if (caps && typeof caps === 'object') {
  // Print only the booleans — never the raw body.
  console.log(
    `    capabilities: assistant=${caps.assistant} papers=${caps.papers} email=${caps.email}`,
  );
  check(typeof caps.assistant === 'boolean', 'assistant capability is a boolean');

  // Guard against the endpoint ever regressing into leaking key material.
  const serialized = JSON.stringify(ready.body);
  check(
    !/sk-|BEGIN [A-Z ]*PRIVATE KEY|re_[A-Za-z0-9]{8}/.test(serialized),
    'readiness response contains no key material',
  );

  if (REQUIRE_ASSISTANT) {
    check(
      caps.assistant === true,
      'Assistant dependency is configured (REQUIRE_ASSISTANT=1)',
      'ANTHROPIC_API_KEY is not set on the deployed Worker — run: cd worker && npx wrangler secret put ANTHROPIC_API_KEY',
    );
  } else if (caps.assistant !== true) {
    // Not a failure while the secret is still pending, but never silent.
    console.log(
      '    ::warning:: Assistant is deployed but its API key is NOT configured, so the feature is hidden in the UI. See issue #455.',
    );
  }
}

console.log('');
if (failures > 0) {
  console.error(`✗ Worker smoke test failed (${failures} check${failures === 1 ? '' : 's'}).\n`);
  process.exit(1);
}
console.log('✅ Worker smoke test passed.\n');
