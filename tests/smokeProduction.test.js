/**
 * tests/smokeProduction.test.js
 * The post-deploy smoke test (scripts/smoke-production.mjs) waits for GitHub
 * Pages to publish before it judges a deploy. On 6 Oct 2026 Pages took 2 min
 * 3 s and the script, which waited two minutes, failed a deploy that had
 * worked. This pins how long it waits by default, and that it still gives up.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/smoke-production.mjs', import.meta.url));
const SOURCE = readFileSync(SCRIPT, 'utf8');

const LIVE = 'a'.repeat(40);

/** Serve a site whose version.json reports `LIVE`, counting how often it is asked. */
async function fakeSite() {
  let versionHits = 0;
  const server = createServer((req, res) => {
    if (req.url.startsWith('/version.json')) {
      versionHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ commit: LIVE, version: '0.0.0' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not here');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    hits: () => versionHits,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function runSmoke(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('by default it waits at least five minutes for Pages to publish', () => {
  const attempts = Number(SOURCE.match(/process\.env\.SMOKE_MAX_ATTEMPTS \|\| (\d+)/)[1]);
  const delayMs = Number(SOURCE.match(/process\.env\.SMOKE_DELAY_MS \|\| (\d+)/)[1]);
  const waitMs = (attempts - 1) * delayMs;
  // Pages has taken 2 min 3 s. Under five minutes is too close to that.
  assert.ok(waitMs >= 5 * 60_000, `default wait is only ${waitMs / 1000} s`);
  // And it must finish, with room for the route checks, inside the deploy
  // job's timeout (ci.yml deploy-frontend: 25 minutes).
  assert.ok(waitMs <= 10 * 60_000, `default wait of ${waitMs / 1000} s crowds the job timeout`);
});

test('it keeps asking until the expected commit appears, then gives up and fails', async () => {
  const site = await fakeSite();
  try {
    const { code, out } = await runSmoke({
      BASE_URL: site.url,
      EXPECTED_SHA: 'b'.repeat(40),
      SMOKE_MAX_ATTEMPTS: '4',
      SMOKE_DELAY_MS: '20',
    });
    assert.equal(code, 1);
    assert.equal(site.hits(), 4, 'one request per attempt, no more');
    assert.match(out, /attempt 4\/4/);
    assert.match(out, /did not report expected commit within 4 attempts \(\d+ s\)/);
    assert.match(out, /Investigate or roll back/);
  } finally {
    await site.close();
  }
});

test('it stops waiting the moment the expected commit is live', async () => {
  const site = await fakeSite();
  try {
    const { out } = await runSmoke({
      BASE_URL: site.url,
      EXPECTED_SHA: LIVE,
      SMOKE_MAX_ATTEMPTS: '50',
      SMOKE_DELAY_MS: '20',
    });
    assert.equal(site.hits(), 1, 'the first answer was the right one');
    assert.match(out, /✓ version\.json live \(commit=a{40}/);
  } finally {
    await site.close();
  }
});
