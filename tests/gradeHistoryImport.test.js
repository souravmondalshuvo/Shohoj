/**
 * tests/gradeHistoryImport.test.js
 * Reading a pasted RDS "Grade History" page (#843).
 *
 * The fixture is CONSTRUCTED, not captured: nobody on this project has an RDS
 * login, so the layout is the one a published reader of the same page relies
 * on — seven named columns, semester name and year on the first row of each
 * semester only, and a "TGPA / CGPA" summary row closing it. The grades are
 * chosen so the CGPA printed in the summary rows is the one NSU's rules give,
 * which is what lets the last test hold the importer to the calculator.
 */

import {
    parseGradeHistoryRows,
    parseGradeHistoryText,
    rowsFromText,
    studentIdFrom,
} from '../js/import/gradeHistory-core.js';
import { calculateCgpaTotals } from '../js/core/gpa-core.js';
import { UNIVERSITIES } from '../js/core/university.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

const HEADER = 'Semester Name\tSemester Year\tCourse Code\tCourse Credit\tCourse Title\tCourse Grade\tCr.Count';

// Spring: 3×4.0 + 3×2.0 + 0-credit lab            → TGPA 3.00, CGPA 3.00
// Summer: MAT116 retaken (C → A-), a W, and a B+  → best attempt counts:
//         ENG102 4.0·3 + MAT116 3.7·3 + PHY107 3.3·3 = 33 over 9 → CGPA 3.67
const PASTE = [
    'Grade History of 2012345642',
    HEADER,
    'Spring\t2025\tENG102\t3\tIntroduction to Composition\tA\t3',
    '\t\tMAT116\t3\tPre-Calculus\tC\t3',
    '\t\tCSE115L\t0\tProgramming Language I Lab\tA\t0',
    'TGPA: 3.00\tCGPA: 3.00',
    'Summer\t2025\tMAT116\t3\tPre-Calculus\tA-\t3',
    '\t\tBUS112\t3\tIntro to Business Mathematics\tW\t0',
    '\t\tPHY107\t3\tPhysics I\tB+\t3',
    'TGPA: 3.50\tCGPA: 3.67',
].join('\n');

console.log('\ngradeHistoryImport');

test('semesters are named from the two leading columns, in page order', () => {
    const { semesters } = parseGradeHistoryText(PASTE);
    eq(semesters.map(s => s.name), ['Spring 2025', 'Summer 2025']);
    eq(semesters.map(s => s.id), [1, 2]);
    eq(semesters.map(s => s.running), [false, false]);
});

test('rows under a semester belong to it although their first two cells are empty', () => {
    const { semesters } = parseGradeHistoryText(PASTE);
    eq(semesters.map(s => s.courses.length), [3, 3]);
    eq(semesters[0].courses[1], { name: 'Pre-Calculus (MAT116)', credits: 3, grade: 'C' });
});

test('a zero-credit lab, a W and both attempts at a retake all survive', () => {
    const { semesters } = parseGradeHistoryText(PASTE);
    eq(semesters[0].courses[2], { name: 'Programming Language I Lab (CSE115L)', credits: 0, grade: 'A' });
    // Cr.Count is 0 for a withdrawal; the course keeps its own three credits.
    eq(semesters[1].courses[1], { name: 'Intro to Business Mathematics (BUS112)', credits: 3, grade: 'W' });
    const attempts = semesters.flatMap(s => s.courses).filter(c => c.name.endsWith('(MAT116)'));
    eq(attempts.map(c => c.grade), ['C', 'A-']);
});

test("RDS's own TGPA and CGPA are kept beside each semester", () => {
    const { official, officialCgpa } = parseGradeHistoryText(PASTE);
    eq(official, [
        { name: 'Spring 2025', tgpa: 3, cgpa: 3 },
        { name: 'Summer 2025', tgpa: 3.5, cgpa: 3.67 },
    ]);
    eq(officialCgpa, 3.67);
});

test('the student id is read from the page heading, and nothing else is claimed', () => {
    const parsed = parseGradeHistoryText(PASTE);
    eq(parsed.studentId, '2012345642');
    eq(parsed.studentName, null);
    eq(parsed.detectedDept, null);
    eq(studentIdFrom('Class Schedule of someone'), null);
});

test('columns are found by name, so a reordered table reads the same', () => {
    const reordered = [
        'Course Code\tCourse Title\tSemester Year\tSemester Name\tCr.Count\tCourse Grade\tCourse Credit',
        'ENG102\tIntroduction to Composition\t2025\tSpring\t3\tA\t3',
        'MAT116\tPre-Calculus\t\t\t3\tC\t3',
    ].join('\n');
    const { semesters, warnings } = parseGradeHistoryText(reordered);
    eq(semesters.map(s => s.name), ['Spring 2025']);
    eq(semesters[0].courses.map(c => c.grade), ['A', 'C']);
    eq(warnings, []);
});

