// vite/seed-injection.js
//
// Vite plugin that injects seed data into js/core/reviews.js and
// js/core/faculty.js at build/dev time — the same way build3.py does for the
// static shohoj.html bundle. The source files keep their placeholder lines
// unchanged, so build3.py continues to work identically; this plugin performs
// the exact same transform for the Vite path.
//
// Parity with build3.py (build3.py:230-293) is asserted by
// tests/seedInjectionParity.test.js.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const REVIEWS_PLACEHOLDER = 'const SEEDED_REVIEWS = []; // injected by build3.py';
const PROFILES_PLACEHOLDER = 'const SEEDED_FACULTY_PROFILES = []; // injected by build3.py';

const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];

// Python's round() uses banker's rounding (round half to even); JS Math.round
// rounds half up. build3.py runs round() on each rating, so we mirror Python to
// stay byte-identical even if fractional ratings ever appear in the seed data.
function pythonRound(value) {
  const n = Number(value);
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly .5 → round to even.
  return floor % 2 === 0 ? floor : floor + 1;
}

function readJsonl(text) {
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line) rows.push(JSON.parse(line));
  }
  return rows;
}

// Mirror build3.py:250-293.
export function buildSeededReviews(jsonlText) {
  const reviews = [];
  let idx = 0;
  for (const row of readJsonl(jsonlText)) {
    idx += 1;
    const initials = String(row.facultyInitials ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 6);
    const course = String(row.courseCode ?? '').trim().toUpperCase();
    const text = String(row.text ?? '').trim().slice(0, 500);
    const source = String(row.sourceUrl ?? '');
    const digest = createHash('sha256')
      .update(`seeded-input-v1|${idx}|${initials}|${course}|${text}|${source}`, 'utf8')
      .digest('hex');
    const ratings = row.ratings ?? {};
    const out = {};
    for (const key of RATING_KEYS) out[key] = pythonRound(ratings[key]);
    reviews.push({
      id: `${initials}_${course}_${digest}`,
      facultyInitials: initials,
      courseCode: course,
      semester: String(row.semester ?? '').trim().slice(0, 40),
      ratings: out,
      text,
      createdAt: 1775000000000 - idx,
      seeded: true,
    });
  }
  return reviews;
}

// Mirror build3.py:230-248 (profiles injected as-is).
export function buildSeededProfiles(jsonlText) {
  return readJsonl(jsonlText);
}

function readDataFile(relPath) {
  try {
    return readFileSync(resolve(repoRoot, relPath), 'utf8');
  } catch {
    return null;
  }
}

export default function seedInjection() {
  return {
    name: 'shohoj-seed-injection',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.split('?')[0];

      if (normalized.endsWith('js/core/reviews.js') && code.includes(REVIEWS_PLACEHOLDER)) {
        const jsonl = readDataFile('data/input_reviews.jsonl');
        const reviews = jsonl ? buildSeededReviews(jsonl) : [];
        const replacement = `const SEEDED_REVIEWS = ${JSON.stringify(reviews)};`;
        return { code: code.replace(REVIEWS_PLACEHOLDER, replacement), map: null };
      }

      if (normalized.endsWith('js/core/faculty.js') && code.includes(PROFILES_PLACEHOLDER)) {
        const jsonl = readDataFile('data/faculty_profiles.jsonl');
        const profiles = jsonl ? buildSeededProfiles(jsonl) : [];
        const replacement = `const SEEDED_FACULTY_PROFILES = ${JSON.stringify(profiles)};`;
        return { code: code.replace(PROFILES_PLACEHOLDER, replacement), map: null };
      }

      return null;
    },
  };
}
