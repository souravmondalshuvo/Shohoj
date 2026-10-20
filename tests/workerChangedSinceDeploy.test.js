/**
 * tests/workerChangedSinceDeploy.test.js
 * Whether main's run should deploy the Worker (scripts/worker-changed-since-deploy.mjs,
 * #946). The bug this guards: #944 merged a Worker change, a newer unrelated
 * push superseded its run, and neither run deployed it. Every uncertain branch
 * must come out "deploy" — a missed deploy is the failure, not an extra one.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decideWorkerDeploy,
  MAX_RUNS,
  WORKER_DEPLOY_JOB,
  WORKER_SOURCE_PATHS,
} from '../scripts/worker-changed-since-deploy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (c) => c.repeat(40);
const deployed = [{ name: WORKER_DEPLOY_JOB, conclusion: 'success' }];
const skipped = [{ name: WORKER_DEPLOY_JOB, conclusion: 'skipped' }];

/** A history of runs, newest first, each with the jobs it ran. */
function history(runs) {
  return {
    listRuns: async () => runs.map(([headSha], i) => ({ id: i + 1, headSha })),
    listJobs: async (id) => runs[id - 1][1],
  };
}

const always = () => true;

test('#944: a superseded Worker change is still deployed by the newer run', async () => {
  // 614c (campus data) superseded 1c4b (#944); 1c4b skipped its deploy as "not
  // the tip"; the Worker was last deployed from b627.
  const seen = [];
  const verdict = await decideWorkerDeploy({
    headSha: sha('6'),
    ...history([[sha('6'), skipped], [sha('1'), skipped], [sha('b'), deployed]]),
    isAncestor: always,
    changedFiles: (base, head, paths) => {
      seen.push({ base, head, paths });
      return ['worker/wrangler.toml'];
    },
  });
  assert.equal(verdict.changed, true);
  assert.equal(seen[0].base, sha('b'), 'diffed from the last DEPLOYED commit, not the push base');
  assert.match(verdict.reason, /worker\/wrangler\.toml/);
});

test('nothing the Worker is built from changed: no deploy', async () => {
  const verdict = await decideWorkerDeploy({
    headSha: sha('2'),
    ...history([[sha('1'), deployed]]),
    isAncestor: always,
    changedFiles: () => [],
  });
  assert.equal(verdict.changed, false);
});

test('a change in shared code the Worker bundles counts as a Worker change', async () => {
  let paths;
  await decideWorkerDeploy({
    headSha: sha('2'),
    ...history([[sha('1'), deployed]]),
    isAncestor: always,
    changedFiles: (base, head, p) => {
      paths = p;
      return ['js/core/connectFeed.js'];
    },
  });
  for (const dir of ['worker/', 'js/core/', 'src/core/', 'src/features/', 'src/platform/']) {
    assert.ok(paths.includes(dir), `${dir} is diffed`);
  }
});

test('every doubt deploys', async () => {
  const boom = () => {
    throw new Error('boom');
  };
  const cases = {
    'runs unreadable': { listRuns: async () => boom(), listJobs: async () => deployed },
    'jobs unreadable': { ...history([[sha('1'), deployed]]), listJobs: async () => boom() },
    'no deploy found': history([[sha('1'), skipped], [sha('3'), skipped]]),
    'not an ancestor': { ...history([[sha('1'), deployed]]), isAncestor: () => false },
    'git fails': { ...history([[sha('1'), deployed]]), isAncestor: () => boom() },
    'diff fails': { ...history([[sha('1'), deployed]]), changedFiles: () => boom() },
  };
  for (const [name, overrides] of Object.entries(cases)) {
    const verdict = await decideWorkerDeploy({
      headSha: sha('2'),
      isAncestor: always,
      changedFiles: () => [],
      ...overrides,
    });
    assert.equal(verdict.changed, true, name);
    assert.match(verdict.reason, /deploying/, name);
  }
});

test('its own run never counts as the last deploy', async () => {
  let base;
  await decideWorkerDeploy({
    headSha: sha('2'),
    // A re-run of this very commit that deployed must not make it its own baseline.
    ...history([[sha('2'), deployed], [sha('1'), deployed]]),
    isAncestor: always,
    changedFiles: (b) => {
      base = b;
      return [];
    },
  });
  assert.equal(base, sha('1'));
});

test(`searches at most ${MAX_RUNS} runs`, async () => {
  let asked = 0;
  const runs = Array.from({ length: MAX_RUNS + 20 }, (_, i) => ({ id: i, headSha: sha('9') }));
  const verdict = await decideWorkerDeploy({
    headSha: sha('2'),
    listRuns: async () => runs,
    listJobs: async () => {
      asked += 1;
      return skipped;
    },
    isAncestor: always,
    changedFiles: () => [],
  });
  assert.equal(asked, MAX_RUNS);
  assert.equal(verdict.changed, true);
});

// ── Drift guards ────────────────────────────────────────────────────────────

test('the job it looks for is the one ci.yml runs', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(ci.includes(`name: ${WORKER_DEPLOY_JOB}\n`), `ci.yml names "${WORKER_DEPLOY_JOB}"`);
  assert.ok(ci.includes('scripts/worker-changed-since-deploy.mjs'), 'and runs this script');
});

/** Every repo file the Worker imports, following relative imports from index.js. */
function workerSourceFiles() {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      let target = resolve(dirname(file), spec);
      if (!existsSync(target)) {
        const withExt = ['.js', '.ts', '.mjs'].map((ext) => target + ext).find(existsSync);
        if (!withExt) continue;
        target = withExt;
      }
      visit(target);
    }
  };
  visit(join(ROOT, 'worker/index.js'));
  return [...seen].map((f) => relative(ROOT, f));
}

test('every file the Worker bundles is under a watched path', () => {
  const files = workerSourceFiles();
  assert.ok(files.length > 30, `walked the import graph (${files.length} files)`);
  const unwatched = files.filter((f) => !WORKER_SOURCE_PATHS.some((p) => f.startsWith(p)));
  assert.deepEqual(unwatched, [], 'a Worker import outside the watched paths would never trigger a deploy');
});
