/**
 * tests/importBubtRoutine.test.js
 *
 * scripts/import_bubt_routine.mjs turns BUBT routine pages, saved by hand from
 * a browser, into campus term files (#927). These pin what is easy to get
 * subtly wrong: 01:15 PM is 13:15; a lab's two slots are one meeting but a
 * class either side of the lunch break is two; one section's legend slip must
 * not rename a course; and a page the importer does not understand stops it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CAMPUS_DATA_DIR } from '../scripts/campus_data.mjs';
import {
  buildRecords,
  formatRecordsFile,
  mergeProgramCourses,
  normaliseCode,
  normaliseSection,
  parseRoutinePage,
  termOf,
} from '../scripts/import_bubt_routine.mjs';

// One intake-section in annex's markup. `cells` maps a day label to six slots.
function section({ program = 'B.Sc. in CSE', intake = '59 - 1', semester = 'Fall, 2026', cells, legend }) {
  const slot = (c) => (c ? `<td style='background: #fff ;'> <strong>${c[0]}</strong><br><strong>FC:</strong> ${c[1]} <br><strong>R:</strong> ${c[2]} </td>` : '<td style="background: #FFF ;"> </td>');
  const rows = Object.entries(cells)
    .map(([day, six]) => `<tr>\n <th>${day}</th>\n ${six.map(slot).join('')} </tr>`)
    .join('\n');
  const legendRows = legend
    .map(([code, title, fc, name]) => `<tr><td>${code}</td><td>${title}</td><td>${fc}</td><td>${name} </td></tr>`)
    .join('');
  return `<table id="HdtableRtn" align="center" width="100%">
 <tr><td align="left"><strong>Program: </strong> ${program} <br /></td>
 <td align="center"><strong>Intake: </strong> ${intake} <br /></td>
 <td align="right"><strong>Semester: </strong> ${semester} <br /></td></tr></table>
<table align="center" id="tableRtn" width="100%">
 <tr><th><em>Day</em>/<em>Time</em></th><th>08:15 AM to 09:45 AM</th><th>09:45 AM to 11:15 AM</th><th>11:15 AM to 12:45 PM</th><th>01:15 PM to 02:45 PM</th><th>02:45 PM to 04:15 PM</th><th>04:15 PM to 05:45 PM</th></tr>
${rows}
</table>
<table><tr><th>Course Code</th><th>Course Title</th><th>Faculty Code</th><th>Faculty Name</th></tr>${legendRows}</table>`;
}

const _ = null;
const CSE = section({
  cells: {
    SUN: [_, _, _, _, ['CSE 102', 'ZAK', '2517'], ['CSE 102', 'ZAK', '2517']],
    TUE: [_, _, ['CSE 101', 'ZAK', '2316'], ['CSE 101', 'ZAK', '2316'], _, _],
  },
  legend: [
    ['CSE 101', 'Structured Programming Language', 'ZAK', 'Zobaer Al Khalil Zihad'],
    ['CSE 102', 'Structured Programming Language Lab', 'ZAK', 'Zobaer Al Khalil Zihad'],
  ],
});
const LAW = section({
  program: 'LL.B (Hons)',
  intake: '56 - 1',
  cells: { SAT: [['Law 624', 'SUBA', '1508'], _, _, _, _, _] },
  legend: [['Law 624', 'Transfer of Property Act', 'SUBA', 'Subarna']],
});
const systems = { CSE: 'trimester', LLB: 'bisemester' };

// ── Small conversions ───────────────────────────────────────────────────────

assert.deepEqual(normaliseCode('CSE 101'), { code: 'CSE101', note: null });
assert.deepEqual(normaliseCode('ENG 1101'), { code: 'ENG1101', note: null });
assert.deepEqual(normaliseCode('CSE 498B'), { code: 'CSE498B', note: null });
assert.deepEqual(normaliseCode('Law 624'), { code: 'LAW624', note: 'Printed "Law 624" in the routine; uppercased.' });
assert.throws(() => normaliseCode('Thesis'), /not a course code/);

assert.equal(normaliseSection('59 - 1'), '59-1');
assert.equal(normaliseSection('52 - 1 (Major: Human Resource Management )'), '52-1 (Major: Human Resource Management)');
assert.equal(normaliseSection('52 - 1B'), '52-1B');

assert.deepEqual(termOf('Fall, 2026'), { term: '263', label: 'Fall 2026' });
assert.deepEqual(termOf('Spring, 2027'), { term: '271', label: 'Spring 2027' });
assert.throws(() => termOf('Winter, 2026'), /not a semester/);

// ── A page → records ────────────────────────────────────────────────────────

const blocks = parseRoutinePage(CSE + LAW);
assert.equal(blocks.length, 2);
assert.equal(blocks[0].programme, 'B.Sc. in CSE');
assert.deepEqual(blocks[0].meetings[0], { course: 'CSE 102', faculty: 'ZAK', room: '2517', day: 'S', start: '14:45', end: '16:15' });

const built = buildRecords(blocks, (p) => systems[p]);
assert.equal(built.term, '263');
assert.deepEqual(Object.keys(built.bySystem).sort(), ['bisemester', 'trimester'], 'Law goes in its own calendar file');

const [cse101, cse102] = built.bySystem.trimester;
// The lab's two consecutive afternoon slots in one room are one meeting.
assert.deepEqual(cse102.meetings, [{ day: 'S', start: '14:45', end: '17:45', room: '2517' }]);
// Either side of the 12:45-13:15 break are two meetings, not one.
assert.deepEqual(cse101.meetings, [
  { day: 'T', start: '11:15', end: '12:45', room: '2316' },
  { day: 'T', start: '13:15', end: '14:45', room: '2316' },
]);
assert.deepEqual(
  { program: cse101.program, course: cse101.course, section: cse101.section, faculty: cse101.faculty, capacity: cse101.capacity },
  { program: 'CSE', course: 'CSE101', section: '59-1', faculty: 'ZAK', capacity: null },
);
assert.equal(built.merged, 1, "only the lab's back-to-back slots merge");

const [law] = built.bySystem.bisemester;
assert.equal(law.course, 'LAW624');
assert.match(law.note, /Printed "Law 624"/, 'a corrected code says so on the record');

// ── Course titles: the programme's majority, not one section's slip ─────────

const slip = buildRecords(
  parseRoutinePage(
    [1, 2, 3]
      .map((n) =>
        section({
          intake: `51 - ${n}`,
          cells: { MON: [['CSE 209', 'AB', '2301'], _, _, _, _, _] },
          legend: [['CSE 209', n === 3 ? 'Data Communication' : 'Operating Systems', 'AB', 'A B']],
        }),
      )
      .join(''),
  ),
  (p) => systems[p],
);
assert.equal(slip.courses.find((c) => c.code === 'CSE209').title, 'Operating Systems');

// ── Merging into program-courses.json ───────────────────────────────────────

{
  const file = { note: 'n', records: [{ program: 'CSE', code: 'CSE101', title: 'Kept as is', credits: 3, source: 'offer' }] };
  const { file: next, added } = mergeProgramCourses(file, built.courses, 'bubt-routine-263');
  assert.deepEqual(added.map((r) => `${r.program}:${r.code}`), ['CSE:CSE102', 'LLB:LAW624']);
  assert.deepEqual(next.records[0], file.records[0], 'an existing course keeps its credits and title');
  assert.equal(next.records.find((r) => r.code === 'CSE102').credits, null, 'a routine gives no credits');
  assert.match(next.records.find((r) => r.code === 'LAW624').note, /uppercased/);
}

// ── What stops the import ───────────────────────────────────────────────────

assert.throws(
  () => buildRecords(parseRoutinePage(section({ program: 'B.Sc. in Architecture', cells: { SUN: [['ARC 101', 'X', '1101'], _, _, _, _, _] }, legend: [] })), () => 'trimester'),
  /unknown programme "B.Sc. in Architecture"/,
);
assert.throws(
  () => buildRecords(parseRoutinePage(CSE + section({ intake: '59 - 2', semester: 'Spring, 2027', cells: { SUN: [['CSE 101', 'ZAK', '2316'], _, _, _, _, _] }, legend: [] })), (p) => systems[p]),
  /more than one term/,
);
assert.throws(
  () =>
    buildRecords(
      parseRoutinePage(section({ cells: { SUN: [['CSE 101', 'ZAK', '2316'], _, _, _, _, _], MON: [['CSE 101', 'RS', '2316'], _, _, _, _, _] }, legend: [] })),
      (p) => systems[p],
    ),
  /has 2 teachers/,
);
// A bot-check page saved by mistake holds no routine at all.
assert.deepEqual(parseRoutinePage('<title>One moment, please...</title>'), []);

// ── Layout: rewriting the committed files reflows nothing ───────────────────

for (const file of ['sections/263-trimester.json', 'sections/263-bisemester.json', 'program-courses.json', 'sources.json']) {
  const raw = fs.readFileSync(path.join(CAMPUS_DATA_DIR, 'bubt', file), 'utf8');
  assert.equal(formatRecordsFile(JSON.parse(raw)), raw, `${file} round-trips through the importer's layout`);
}

console.log('importBubtRoutine: saved routine pages become term files');
