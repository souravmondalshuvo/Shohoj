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
import {
  ALL_COURSES,
  COURSE_DB,
  DEPT_META,
  PREFIX_DEPT_MAP,
  PREREQS,
  getCourseDept,
  getCoursePrefix,
} from '../js/core/catalog.js';
import {
  SEASON_ORDER,
  countSemesters,
  escAttr,
  escHtml,
  generateSemesterNames,
  getCurrentSeason,
  getLastCompletedSemester,
  ordinalSup,
  sanitizeRestoredState,
  sanitizeSemName,
  stripTags,
} from '../js/core/helpers.js';
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
import {
  clearFacultyCache,
  getFacultyProfile,
  hasFacultyProfile,
  isValidInitials,
  listKnownFaculty,
  normalizeInitials as normalizeInitialsFaculty,
  suggestFaculty,
  upsertFacultyProfile,
} from '../js/core/faculty.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const srcCore = path.join(repoRoot, 'src', 'core');

const coreFiles = [
  'grades.ts',
  'types.ts',
  // gpa.ts and planner.ts read their campus rules from the university registry,
  // so it has to be transpiled alongside them or their imports dangle.
  'university.ts',
  'gpa.ts',
  'planner.ts',
  'transcript.ts',
  'reviews.ts',
  'papers.ts',
  'helpers.ts',
  'catalog.ts',
  'faculty.ts',
];

