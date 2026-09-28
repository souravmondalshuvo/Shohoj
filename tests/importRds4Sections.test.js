/**
 * tests/importRds4Sections.test.js
 *
 * scripts/import_rds4_sections.mjs turns a copy of NSU's RDS offered-course
 * table into a campus term file. These pin the conversions that are easy to get
 * subtly wrong — 12 PM is noon, not midnight; a TBA faculty is null, not the
 * initials "TBA" — and that it rewrites the committed files without reflowing
 * the lines it didn't touch.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CAMPUS_DATA_DIR } from '../scripts/campus_data.mjs';
import {
  addCourseStubs,
  convertRows,
  formatRecordsFile,
  rowsFromHtml,
} from '../scripts/import_rds4_sections.mjs';

const row = (over) => ({
  Course: 'CSE115',
  Section: '3',
  Faculty: 'NvA',
  Time: 'ST 11:20 AM - 12:50 PM',
  Room: 'SAC313',
  Seats: '4',
  ...over,
});

// ── Rows → records ──────────────────────────────────────────────────────────

{
  const { records } = convertRows([row()]);
  assert.deepEqual(records, [
    {
      course: 'CSE115',
      section: 3,
      faculty: 'NvA',
      days: 'ST',
      start: '11:20',
      end: '12:50',
      room: 'SAC313',
      capacity: null,
      seatsAvailable: 4,
    },
  ]);
}

// The 12-hour clock's two traps: 12 PM is noon and 12 AM is midnight.
{
  const [r] = convertRows([row({ Time: 'RA 12:15 PM - 01:45 PM' })]).records;
  assert.equal(r.start, '12:15');
  assert.equal(r.end, '13:45');
  const [night] = convertRows([row({ Time: 'F 12:00 AM - 01:00 AM' })]).records;
  assert.equal(night.start, '00:00');
}

// TBA faculty and rooms are unknowns, not initials or a room called "TBA".
{
  const [r] = convertRows([row({ Faculty: 'TBA', Room: ' tba ' })]).records;
  assert.equal(r.faculty, null);
  assert.equal(r.room, null);
}

// A TBA time keeps the section, unscheduled: days, start, end and room all
// null (a room without a time would be a meeting nobody can place). Codes
// outside the course-code pattern (four-digit graduate codes, cross-listings)
// would fail the validator, so they are left out and counted.
{
  const { records, skipped, tba } = convertRows([
    row({ Time: 'TBA', Section: '9' }),
    row({ Course: 'CE6000A' }),
    row({ Course: 'BBT608/BBT609' }),
    row(),
  ]);
  assert.equal(records.length, 2);
  assert.equal(tba, 1);
  const unscheduled = records.find((r) => r.section === 9);
  assert.deepEqual(
    [unscheduled.days, unscheduled.start, unscheduled.end, unscheduled.room],
    [null, null, null, null],
  );
  assert.equal(unscheduled.seatsAvailable, 4, 'an unscheduled section still has seats');
  assert.deepEqual(skipped.code, ['CE6000A', 'BBT608/BBT609']);
}

// A time the parser doesn't recognise stops the import rather than guessing.
assert.throws(() => convertRows([row({ Time: 'Sun 11:20-12:50' })]), /unreadable time/);

// Records come out in course, then numeric section, order — 2 before 10.
{
  const { records } = convertRows([
    row({ Section: '10' }),
    row({ Course: 'ACT201', Section: '1' }),
    row({ Section: '2' }),
  ]);
  assert.deepEqual(
    records.map((r) => `${r.course}.${r.section}`),
    ['ACT201.1', 'CSE115.2', 'CSE115.10'],
  );
}

// ── HTML → rows ─────────────────────────────────────────────────────────────

{
  const html = `<table><thead><tr><th>#</th><th>Course</th><th>Section</th><th>Faculty</th>
    <th>Time</th><th>Room</th><th>Seats Available</th></tr></thead>
    <tbody><tr><td>1</td><td><b>CSE115</b></td><td>3</td><td>NvA</td>
    <td>ST 11:20 AM - 12:50 PM</td><td>SAC313</td><td>4</td></tr></tbody></table>`;
  const rows = rowsFromHtml(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Course, 'CSE115');
  // The page labels the column "Seats Available"; convertRows reads either name.
  assert.equal(convertRows(rows).records[0].seatsAvailable, 4);
  assert.throws(() => rowsFromHtml('<p>Just a moment...</p>'), /no offered-course table/);
}

// ── Catalogue stubs ─────────────────────────────────────────────────────────

{
  const catalogue = {
    source: 's',
    records: [
      { code: 'ACT201', title: 'A', credits: 3 },
      { code: 'CSE115', title: 'C', credits: 3 },
    ],
  };
  const { catalogue: out, added } = addCourseStubs(catalogue, ['CSE115', 'BIO103', 'BIO103'], 'rds');
  assert.deepEqual(added, ['BIO103'], 'each missing code once; known codes untouched');
  assert.deepEqual(
    out.records.map((r) => r.code),
    ['ACT201', 'BIO103', 'CSE115'],
  );
  assert.deepEqual(out.records[1], { code: 'BIO103', title: null, credits: null, source: 'rds' });
}

// ── Writing ─────────────────────────────────────────────────────────────────

// Every committed records file must survive a rewrite byte for byte, or the
// next import would reflow lines nobody changed.
for (const file of [
  'courses.json',
  'sections/252-trimester.json',
  'sections/253-trimester.json',
  'sections/263-trimester.json',
]) {
  const text = fs.readFileSync(path.join(CAMPUS_DATA_DIR, 'nsu', file), 'utf8');
  assert.equal(formatRecordsFile(JSON.parse(text)), text, `${file} round-trips`);
}

console.log('importRds4Sections: RDS rows convert, and committed files round-trip');
