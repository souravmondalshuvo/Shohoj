#!/usr/bin/env node
/**
 * scripts/run-tests.mjs — auto-discovering test runner.
 *
 * Runs every `tests/*.test.js` (and `worker/test/*.test.js`) with `node`,
 * sequentially, fail-fast. New test files are picked up automatically — you
 * never edit a shared list in package.json to add a test, which is what used
 * to cause merge conflicts on every stacked PR.
 *
 * Two files are intentionally NOT run here because they need a different
 * harness; they have their own npm scripts:
 *   - firestore.rules.test.js  → `npm run test:rules`  (Firestore emulator)
 *   - backfillCampus.test.js   → `npm run test:backfill` (Firestore emulator)
 *   - productionBundleSmoke.test.js → `npm run test:bundle` (needs a build)
 *
 * Usage:
 *   node scripts/run-tests.mjs           # run all discovered tests
 *   node scripts/run-tests.mjs reviews   # run only tests whose name matches
 */

import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Files that must NOT run via this generic runner (they need a special harness).
const EXCLUDE = new Set([
  'firestore.rules.test.js', // needs the Firestore emulator → npm run test:rules
  'backfillCampus.test.js', // needs the Firestore emulator → npm run test:backfill
  'productionBundleSmoke.test.js', // needs a built bundle → npm run test:bundle
  'cspInlineHandlers.test.js', // needs a built bundle → npm run test:csp
]);

// Directories scanned for `*.test.js`. Add a directory here once; individual
// files inside are then auto-discovered forever.
const TEST_DIRS = ['tests', 'worker/test'];

function discover() {
  const found = [];
  for (const dir of TEST_DIRS) {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, dir));
    } catch {
      continue; // directory may not exist in every checkout
    }
    for (const name of entries) {
      if (!name.endsWith('.test.js')) continue;
      if (EXCLUDE.has(name)) continue;
      found.push(path.join(dir, name));
    }
  }
  // Stable, deterministic order so output is reproducible across machines.
  found.sort();
  return found;
}

// The worker is its own npm package (worker/package.json), so its dependencies
// live in worker/node_modules and a root `npm ci` does not install them. Without
// them worker/test/*.test.js dies on an opaque ERR_MODULE_NOT_FOUND naming a
// package that *is* correctly declared, which reads like a missing dependency
// and sends you hunting through the root package.json for a bug that isn't
// there. Fail early on the real cause instead. CI installs both (see ci.yml).
function requireWorkerDeps(files) {
  if (!files.some((f) => f.split(path.sep)[0] === 'worker')) return;
  if (existsSync(path.join(ROOT, 'worker', 'node_modules'))) return;

  console.error(
    'worker/node_modules is missing — the worker is a separate npm package,\n' +
      'so its dependencies are not installed by a root `npm ci`.\n\n' +
      '  npm ci --prefix worker\n\n' +
      'Then re-run this command.',
  );
  process.exit(1);
}

function main() {
  const filter = process.argv[2];
  let files = discover();
  if (filter) {
    files = files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()));
  }

  if (files.length === 0) {
    console.error(filter ? `No test files match "${filter}".` : 'No test files discovered.');
    process.exit(1);
  }

  requireWorkerDeps(files);

  console.log(`Running ${files.length} test file${files.length === 1 ? '' : 's'}:\n`);

  const failed = [];
  for (const file of files) {
    console.log(`\n── ${file} ${'─'.repeat(Math.max(0, 56 - file.length))}`);
    const result = spawnSync('node', [file], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) {
      failed.push(file);
      // Fail fast: a broken test usually means the rest are noise.
      break;
    }
  }

  console.log('\n' + '═'.repeat(60));
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`All ${files.length} test file${files.length === 1 ? '' : 's'} passed ✓`);
}

main();