test('rows handed over ready-split read the same as the text', () => {
    const rows = rowsFromText(PASTE).map(row => ({
        cells: row.cells,
        summary: /TGPA/.test(row.cells.join(' ')),
    }));
    eq(parseGradeHistoryRows(rows, { text: PASTE }), parseGradeHistoryText(PASTE));
});

test('a paste without its header row is read in RDS order, and says so', () => {
    const body = PASTE.split('\n').slice(2).join('\n');
    const { semesters, warnings } = parseGradeHistoryText(body);
    eq(semesters.map(s => s.courses.length), [3, 3]);
    assert(warnings.some(w => /header row/.test(w)), 'no warning about the missing header');
});

test('a semester with no grades yet is marked as running', () => {
    const paste = [HEADER, 'Fall\t2025\tCSE215\t3\tProgramming Language II\t\t0', '\t\tCSE215L\t1\tProgramming Language II Lab\t\t0'].join('\n');
    const { semesters } = parseGradeHistoryText(paste);
    eq(semesters[0].running, true);
    // Cr.Count is 0 until a grade lands; the course's own credit is what counts here.
    eq(semesters[0].courses.map(c => c.credits), [3, 1]);
});

test('a grade the calculator has no value for is left blank and named', () => {
    const paste = [HEADER, 'Fall\t2025\tCSE215\t3\tProgramming Language II\tZ9\t0', '\t\tENG103\t3\tIntermediate Composition\tB\t3'].join('\n');
    const { semesters, warnings } = parseGradeHistoryText(paste);
    eq(semesters[0].courses.map(c => c.grade), ['', 'B']);
    assert(warnings.some(w => w.includes('Z9')), 'unknown grade not reported');
});

test('every grade the importer keeps is one NSU\'s scale knows', () => {
    const scale = UNIVERSITIES.nsu.grades.points;
    const grades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'W', 'I'];
    const paste = [HEADER, ...grades.map((g, i) => `${i ? '' : 'Fall'}\t${i ? '' : '2025'}\tCSE${100 + i}\t3\tCourse ${i}\t${g}\t3`)].join('\n');
    const kept = parseGradeHistoryText(paste).semesters[0].courses.map(c => c.grade);
    eq(kept, grades);
    kept.forEach(g => assert(g in scale, `${g} is not on NSU's scale`));
});

test('text that is not the grade history yields nothing, not a guess', () => {
    for (const junk of ['', 'hello world', 'TIME/DAY\tSUNDAY\tMONDAY\n8:00 AM\tCSE115 -1\t']) {
        const { semesters, officialCgpa } = parseGradeHistoryText(junk);
        eq(semesters, []);
        eq(officialCgpa, null);
    }
});

test('a row that is not a course is counted, never invented', () => {
    const paste = [HEADER, 'Spring\t2025\tENG102\t3\tIntroduction to Composition\tA\t3', '\t\tnot a code\t3\tSomething\tA\t3'].join('\n');
    const { semesters, warnings } = parseGradeHistoryText(paste);
    eq(semesters[0].courses.length, 1);
    assert(warnings.some(w => /1 row could not be read/.test(w)), 'skipped row not reported');
});

test('that holds for the row that opens a semester too', () => {
    const paste = [HEADER, 'Spring\t2025\tXYZ\t3\tSomething\tA\t3', '\t\tENG102\t3\tIntroduction to Composition\tA\t3'].join('\n');
    const { semesters, warnings } = parseGradeHistoryText(paste);
    eq(semesters.map(s => [s.name, s.courses.length]), [['Spring 2025', 1]]);
    assert(warnings.some(w => /1 row could not be read/.test(w)), 'skipped row not reported');
});

test('markup in a cell stays text', () => {
    const paste = [HEADER, 'Spring\t2025\tENG102\t3\t<img src=x onerror=alert(1)>\tA\t3'].join('\n');
    const { semesters } = parseGradeHistoryText(paste);
    eq(semesters[0].courses[0].name, '<img src=x onerror=alert(1)> (ENG102)');
});

test("the calculator reaches RDS's CGPA from what was imported", () => {
    const { semesters, officialCgpa } = parseGradeHistoryText(PASTE);
    const { grades: scale, retake } = UNIVERSITIES.nsu;
    const totals = calculateCgpaTotals(semesters, { includeRunning: false, scale, retake });
    eq(totals.cgpa.toFixed(2), officialCgpa.toFixed(2));
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