function rewriteLocalImports(output) {
  return output.replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_match, quote, specifier) => {
    if (/\.[cm]?js$/.test(specifier)) return `from ${quote}${specifier}${quote}`;
    // Explicit .ts extensions (the node-runner import convention) map to the
    // transpiled sibling, matching the outFile rename below.
    return `from ${quote}${specifier.replace(/\.ts$/, '')}.mjs${quote}`;
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
const typedHelpers = await import(pathToFileURL(path.join(tempDir, 'helpers.mjs')));
const typedCatalog = await import(pathToFileURL(path.join(tempDir, 'catalog.mjs')));
const typedFaculty = await import(pathToFileURL(path.join(tempDir, 'faculty.mjs')));

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

test('typed SEASON_ORDER matches current JS season ordering', () => {
  assert.deepEqual([...typedHelpers.SEASON_ORDER], [...SEASON_ORDER]);
});

test('typed HTML escaping matches current JS escHtml/escAttr', () => {
  const inputs = [
    `Tom & Jerry <script>alert("x")</script> 'quoted'`,
    '<sup>1</sup> & <b>bold</b>',
    '',
    null,
    undefined,
    42,
    { toString() { return 'obj&<>'; } },
  ];
  for (const input of inputs) {
    assert.equal(typedHelpers.escHtml(input), escHtml(input));
    assert.equal(typedHelpers.escAttr(input), escAttr(input));
  }
});

test('typed ordinalSup matches current JS ordinal suffixes', () => {
  for (const n of [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 100, 101, 111, 112, 113, 121]) {
    assert.equal(typedHelpers.ordinalSup(n), ordinalSup(n));
  }
});

test('typed sanitizeSemName matches current JS <sup> stripping', () => {
  for (const name of ['Fall 2024 (1<sup>st</sup> Semester)', 'plain', '', 42, null]) {
    assert.equal(typedHelpers.sanitizeSemName(name), sanitizeSemName(name));
  }
});

test('typed stripTags matches current JS repeated tag removal', () => {
  for (const s of ['<b>bold</b>', '<<b>b>nested', 'plain text', '', 99, null, '<a href="x">link</a> & text']) {
    assert.equal(typedHelpers.stripTags(s), stripTags(s));
  }
});

test('typed sanitizeRestoredState matches current JS restore validation', () => {
  const payloads = [
    null,
    undefined,
    'not-an-object',
    { semesters: 'nope' },
    { currentDept: 'cse!!', semesters: [] },
    {
      currentDept: 'CSE',
      semesterCounter: 'bad',
      planCourses: ['CSE220', 'nope', 'MAT110', 123],
      semesters: [
        null,
        { id: 'x' },
        {
          id: 1,
          name: 'Fall <sup>1</sup>',
          courses: [
            { name: 'PL I', credits: 3, grade: 'A', gradePoint: '4', faculty: 'abcdefgh' },
            'garbage',
            { name: 7, credits: 'x', grade: 9, gradePoint: 'NT' },
          ],
        },
        { id: 2, summary: true, summaryCGPA: 3.5, summaryCredits: 30 },
        { id: 3, summary: true, summaryCGPA: 9, summaryCredits: 30 },
        { id: 4, courses: 'not-array' },
      ],
    },
  ];
  for (const payload of payloads) {
    const typed = typedHelpers.sanitizeRestoredState(structuredClone(payload));
    const plain = sanitizeRestoredState(structuredClone(payload));
    assert.deepEqual(typed, plain);
  }
});

test('typed season-window helpers match current JS date logic', () => {
  assert.equal(typedHelpers.getCurrentSeason(), getCurrentSeason());
  assert.deepEqual(typedHelpers.getLastCompletedSemester(), getLastCompletedSemester());
  assert.deepEqual(
    typedHelpers.getLastCompletedSemester(['Spring', 'Fall']),
    getLastCompletedSemester(['Spring', 'Fall']),
  );
});

test('typed countSemesters matches current JS semester counting', () => {
  const cases = [
    ['Fall', 2022, 'Spring', 2024, undefined],
    ['Spring', '2023', 'Fall', '2023', undefined],
    ['Summer', 2024, 'Summer', 2024, undefined],
    ['Spring', 2022, 'Fall', 2021, undefined],
    ['Fall', 2023, 'Spring', 2025, ['Spring', 'Fall']],
  ];
  for (const [ss, sy, es, ey, seasons] of cases) {
    assert.equal(
      typedHelpers.countSemesters(ss, sy, es, ey, seasons),
      countSemesters(ss, sy, es, ey, seasons),
    );
  }
});

test('typed generateSemesterNames matches current JS naming', () => {
  const cases = [
    ['Fall', 2022, 5, undefined],
    ['Spring', '2023', 4, ['Spring', 'Fall']],
    ['Bogus', 2024, 3, undefined],
    ['Summer', 2024, 0, undefined],
  ];
  for (const [ss, sy, count, seasons] of cases) {
    assert.deepEqual(
      typedHelpers.generateSemesterNames(ss, sy, count, seasons),
      generateSemesterNames(ss, sy, count, seasons),
    );
  }
});

test('typed catalog lookup tables match current JS data', () => {
  assert.deepEqual(typedCatalog.PREFIX_DEPT_MAP, PREFIX_DEPT_MAP);
  assert.deepEqual(typedCatalog.DEPT_META, DEPT_META);
});

test('typed getCoursePrefix matches current JS prefix extraction', () => {
  const codes = ['CSE110', 'MAT092', 'CST333', 'ENG101', 'A1B2', '110', '', 'cse110', 'X', null, undefined, 12345];
  for (const code of codes) {
    assert.equal(typedCatalog.getCoursePrefix(code), getCoursePrefix(code));
  }
});

test('typed getCourseDept matches current JS department resolution', () => {
  const codes = [
    'CSE110', 'EEE101', 'MAT110', 'PHY111', 'ACT201', 'ENG101', 'HST200',
    'SOC101', 'ANT101', 'ARC101', 'PHB101', 'LAW101', 'BNG103', 'POL101',
    'CST101', 'CST333', 'cst333', 'XYZ999', 'ZZ100', '', '123', null,
  ];
  for (const code of codes) {
    assert.equal(typedCatalog.getCourseDept(code), getCourseDept(code));
  }
});

const FACULTY_INITIALS_INPUTS = [
  'abc', '  Md ', 'A', 'AB', 'ABCDEFG', 'A1B2C3D4', 'cse-faculty',
  '', '   ', null, undefined, 42, 'AbCdEf', 'a.b.c',
];

test('typed faculty normalizeInitials matches current JS', () => {
  for (const raw of FACULTY_INITIALS_INPUTS) {
    assert.equal(typedFaculty.normalizeInitials(raw), normalizeInitialsFaculty(raw));
  }
});

test('typed faculty isValidInitials matches current JS', () => {
  for (const raw of FACULTY_INITIALS_INPUTS) {
    assert.equal(typedFaculty.isValidInitials(raw), isValidInitials(raw));
  }
});

const FACULTY_UPSERTS = [
  null,
  'not-an-object',
  { name: 'No Initials' },
  { initials: '!!', name: 'Bad Initials' },
  {
    initials: 'abc', name: 'Dr. ABC', dept: 'CSE', courses: ['CSE110'],
    ratings: { teaching: 5, marking: 4, behavior: 5, difficulty: 2, workload: 3 }, reviewCount: 7,
  },
  { initials: 'ABC', email: 'abc@bracu.ac.bd', reviewCount: 9 }, // merge onto existing ABC
  { initials: 'xyz', name: 'Prof. XYZ Wong', dept: 'EEE' },
  { initials: 'mnp', name: 'Aileen ABCDEF' },
];

function driveFacultyCache(upsert, clear) {
  clear();
  for (const profile of FACULTY_UPSERTS) upsert(profile);
}

test('typed faculty cache upsert/get/has/list match current JS', () => {
  driveFacultyCache(typedFaculty.upsertFacultyProfile, typedFaculty.clearFacultyCache);
  driveFacultyCache(upsertFacultyProfile, clearFacultyCache);

  for (const initials of ['ABC', 'abc', 'xyz', 'MNP', 'zzz', '']) {
    assert.deepEqual(typedFaculty.getFacultyProfile(initials), getFacultyProfile(initials));
    assert.equal(typedFaculty.hasFacultyProfile(initials), hasFacultyProfile(initials));
  }
  assert.deepEqual(typedFaculty.listKnownFaculty(), listKnownFaculty());
});

test('typed faculty suggestFaculty matches current JS', () => {
  driveFacultyCache(typedFaculty.upsertFacultyProfile, typedFaculty.clearFacultyCache);
  driveFacultyCache(upsertFacultyProfile, clearFacultyCache);

  const queries = [['A', undefined], ['ab', undefined], ['XYZ', undefined],
    ['ABCDEF', undefined], ['z', undefined], ['', undefined], ['a', 1]];
  for (const [query, limit] of queries) {
    assert.deepEqual(typedFaculty.suggestFaculty(query, limit), suggestFaculty(query, limit));
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
