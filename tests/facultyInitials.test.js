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
const { UNIVERSITIES } = await import('../js/core/university.js');
const { bracu: BRACU, nsu: NSU } = UNIVERSITIES;
const worker = await import('../worker/index.js');
// The shell's typed copies of the same functions.
const typedFaculty = await import('../src/core/faculty.ts');
const typedReviews = await import('../src/core/reviews.ts');
const draft = await import('../src/features/calculator/reviewDraft.ts');
const { buildCourseReviewGroups } = await import('../src/features/calculator/courseReviews.ts');
const typedUniversity = await import('../src/core/university.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, []);
const campus = (id) => campuses.find((c) => c.id === id);
const subject = (course) => course.match(/^[A-Z]+/)[0];

// ── The rule ────────────────────────────────────────────────────────────────

assert.equal(normalizeInitials(' mak ', BRACU), 'MAK');
assert.equal(normalizeInitials('MAK2', BRACU), 'MAK', 'a digit at BRACU is a typo, dropped as before');
assert.equal(normalizeInitials('mms4', NSU), 'MMS4', 'a closing number at NSU is kept');
assert.equal(normalizeInitials('ABq1', NSU), 'ABQ1');
assert.equal(normalizeInitials('abq1', NSU), 'ABQ1', 'case folds on every campus');
assert.equal(normalizeInitials('M.M-S 4', NSU), 'MMS4', 'punctuation is still dropped');
assert.equal(normalizeInitials('ABCDEFG9', NSU), 'ABCDEF', 'six characters at most');
assert.equal(normalizeInitials(null, NSU), '');

for (const [raw, campusProfile, ok] of [
  ['MAK', BRACU, true], ['M', BRACU, false], ['MMS4', BRACU, true /* → MMS */],
  ['MMS4', NSU, true], ['NvA', NSU, true], ['M4', NSU, false],
  ['MM44', NSU, false], ['4MMS', NSU, false], ['', NSU, false],
]) {
  assert.equal(isValidInitials(raw, campusProfile), ok, `isValidInitials(${JSON.stringify(raw)}, ${campusProfile.id})`);
}

// Which campuses number their faculty is one registry field, read by the page,
// the shell and the Worker alike.
assert.equal(NSU.numberedInitials, true);
assert.equal(BRACU.numberedInitials, undefined);

// With no campus given it is the active one: BRACU until sign-in says otherwise.
assert.equal(normalizeInitials('MMS4'), 'MMS');
setActiveCampusForEmail('first.last@northsouth.edu');
assert.equal(normalizeInitials('MMS4'), 'MMS4');
setActiveCampusForEmail(null);
assert.equal(normalizeInitials('MMS4'), 'MMS');

// ── NSU's data: the number separates people, the case does not ─────────────

const TYPED_NSU = typedUniversity.UNIVERSITIES.nsu;
const TYPED_BRACU = typedUniversity.UNIVERSITIES.bracu;
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
    assert.equal(normalizeInitials(raw, NSU), raw.toUpperCase(), `${term}: ${raw}`);
    assert.ok(isValidInitials(raw, NSU), `${term}: ${raw} is valid at NSU`);
    assert.ok(worker.facultyInitialsRe('nsu').test(raw.toUpperCase()), `${term}: the Worker accepts ${raw}`);
    // The shell reads it the same way, from either of its two modules.
    assert.equal(typedFaculty.normalizeInitials(raw, TYPED_NSU), raw.toUpperCase(), `${term}: shell ${raw}`);
    assert.equal(typedReviews.normalizeInitials(raw, TYPED_NSU), raw.toUpperCase(), `${term}: shell reviews ${raw}`);
    assert.ok(typedFaculty.isValidInitials(raw, TYPED_NSU), `${term}: shell accepts ${raw}`);
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
  const byNumber = groupBy((raw) => normalizeInitials(raw, BRACU))
    .map((g) => new Set([...g].map((raw) => raw.toUpperCase())))
    .filter((g) => g.size > 1);
  assert.ok(byNumber.length >= 10, `${term}: NSU numbers its faculty (${byNumber.length} groups)`);
  numbered += byNumber.length;
  // They stay apart under NSU's rule...
  for (const group of byNumber) {
    assert.equal(new Set([...group].map((u) => normalizeInitials(u, NSU))).size, group.size, `${term}: ${[...group]}`);
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
    assert.equal(new Set([...group].map((raw) => normalizeInitials(raw, NSU))).size, 1, `${term}: ${[...group]}`);
  }
}
assert.ok(wholeTerms >= 3, 'three whole terms were measured');

// The three the rule is named for, in the running term.
assert.equal(new Set(['MMS1', 'MMS3', 'MMS4'].map((x) => normalizeInitials(x, NSU))).size, 3);
assert.equal(new Set(['MMS1', 'MMS3', 'MMS4'].map((x) => normalizeInitials(x, BRACU))).size, 1);

// ── BRACU's data: nothing moves ─────────────────────────────────────────────

