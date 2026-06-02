/**
 * tests/typedCoreParity.test.js
 * Parity checks for the TypeScript core migration.
 *
 * The live app still ships vanilla JS, so this test transpiles the TS core
 * into a temp folder and compares the migrated logic against current JS
 * behavior before the UI is wired to it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import {
  calcSemGPA,
  getImprovementStrategy,
  getRetakenKeys,
  getSemCreditWarning,
  isRepeatEligible,
  normalizeGradePoint,
} from '../js/core/calculator.js';
import { ALL_COURSES, COURSE_DB, PREREQS } from '../js/core/catalog.js';
import { parseTranscriptText } from '../js/import/parser.js';
import {
  aggregateByFaculty,
  aggregateRatings,
  buildReviewOverview,
  buildReviewReportId,
  isValidReviewId,
  validateReview,
} from '../js/core/reviews.js';
import {
  isValidPaperType,
  paperTimestampMs,
  validatePaperUpload,
} from '../js/core/papers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const srcCore = path.join(repoRoot, 'src', 'core');

const coreFiles = [
  'grades.ts',
  'types.ts',
  'gpa.ts',
  'planner.ts',
  'transcript.ts',
  'reviews.ts',
  'papers.ts',
];

function rewriteLocalImports(output) {
  return output.replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_match, quote, specifier) => {
    if (/\.[cm]?js$/.test(specifier)) return `from ${quote}${specifier}${quote}`;
    return `from ${quote}${specifier}.mjs${quote}`;
  });
}

function transpileTypedCore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shohoj-typed-core-'));

  for (const file of coreFiles) {
    const sourcePath = path.join(srcCore, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const result = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        strict: true,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
    });

    const outFile = path.join(tempDir, file.replace(/\.ts$/, '.mjs'));
    fs.writeFileSync(outFile, rewriteLocalImports(result.outputText));
  }

  return tempDir;
}

function stripTranscriptIds(result) {
  return {
    detectedDept: result.detectedDept,
    semesters: result.semesters.map(semester => ({
      name: semester.name,
      running: semester.running,
      courses: semester.courses,
    })),
  };
}

function setToSortedArray(set) {
  return [...set].sort();
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const tempDir = transpileTypedCore();
const typedGpa = await import(pathToFileURL(path.join(tempDir, 'gpa.mjs')));
const typedPlanner = await import(pathToFileURL(path.join(tempDir, 'planner.mjs')));
const typedTranscript = await import(pathToFileURL(path.join(tempDir, 'transcript.mjs')));
const typedReviews = await import(pathToFileURL(path.join(tempDir, 'reviews.mjs')));
const typedPapers = await import(pathToFileURL(path.join(tempDir, 'papers.mjs')));

console.log('\nTyped core parity:');

test('typed semester GPA matches current JS calculator behavior', () => {
  const semester = {
    courses: [
      { name: 'Programming Language-I (CSE110)', credits: 3, grade: 'A' },
      { name: 'Differential Calculus (MAT110)', credits: 3, grade: 'B+' },
      { name: 'English (ENG101)', credits: 3, grade: 'I' },
      { name: 'Programming Language-II (CSE111)', credits: 3, grade: 'F(NT)' },
    ],
  };

  assert.equal(
    typedGpa.calcSemesterGpa(semester).toFixed(4),
    calcSemGPA(semester).toFixed(4),
  );
});

test('typed retake key selection matches current best-grade policy behavior', () => {
  const semesters = [
    { id: 1, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'C' }] },
    { id: 2, courses: [{ name: 'Data Structures (CSE220)', credits: 3, grade: 'B+' }] },
  ];

  assert.deepEqual(
    setToSortedArray(typedGpa.getRetakenKeys(semesters, { bestGrade: true })),
    setToSortedArray(getRetakenKeys(semesters, { bestGrade: true })),
  );
});

test('typed retake key selection matches current latest-grade policy behavior', () => {
  const semesters = [
    { id: 1, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'A' }] },
    { id: 2, courses: [{ name: 'Algorithms (CSE221)', credits: 3, grade: 'D' }] },
  ];

  assert.deepEqual(
    setToSortedArray(typedGpa.getRetakenKeys(semesters, { bestGrade: false })),
    setToSortedArray(getRetakenKeys(semesters, { bestGrade: false })),
  );
});

test('typed grade helpers match current JS calculator helpers', () => {
  for (const grade of ['A', 'B', 'B-', 'C+', 'D', 'F', 'F(NT)', 'P', 'I', '']) {
    assert.equal(typedGpa.isRepeatEligible(grade), isRepeatEligible(grade));
    assert.equal(typedGpa.getImprovementStrategy(grade), getImprovementStrategy(grade));
  }

  for (const [raw, mode] of [['33', 'input'], ['40', 'input'], ['3', 'blur'], ['NT', 'input']]) {
    assert.equal(typedGpa.normalizeGradePoint(raw, mode), normalizeGradePoint(raw, mode));
  }
});

test('typed semester credit warning matches current JS warning text', () => {
  const semester = {
    courses: [
      { name: 'Programming Language-I (CSE110)', credits: 3, grade: 'A' },
      { name: 'Differential Calculus (MAT110)', credits: 3, grade: 'B' },
    ],
  };

  assert.deepEqual(typedGpa.getSemesterCreditWarning(semester), getSemCreditWarning(semester));
});

test('typed planner identifies completed, unlocked, and locked courses', () => {
  const semesters = [
    {
      id: 1,
      courses: [
        { name: 'Programming Language-I (CSE110)', credits: 3, grade: 'A' },
        { name: 'Mathematics I (MAT110)', credits: 3, grade: 'B+' },
      ],
    },
  ];

  const input = {
    semesters,
    allCourses: ALL_COURSES,
    courseCatalog: COURSE_DB,
    prerequisites: PREREQS,
    planCourses: [],
    currentDept: 'CSE',
    retakenKeys: new Set(),
  };

  const completed = typedPlanner.getCompletedCodes(semesters, new Set());
  assert.equal(completed.has('CSE110'), true);
  assert.equal(completed.has('MAT110'), true);

  const cse220 = typedPlanner.getAvailableCourses(input, { searchQuery: 'CSE220' })[0];
  assert.equal(cse220.code, 'CSE220');
  assert.equal(cse220.canTake, true);

  const cse221 = typedPlanner.getAvailableCourses(input, { searchQuery: 'CSE221' })[0];
  assert.equal(cse221.code, 'CSE221');
  assert.equal(cse221.canTake, false);
  assert.deepEqual(cse221.missingHp, ['CSE220']);
});

test('typed planner validation mirrors current issue and warning wording', () => {
  const validation = typedPlanner.validatePlan({
    semesters: [
      {
        id: 1,
        courses: [{ name: 'Programming Language-I (CSE110)', credits: 3, grade: 'A' }],
      },
    ],
    allCourses: ALL_COURSES,
    courseCatalog: COURSE_DB,
    prerequisites: PREREQS,
    planCourses: ['CSE221'],
    currentDept: 'CSE',
    retakenKeys: new Set(),
  });

  assert.equal(validation.totalCredits, 3);
  assert.equal(validation.issues.includes('3 credits \u2014 below 9-credit minimum'), true);
  assert.equal(validation.issues.includes('CSE221 \u2014 missing prerequisite: CSE220'), true);
  assert.equal(validation.warnings.includes('CSE221 \u2014 recommended: CSE230'), true);
});

test('typed transcript parser matches current JS parser output shape', () => {
  const text = `
    PROGRAM:Computer Science and Engineering
    SEMESTER:FALL2022
    CSE110
    ProgrammingLanguageI
    MAT110
    DifferentialCalculus
    Credits Earned
    3.00
    3.00
    6.00
    6.00
    A
    B+
    4.00
    3.30
    7.30
    7.30
  `;

  assert.deepEqual(
    stripTranscriptIds(typedTranscript.parseTranscriptText(text)),
    stripTranscriptIds(parseTranscriptText(text)),
  );
});

function makeRatings(teaching, marking, behavior, difficulty, workload) {
  return { teaching, marking, behavior, difficulty, workload };
}

const REVIEW_SAMPLE = [
  { id: 'a', facultyInitials: 'ABC', courseCode: 'CSE110', text: 'Very clear explanations and patient, helpful support. Marking is fair.', ratings: makeRatings(5, 4, 5, 2, 3) },
  { id: 'b', facultyInitials: 'ABC', courseCode: 'CSE110', text: 'Quizzes were manageable and easy if you practice.', ratings: makeRatings(4, 4, 4, 3, 3) },
  { id: 'c', facultyInitials: 'XY', courseCode: 'CSE220', text: 'Disorganized and harsh marking.', ratings: makeRatings(2, 2, 2, 4, 5) },
  { id: 'd', facultyInitials: 'XY', courseCode: 'CSE220', text: '', ratings: { teaching: 3 } },
];

test('typed review validation matches current JS reviews validator', () => {
  const payloads = [
    null,
    {},
    { facultyInitials: 'A', courseCode: 'CSE110', ratings: makeRatings(5, 5, 5, 5, 5) },
    { facultyInitials: 'ABC', courseCode: '', ratings: makeRatings(5, 5, 5, 5, 5) },
    { facultyInitials: 'ABC', courseCode: 'ZZ9', ratings: makeRatings(5, 5, 5, 5, 5) },
    { facultyInitials: 'ABC', courseCode: 'QWE999', ratings: makeRatings(5, 5, 5, 5, 5) },
    { facultyInitials: 'ABC', courseCode: 'CSE110', ratings: makeRatings(5, 5, 5, 5, 6) },
    { facultyInitials: 'ABC', courseCode: 'CSE110', ratings: makeRatings(5, 5, 5, 5, 5), semester: 'x'.repeat(41) },
    { facultyInitials: 'ABC', courseCode: 'CSE110', ratings: makeRatings(5, 5, 5, 5, 5), text: 'y'.repeat(501) },
    { facultyInitials: 'ABC', courseCode: 'cse110', ratings: makeRatings(4, 4, 4, 4, 4) },
  ];
  for (const payload of payloads) {
    assert.equal(typedReviews.validateReview(payload, COURSE_DB), validateReview(payload));
  }
});

test('typed review id + report id helpers match current JS', () => {
  const ids = ['', 'nope', 'ABC_CSE110_' + 'a'.repeat(64), 'ABC_CSE110_' + 'g'.repeat(64)];
  for (const id of ids) {
    assert.equal(typedReviews.isValidReviewId(id), isValidReviewId(id));
    assert.equal(typedReviews.buildReviewReportId(id, 'uid123'), buildReviewReportId(id, 'uid123'));
  }
  assert.equal(typedReviews.buildReviewReportId('', 'uid'), buildReviewReportId('', 'uid'));
});

test('typed rating aggregation matches current JS aggregateRatings', () => {
  assert.equal(typedReviews.aggregateRatings([]), aggregateRatings([]));
  assert.deepEqual(typedReviews.aggregateRatings(REVIEW_SAMPLE), aggregateRatings(REVIEW_SAMPLE));
});

test('typed per-faculty aggregation matches current JS aggregateByFaculty', () => {
  assert.deepEqual(typedReviews.aggregateByFaculty(REVIEW_SAMPLE), aggregateByFaculty(REVIEW_SAMPLE));
});

test('typed review overview matches current JS buildReviewOverview', () => {
  assert.equal(typedReviews.buildReviewOverview([]), buildReviewOverview([]));
  for (const opts of [{}, { facultyName: 'Dr. Test', facultyInitials: 'ABC', courseCode: 'CSE110' }, { facultyInitials: 'XY' }]) {
    assert.deepEqual(
      typedReviews.buildReviewOverview(REVIEW_SAMPLE, opts),
      buildReviewOverview(REVIEW_SAMPLE, opts),
    );
  }
});

test('typed paper upload validation matches current JS validatePaperUpload', () => {
  const inputs = [
    { file: null, courseCode: 'CSE110', type: 'midterm', title: 'Midterm 1' },
    { file: { size: 0, type: 'application/pdf' }, courseCode: 'CSE110', type: 'final', title: 'Final' },
    { file: { size: 11 * 1024 * 1024, type: 'application/pdf' }, courseCode: 'CSE110', type: 'final', title: 'Final' },
    { file: { size: 100, type: 'text/plain' }, courseCode: 'CSE110', type: 'final', title: 'Final' },
    { file: { size: 100, type: 'image/png' }, courseCode: 'ZZ9', type: 'final', title: 'Final' },
    { file: { size: 100, type: 'application/pdf' }, courseCode: 'CSE110', type: 'bogus', title: 'Final' },
    { file: { size: 100, type: 'application/pdf' }, courseCode: 'CSE110', type: 'quiz', title: 'ab' },
    { file: { size: 100, type: 'application/pdf' }, courseCode: 'CSE110', type: 'quiz', title: 'z'.repeat(121) },
    { file: { size: 100, type: 'application/pdf' }, courseCode: 'cse110', type: 'notes', title: 'Lecture notes' },
  ];
  for (const input of inputs) {
    assert.equal(typedPapers.validatePaperUpload(input, COURSE_DB), validatePaperUpload(input));
  }
});

test('typed paper type + timestamp helpers match current JS', () => {
  for (const type of ['midterm', 'MIDTERM', 'final', 'bogus', '', null, 'lab-quiz']) {
    assert.equal(typedPapers.isValidPaperType(type), isValidPaperType(type));
  }
  const stamps = [
    null,
    {},
    { createdAt: null },
    { createdAt: { seconds: 1700 } },
    { createdAt: { toMillis: () => 1700000 } },
  ];
  for (const stamp of stamps) {
    assert.equal(typedPapers.paperTimestampMs(stamp), paperTimestampMs(stamp));
  }
});

let passed = 0;
let failed = 0;

try {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS ${name}`);
      passed++;
    } catch (error) {
      console.error(`  FAIL ${name}`);
      console.error(`    ${error.message}`);
      failed++;
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}
