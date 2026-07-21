#!/usr/bin/env node
// scripts/validate_data.mjs (#241)
//
// Validates the source datasets in data/*.jsonl BEFORE they're bundled by
// build3.py or seeded to Firestore. build3.py trusts these files (it calls
// round(rating) with no guard, keys faculty docs by `initials`, etc.), so a bad
// row can break the build or silently corrupt the public caches. This is the
// guard rail.
//
// Usage:
//   node scripts/validate_data.mjs                 # validate, human report
//   node scripts/validate_data.mjs --dry-run       # same, but never writes
//   node scripts/validate_data.mjs --strict        # warnings fail too (exit 1)
//   node scripts/validate_data.mjs --add-provenance # stamp missing provenance
//   node scripts/validate_data.mjs --json          # machine-readable report
//
// Exit codes: 0 = clean (or warnings only), 1 = errors (or any issue --strict),
// 2 = could not read/parse a file.
//
// PRIVACY: faculty reviews are pseudonymous — the docs store NO uid. This script
// never prints review `text` or anything author-identifying; review findings are
// reported by line number + non-identifying fields (initials/course) only.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

// ── Canonical lookups (mirror src/core/catalog.ts + js/ui/reviewsTab.js) ───────
// The department codes the public faculty/reviews UI groups by. A faculty `dept`
// outside this set renders ungrouped (raw code), so it's a data-quality warning.
export const CANON_DEPTS = new Set([
  'CSE',
  'EEE',
  'ECE',
  'MPS',
  'BBA',
  'ENG',
  'ECO',
  'ANT',
  'ARC',
  'PHR',
  'LLB',
  'GENED',
]);

// Course-code prefix → department. Trimmed mirror of PREFIX_DEPT_MAP; used to
// flag course codes whose prefix maps to no known department.
export const KNOWN_PREFIXES = new Set([
  'CSE',
  'EEE',
  'ECE',
  'MAT',
  'PHY',
  'STA',
  'ENV',
  'MIC',
  'BCH',
  'BTE',
  'BIO',
  'APE',
  'CHE',
  'GEO',
  'ACT',
  'BUS',
  'FIN',
  'MGT',
  'MKT',
  'MIS',
  'MSC',
  'ENG',
  'HST',
  'ECO',
  'SOC',
  'ANT',
  'ARC',
  'CEE',
  'MEE',
  'PHI',
  'PHB',
  'PHR',
  'LAW',
  'BNG',
  'EMB',
  'CST',
  'FRN',
  'DEV',
  'POL',
  'PSY',
  'HUM',
  'CHN',
  'JPN',
  'SPN',
]);

// Mirrors the strict shapes enforced by firestore.rules / the worker.
const INITIALS_RE = /^[A-Z]{2,6}$/;
const COURSE_CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RATING_KEYS = ['teaching', 'marking', 'behavior', 'difficulty', 'workload'];
const PAPER_TYPES = new Set(['midterm', 'final', 'quiz', 'notes', 'assignment', 'lab', 'lab-quiz']);
const MAX_PAPER_BYTES = 10 * 1024 * 1024; // mirrors worker MAX_UPLOAD_BYTES
const MAX_TEXT = 500;
const MAX_SEMESTER = 40;
const MAX_TITLE = 200;

// ── Small pure helpers (exported for tests) ────────────────────────────────────
export function isValidCourseCode(code) {
  return typeof code === 'string' && COURSE_CODE_RE.test(code);
}
export function isValidInitials(s) {
  return typeof s === 'string' && INITIALS_RE.test(s);
}
export function coursePrefix(code) {
  const m = String(code)
    .toUpperCase()
    .match(/^([A-Z]+)/);
  return m ? m[1] : '';
}
export function isKnownCoursePrefix(code) {
  return KNOWN_PREFIXES.has(coursePrefix(code));
}
// Provenance = "where did this record come from". Reviews carry it as sourceUrl;
// faculty rows can carry a `provenance` object or a `source` string.
export function hasProvenance(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.provenance && typeof row.provenance === 'object') return true;
  if (typeof row.source === 'string' && row.source.trim()) return true;
  if (typeof row.sourceUrl === 'string' && row.sourceUrl.trim()) return true;
  return false;
}

