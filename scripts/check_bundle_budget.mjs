#!/usr/bin/env node
// Bundle size budgets — the ratchet that keeps the download from growing unwatched.
//
// Vite prints a 500 kB warning on every build and blocks nothing, and the page
// GitHub Pages actually serves (shohoj.html, 1.66 MB gzipped) had no limit at
// all. Each budget below was measured, not guessed; raising one is a commit
// someone reviews.
//
// What is enforced: gzip for what crosses the wire, and raw where parse and
// execute cost matters (the browser pays that on the uncompressed bytes).
//
// Usage:
//   npm run check:bundle-size          # after build3.py, build:vite, build:shell
//
// A missing artifact is a failure, not a skip: a check that quietly does nothing
// is how a preflight went unnoticed for months (#675).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Budgets in kB. `measured` records what the artifact was when the budget was
 * set, so the headroom is visible and drift is obvious in review.
 *
 * Figures measured in CI (ubuntu-latest, Node 24) on main @ a87b6690 — CI is the
 * environment that gates merges. A local build differs a few kB either way: JS
 * minifies ~15 kB smaller there, gzip runs ~8 kB larger (different Node and zlib).
 * Where the two disagree the budget takes the larger, so neither trips on the
 * difference alone.
 */
export const TARGETS = [
  // The page GitHub Pages serves. Biggest thing any student downloads.
  {
    label: 'shohoj.html (deployed)',
    file: 'shohoj.html',
    build: 'python3 build3.py',
    measured: { raw: 3406, gzip: 1656 },
    budget: { raw: 3580, gzip: 1740 },
  },
  {
    label: 'admin.html',
    file: 'admin.html',
    build: 'python3 build3.py',
    measured: { gzip: 116 },
    budget: { gzip: 125 },
  },
  {
    label: 'profile.html',
    file: 'profile.html',
    build: 'python3 build3.py',
    measured: { gzip: 125 },
    budget: { gzip: 135 },
  },
  // Vite islands entry — not deployed today, but it is what Phase 10 tracked.
  {
    label: 'vite main entry',
    dir: 'dist/assets',
    match: /^main-.*\.js$/,
    build: 'npm run build:vite',
    measured: { raw: 946, gzip: 274 },
    budget: { raw: 995, gzip: 288 },
  },
  // The shell entry — what a student would download after the cutover.
  {
    label: 'shell entry',
    dir: 'dist-shell/assets',
    match: /^index-.*\.js$/,
    build: 'npm run build:shell',
    measured: { raw: 443, gzip: 138 },
    budget: { raw: 465, gzip: 146 },
  },
  {
    label: 'shell stylesheet',
    dir: 'dist-shell/assets',
    match: /^index-.*\.css$/,
    build: 'npm run build:shell',
    measured: { gzip: 40 },
    budget: { gzip: 43 },
  },
  // Every shell chunk together: catches growth that merely moves between chunks.
  {
    label: 'shell JS, all chunks',
    dir: 'dist-shell/assets',
    match: /\.js$/,
    all: true,
    build: 'npm run build:shell',
    measured: { raw: 1935 },
    budget: { raw: 2035 },
  },
];

const kb = (bytes) => bytes / 1024;

/** Resolve a target to the files it covers. Throws when nothing matches. */
export function resolveFiles(target, root = ROOT) {
  if (target.file) {
    const full = path.join(root, target.file);
    statSync(full);
    return [full];
  }
  const dir = path.join(root, target.dir);
  const names = readdirSync(dir).filter((n) => target.match.test(n));
  if (names.length === 0) throw new Error(`no file in ${target.dir} matches ${target.match}`);
  if (!target.all && names.length > 1) {
    throw new Error(
      `${names.length} files in ${target.dir} match ${target.match}: ${names.join(', ')}`,
    );
  }
  return names.map((n) => path.join(dir, n));
}

export function measure(files) {
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const bytes = readFileSync(f);
    raw += bytes.length;
    gzip += gzipSync(bytes).length;
  }
  return { raw: kb(raw), gzip: kb(gzip) };
}

/**
 * Compare one target's sizes with its budget.
 * Over budget in either dimension fails; headroom is reported either way.
 */
export function judge(target, sizes) {
  const checks = [];
  for (const kind of ['raw', 'gzip']) {
    const budget = target.budget?.[kind];
    if (budget === undefined) continue;
    const actual = sizes[kind];
    checks.push({
      kind,
      actual,
      budget,
      over: actual > budget,
      headroomPct: ((budget - actual) / budget) * 100,
      grewSinceMeasured:
        target.measured?.[kind] !== undefined ? actual - target.measured[kind] : null,
    });
  }
  return { label: target.label, checks, failed: checks.some((c) => c.over) };
}

function main() {
  const rows = [];
  const missing = [];
  for (const target of TARGETS) {
    let files;
    try {
      files = resolveFiles(target);
    } catch (err) {
      missing.push(`${target.label}: ${err.message} — run \`${target.build}\``);
      continue;
    }
    rows.push(judge(target, measure(files)));
  }

  const fmt = (n) => `${n.toFixed(1)} kB`.padStart(10);
  console.log('\nBundle size budgets\n');
  console.log(
    `  ${'artifact'.padEnd(24)} ${'kind'.padEnd(5)} ${'actual'.padStart(10)} ${'budget'.padStart(10)}   headroom   since set`,
  );
  for (const row of rows) {
    for (const c of row.checks) {
      const drift =
        c.grewSinceMeasured === null
          ? ''
          : `${c.grewSinceMeasured >= 0 ? '+' : ''}${c.grewSinceMeasured.toFixed(1)} kB`;
      console.log(
        `  ${row.label.padEnd(24)} ${c.kind.padEnd(5)} ${fmt(c.actual)} ${fmt(c.budget)}   ` +
          `${`${c.headroomPct.toFixed(1)}%`.padStart(7)}   ${drift.padStart(9)}   ${c.over ? '✗ OVER' : ''}`,
      );
    }
  }
  console.log('');

  const over = rows.filter((r) => r.failed);
  for (const m of missing) console.error(`✗ ${m}`);
  for (const row of over) {
    for (const c of row.checks.filter((x) => x.over)) {
      console.error(
        `✗ ${row.label} ${c.kind} is ${c.actual.toFixed(1)} kB, over its ${c.budget} kB budget.`,
      );
    }
  }
  if (over.length || missing.length) {
    console.error(
      '\nMake it smaller, or raise the budget in scripts/check_bundle_budget.mjs as a' +
        '\ndeliberate commit that says why.\n',
    );
    process.exit(1);
  }
  console.log('✅ Every bundle is within budget.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
