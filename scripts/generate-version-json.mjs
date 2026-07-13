#!/usr/bin/env node
// Generate a public `version.json` with safe build/deploy metadata so a live
// deployment is traceable back to the exact commit that produced it. The file
// is written into the deploy folder at publish time (it is NOT committed).
//
// SAFETY: this file is served publicly. It must only ever contain metadata that
// is already public (the app version, the git SHA/ref, a timestamp, the deploy
// target, and the CI run id). Never add secrets, tokens, user data, or private
// infrastructure identifiers here.
//
// Usage:
//   node scripts/generate-version-json.mjs <output-path>
// Environment (all optional; falls back to local git / sensible defaults):
//   GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, DEPLOY_TARGET

import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function gitFallback(args) {
  try {
    return execSync(`git ${args}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));

const metadata = {
  name: pkg.name ?? 'shohoj',
  version: pkg.version ?? '0.0.0',
  commit: process.env.GITHUB_SHA || gitFallback('rev-parse HEAD') || 'unknown',
  ref: process.env.GITHUB_REF || gitFallback('rev-parse --abbrev-ref HEAD') || 'unknown',
  buildTime: new Date().toISOString(),
  target: process.env.DEPLOY_TARGET || 'github-pages-production',
  runId: process.env.GITHUB_RUN_ID || null,
};

const outPath = resolve(process.cwd(), process.argv[2] || 'version.json');
writeFileSync(outPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(metadata, null, 2));