function issue(severity, rule, message) {
  return { severity, rule, message };
}

// ── Per-row validators (pure; return an array of issues) ───────────────────────
export function validateFacultyRow(row) {
  const out = [];
  const initials = String(row?.initials ?? '').trim();
  if (!initials) out.push(issue('error', 'missing-required', 'faculty: initials is required'));
  else if (!isValidInitials(initials))
    out.push(
      issue(
        'error',
        'invalid-initials',
        `faculty initials must be 2–6 uppercase letters (got ${JSON.stringify(initials)})`,
      ),
    );

  if (!String(row?.name ?? '').trim())
    out.push(issue('error', 'missing-required', 'faculty: name is required'));
  if (!String(row?.dept ?? '').trim())
    out.push(issue('error', 'missing-required', 'faculty: dept is required'));
  else if (!CANON_DEPTS.has(String(row.dept).trim().toUpperCase())) {
    out.push(
      issue(
        'warn',
        'invalid-dept-mapping',
        `faculty dept ${JSON.stringify(row.dept)} is not a known department code (renders ungrouped)`,
      ),
    );
  }

  const email = String(row?.email ?? '').trim();
  if (email && !EMAIL_RE.test(email))
    out.push(issue('warn', 'invalid-email', 'faculty email is malformed'));

  const courses = row?.courses;
  if (courses !== undefined && !Array.isArray(courses)) {
    out.push(issue('error', 'invalid-courses', 'faculty: courses must be an array'));
  } else if (Array.isArray(courses)) {
    for (const c of courses) {
      const code = String(c).trim().toUpperCase();
      if (!isValidCourseCode(code))
        out.push(
          issue(
            'error',
            'invalid-course-code',
            `faculty course code looks malformed: ${JSON.stringify(c)}`,
          ),
        );
      else if (!isKnownCoursePrefix(code))
        out.push(
          issue(
            'info',
            'unknown-course-prefix',
            `faculty course ${code} has an unknown department prefix`,
          ),
        );
    }
  }

  if (!hasProvenance(row))
    out.push(
      issue('info', 'missing-provenance', 'faculty row has no provenance (provenance/source)'),
    );
  return out;
}

export function validateReviewRow(row) {
  const out = [];
  const initials = String(row?.facultyInitials ?? '').trim();
  if (!initials)
    out.push(issue('error', 'missing-required', 'review: facultyInitials is required'));
  else if (!isValidInitials(initials))
    out.push(
      issue(
        'error',
        'invalid-initials',
        `review facultyInitials must be 2–6 uppercase letters (got ${JSON.stringify(initials)})`,
      ),
    );

  const course = String(row?.courseCode ?? '').trim();
  if (course && !isValidCourseCode(course.toUpperCase()))
    out.push(
      issue(
        'error',
        'invalid-course-code',
        `review courseCode looks malformed: ${JSON.stringify(course)}`,
      ),
    );

  if (String(row?.semester ?? '').length > MAX_SEMESTER)
    out.push(issue('error', 'oversized-field', `review semester exceeds ${MAX_SEMESTER} chars`));
  if (String(row?.text ?? '').length > MAX_TEXT)
    out.push(issue('error', 'oversized-field', `review text exceeds ${MAX_TEXT} chars`));

  const ratings = row?.ratings;
  if (!ratings || typeof ratings !== 'object') {
    out.push(issue('error', 'missing-required', 'review: ratings object is required'));
  } else {
    for (const key of RATING_KEYS) {
      const v = ratings[key];
      if (typeof v !== 'number' || Number.isNaN(v) || v < 1 || v > 5) {
        out.push(
          issue(
            'error',
            'rating-out-of-range',
            `review rating ${JSON.stringify(key)} must be a number in 1..5`,
          ),
        );
      }
    }
  }

  if (!hasProvenance(row))
    out.push(issue('info', 'missing-provenance', 'review row has no provenance (sourceUrl)'));
  return out;
}

