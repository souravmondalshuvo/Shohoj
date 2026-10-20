/**
 * tests/importDiuCurricula.test.js
 *
 * scripts/import_diu_curricula.py reads DIU's program pages, and each
 * department lays its curriculum tables out its own way. The records it reads
 * are not committed (the CSE page alone is 160 kB of HTML), so this pins the
 * reader on small tables cut to each layout it has to handle, and holds the
 * committed program-courses.json to what that reader can produce.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** courses_of(html) for each fixture, from the importer itself. */
function read(fixtures) {
  const program = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'scripts'))})
import import_diu_curricula as m
out = {}
for name, html in json.load(sys.stdin).items():
    courses, report = m.courses_of(html)
    out[name] = {'courses': courses, 'report': report}
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('python3', ['-c', program], { input: JSON.stringify(fixtures) }).toString());
}

const table = (...rows) =>
  `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

const results = read({
  // CSE: a clean table, codes with a hyphen, and an elective slot that is not a course.
  cse: table(
    ['Code', 'Course Title', 'Course Type', 'Credits'],
    ['CSE-113', 'Programming and Problem Solving', 'Core Theory', '3'],
    ['CSE-114', 'Programming and Problem Solving Lab', 'Core Lab', '1.5'],
    ['PHY- 102', 'Physics - II', 'GED Theory', '3'],
    ['CSE-***', 'Elective-I', 'Core Theory', '3'],
    ['', 'Total', '', '10.5'],
  ),
  // SWE: credits split into theory and lab, a semester total that is not a
  // course's, and a term cell spanning rows so later rows are a cell short.
  swe:
    `<table><tr><td>SEM.</td><td>CODE</td><td>COURSE TITLE</td><td>Prerequisite</td><td>Course Category</td>` +
    `<td>Theory Credit</td><td>Lab Credit</td><td>Sem.-wise Credit</td></tr>` +
    `<tr><td>1st (1-1)</td><td>SE 111</td><td>Computer Fundamentals</td><td></td><td>CORE</td><td>3</td><td></td><td>16</td></tr>` +
    `<tr><td>SE 112</td><td>Computer Fundamentals Lab</td><td></td><td>LAB</td><td></td><td>1</td></tr>` +
    `<tr><td>ENG 114/ ENG 101</td><td>English Reading, Writing Skills</td><td></td><td>GED</td><td>3</td><td></td></tr></table>`,
  // Architecture: theory:sessional credits, and the header in a table of its
  // own above the rows — whose last column is contact hours, not credits.
  arch:
    table(['Course No.', 'Course Title', 'Credit Hrs', 'Contact Hrs']) +
    table(['ARCH-102', 'Design Studio-I (Basic Design)', '0:5', '10'], ['ARCH-101', 'Architecture of Ancient Civilizations', '2:0', '2']),
  // ESDM: a header whose names are in the wrong order for its rows.
  esdm: table(['Course Title', 'Course Code', 'Credit'], ['ESDM101', 'Introduction to Environmental Science', '3'], ['BIO101A', 'Environmental Biology lab', '1']),
  // The BBA family: ISCED field codes, spaced however the page spaces them.
  bba: table(['Course Code', 'Course Title', 'Credit'], ['0413-101', 'Principles of Management', '3'], ['0321- 106L', 'Information Gathering Lab', '1']),
  // ITM: a row with an ISCED code and the program's own; the program's is kept,
  // and columns still line up from the first code cell.
  itm: table(
    ['Semester', 'BNQF Course Code', 'Course Code', 'Course Name', 'Total Credit', 'Sem. wise Credit'],
    ['1st', '0613-123', 'ITM 123', 'Programming Fundamentals', '3', '13'],
  ),
  // One code, two different credit values, or two different courses.
  conflicts: table(
    ['Code', 'Course Title', 'Credits'],
    ['CIS 499', 'Internship', '3'],
    ['CIS 499', 'Internship', '6'],
    ['ARCH 211', 'Physical Planning Fundamentals', '2'],
    ['ARCH 211', 'Green Architecture and Sustainable Development', '2'],
    ['PHY 101', 'Physics: Modern Physics, Waves', '2'],
    ['PHY 101', 'Physics : Modern Physics, Waves', '2'],
    ['ICE 225', 'NIL', '3'],
  ),
});

const courses = (name) => results[name].courses.map((c) => [c.code, c.title, c.credits]);

test('codes lose their spaces and hyphens, and slots are not courses', () => {
  assert.deepEqual(courses('cse'), [
    ['CSE113', 'Programming and Problem Solving', 3],
    ['CSE114', 'Programming and Problem Solving Lab', 1.5],
    ['PHY102', 'Physics - II', 3],
  ]);
});

test('theory and lab credits add up, and a semester total is never a course', () => {
  assert.deepEqual(courses('swe'), [
    ['ENG114', 'English Reading, Writing Skills', 3],
    ['SE111', 'Computer Fundamentals', 3],
    ['SE112', 'Computer Fundamentals Lab', 1],
  ]);
});

test("Architecture's 0:5 is five credits, read under a header in a table of its own", () => {
  assert.deepEqual(courses('arch'), [
    ['ARCH101', 'Architecture of Ancient Civilizations', 2],
    ['ARCH102', 'Design Studio-I (Basic Design)', 5],
  ]);
});

test('a header that does not line up with its rows falls back to the row itself', () => {
  assert.deepEqual(courses('esdm'), [
    ['BIO101A', 'Environmental Biology lab', 1],
    ['ESDM101', 'Introduction to Environmental Science', 3],
  ]);
});

test('ISCED codes are read, with one hyphen however the page spaces them', () => {
  assert.deepEqual(courses('bba'), [
    ['0321-106L', 'Information Gathering Lab', 1],
    ['0413-101', 'Principles of Management', 3],
  ]);
  assert.equal(results.bba.report.isced, 2);
});

test("where a row has a field code and the program's own, the program's is kept", () => {
  assert.deepEqual(courses('itm'), [['ITM123', 'Programming Fundamentals', 3]]);
});

test('a code that means two things is left out, and two wordings of one title are not', () => {
  assert.deepEqual(courses('conflicts'), [['PHY101', 'Physics: Modern Physics, Waves', 2]]);
  assert.equal(results.conflicts.report.conflicts.length, 2);
  assert.ok(results.conflicts.report.dropped.some((d) => d.startsWith('ICE225')), 'NIL is not a title');
});

test('stubs a routine left survive a re-run, in code order, until the page lists them', () => {
  const out = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'scripts'))})
import import_diu_curricula as m
page = [{'program': 'CSE', 'code': 'CSE112', 'title': 'A', 'credits': 3, 'source': 'p'},
        {'program': 'CSE', 'code': 'CSE441', 'title': 'IoT', 'credits': 3, 'source': 'p'},
        {'program': 'SWE', 'code': 'SE111', 'title': 'B', 'credits': 3, 'source': 'p'}]
existing = page[:2] + [
    {'program': 'CSE', 'code': 'CSE328', 'title': None, 'credits': None, 'source': 'r', 'note': 'n'},
    {'program': 'CSE', 'code': 'CSE441', 'title': None, 'credits': None, 'source': 'r', 'note': 'n'},
    {'program': 'CSE', 'code': 'CSE112', 'title': 'Old title', 'credits': 3, 'source': 'p'}]
print(json.dumps([[r['program'], r['code'], r['title']] for r in m.merge_stubs(page, existing)]))
`]).toString());
  assert.deepEqual(out, [
    ['CSE', 'CSE112', 'A'],
    ['CSE', 'CSE328', null],
    ['CSE', 'CSE441', 'IoT'],
    ['SWE', 'SE111', 'B'],
  ]);
});

