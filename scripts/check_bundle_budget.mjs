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
    // Raw raised from 3580 for Shohoj Tasks on the legacy page (#767), all five
    // phases at once so the stacked PRs do not each trip it. CI measured 3540
    // with phase 2; phases 3-5 add ~54 kB locally (the announcement detector,
    // calendar and digest), projecting ~3594. Gzip is unchanged: the projected
    // ~1698 still sits under 1740.
    budget: { raw: 3680, gzip: 1740 },
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
    // Raised from 995/288 for the same Tasks port (#767): the legacy modules
    // it adds are in this entry too. CI measured 993/288.4 with phase 2;
    // phases 3-5 add ~25/7 kB locally, projecting ~1019/296.
    budget: { raw: 1045, gzip: 303 },
  },
  // The shell entry — what a student would download after the cutover.
  {
    label: 'shell entry',
    dir: 'dist-shell/assets',
    match: /^index-.*\.js$/,
    build: 'npm run build:shell',
    // Raised from 465/146 for the minor tracker (#731), and the reason matters
    // more than the number: almost none of this is new first-paint work.
    //
    // The minor feature is lazy — it lands in the DegreeRoute chunk (1.7 kB ->
    // 11.7 kB), not here. What grew this entry is a chunk BOUNDARY moving.
    // DegreeRoute used to import calculatorState directly; it now reads the
    // shared CalculatorProvider instead, which left calculatorState with a
    // single importer, so Rollup inlined it into the entry rather than emitting
    // the shared chunk it used to (48 chunks -> 46). Those bytes were already
    // downloaded by the entry before, as a separate file it imported. The
    // boundary moved; the work a student waits for did not.
    //
    // `shell JS, all chunks` below is the honest total, and it grew by only
    // ~7 kB for the whole feature. If this entry number rises again WITHOUT a
    // matching rise there, that is a real regression and not this case.
    //
    // Recorded from CI, which is where the gate runs — it measures ~16 kB above
    // a local build off the same tree, because `npm ci` resolves dependencies
    // that a working node_modules may not match exactly.
    measured: { raw: 469, gzip: 147 },
    budget: { raw: 490, gzip: 154 },
  },
  {
    label: 'shell stylesheet',
    dir: 'dist-shell/assets',
    match: /^index-.*\.css$/,
    build: 'npm run build:shell',
    // Re-measured 2026-09-23 at 42.6 kB. Phases 7a-7c each added a panel to
    // the Tasks route — import, the AI offer, the calendar subscription — and
    // the 43 kB ceiling was down to 0.4 kB of room, which fails the NEXT
    // change rather than the one that used it up. Raised with the same
    // headroom the original had (~7%), not to whatever happens to fit.
    measured: { gzip: 42.6 },
    budget: { gzip: 46 },
  },
  // Every shell chunk together: catches growth that merely moves between chunks.
  {
    label: 'shell JS, all chunks',
    dir: 'dist-shell/assets',
    match: /\.js$/,
    all: true,
    build: 'npm run build:shell',
    // Raised from 2035 with Shohoj Tasks complete (#710-#729), which took this
    // to 2015 — 1.0% headroom, enough to block the next feature of any size.
    //
    // Worth knowing what this number is before reading a change to it: it sums
    // EVERY chunk, not what a visit downloads. 599 kB of it — 30% — is the
    // Three.js campus map, which is correctly lazy and only loads on /campus.
    // Tasks contributed ~80 kB, all of it in lazily-loaded route chunks.
    //
    // The number that governs load time is `shell entry` above, and it did NOT
    // grow: 137.4 kB gzip, slightly UNDER its recorded baseline, with 5.9%
    // headroom. So this ceiling is total artifact weight, not a regression in
    // what students wait for — which is why it is raised rather than chased.
    //
    // If it tightens again, the campus chunk is the place to look first.
    //
    // (#731 did move `shell entry` afterwards, but by relocating a chunk
    // boundary rather than by adding first-paint work — see the note there.
    // The claim above still holds for the Tasks work it was written about.)
    //
    // Raised from 2120 for the campus exterior model (#750): three's
    // GLTFLoader (~70 kB raw, ~19 kB gzip) joins the lazy campus chunk — the
    // place the note above says to look. `shell entry` is untouched (449.8 kB
    // raw / 140.8 kB gzip at the time), and the 1.8 MB model itself is a
    // separate asset fetched after the map's first paint, not JS.
    measured: { raw: 2123 },
    budget: { raw: 2200 },
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
