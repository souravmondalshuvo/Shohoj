/**
 * tests/validateData.test.js
 * Unit coverage for the data-quality rules in scripts/validate_data.mjs (#241).
 * Pure rule functions only — no file IO. Privacy: assertions never rely on or
 * print review `text`, mirroring the script's no-author-identity guarantee.
 */

import {
  isValidCourseCode,
  isValidInitials,
  coursePrefix,
  isKnownCoursePrefix,
  hasProvenance,
  validateFacultyRow,
  validateReviewRow,
  validatePaperRow,
  findDuplicateFaculty,
  findDuplicateReviews,
  findOrphanReviews,
  validateDataset,
  CANON_DEPTS,
} from '../scripts/validate_data.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const rules = (issues) => issues.map(i => i.rule);
const has = (issues, rule) => issues.some(i => i.rule === rule);
const sev = (issues, rule) => (issues.find(i => i.rule === rule) || {}).severity;

// ── helpers ────────────────────────────────────────────────────────────────
test('isValidCourseCode accepts canonical codes, rejects junk', () => {
  assert(isValidCourseCode('CSE110'));
  assert(isValidCourseCode('MAT215'));
  assert(isValidCourseCode('PHB101'));
  assert(!isValidCourseCode('cse110'));   // lowercase
  assert(!isValidCourseCode('CSE11'));     // too few digits
  assert(!isValidCourseCode('CSE1100'));   // too many digits
  assert(!isValidCourseCode(''));
  assert(!isValidCourseCode(110));
});

test('isValidInitials enforces 2–6 uppercase letters', () => {
  assert(isValidInitials('AB'));
  assert(isValidInitials('ABCDEF'));
  assert(!isValidInitials('A'));
  assert(!isValidInitials('ABCDEFG'));
  assert(!isValidInitials('Ab1'));
});

test('coursePrefix / isKnownCoursePrefix', () => {
  assert(coursePrefix('CSE110') === 'CSE');
  assert(coursePrefix('123') === '');
  assert(isKnownCoursePrefix('CSE110'));
  assert(!isKnownCoursePrefix('ZZZ999'));
});

test('hasProvenance recognises provenance/source/sourceUrl', () => {
  assert(hasProvenance({ sourceUrl: 'https://x' }));
  assert(hasProvenance({ source: 'scrape' }));
  assert(hasProvenance({ provenance: { source: 'x' } }));
  assert(!hasProvenance({}));
  assert(!hasProvenance({ source: '   ' }));
});

// ── faculty rules ────────────────────────────────────────────────────────────
test('faculty: clean row yields only an info (missing provenance)', () => {
  const issues = validateFacultyRow({ initials: 'MSI', name: 'X', dept: 'CSE', courses: ['CSE110'] });
  assert(!issues.some(i => i.severity === 'error'), 'no errors expected');
  assert(sev(issues, 'missing-provenance') === 'info');
});

test('faculty: missing initials/name/dept are errors', () => {
  const issues = validateFacultyRow({ courses: [] });
  assert(rules(issues).filter(r => r === 'missing-required').length >= 3);
  assert(issues.filter(i => i.rule === 'missing-required').every(i => i.severity === 'error'));
});

test('faculty: bad initials format is an error', () => {
  assert(sev(validateFacultyRow({ initials: 'x', name: 'N', dept: 'CSE' }), 'invalid-initials') === 'error');
});

test('faculty: non-canonical dept is a warning, not an error', () => {
  const issues = validateFacultyRow({ initials: 'AB', name: 'N', dept: 'PHB' });
  assert(sev(issues, 'invalid-dept-mapping') === 'warn');
  assert(!CANON_DEPTS.has('PHB'));
});

test('faculty: malformed course code is an error; unknown prefix is info', () => {
  assert(sev(validateFacultyRow({ initials: 'AB', name: 'N', dept: 'CSE', courses: ['nope'] }), 'invalid-course-code') === 'error');
  assert(sev(validateFacultyRow({ initials: 'AB', name: 'N', dept: 'CSE', courses: ['ZZZ101'] }), 'unknown-course-prefix') === 'info');
});

test('faculty: courses must be an array', () => {
  assert(has(validateFacultyRow({ initials: 'AB', name: 'N', dept: 'CSE', courses: 'CSE110' }), 'invalid-courses'));
});

// ── review rules ─────────────────────────────────────────────────────────────
const goodRatings = { teaching: 5, marking: 4, behavior: 5, difficulty: 2, workload: 3 };

test('review: clean row yields no errors', () => {
  const issues = validateReviewRow({ facultyInitials: 'MSI', courseCode: 'CSE110', ratings: goodRatings, sourceUrl: 'https://x' });
  assert(!issues.some(i => i.severity === 'error'));
  assert(!has(issues, 'missing-provenance'));
});

