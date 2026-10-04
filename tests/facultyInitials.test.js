/**
 * tests/facultyInitials.test.js (#819)
 *
 * How faculty initials are normalised, held to the section data it is derived
 * from. Two findings carry the rule, and both are re-measured here so the rule
 * cannot outlive them:
 *
 *   - At NSU a closing number is identity. MMS1, MMS3 and MMS4 teach different
 *     subjects term after term; dropping the number files three lecturers'
 *     reviews under one.
 *   - Case is not identity. One NSU lecturer appears as ABq1, Abq1 and abq1
 *     within a single term's list, so folding case joins a person back
 *     together rather than merging two.
 *
 * BRACU's initials are letters only and its rule does not move.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};

const { loadCampuses } = await import('../scripts/campus_data.mjs');
const { isValidInitials, normalizeInitials } = await import('../js/core/faculty.js');
const { isValidReviewId } = await import('../js/core/reviews.js');
const { setActiveCampusForEmail } = await import('../js/core/activeCampus.js');
const worker = await import('../worker/index.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, []);
const campus = (id) => campuses.find((c) => c.id === id);
const subject = (course) => course.match(/^[A-Z]+/)[0];

// ── The rule ────────────────────────────────────────────────────────────────

assert.equal(normalizeInitials(' mak ', 'bracu'), 'MAK');
assert.equal(normalizeInitials('MAK2', 'bracu'), 'MAK', 'a digit at BRACU is a typo, dropped as before');
assert.equal(normalizeInitials('mms4', 'nsu'), 'MMS4', 'a closing number at NSU is kept');
assert.equal(normalizeInitials('ABq1', 'nsu'), 'ABQ1');
assert.equal(normalizeInitials('abq1', 'nsu'), 'ABQ1', 'case folds on every campus');
assert.equal(normalizeInitials('M.M-S 4', 'nsu'), 'MMS4', 'punctuation is still dropped');
assert.equal(normalizeInitials('ABCDEFG9', 'nsu'), 'ABCDEF', 'six characters at most');
assert.equal(normalizeInitials(null, 'nsu'), '');

for (const [raw, id, ok] of [
  ['MAK', 'bracu', true], ['M', 'bracu', false], ['MMS4', 'bracu', true /* → MMS */],
  ['MMS4', 'nsu', true], ['NvA', 'nsu', true], ['M4', 'nsu', false],
  ['MM44', 'nsu', false], ['4MMS', 'nsu', false], ['', 'nsu', false],
]) {
  assert.equal(isValidInitials(raw, id), ok, `isValidInitials(${JSON.stringify(raw)}, ${id})`);
}

// With no campus given it is the active one: BRACU until sign-in says otherwise.
assert.equal(normalizeInitials('MMS4'), 'MMS');
setActiveCampusForEmail('first.last@northsouth.edu');
assert.equal(normalizeInitials('MMS4'), 'MMS4');
setActiveCampusForEmail(null);
assert.equal(normalizeInitials('MMS4'), 'MMS');

// ── NSU's data: the number separates people, the case does not ─────────────

