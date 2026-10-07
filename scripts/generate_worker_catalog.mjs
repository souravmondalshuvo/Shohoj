#!/usr/bin/env node
// scripts/generate_worker_catalog.mjs
//
// Generates worker/catalog.generated.js — the Worker's authoritative,
// server-controlled set of each campus's course codes.
//
// WHY THIS EXISTS
// The Worker used to accept any course code matching /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/.
// That is a shape check, not an existence check: "ZZZ999" passes it. A caller
// could therefore mint review rows and R2 object prefixes for courses that do
// not exist, which is both a junk-data vector and an unbounded namespace in the
// bucket. Validating against the real catalogue closes that.
//
// BRACU's catalogue is read from js/core/catalog.js (the one copy the legacy
// bundle and the React shell share, itself generated from data/campuses/bracu);
// NSU's from data/campuses/nsu, mapped by scripts/legacy_catalog.mjs exactly as
// the client's copy is. We copy
// the CODES and their CREDIT VALUES into a small generated module, so the
// Worker bundle carries ~23 KB rather than importing whole catalogues with
// their names and prerequisites.
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
const { loadCampuses } = await import('./campus_data.mjs');
const { buildLegacyCatalog } = await import('./legacy_catalog.mjs');

// Every code must satisfy the Worker's shape regex too; a catalogue entry that
// does not would silently become unreachable, so fail loudly instead.
const SHAPE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;

/**
 * code -> credits for one campus's catalogue (`courses` is code -> { credits }).
 *
 * A course whose credits are missing or not a finite number is a catalogue
 * bug: enrolments would record `null` workload for it and the failure would
 * surface much later, as a quietly wrong number on a student's plan. Fail here
 * instead.
 */
function creditTable(courses, label) {
  const codes = Object.keys(courses).sort();
  if (codes.length === 0) {
    console.error(`refusing to generate an empty ${label} catalogue — is its source intact?`);
    process.exit(1);
  }
  const credits = {};
  const badCredits = [];
  for (const code of codes) {
    const value = courses[code]?.credits;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 12) {
      badCredits.push(`${code}=${JSON.stringify(value)}`);
      continue;
    }
    credits[code] = value;
  }
  if (badCredits.length > 0) {
    console.error(`${label} catalogue entries with unusable credits: ${badCredits.join(', ')}`);
    process.exit(1);
  }
  const malformed = codes.filter((c) => !SHAPE.test(c));
  if (malformed.length > 0) {
    console.error(
      `${label} catalogue contains codes the Worker regex rejects: ${malformed.join(', ')}`,
    );
    process.exit(1);
  }
  return credits;
}

// BRACU's catalogue is the legacy literals. NSU's is built from the campus
// database by the same mapping that generates the client's NSU catalogue
// (js/core/catalogNsu.generated.js), so the code a student's browser accepts
// is the code the Worker accepts.
const { campuses, errors } = loadCampuses();
if (errors.length > 0) {
  console.error(`data/campuses has errors; refusing to generate from it:\n${errors.join('\n')}`);
  process.exit(1);
}
const credits = creditTable(COURSE_DB, 'BRACU');
const nsuCredits = creditTable(
  buildLegacyCatalog(campuses.find((c) => c.id === 'nsu')).courses,
  'NSU',
);

const banner = `// worker/catalog.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:worker-catalog
// Source of truth: js/core/catalog.js (COURSE_DB) for BRACU, and
// data/campuses/nsu via scripts/legacy_catalog.mjs for NSU
//
// The authoritative set of each campus's course codes and their credit values.
// Used by the Worker to reject syntactically-valid-but-nonexistent courses on
// /upload and /reviews — against the caller's own campus — and to stamp
// credits onto /api/v1 enrolments from a server-controlled table rather than
// from the client.
// ${Object.keys(credits).length} BRACU courses, ${Object.keys(nsuCredits).length} NSU courses.

`;

// One map per campus, and the credit table IS the code list, so the file
// cannot contain a course that has one and not the other.
const body = `export const COURSE_CREDITS = ${JSON.stringify(credits, null, 0)};

export const NSU_COURSE_CREDITS = ${JSON.stringify(nsuCredits, null, 0)};

export const KNOWN_COURSE_CODES = new Set(Object.keys(COURSE_CREDITS));

const CAMPUS_COURSE_CREDITS = { bracu: COURSE_CREDITS, nsu: NSU_COURSE_CREDITS };

const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** One campus's credit table, or null for a campus with no catalogue. */
function tableFor(campus) {
  return typeof campus === 'string' && owns(CAMPUS_COURSE_CREDITS, campus)
    ? CAMPUS_COURSE_CREDITS[campus]
    : null;
}

/**
 * True when \`code\` is a real course on \`campus\`, not merely a well-shaped
 * string. BRACU when no campus is given; a campus with no catalogue has no
 * known courses.
 */
export function isKnownCourse(code, campus = 'bracu') {
  const table = tableFor(campus);
  return typeof code === 'string' && table !== null && owns(table, code);
}

/** Credits for a known course on \`campus\`, or null. Never guesses a default. */
export function creditsForCourse(code, campus = 'bracu') {
  const table = tableFor(campus);
  return typeof code === 'string' && table !== null && owns(table, code) ? table[code] : null;
}
`;

const next = banner + body;
const summary = `${Object.keys(credits).length} BRACU, ${Object.keys(nsuCredits).length} NSU courses`;

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
      '✗ worker/catalog.generated.js is out of date with js/core/catalog.js or data/campuses/nsu.\n' +
        '  Run: npm run generate:worker-catalog',
    );
    process.exit(1);
  }
  console.log(`✅ worker catalogue in sync (${summary}).`);
  process.exit(0);
}

writeFileSync(outPath, next);
console.log(`✅ wrote worker/catalog.generated.js (${summary}).`);