test('review: rating out of 1..5 (or non-number) is an error', () => {
  assert(sev(validateReviewRow({ facultyInitials: 'AB', ratings: { ...goodRatings, teaching: 6 } }), 'rating-out-of-range') === 'error');
  assert(sev(validateReviewRow({ facultyInitials: 'AB', ratings: { ...goodRatings, marking: 0 } }), 'rating-out-of-range') === 'error');
  assert(sev(validateReviewRow({ facultyInitials: 'AB', ratings: { ...goodRatings, workload: 'x' } }), 'rating-out-of-range') === 'error');
});

test('review: missing ratings object is an error', () => {
  assert(sev(validateReviewRow({ facultyInitials: 'AB' }), 'missing-required') === 'error');
});

test('review: malformed courseCode and oversized text are errors', () => {
  assert(sev(validateReviewRow({ facultyInitials: 'AB', courseCode: 'bad', ratings: goodRatings }), 'invalid-course-code') === 'error');
  assert(sev(validateReviewRow({ facultyInitials: 'AB', ratings: goodRatings, text: 'x'.repeat(501) }), 'oversized-field') === 'error');
});

test('review: empty courseCode is allowed (optional field)', () => {
  assert(!has(validateReviewRow({ facultyInitials: 'AB', courseCode: '', ratings: goodRatings, sourceUrl: 'u' }), 'invalid-course-code'));
});

// ── paper rules ──────────────────────────────────────────────────────────────
test('paper: missing fields, bad type and oversize are errors', () => {
  assert(has(validatePaperRow({}), 'missing-required'));
  assert(sev(validatePaperRow({ paperId: 'p', title: 'T', courseCode: 'CSE110', type: 'essay' }), 'invalid-paper-type') === 'error');
  assert(sev(validatePaperRow({ paperId: 'p', title: 'T', courseCode: 'CSE110', type: 'final', sizeBytes: 11 * 1024 * 1024 }), 'oversized-paper') === 'error');
});

test('paper: a well-formed row has no errors', () => {
  const issues = validatePaperRow({ paperId: 'p1', title: 'Final 2024', courseCode: 'CSE110', type: 'final', sizeBytes: 1024, source: 'upload' });
  assert(!issues.some(i => i.severity === 'error'));
});

// ── cross-row rules ──────────────────────────────────────────────────────────
test('findDuplicateFaculty: same initials twice → duplicate-faculty error', () => {
  const rows = [
    { line: 1, row: { initials: 'AB', name: 'Same', email: 'a@b' } },
    { line: 2, row: { initials: 'AB', name: 'Same', email: 'a@b' } },
  ];
  assert(sev(findDuplicateFaculty(rows), 'duplicate-faculty') === 'error');
});

test('findDuplicateFaculty: same initials, different name → conflicting-initials error', () => {
  const rows = [
    { line: 1, row: { initials: 'AB', name: 'Alice' } },
    { line: 7, row: { initials: 'AB', name: 'Bob' } },
  ];
  const issues = findDuplicateFaculty(rows);
  assert(sev(issues, 'conflicting-initials') === 'error');
  assert(issues[0].message.includes('1, 7'), 'reports both line numbers');
});

test('findDuplicateReviews: same faculty+course+text → warn, and never leaks text', () => {
  const rows = [
    { line: 3, row: { facultyInitials: 'AB', courseCode: 'CSE110', text: 'Great teacher and very kind' } },
    { line: 9, row: { facultyInitials: 'AB', courseCode: 'CSE110', text: 'great teacher and very KIND' } },
  ];
  const issues = findDuplicateReviews(rows);
  assert(sev(issues, 'duplicate-review') === 'warn');
  assert(!issues[0].message.toLowerCase().includes('great teacher'), 'must NOT include review text');
});

test('findDuplicateReviews: distinct text is not a duplicate', () => {
  const rows = [
    { line: 1, row: { facultyInitials: 'AB', courseCode: 'CSE110', text: 'aaa' } },
    { line: 2, row: { facultyInitials: 'AB', courseCode: 'CSE110', text: 'bbb' } },
  ];
  assert(findDuplicateReviews(rows).length === 0);
});

test('findOrphanReviews: review for unknown faculty → warn, deduped per initials', () => {
  const faculty = [{ line: 1, row: { initials: 'AB' } }];
  const reviews = [
    { line: 1, row: { facultyInitials: 'ZZ' } },
    { line: 2, row: { facultyInitials: 'ZZ' } },
    { line: 3, row: { facultyInitials: 'AB' } },
  ];
  const issues = findOrphanReviews(reviews, faculty);
  assert(issues.length === 1 && issues[0].rule === 'orphan-review');
});

// ── orchestration ────────────────────────────────────────────────────────────
test('validateDataset aggregates per-file findings', () => {
  const findings = validateDataset({
    facultyRows: [{ line: 1, row: { initials: 'AB', name: 'N', dept: 'PHB' } }],
    reviewRows: [{ line: 1, row: { facultyInitials: 'AB', ratings: { ...goodRatings, teaching: 9 } } }],
    paperRows: [{ line: 1, row: {} }],
  });
  assert(has(findings.faculty, 'invalid-dept-mapping'));
  assert(has(findings.reviews, 'rating-out-of-range'));
  assert(has(findings.papers, 'missing-required'));
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