const nsuTerms = Object.entries(campus('nsu').sections);
assert.ok(nsuTerms.length >= 3, 'the NSU term files are loaded');
let numbered = 0;
let wholeTerms = 0;
for (const [term, file] of nsuTerms) {
  // What each lecturer teaches, by initials exactly as the source spells them.
  const teaches = new Map();
  for (const s of file.records) {
    // A few 2025 PDF cells are spreadsheet debris ("Mar-03"), not initials.
    if (!s.faculty || !/^[A-Za-z0-9]+$/.test(s.faculty)) continue;
    if (!teaches.has(s.faculty)) teaches.set(s.faculty, new Set());
    teaches.get(s.faculty).add(subject(s.course));
  }
  const spelled = [...teaches.keys()];

  // Every real initial survives normalisation as its own uppercase, and is valid.
  for (const raw of spelled) {
    assert.equal(normalizeInitials(raw, 'nsu'), raw.toUpperCase(), `${term}: ${raw}`);
    assert.ok(isValidInitials(raw, 'nsu'), `${term}: ${raw} is valid at NSU`);
    assert.ok(worker.facultyInitialsRe('nsu').test(raw.toUpperCase()), `${term}: the Worker accepts ${raw}`);
  }

  // The statistics below need a whole term's faculty to mean anything; the
  // bi-semester file is two programs' worth.
  if (spelled.length < 500) continue;
  wholeTerms += 1;

  const groupBy = (key) => {
    const groups = new Map();
    for (const raw of spelled) {
      const k = key(raw);
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(raw);
    }
    return [...groups.values()].filter((g) => g.size > 1);
  };
  const shareSubject = (group) => {
    const sets = [...group].map((raw) => teaches.get(raw));
    return [...sets[0]].some((subj) => sets.every((set) => set.has(subj)));
  };

  // Initials the BRACU rule would merge that differ by more than case: a number.
  const byNumber = groupBy((raw) => normalizeInitials(raw, 'bracu'))
    .map((g) => new Set([...g].map((raw) => raw.toUpperCase())))
    .filter((g) => g.size > 1);
  assert.ok(byNumber.length >= 10, `${term}: NSU numbers its faculty (${byNumber.length} groups)`);
  numbered += byNumber.length;
  // They stay apart under NSU's rule...
  for (const group of byNumber) {
    assert.equal(new Set([...group].map((u) => normalizeInitials(u, 'nsu'))).size, group.size, `${term}: ${[...group]}`);
  }
  // ...and they should: lecturers who differ only by number rarely share a subject.
  const numberGroupsRaw = groupBy((raw) => raw.toUpperCase().replace(/\d/g, '')).filter(
    (g) => new Set([...g].map((raw) => raw.toUpperCase())).size > 1,
  );
  const sameSubjectByNumber = numberGroupsRaw.filter((g) => {
    const byPerson = new Map();
    for (const raw of g) {
      const u = raw.toUpperCase();
      if (!byPerson.has(u)) byPerson.set(u, new Set());
      for (const subj of teaches.get(raw)) byPerson.get(u).add(subj);
    }
    const sets = [...byPerson.values()];
    return [...sets[0]].some((subj) => sets.every((set) => set.has(subj)));
  });
  assert.ok(
    sameSubjectByNumber.length <= numberGroupsRaw.length / 4,
    `${term}: number-only variants are different people (${sameSubjectByNumber.length} of ${numberGroupsRaw.length} share a subject)`,
  );

  // Case-only variants mostly teach the same subject: one person, typed twice.
  const byCase = groupBy((raw) => raw.toUpperCase());
  assert.ok(byCase.length >= 20, `${term}: the source spells initials inconsistently (${byCase.length} groups)`);
  const sameSubjectByCase = byCase.filter(shareSubject);
  assert.ok(
    sameSubjectByCase.length >= byCase.length * 0.6,
    `${term}: case variants are the same person (${sameSubjectByCase.length} of ${byCase.length} share a subject)`,
  );
  // ...so they fold into one under NSU's rule.
  for (const group of byCase) {
    assert.equal(new Set([...group].map((raw) => normalizeInitials(raw, 'nsu'))).size, 1, `${term}: ${[...group]}`);
  }
}
assert.ok(wholeTerms >= 3, 'three whole terms were measured');

// The three the rule is named for, in the running term.
assert.equal(new Set(['MMS1', 'MMS3', 'MMS4'].map((x) => normalizeInitials(x, 'nsu'))).size, 3);
assert.equal(new Set(['MMS1', 'MMS3', 'MMS4'].map((x) => normalizeInitials(x, 'bracu'))).size, 1);

// ── BRACU's data: nothing moves ─────────────────────────────────────────────

const bracuFaculty = campus('bracu').faculty.records.map((f) => f.initials);
assert.ok(bracuFaculty.length >= 100);
for (const initials of bracuFaculty) {
  assert.equal(normalizeInitials(initials, 'bracu'), initials, `BRACU ${initials}`);
  assert.equal(normalizeInitials(initials, 'nsu'), initials, 'letters-only initials read the same under either rule');
  assert.ok(worker.facultyInitialsRe('bracu').test(initials));
}
assert.equal(worker.facultyInitialsRe('bracu').test('MMS4'), false, 'the Worker takes no number from a BRACU caller');
assert.equal(worker.facultyInitialsRe('diu').test('MMS4'), false, 'nor from a campus nothing is known about');

// ── Review ids, in the three places their shape is written ─────────────────

const hash = 'a'.repeat(64);
assert.ok(isValidReviewId(`MAK_CSE110_${hash}`));
assert.ok(isValidReviewId(`MMS4_CSE115_${hash}`), "an NSU lecturer's review has a valid id");
assert.equal(isValidReviewId(`MMS44_CSE115_${hash}`), false);
assert.equal(isValidReviewId(`4MMS_CSE115_${hash}`), false);
assert.equal(isValidReviewId(`M_CSE115_${hash}`), false);

// firestore.rules cannot import this pattern, so it is compared as text.
const clientPattern = fs
  .readFileSync(path.join(ROOT, 'js/core/reviews.js'), 'utf8')
  .match(/const REVIEW_ID_RE = \/(.+)\/;/)[1];
const rulesPattern = fs
  .readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
  .match(/function validReviewId\(id\) \{[\s\S]*?id\.matches\('([^']+)'\)/)[1];
assert.equal(
  rulesPattern,
  clientPattern.replace('(?:', '('),
  'firestore.rules validReviewId and js/core/reviews.js REVIEW_ID_RE describe the same id',
);

console.log(`facultyInitials: NSU keeps its ${numbered} numbered groups apart, folds case, and BRACU is unchanged`);
