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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const srcCore = path.join(repoRoot, 'src', 'core');

const coreFiles = [
  'grades.ts',
  'types.ts',
  'gpa.ts',
  'planner.ts',
  'transcript.ts',
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