test('a program id from the API names a file inside the directory, or nothing', () => {
  const out = execFileSync('python3', ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(resolve(root, 'scripts'))})
import import_diu_curricula as m
print(m.record_path('/tmp/records', 28))
for bad in ['../../data/campuses/diu/profile', '28/../x', '', 'abc']:
    try:
        m.record_path('/tmp/records', bad)
        print('ACCEPTED', bad)
    except ValueError:
        print('refused')
`]).toString().trim().split('\n');
  assert.deepEqual(out, ['/tmp/records/28.json', 'refused', 'refused', 'refused', 'refused']);
});

test('the committed lists are what the importer writes', () => {
  const file = JSON.parse(readFileSync(resolve(root, 'data/campuses/diu/program-courses.json'), 'utf8'));
  assert.match(file.note, /Generated by scripts\/import_diu_curricula\.py/);
  // Program, then code order within it, as the importer writes them.
  const keys = file.records.map((r) => `${r.program}|${r.code}`);
  for (const program of new Set(file.records.map((r) => r.program))) {
    const records = file.records.filter((r) => r.program === program);
    const codes = records.map((r) => r.code);
    assert.deepEqual(codes, [...codes].sort(), `${program} is in code order`);
    // What the importer reads from a program page …
    const read = records.filter((r) => r.title !== null).map((r) => r.code);
    assert.ok(read.every((c) => /^(?:[A-Z]{2,4}\d{3}[A-Z]{0,2}|\d{4}-\d{3}[A-Z]?)$/.test(c)), `${program}'s codes`);
    // … and stubs, which carry a routine's own code shapes (English's ENG0232-03).
    const stubs = records.filter((r) => r.title === null).map((r) => r.code);
    assert.ok(stubs.every((c) => /^(?:[A-Z]{2,4}\d{3}[A-Z]{0,2}|[A-Z]{2,4}\d{4}-\d{2,3})$/.test(c)), `${program}'s stub codes`);
  }
  assert.equal(new Set(keys).size, keys.length);

  // Values, not only shape: one course of each kind the reader had to handle,
  // as DIU's pages give them.
  const course = (program, code) => file.records.find((r) => r.program === program && r.code === code);
  assert.deepEqual(
    [
      course('CSE', 'CSE113'),
      course('CSE', 'CSE114'),
      course('SWE', 'SE112'),
      course('ARCH', 'ARCH102'),
      course('ESDM', 'BIO101A'),
      course('PHARM', 'BPH111P'),
    ].map((c) => c && [c.title, c.credits]),
    [
      ['Programming and Problem Solving', 3],
      ['Programming and Problem Solving Lab', 1.5],
      ['Computer Fundamentals Lab', 1],
      ['Design Studio-I (Basic Design)', 5],
      ['Environmental Biology lab', 1],
      ['Inorganic Pharmacy-I Practical', 1],
    ],
  );
});
