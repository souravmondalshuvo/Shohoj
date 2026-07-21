#!/usr/bin/env node
// scripts/generate_worker_catalog.mjs
//
// Generates worker/catalog.generated.js — the Worker's authoritative,
// server-controlled set of BRACU course codes.
//
// WHY THIS EXISTS
// The Worker used to accept any course code matching /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.
// That is a shape check, not an existence check: "ZZZ999" passes it. A caller
// could therefore mint review rows and R2 object prefixes for courses that do
// not exist, which is both a junk-data vector and an unbounded namespace in the
// bucket. Validating against the real catalogue closes that.
//
// The catalogue lives in js/core/catalog.js (the single source of truth shared
// by the legacy bundle and the React shell). We copy just the CODES into a tiny
// generated module so the Worker bundle carries ~8 KB of strings rather than
// importing the whole catalogue with its names, credits and prerequisites.
//
// Run:      npm run generate:worker-catalog
// Verify:   npm run check:worker-catalog   (CI drift guard — regenerates and
//                                           diffs, so the Worker can never fall
//                                           behind a catalogue update)

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outPath = resolve(repoRoot, 'worker/catalog.generated.js');

const { COURSE_DB } = await import(resolve(repoRoot, 'js/core/catalog.js'));

const codes = Object.keys(COURSE_DB).sort();
if (codes.length === 0) {
  console.error('refusing to generate an empty catalogue — is js/core/catalog.js intact?');
  process.exit(1);
}

// Every code must satisfy the Worker's shape regex too; a catalogue entry that
// does not would silently become unreachable, so fail loudly instead.
const SHAPE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const malformed = codes.filter((c) => !SHAPE.test(c));
if (malformed.length > 0) {
  console.error(`catalogue contains codes the Worker regex rejects: ${malformed.join(', ')}`);
  process.exit(1);
}

const banner = `// worker/catalog.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:worker-catalog
// Source of truth: js/core/catalog.js (COURSE_DB)
//
// The authoritative set of BRACU course codes, used by the Worker to reject
// syntactically-valid-but-nonexistent courses on /upload and /reviews.
// ${codes.length} courses.

`;

const body = `export const KNOWN_COURSE_CODES = new Set(${JSON.stringify(codes, null, 0)});

/** True when \`code\` is a real BRACU course, not merely a well-shaped string. */
export function isKnownCourse(code) {
  return typeof code === 'string' && KNOWN_COURSE_CODES.has(code);
}
`;

const next = banner + body;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    console.error(`✗ ${outPath} is missing. Run: npm run generate:worker-catalog`);
    process.exit(1);
  }
  if (current !== next) {
    console.error(
      '✗ worker/catalog.generated.js is out of date with js/core/catalog.js.\n' +
        '  Run: npm run generate:worker-catalog',
    );
    process.exit(1);
  }
  console.log(`✅ worker catalogue in sync (${codes.length} courses).`);
  process.exit(0);
}

writeFileSync(outPath, next);
console.log(`✅ wrote worker/catalog.generated.js (${codes.length} courses).`);