// Paper metadata validator — mirrors the worker's upload constraints. Used when
// a data/papers*.jsonl exists; kept here (and tested) so the rule is ready.
export function validatePaperRow(row) {
  const out = [];
  if (!String(row?.paperId ?? row?.id ?? '').trim())
    out.push(issue('error', 'missing-required', 'paper: paperId is required'));
  if (!String(row?.title ?? '').trim())
    out.push(issue('error', 'missing-required', 'paper: title is required'));
  else if (String(row.title).length > MAX_TITLE)
    out.push(issue('error', 'oversized-field', `paper title exceeds ${MAX_TITLE} chars`));

  const course = String(row?.courseCode ?? '')
    .trim()
    .toUpperCase();
  if (!course) out.push(issue('error', 'missing-required', 'paper: courseCode is required'));
  else if (!isValidCourseCode(course))
    out.push(
      issue(
        'error',
        'invalid-course-code',
        `paper courseCode looks malformed: ${JSON.stringify(row.courseCode)}`,
      ),
    );

  const type = String(row?.type ?? '')
    .trim()
    .toLowerCase();
  if (!type) out.push(issue('error', 'missing-required', 'paper: type is required'));
  else if (!PAPER_TYPES.has(type))
    out.push(
      issue('error', 'invalid-paper-type', `paper type ${JSON.stringify(row.type)} is not allowed`),
    );

  const size = row?.sizeBytes;
  if (size !== undefined) {
    if (typeof size !== 'number' || size < 0)
      out.push(
        issue('error', 'invalid-paper-size', 'paper sizeBytes must be a non-negative number'),
      );
    else if (size > MAX_PAPER_BYTES)
      out.push(
        issue('error', 'oversized-paper', `paper sizeBytes exceeds ${MAX_PAPER_BYTES} (10MB)`),
      );
  }
  if (!hasProvenance(row))
    out.push(issue('info', 'missing-provenance', 'paper row has no provenance'));
  return out;
}

// ── Cross-row validators (pure) ────────────────────────────────────────────────
// Faculty docs are keyed by `initials` (build3.py / seed_faculty.py), so two rows
// with the same initials collide. Same initials with a different name/email is a
// conflict that silently overwrites.
export function findDuplicateFaculty(rows) {
  const out = [];
  const byInitials = new Map();
  for (const { line, row } of rows) {
    const k = String(row?.initials ?? '')
      .trim()
      .toUpperCase();
    if (!k) continue;
    (byInitials.get(k) || byInitials.set(k, []).get(k)).push({ line, row });
  }
  for (const [k, group] of byInitials) {
    if (group.length < 2) continue;
    const names = new Set(group.map((g) => String(g.row?.name ?? '').trim()));
    const emails = new Set(group.map((g) => String(g.row?.email ?? '').trim()).filter(Boolean));
    const lines = group.map((g) => g.line).join(', ');
    if (names.size > 1 || emails.size > 1) {
      out.push(
        issue(
          'error',
          'conflicting-initials',
          `initials ${k} used by ${names.size} different faculty (lines ${lines})`,
        ),
      );
    } else {
      out.push(
        issue(
          'error',
          'duplicate-faculty',
          `initials ${k} appears ${group.length}× (lines ${lines})`,
        ),
      );
    }
  }
  return out;
}

