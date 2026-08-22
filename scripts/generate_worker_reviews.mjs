#!/usr/bin/env node
// scripts/generate_worker_reviews.mjs
//
// Generates worker/reviews.generated.js — the Worker's copy of the seeded
// faculty-review corpus, so the Assistant can answer "is this faculty good?"
// with the same numbers the Routine Builder already puts on screen.
//
// WHY THIS EXISTS
// The ★ ratings students see in the Routine Builder do NOT come from Firestore.
// data/input_reviews.jsonl is injected straight into the browser bundle by
// build3.py (`SEEDED_REVIEWS`), deliberately not seeded into the
// `facultyReviews` collection — seeding it there would double-display every
// review. The Worker only has Firestore, so without this file the Assistant
// would answer "no reviews for SUE" while the grid behind the chat panel shows
// 4.8. That contradiction is issue #579.
//
// WHAT IS DELIBERATELY LEFT OUT
// The review TEXT. The Assistant is aggregates-only by design: student-written
// free text is attacker-controlled input, and feeding it to the model would
// punch a hole in the one invariant the Assistant is built around — that no
// data path reaches anything but this student's own record. Ratings are
// numbers; numbers cannot carry instructions. The text stays in the browser,
// where a human reads it and no model acts on it.
//
// Ids are still derived from the text, byte for byte as build3.py derives them,
// so a Worker-side seed and a browser-side seed for the same row agree. The
// digest is computed HERE, at generation time; only the resulting id ships.
//
// Run:      npm run generate:worker-reviews
// Verify:   npm run check:worker-reviews   (CI drift guard — regenerates and
//                                           diffs, so the Worker can never fall
//                                           behind a corpus update)

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outPath = resolve(repoRoot, 'worker/reviews.generated.js');

const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];

/**
 * The id build3.py stamps on a seeded review. Kept identical on purpose: the
 * two corpora are the same rows, so they must carry the same identity or a
 * future merge would count a review twice. `idx` is 1-based line number.
 */
function seededReviewId(idx, initials, course, text, source) {
  const digest = createHash('sha256')
    .update(`seeded-input-v1|${idx}|${initials}|${course}|${text}|${source}`, 'utf8')
    .digest('hex');
  return `${initials}_${course}_${digest}`;
}

function readJsonl(path) {
  const rows = [];
  const raw = readFileSync(path, 'utf8');
  raw.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      rows.push({ row: JSON.parse(trimmed), lineNo: i + 1 });
    } catch (e) {
      console.error(`${path}:${i + 1} is not valid JSON — ${e.message}`);
      process.exit(1);
    }
  });
  return rows;
}

// ── Reviews ───────────────────────────────────────────────────────────────────
// build3.py's normalisation, mirrored: strip non-letters from initials and cap
// at 6, upper-case the course, cap text at 500 chars BEFORE hashing (the cap is
// part of the hashed value), and count rows from 1 including blank lines.
const reviewRows = readJsonl(resolve(repoRoot, 'data/input_reviews.jsonl'));
if (reviewRows.length === 0) {
  console.error('refusing to generate an empty corpus — is data/input_reviews.jsonl intact?');
  process.exit(1);
}

const reviews = reviewRows.map(({ row, lineNo }) => {
  const initials = String(row.facultyInitials || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
  const courseCode = String(row.courseCode || '')
    .trim()
    .toUpperCase();
  const text = String(row.text || '')
    .trim()
    .slice(0, 500);
  const source = String(row.sourceUrl || '');
  const src = row.ratings || {};
  const ratings = {};
  for (const k of RATING_KEYS) {
    ratings[k] = typeof src[k] === 'number' ? Math.round(src[k]) : null;
  }
  return {
    id: seededReviewId(lineNo, initials, courseCode, text, source),
    facultyInitials: initials,
    courseCode,
    ratings,
    // Mirrors build3.py's synthetic ordering: seeds sort below anything real.
    createdAt: 1775000000000 - lineNo,
  };
});

const unrated = reviews.filter((r) => RATING_KEYS.every((k) => r.ratings[k] === null));
if (unrated.length > 0) {
  console.error(`${unrated.length} seeded review(s) carry no ratings at all — check the corpus.`);
  process.exit(1);
}

// ── Faculty names ─────────────────────────────────────────────────────────────
// Only initials appear in the CONNECT feed, so the Assistant needs the display
// name to answer "who is SUE?" readably. Names only — the profile rows also
// carry email addresses, and there is no reason to put staff contact details in
// a model's context window.
const names = {};
for (const { row } of readJsonl(resolve(repoRoot, 'data/faculty_profiles.jsonl'))) {
  const initials = String(row.initials || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
  const name = String(row.name || '').trim();
  if (initials && name) names[initials] = name;
}

const sortedNames = Object.fromEntries(Object.entries(names).sort(([a], [b]) => (a < b ? -1 : 1)));

const banner = `// worker/reviews.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:worker-reviews
// Source of truth: data/input_reviews.jsonl + data/faculty_profiles.jsonl
//
// The seeded faculty-review corpus, ratings only, for the Assistant's
// get_faculty_rating tool (#579). Review TEXT is deliberately absent: the
// Assistant answers from aggregates so that student-written prose never reaches
// the model. Ids match the ones build3.py stamps on the browser-side copy.
// ${reviews.length} reviews, ${Object.keys(sortedNames).length} faculty names.

`;

const body = `export const SEEDED_REVIEWS = ${JSON.stringify(reviews, null, 0)};

export const SEEDED_FACULTY_NAMES = ${JSON.stringify(sortedNames, null, 0)};

function normalizeKey(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}

/** Seeded reviews for one faculty, optionally narrowed to a single course. */
export function seededReviewsForFaculty(initials, courseCode = '') {
  const key = normalizeKey(initials);
  if (!key) return [];
  const scope = String(courseCode || '')
    .trim()
    .toUpperCase();
  return SEEDED_REVIEWS.filter(
    (r) => r.facultyInitials === key && (!scope || r.courseCode === scope),
  );
}

/** Display name for a faculty member, or '' when the directory has no entry. */
export function seededFacultyName(initials) {
  return SEEDED_FACULTY_NAMES[normalizeKey(initials)] || '';
}
`;

const next = banner + body;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    console.error(`✗ ${outPath} is missing. Run: npm run generate:worker-reviews`);
    process.exit(1);
  }
  if (current !== next) {
    console.error(
      '✗ worker/reviews.generated.js is out of date with data/input_reviews.jsonl.\n' +
        '  Run: npm run generate:worker-reviews',
    );
    process.exit(1);
  }
  console.log(`✅ worker review corpus in sync (${reviews.length} reviews).`);
  process.exit(0);
}

writeFileSync(outPath, next);
console.log(
  `✅ wrote worker/reviews.generated.js (${reviews.length} reviews, ${Object.keys(sortedNames).length} names).`,
);
