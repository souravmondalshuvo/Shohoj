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
// by the legacy bundle and the React shell). We copy the CODES and their CREDIT
// VALUES into a tiny generated module, so the Worker bundle carries ~14 KB
// rather than importing the whole catalogue with its names and prerequisites.
//
// Credits are here because /api/v1 enrolments record what a course was worth at
// enrolment time (#712). That number feeds workload and, eventually, grade
// impact — so it has to come from a server-controlled table rather than from
// whatever the client says. Names are still omitted: the frontend already ships
// the full catalogue and renders them from there, so sending them over the wire
// would be a slower path to data the client already has.
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

// code -> credits. A course whose credits are missing or not a finite number is
// a catalogue bug: enrolments would record `null` workload for it and the
// failure would surface much later, as a quietly wrong number on a student's
// plan. Fail here instead.
const credits = {};
const badCredits = [];
for (const code of codes) {
  const value = COURSE_DB[code]?.credits;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 12) {
    badCredits.push(`${code}=${JSON.stringify(value)}`);
    continue;
  }
  credits[code] = value;
}
if (badCredits.length > 0) {
  console.error(`catalogue entries with unusable credits: ${badCredits.join(', ')}`);
  process.exit(1);
}
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
// The authoritative set of BRACU course codes and their credit values. Used by
// the Worker to reject syntactically-valid-but-nonexistent courses on /upload
// and /reviews, and to stamp credits onto /api/v1 enrolments from a
// server-controlled table rather than from the client.
// ${codes.length} courses.

`;

// One map, two exports: the credit table IS the code list, so the file cannot
// contain a course that has one and not the other.
const body = `export const COURSE_CREDITS = ${JSON.stringify(credits, null, 0)};

export const KNOWN_COURSE_CODES = new Set(Object.keys(COURSE_CREDITS));

/** True when \`code\` is a real BRACU course, not merely a well-shaped string. */
export function isKnownCourse(code) {
  return typeof code === 'string' && KNOWN_COURSE_CODES.has(code);
}

/** Credits for a known course, or null. Never guesses a default. */
export function creditsForCourse(code) {
  if (typeof code !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(COURSE_CREDITS, code)
    ? COURSE_CREDITS[code]
    : null;
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
