// Read a pasted RDS "Grade History" page into calculator semesters (#843).
//
// NSU has no downloadable grade sheet to hand to the PDF importer, and RDS sits
// behind a login this project will not ask for. What is left is the page the
// student is already looking at: they can see it, so they can copy it.
//
// The table has one row per course attempt and seven columns —
//   Semester Name | Semester Year | Course Code | Course Credit |
//   Course Title  | Course Grade  | Cr.Count
// Only the first row of a semester carries its name and year; the rows under
// it leave those two cells empty. A summary row ("TGPA: 3.50  CGPA: 3.42")
// closes each semester.
//
// This module is pure: it takes rows of cell text and knows nothing about the
// DOM. The rows come from the plain-text half of the clipboard, where a copied
// table is one line per row with tabs between cells — no markup is parsed.
//
// The column layout comes from a published reader of the same page, not from a
// page captured for this repo. Columns are therefore found by header name, and
// anything that could not be placed is reported rather than guessed at.

const GH_COLUMNS = {
  name:    'semester name',
  year:    'semester year',
  code:    'course code',
  credit:  'course credit',
  title:   'course title',
  grade:   'course grade',
  crCount: 'cr.count',
};
// Enough to tell this table from any other on the page.
const GH_REQUIRED = ['name', 'grade', 'crCount'];
// The order RDS prints them in — used only when the header row was not copied.
const GH_DEFAULT_ORDER = ['name', 'year', 'code', 'credit', 'title', 'grade', 'crCount'];

const GH_SEASONS = { spring: 'Spring', summer: 'Summer', fall: 'Fall' };
const GH_CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;
// Grades the calculator has no row for are imported blank; these are the ones it has.
const GH_KNOWN_GRADES = new Set(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'W', 'I']);

const ghClean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const ghHeaderKey = value => ghClean(value).toLowerCase().replace(/\s*\.\s*/g, '.');

function ghNumber(value) {
  const n = parseFloat(ghClean(value));
  return Number.isFinite(n) ? n : null;
}

/** `{ name: 0, year: 1, … }` if this row is the table's header, else null. */
function ghColumnsFromHeader(cells) {
  const keys = cells.map(ghHeaderKey);
  const index = {};
  for (const [field, label] of Object.entries(GH_COLUMNS)) {
    const at = keys.indexOf(label);
    if (at >= 0) index[field] = at;
  }
  return GH_REQUIRED.every(field => field in index) ? index : null;
}

const GH_DEFAULT_COLUMNS = Object.fromEntries(GH_DEFAULT_ORDER.map((field, at) => [field, at]));

/** A body row in RDS's own column order — the test for a paste without its header. */
function ghLooksLikeDefaultRow(cells) {
  if (cells.length < GH_DEFAULT_ORDER.length) return false;
  const code = ghClean(cells[GH_DEFAULT_COLUMNS.code]).replace(/\s+/g, '').toUpperCase();
  return GH_CODE_RE.test(code) && ghNumber(cells[GH_DEFAULT_COLUMNS.credit]) !== null;
}

function ghSummaryOf(row) {
  const text = row.cells.map(ghClean).join(' ');
  const tgpa = text.match(/TGPA\s*:?\s*(\d+(?:\.\d+)?)/i);
  const cgpa = text.match(/CGPA\s*:?\s*(\d+(?:\.\d+)?)/i);
  if (!row.summary && !tgpa && !cgpa) return null;
  return { tgpa: tgpa ? parseFloat(tgpa[1]) : null, cgpa: cgpa ? parseFloat(cgpa[1]) : null };
}

function ghSemesterLabel(name, year) {
  const season = GH_SEASONS[ghClean(name).toLowerCase()] || ghClean(name);
  return ghClean(`${season} ${ghClean(year)}`);
}

/**
 * Plain-text copy of an HTML table: one line per row, cells split by tabs.
 * Lines are not trimmed first — the leading tabs are the empty semester cells.
 */
export function rowsFromText(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => ({ cells: line.split('\t').map(ghClean), summary: false }));
}

/** `Grade History of 2012345642` anywhere in what was copied. */
export function studentIdFrom(text) {
  const match = String(text ?? '').match(/Grade History of\s+([0-9]{6,12})\b/i);
  return match ? match[1] : null;
}

