// scripts/import_rds4_sections.mjs
//
// Turns NSU's RDS offered-course table into a campus term file.
//
//   node scripts/import_rds4_sections.mjs --term 263 --system trimester \
//     --source rds4plus-263 --note "…" <rows.json | page.html>
//
// RDS (rds4.northsouth.ac.bd/offered_courses) sits behind a Cloudflare
// challenge, so Shohoj never reads it directly. This consumes a copy someone
// else already made: a JSON array of the table's rows (RDS4+'s
// data/response.json — {Course, Section, Faculty, Time, Room, Seats}) or the
// page's HTML (a saved page, or a mirror that serves it verbatim). Both carry
// the same six columns.
//
// Writes data/campuses/<campus>/sections/<term>-<system>.json, and adds a
// catalogue stub (title and credits null) for every course the catalogue
// lacks — RDS lists codes only, and a section may not name a course
// courses.json doesn't know.
//
// A section whose time is TBA keeps its row with days, start, end and room
// null. Codes that don't fit the course-code pattern (four-digit graduate
// codes, cross-listings like BBT608/BBT609) are left out. Both are counted in
// the file's note.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPUS_DATA_DIR, COURSE_CODE } from './campus_data.mjs';

const DAYS_TIME = /^([A-Z]+) (\d{1,2}):(\d{2}) ?(AM|PM) - (\d{1,2}):(\d{2}) ?(AM|PM)$/;

/** `04:20 PM` parts → `16:20`. */
function to24h(hours, minutes, meridiem) {
  const h = (Number(hours) % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${minutes}`;
}

// Faculty initials and room codes: letters, digits and the few separators RDS
// uses (`SAC415B_V`, `NAC201-v1`, `TV LAB`). Anything else — markup above all —
// is not a value RDS would show, and these end up rendered in the app.
const PLAIN_TEXT = /^[A-Za-z0-9 _./()-]+$/;

const blankToNull = (value, label) => {
  const v = String(value ?? '').trim();
  if (v === '' || v.toUpperCase() === 'TBA') return null;
  if (!PLAIN_TEXT.test(v)) throw new Error(`${label}: unexpected characters in "${v}"`);
  return v;
};

/**
 * Convert RDS table rows to term-file records. Rows use RDS's column names;
 * `Seats` and `Seats Available` are both accepted.
 */
export function convertRows(rows) {
  const records = [];
  const skipped = { code: [] };
  let tba = 0;
  for (const row of rows) {
    const course = String(row.Course ?? '').trim();
    if (!COURSE_CODE.test(course)) {
      skipped.code.push(course);
      continue;
    }
    const time = String(row.Time ?? '').trim();
    const unscheduled = time.toUpperCase() === 'TBA';
    const m = unscheduled ? null : DAYS_TIME.exec(time);
    if (!unscheduled && !m) throw new Error(`${course}.${row.Section}: unreadable time "${time}"`);
    if (unscheduled) tba += 1;
    const seats = Number(row.Seats ?? row['Seats Available']);
    records.push({
      course,
      section: Number(row.Section),
      faculty: blankToNull(row.Faculty, `${course}.${row.Section} faculty`),
      days: m ? m[1] : null,
      start: m ? to24h(m[2], m[3], m[4]) : null,
      end: m ? to24h(m[5], m[6], m[7]) : null,
      room: m ? blankToNull(row.Room, `${course}.${row.Section} room`) : null,
      capacity: null,
      seatsAvailable: seats,
    });
  }
  records.sort((a, b) =>
    a.course < b.course ? -1 : a.course > b.course ? 1 : a.section - b.section,
  );
  return { records, skipped, tba };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/**
 * A cell's text. Tags are stripped until none are left (one pass leaves
 * `<script` behind from `<scr<b>ipt>`), and entities are decoded in a single
 * pass, so `&amp;lt;` is the text `&lt;`, never a `<`.
 */
function decode(html) {
  let text = html;
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, name) => ENTITIES[name]).trim();
}

/** Read the offered-course table out of an RDS page's HTML. */
export function rowsFromHtml(html) {
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => decode(c[1])),
  );
  const header = trs.findIndex((cells) => cells.includes('Course') && cells.includes('Time'));
  if (header === -1) throw new Error('no offered-course table (Course/Time header) in the HTML');
  const names = trs[header];
  return trs
    .slice(header + 1)
    .filter((cells) => cells.length === names.length)
    .map((cells) => Object.fromEntries(names.map((n, i) => [n, cells[i]])));
}

// ── Writing, in the layout the committed files already use ─────────────────

/** One JSON value the way the committed files spell it: `{"a": 1, "b": null}`. */
function inline(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`)
    .join(', ')}}`;
}

/** A records file: top-level keys two spaces in, one record per line. */
export function formatRecordsFile(data) {
  const lines = Object.entries(data).map(([k, v]) =>
    k === 'records'
      ? `  "records": [\n${v.map((r) => `    ${inline(r)}`).join(',\n')}\n  ]`
      : `  ${JSON.stringify(k)}: ${inline(v)}`,
  );
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** Add a null-titled stub for each code the catalogue lacks, kept in code order. */
export function addCourseStubs(catalogue, codes, source) {
  const known = new Set(catalogue.records.map((r) => r.code));
  const added = [...new Set(codes)].filter((c) => !known.has(c)).sort();
  const records = [
    ...catalogue.records,
    ...added.map((code) => ({ code, title: null, credits: null, source })),
  ].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { catalogue: { ...catalogue, records }, added };
}

function main(argv) {
  const args = { campus: 'nsu' };
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else inputs.push(a);
  }
  if (!args.term || !args.system || !args.source || !args.note || inputs.length !== 1) {
    console.error(
      'usage: import_rds4_sections.mjs --term <code> --system <termSystem> --source <id> --note <text> [--campus nsu] <rows.json|page.html>',
    );
    process.exit(2);
  }
  const text = fs.readFileSync(inputs[0], 'utf8');
  const rows = text.trimStart().startsWith('[') ? JSON.parse(text) : rowsFromHtml(text);
  const { records, skipped, tba } = convertRows(rows);

  const dir = path.join(CAMPUS_DATA_DIR, args.campus);
  const coursesPath = path.join(dir, 'courses.json');
  const coursesText = fs.readFileSync(coursesPath, 'utf8');
  const catalogue = JSON.parse(coursesText);
  // Rewriting courses.json must not reflow the lines nobody touched.
  if (formatRecordsFile(catalogue) !== coursesText) {
    throw new Error(
      `${coursesPath} is not in the layout this script writes; refusing to rewrite it`,
    );
  }
  const stubs = addCourseStubs(
    catalogue,
    records.map((r) => r.course),
    args.source,
  );

  const counts =
    `${tba} section(s) had a TBA time, so their days, start, end and room are null. ` +
    `Left out: ${skipped.code.length} whose code doesn't fit the course-code pattern ` +
    `(${[...new Set(skipped.code)].sort().join(', ') || 'none'}).`;
  const termFile = {
    term: args.term,
    termSystem: args.system,
    source: args.source,
    note: `${args.note} ${counts}`,
    records,
  };
  const name = `${args.term}-${args.system}.json`;
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sections', name), formatRecordsFile(termFile));
  fs.writeFileSync(coursesPath, formatRecordsFile(stubs.catalogue));

  console.log(
    `${records.length} sections → sections/${name}; ${stubs.added.length} catalogue stub(s) added. ${counts}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