const bracuFaculty = campus('bracu').faculty.records.map((f) => f.initials);
assert.ok(bracuFaculty.length >= 100);
for (const initials of bracuFaculty) {
  assert.equal(normalizeInitials(initials, BRACU), initials, `BRACU ${initials}`);
  assert.equal(normalizeInitials(initials, NSU), initials, 'letters-only initials read the same under either rule');
  assert.ok(worker.facultyInitialsRe('bracu').test(initials));
}
assert.equal(worker.facultyInitialsRe('bracu').test('MMS4'), false, 'the Worker takes no number from a BRACU caller');
assert.equal(worker.facultyInitialsRe('diu').test('MMS4'), false, 'nor from a campus nothing is known about');

// ── The shell: the same rule, with the campus passed in ────────────────────

// With no campus the typed functions read letters only, as they always did —
// the shell has no ambient campus, so every caller that has one must pass it.
assert.equal(typedFaculty.normalizeInitials('MMS4'), 'MMS');
assert.equal(typedFaculty.normalizeInitials('MMS4', TYPED_BRACU), 'MMS');
assert.equal(typedFaculty.normalizeInitials('mms4', TYPED_NSU), 'MMS4');
assert.equal(typedReviews.normalizeInitials('MMS4'), 'MMS');
assert.equal(typedFaculty.isValidInitials('MM44', TYPED_NSU), false);

// The review form: prefilled, typed, validated and sent with the number.
{
  let d = draft.emptyReviewDraft('mms4', TYPED_NSU);
  assert.equal(d.initials, 'MMS4');
  d = draft.setDraftInitials(d, 'mms 1', TYPED_NSU);
  assert.equal(d.initials, 'MMS1');
  assert.notEqual(draft.firstDraftError(d, TYPED_NSU)?.field, 'initials');
  assert.equal(draft.buildReviewPayload(d, 'cse115', 'Fall 2026', TYPED_NSU).facultyInitials, 'MMS1');
  // At BRACU the same keystrokes are still MMS.
  assert.equal(draft.setDraftInitials(draft.emptyReviewDraft(), 'mms 1', TYPED_BRACU).initials, 'MMS');
  assert.equal(draft.emptyReviewDraft('mms4').initials, 'MMS');
}

// Grouping reviews: two numbered lecturers are two rows at NSU.
{
  const ratings = { teaching: 4, marking: 4, behavior: 4, difficulty: 3, workload: 3 };
  const reviews = [
    { id: 'a', facultyInitials: 'MMS1', courseCode: 'CSE115', ratings, text: 'one' },
    { id: 'b', facultyInitials: 'MMS4', courseCode: 'CSE115', ratings, text: 'four' },
    { id: 'c', facultyInitials: 'MMS4', courseCode: 'CSE115', ratings, text: 'four again' },
  ];
  const byNsu = typedReviews.aggregateByFaculty(reviews, TYPED_NSU);
  assert.deepEqual(byNsu.map((g) => [g.facultyInitials, g.count]), [['MMS4', 2], ['MMS1', 1]]);
  assert.equal(typedReviews.aggregateByFaculty(reviews).length, 1, 'without the campus they collapse into MMS');
  const groups = buildCourseReviewGroups(reviews, TYPED_NSU);
  assert.deepEqual(groups.map((g) => g.facultyInitials), ['MMS4', 'MMS1']);
  assert.equal(groups[1].snippets.length, 1, "MMS1's page shows MMS1's review only");
}

// A review's id carries the number, in the shell as on the legacy page.
{
  const id = await typedReviews.buildReviewDocId('uid-1', 'mms4', 'cse115', TYPED_NSU);
  assert.match(id, /^MMS4_CSE115_[a-f0-9]{64}$/);
  assert.ok(typedReviews.isValidReviewId(id), 'and the shell will let it be reported');
  assert.notEqual(id, await typedReviews.buildReviewDocId('uid-1', 'mms1', 'cse115', TYPED_NSU));
  assert.match(await typedReviews.buildReviewDocId('uid-1', 'mms4', 'cse115'), /^MMS_CSE115_/);
}

// ── Review ids, in the three places their shape is written ─────────────────

const hash = 'a'.repeat(64);
assert.ok(isValidReviewId(`MAK_CSE110_${hash}`));
assert.ok(isValidReviewId(`MMS4_CSE115_${hash}`), "an NSU lecturer's review has a valid id");
assert.equal(isValidReviewId(`MMS44_CSE115_${hash}`), false);
assert.equal(isValidReviewId(`4MMS_CSE115_${hash}`), false);
assert.equal(isValidReviewId(`M_CSE115_${hash}`), false);

// firestore.rules cannot import this pattern, so it is compared as text.
assert.equal(typedReviews.isValidReviewId(`MMS44_CSE115_${hash}`), false);

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
const typedPattern = fs
  .readFileSync(path.join(ROOT, 'src/core/reviews.ts'), 'utf8')
  .match(/const REVIEW_ID_RE =\s*\/(.+)\/;/)[1];
assert.equal(typedPattern, clientPattern, 'the shell and the legacy page describe the same id');

console.log(`facultyInitials: NSU keeps its ${numbered} numbered groups apart, folds case, and BRACU is unchanged`);