/**
 * @param {{ cells: string[], summary?: boolean }[]} rows
 * @returns {{
 *   semesters: { id: number, name: string, running: boolean,
 *                courses: { name: string, credits: number, grade: string }[] }[],
 *   official: { name: string, tgpa: number|null, cgpa: number|null }[],
 *   officialCgpa: number|null,
 *   detectedDept: null, studentId: string|null, studentName: null,
 *   warnings: string[],
 * }}
 */
export function parseGradeHistoryRows(rows, { text = '' } = {}) {
  const list = Array.isArray(rows) ? rows.filter(row => row && Array.isArray(row.cells)) : [];
  const warnings = [];

  let columns = null;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const found = ghColumnsFromHeader(list[i].cells);
    if (found) { columns = found; start = i + 1; break; }
  }
  if (!columns && list.some(row => ghLooksLikeDefaultRow(row.cells))) {
    columns = GH_DEFAULT_COLUMNS;
    warnings.push('The header row was not in the paste, so the columns were read in the order RDS prints them.');
  }

  const result = {
    semesters: [],
    official: [],
    officialCgpa: null,
    detectedDept: null,
    studentId: studentIdFrom(text),
    studentName: null,
    warnings,
  };
  if (!columns) return result;

  const cell = (row, field) => (field in columns ? ghClean(row.cells[columns[field]]) : '');
  const unknownGrades = new Set();
  let skipped = 0;
  let current = null;
  let record = null;

  for (const row of list.slice(start)) {
    const summary = ghSummaryOf(row);
    if (summary) {
      if (record) {
        record.tgpa = summary.tgpa;
        record.cgpa = summary.cgpa;
        if (summary.cgpa !== null) result.officialCgpa = summary.cgpa;
      }
      current = null;
      record = null;
      continue;
    }
    // A header repeated further down (a second page of the same table).
    if (ghColumnsFromHeader(row.cells)) continue;

    const name = cell(row, 'name');
    const year = cell(row, 'year');
    if (name || year) {
      const label = ghSemesterLabel(name, year);
      current = { id: result.semesters.length + 1, name: label, courses: [], running: false };
      record = { name: label, tgpa: null, cgpa: null };
      result.semesters.push(current);
      result.official.push(record);
    }

    const code = cell(row, 'code').replace(/\s+/g, '').toUpperCase();
    if (!GH_CODE_RE.test(code)) {
      // A row that only opens a semester is not a failed course; anything else is.
      const opensOnly = (name || year) && code === '';
      if (!opensOnly && row.cells.some(value => ghClean(value) !== '')) skipped++;
      continue;
    }
    if (!current) { skipped++; continue; }

    // Course Credit is the course's own weight; Cr.Count is what RDS counted
    // towards the total, and is the only one of the two left when the first is blank.
    const credit = ghNumber(cell(row, 'credit'));
    const counted = ghNumber(cell(row, 'crCount'));
    const rawGrade = cell(row, 'grade').toUpperCase();
    let grade = '';
    if (GH_KNOWN_GRADES.has(rawGrade)) grade = rawGrade;
    else if (rawGrade) unknownGrades.add(rawGrade.slice(0, 8));

    const title = cell(row, 'title');
    current.courses.push({
      name: title ? `${title} (${code})` : code,
      credits: credit ?? counted ?? 0,
      grade,
    });
  }

  // A semester with courses and not one grade yet is the one being taken now.
  for (const semester of result.semesters) {
    semester.running = semester.courses.length > 0 && semester.courses.every(course => !course.grade);
  }
  const emptied = result.semesters.filter(semester => semester.courses.length === 0);
  if (emptied.length) {
    const kept = new Set(result.semesters.filter(semester => semester.courses.length > 0));
    result.official = result.official.filter((_, at) => kept.has(result.semesters[at]));
    result.semesters = [...kept].map((semester, at) => ({ ...semester, id: at + 1 }));
    warnings.push(`${emptied.length} semester${emptied.length === 1 ? '' : 's'} had no readable courses and ${emptied.length === 1 ? 'was' : 'were'} left out.`);
  }

  if (unknownGrades.size) {
    warnings.push(`Grades left blank because the calculator has no value for them: ${[...unknownGrades].slice(0, 6).join(', ')}.`);
  }
  if (skipped) {
    warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} could not be read as a course and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  }
  return result;
}

/** The plain-text path: what a paste yields when the clipboard carried no HTML. */
export function parseGradeHistoryText(text) {
  return parseGradeHistoryRows(rowsFromText(text), { text });
}
