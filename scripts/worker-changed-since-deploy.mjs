#!/usr/bin/env node
// Has anything the Worker is built from changed since the Worker was last
// deployed? (#946) — the `worker` output of ci.yml's `changes` job on main.
//
// The question used to be "did THIS push touch worker/**?", answered by
// dorny/paths-filter against the push base. That loses a Worker change twice
// over:
//
//   1. Superseded. Deploys run only for the tip of main (deploy-gate). When
//      another push lands before a Worker change's run reaches its deploy, that
//      run skips as "not the tip" — and the newer run skips too, because ITS push
//      did not touch worker/**. #944 merged and sat undeployed this way until it
//      was deployed by hand (2026-10-21).
//   2. Outside worker/. The bundle pulls in js/core, src/core, src/features and
//      src/platform (the dry-run source map lists them). A change there never
//      looked like a Worker change at all.
//
// So the baseline is the commit the Worker was last deployed FROM: the head SHA
// of the newest main run whose "Deploy Cloudflare Worker" job succeeded. The
// diff from there to this commit, over every path the bundle draws from, is the
// answer.
//
// Every doubt resolves to "changed". A redundant deploy uploads the same code
// again; a missed one leaves production silently behind main, which is the bug
// this exists to fix. So a failed API call, no deploy in recent history, a
// baseline that is not an ancestor, or a git error all mean: deploy.
//
// Usage (CI): node scripts/worker-changed-since-deploy.mjs
// Env: GITHUB_REPOSITORY, GITHUB_SHA, GH_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The job whose success marks a commit as deployed. Must match ci.yml. */
export const WORKER_DEPLOY_JOB = 'Deploy Cloudflare Worker';

/**
 * Every path the Worker bundle is built from. worker/ covers its own sources,
 * generated tables and lockfile; the rest are the shared modules it imports,
 * the root lockfile those resolve against, and the workflow that deploys it.
 */
export const WORKER_SOURCE_PATHS = Object.freeze([
  'worker/',
  'js/core/',
  'src/core/',
  'src/features/',
  'src/platform/',
  'package.json',
  'package-lock.json',
  '.github/workflows/ci.yml',
]);

/** How many recent main runs to search for the last successful deploy. */
export const MAX_RUNS = 50;

/**
 * Head SHA of the newest run (other than this commit's) whose Worker deploy
 * succeeded, or null when none is found. `listRuns()` resolves to runs newest
 * first as { id, headSha }; `listJobs(id)` to [{ name, conclusion }]. Either
 * may throw — the caller treats that as doubt.
 */
export async function findLastDeployedSha({ headSha, listRuns, listJobs }) {
  const runs = await listRuns();
  for (const run of runs.slice(0, MAX_RUNS)) {
    if (!run || run.headSha === headSha) continue;
    const jobs = await listJobs(run.id);
    if (jobs.some((job) => job.name === WORKER_DEPLOY_JOB && job.conclusion === 'success')) {
      return run.headSha;
    }
  }
  return null;
}

/**
 * The verdict: { changed, reason }. `isAncestor(base, head)` and
 * `changedFiles(base, head, paths)` wrap git; both may throw.
 */
export async function decideWorkerDeploy({
  headSha,
  listRuns,
  listJobs,
  isAncestor,
  changedFiles,
}) {
  let base;
  try {
    base = await findLastDeployedSha({ headSha, listRuns, listJobs });
  } catch (e) {
    return {
      changed: true,
      reason: `Could not read past deploys (${e?.message || e}); deploying.`,
    };
  }
  if (!base) {
    return {
      changed: true,
      reason: `No successful "${WORKER_DEPLOY_JOB}" in the last ${MAX_RUNS} main runs; deploying.`,
    };
  }
  let files;
  try {
    if (!isAncestor(base, headSha)) {
      return {
        changed: true,
        reason: `Last deployed commit ${base} is not an ancestor of ${headSha}; deploying.`,
      };
    }
    files = changedFiles(base, headSha, WORKER_SOURCE_PATHS);
  } catch (e) {
    return {
      changed: true,
      reason: `Could not diff against ${base} (${e?.message || e}); deploying.`,
    };
  }
  if (files.length === 0) {
    return {
      changed: false,
      reason: `Nothing the Worker is built from changed since it was deployed from ${base}.`,
    };
  }
  const shown = files.slice(0, 10).join(', ') + (files.length > 10 ? `, … (${files.length})` : '');
  return { changed: true, reason: `Changed since the Worker was deployed from ${base}: ${shown}.` };
}

// ── CI wiring ───────────────────────────────────────────────────────────────

async function github(path, token) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GITHUB_SHA: headSha, GH_TOKEN: token } = process.env;
  const verdict = await decideWorkerDeploy({
    headSha,
    listRuns: async () => {
      const body = await github(
        `repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=${MAX_RUNS}`,
        token,
      );
      return (body.workflow_runs || []).map((run) => ({ id: run.id, headSha: run.head_sha }));
    },
    listJobs: async (id) => {
      const body = await github(`repos/${repo}/actions/runs/${id}/jobs?per_page=100`, token);
      return body.jobs || [];
    },
    isAncestor: (base, head) => {
      try {
        git(['merge-base', '--is-ancestor', base, head]);
        return true;
      } catch (e) {
        // Exit 1 is a definite "no"; anything else (unknown commit) is doubt.
        if (e.status === 1) return false;
        throw e;
      }
    },
    changedFiles: (base, head, paths) =>
      git(['diff', '--name-only', base, head, '--', ...paths])
        .split('\n')
        .filter(Boolean),
  });
  console.log(verdict.reason);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${verdict.changed}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Worker deploy: ${verdict.reason}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    // Even an unexpected crash must not skip a deploy: say "changed".
    console.log(`Unexpected error (${e?.message || e}); deploying.`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'changed=true\n');
  });
}
