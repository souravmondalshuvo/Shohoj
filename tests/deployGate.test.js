/**
 * tests/deployGate.test.js
 * The deploy gate in .github/workflows/ci.yml: a deploy job publishes whatever
 * commit its run belongs to, so every deploy first asks whether that commit is
 * still the tip of main. Re-running an old main run must not put an old site
 * (or an old Worker, or old Firestore rules) back into production.
 *
 * A workflow cannot run here, so two things are pinned instead: the gate's
 * shell script is lifted out of the YAML and executed against a stand-in `gh`,
 * and every deploy job is checked to actually depend on its answer.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const WORKFLOW = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const LINES = WORKFLOW.split('\n');

/** The lines of one top-level job, from its `  name:` key to the next job. */
function job(id) {
  const start = LINES.indexOf(`  ${id}:`);
  assert.notEqual(start, -1, `no job '${id}' in ci.yml`);
  let end = start + 1;
  while (end < LINES.length && !/^ {2}[a-z][a-z0-9-]*:\s*$/.test(LINES[end])) end += 1;
  return LINES.slice(start, end);
}

/** A job's `if:` as one line, whether written inline or as a folded block. */
function jobIf(id) {
  const lines = job(id);
  const at = lines.findIndex((l) => /^ {4}if:/.test(l));
  assert.notEqual(at, -1, `job '${id}' has no if:`);
  const inline = lines[at].replace(/^ {4}if:\s*/, '');
  if (inline !== '>-') return inline.trim();
  const parts = [];
  for (let i = at + 1; i < lines.length && /^ {6}\S/.test(lines[i]); i += 1) parts.push(lines[i].trim());
  return parts.join(' ');
}

function jobNeeds(id) {
  const line = job(id).find((l) => /^ {4}needs:/.test(l));
  assert.ok(line, `job '${id}' has no needs:`);
  return line.replace(/^ {4}needs:\s*\[|\]\s*$/g, '').split(',').map((s) => s.trim());
}

/** The gate step's `run: |` script, de-indented. */
function gateScript() {
  const lines = job('deploy-gate');
  const at = lines.findIndex((l) => /^ {8}run: \|\s*$/.test(l));
  assert.notEqual(at, -1, 'the gate has no run: | block');
  const body = [];
  for (let i = at + 1; i < lines.length && (/^ {10}/.test(lines[i]) || lines[i].trim() === ''); i += 1) {
    body.push(lines[i].slice(10));
  }
  return body.join('\n');
}

/** Run the gate with `gh api …` answering `tipAnswer`. */
function runGate({ tipAnswer, sha, ghExit = 0 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-gate-'));
  const gh = path.join(dir, 'gh');
  writeFileSync(gh, `#!/bin/sh\nprintf '%s' '${tipAnswer}'\nexit ${ghExit}\n`);
  chmodSync(gh, 0o755);
  const output = path.join(dir, 'output');
  const summary = path.join(dir, 'summary');
  const result = spawnSync('bash', ['-e', '-c', gateScript()], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_SHA: sha,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '',
  };
}

const NEW = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const DEPLOYS = ['deploy-frontend', 'deploy-worker', 'deploy-firestore'];

test('the commit at the tip of main deploys', () => {
  const r = runGate({ tipAnswer: NEW, sha: NEW });
  assert.equal(r.status, 0);
  assert.equal(r.output.trim(), 'newest=true');
  assert.match(r.summary, /deploying/);
});

test('a superseded commit does not deploy, and the gate still passes', () => {
  // Exit 0 on purpose: the deploy jobs are skipped and the run stays green,
  // which is the right verdict on a commit that was validated and replaced.
  const r = runGate({ tipAnswer: NEW, sha: OLD });
  assert.equal(r.status, 0);
  assert.equal(r.output.trim(), 'newest=false');
  assert.match(r.stdout, /::notice::Not deploying b{40}: main is at a{40}/);
  assert.match(r.summary, /Skipping every deploy/);
});

test('if the tip of main cannot be read, nothing deploys: closed, not open', () => {
  for (const tipAnswer of ['', 'Not Found', '{"message":"Bad credentials"}', NEW.slice(0, 39), `${NEW}x`]) {
    const r = runGate({ tipAnswer, sha: NEW });
    assert.equal(r.status, 1, `'${tipAnswer}' should fail the gate`);
    assert.equal(r.output, '', 'no newest= output may be written on failure');
    assert.match(r.stdout, /::error::Could not read the tip of main/);
  }
});

test('a failing gh call fails the gate even when it printed something', () => {
  const r = runGate({ tipAnswer: NEW, sha: NEW, ghExit: 1 });
  assert.equal(r.status, 1);
  assert.equal(r.output, '');
});

test('the gate exposes its answer as the job output the deploys read', () => {
  const lines = job('deploy-gate').join('\n');
  assert.match(lines, /outputs:\n {6}newest: \$\{\{ steps\.tip\.outputs\.newest \}\}/);
  assert.match(lines, /id: tip/);
  // It asks GitHub for the branch as it is now, not for anything in the checkout.
  assert.match(gateScript(), /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/main" --jq \.object\.sha/);
});

test('the gate runs only for a push to main, after every validation job', () => {
  assert.equal(jobIf('deploy-gate'), "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.deepEqual(jobNeeds('deploy-gate'), [
    'lint', 'typecheck', 'validate-data', 'unit-tests', 'worker-tests', 'build-e2e', 'visual-parity',
  ]);
});

test('every deploy job waits for the gate and runs only on its yes', () => {
  for (const id of DEPLOYS) {
    assert.ok(jobNeeds(id).includes('deploy-gate'), `${id} does not need deploy-gate`);
    assert.ok(
      jobIf(id).includes("needs.deploy-gate.outputs.newest == 'true'"),
      `${id} can run without the gate's yes: ${jobIf(id)}`,
    );
    assert.ok(jobIf(id).includes("github.ref == 'refs/heads/main'"), `${id} lost its main-only condition`);
  }
});

test('no job publishes to production except the three behind the gate', () => {
  // A fourth deploy job added later would publish from a re-run again unless
  // it is gated too. Anything that names the production environment, or that
  // carries a deploy concurrency group, has to be one of the three.
  const ids = LINES.filter((l) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(l) && LINES.indexOf(l) > LINES.indexOf('jobs:'))
    .map((l) => l.trim().slice(0, -1));
  const publishing = ids.filter((id) => {
    const text = job(id).join('\n');
    return /^ {4}environment:/m.test(text) || /group: [a-z]+-deploy\b/.test(text);
  });
  assert.deepEqual(publishing.sort(), [...DEPLOYS].sort());
});

test('the gate script is valid bash', () => {
  execFileSync('bash', ['-n', '-c', gateScript()]);
});