// Two review rows with the same faculty+course+normalized text would double-
// display. Reported by initials/course/line only — never the text.
export function findDuplicateReviews(rows) {
  const out = [];
  const seen = new Map();
  for (const { line, row } of rows) {
    const key = [
      String(row?.facultyInitials ?? '')
        .trim()
        .toUpperCase(),
      String(row?.courseCode ?? '')
        .trim()
        .toUpperCase(),
      String(row?.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    ].join('|');
    if (!row?.text) continue; // empty-text rows aren't meaningful duplicates
    (seen.get(key) || seen.set(key, []).get(key)).push({ line, row });
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    const first = group[0].row;
    const lines = group.map((g) => g.line).join(', ');
    out.push(
      issue(
        'warn',
        'duplicate-review',
        `duplicate review for ${String(first.facultyInitials).toUpperCase()} ${String(first.courseCode || '—').toUpperCase()} (${group.length}× on lines ${lines})`,
      ),
    );
  }
  return out;
}

// Reviews referencing a faculty with no profile show up un-attributed in the UI.
export function findOrphanReviews(reviewRows, facultyRows) {
  const known = new Set(
    facultyRows.map(({ row }) =>
      String(row?.initials ?? '')
        .trim()
        .toUpperCase(),
    ),
  );
  const out = [];
  const flagged = new Set();
  for (const { row } of reviewRows) {
    const k = String(row?.facultyInitials ?? '')
      .trim()
      .toUpperCase();
    if (k && !known.has(k) && !flagged.has(k)) {
      flagged.add(k);
      out.push(
        issue(
          'warn',
          'orphan-review',
          `reviews reference faculty ${k} with no profile in faculty_profiles.jsonl`,
        ),
      );
    }
  }
  return out;
}

// ── File IO ────────────────────────────────────────────────────────────────────
function loadJsonl(path) {
  const rows = [];
  const errors = [];
  const text = readFileSync(path, 'utf8');
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    try {
      rows.push({ line: i + 1, row: JSON.parse(line) });
    } catch (e) {
      errors.push(issue('error', 'invalid-json', `line ${i + 1} is not valid JSON: ${e.message}`));
    }
  });
  return { rows, errors };
}

// ── Orchestration ──────────────────────────────────────────────────────────────
export function validateDataset({ facultyRows = [], reviewRows = [], paperRows = [] } = {}) {
  const findings = { faculty: [], reviews: [], papers: [] };

  for (const { line, row } of facultyRows) {
    for (const f of validateFacultyRow(row)) findings.faculty.push({ ...f, line });
  }
  for (const f of findDuplicateFaculty(facultyRows)) findings.faculty.push(f);

  for (const { line, row } of reviewRows) {
    for (const f of validateReviewRow(row)) findings.reviews.push({ ...f, line });
  }
  for (const f of findDuplicateReviews(reviewRows)) findings.reviews.push(f);
  for (const f of findOrphanReviews(reviewRows, facultyRows)) findings.reviews.push(f);

  for (const { line, row } of paperRows) {
    for (const f of validatePaperRow(row)) findings.papers.push({ ...f, line });
  }
  return findings;
}

function countBy(findings) {
  const c = { errors: 0, warns: 0, infos: 0 };
  for (const group of Object.values(findings)) {
    for (const f of group) {
      if (f.severity === 'error') c.errors += 1;
      else if (f.severity === 'warn') c.warns += 1;
      else c.infos += 1;
    }
  }
  return c;
}

// Stamp a minimal provenance object onto rows that lack one. Non-destructive:
// lines that already have provenance are kept byte-for-byte, and a stamped line
// only gets the new field APPENDED (so the diff stays minimal and additive — no
// re-serialization churn on unrelated rows). Returns the number stamped; only
// writes when allowed by the caller. The source is honestly marked "unverified"
// — this records that provenance is unknown, it does not fabricate an origin.
function stampProvenance(path, kind, { write }) {
  const raw = readFileSync(path, 'utf8');
  let changed = 0;
  // split on \n keeps the trailing-newline structure intact on rejoin, so the
  // file's final newline (or lack of one) is preserved byte-for-byte.
  const out = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      return line;
    }
    if (hasProvenance(row)) return line;
    const stamp = JSON.stringify({
      source: `unverified-${kind}-import`,
      addedBy: 'validate_data',
      addedAt: new Date().toISOString().slice(0, 10),
    });
    const idx = line.lastIndexOf('}');
    changed += 1;
    return `${line.slice(0, idx)},"provenance":${stamp}${line.slice(idx)}`;
  });
  if (write && changed) writeFileSync(path, out.join('\n'));
  return changed;
}

function printReport(findings, { json }) {
  if (json) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    return;
  }
  const labels = {
    faculty: 'faculty_profiles.jsonl',
    reviews: 'input_reviews.jsonl',
    papers: 'papers.jsonl',
  };
  for (const [group, items] of Object.entries(findings)) {
    if (!items.length) continue;
    console.log(`\n${labels[group]}`);
    // Group identical rules to keep the report compact and readable.
    const byRule = new Map();
    for (const f of items) (byRule.get(f.rule) || byRule.set(f.rule, []).get(f.rule)).push(f);
    for (const [rule, fs] of byRule) {
      const tag =
        fs[0].severity === 'error' ? 'ERROR' : fs[0].severity === 'warn' ? 'warn ' : 'info ';
      console.log(`  [${tag}] ${rule} (${fs.length})`);
      for (const f of fs.slice(0, 8))
        console.log(`      ${f.line ? `line ${f.line}: ` : ''}${f.message}`);
      if (fs.length > 8) console.log(`      … and ${fs.length - 8} more`);
    }
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const opts = {
    dryRun: args.has('--dry-run'),
    strict: args.has('--strict'),
    json: args.has('--json'),
    addProvenance: args.has('--add-provenance'),
  };

  const facultyPath = join(DATA_DIR, 'faculty_profiles.jsonl');
  const reviewPath = join(DATA_DIR, 'input_reviews.jsonl');
  const paperPath = ['papers.jsonl', 'input_papers.jsonl']
    .map((f) => join(DATA_DIR, f))
    .find(existsSync);

  const parseErrors = [];
  let facultyRows = [];
  let reviewRows = [];
  let paperRows = [];
  try {
    if (existsSync(facultyPath)) {
      const r = loadJsonl(facultyPath);
      facultyRows = r.rows;
      parseErrors.push(...r.errors.map((e) => ({ ...e, file: 'faculty' })));
    }
    if (existsSync(reviewPath)) {
      const r = loadJsonl(reviewPath);
      reviewRows = r.rows;
      parseErrors.push(...r.errors.map((e) => ({ ...e, file: 'reviews' })));
    }
    if (paperPath) {
      const r = loadJsonl(paperPath);
      paperRows = r.rows;
      parseErrors.push(...r.errors.map((e) => ({ ...e, file: 'papers' })));
    }
  } catch (e) {
    console.error(`✖ could not read a data file: ${e.message}`);
    process.exit(2);
  }

  const findings = validateDataset({ facultyRows, reviewRows, paperRows });
  // Fold any JSON parse errors into the faculty/reviews groups for reporting.
  for (const e of parseErrors)
    findings[e.file === 'reviews' ? 'reviews' : e.file === 'papers' ? 'papers' : 'faculty'].push(e);

  // In --json mode stdout must be pure JSON, so all human chatter goes to stderr.
  const say = opts.json ? (...a) => console.error(...a) : (...a) => console.log(...a);

  say(
    `Validated ${facultyRows.length} faculty, ${reviewRows.length} reviews${paperPath ? `, ${paperRows.length} papers` : ''}.`,
  );
  printReport(findings, opts);

  if (opts.addProvenance) {
    const write = !opts.dryRun;
    const f = stampProvenance(facultyPath, 'faculty', { write });
    const r = existsSync(reviewPath) ? stampProvenance(reviewPath, 'review', { write }) : 0;
    say(`\nprovenance: ${f + r} row(s) ${write ? 'stamped' : 'WOULD be stamped (dry-run)'}.`);
  }

  const { errors, warns, infos } = countBy(findings);
  say(`\nResult: ${errors} error(s), ${warns} warning(s), ${infos} info.`);
  const fail = errors > 0 || (opts.strict && warns > 0);
  if (fail) {
    console.error(
      opts.strict && errors === 0
        ? '✖ warnings present and --strict set.'
        : '✖ validation found errors.',
    );
    process.exit(1);
  }
  say('✓ no blocking issues.');
}

// Run only as a CLI, not when imported by the test harness.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
