// The paste box behind "Import Transcript" on a campus with no grade-sheet PDF
// (#843). An NSU student copies their RDS Grade History page and pastes it
// here; js/import/gradeHistory-core.js reads it, and the confirmed result goes
// through the same applyImport as a BRACU PDF.
//
// Nothing pasted is sent anywhere — it is parsed in this tab and, once the
// student confirms, written to the same local state every other import writes.
//
// Everything on screen is built with DOM calls: the text comes from a clipboard,
// so none of it is ever handed to innerHTML.

import { getActiveCampus } from '../core/activeCampus.js';
import { getActiveCatalog } from '../core/activeCatalog.js';
import { registerAction } from '../core/dispatch.js';
import { calculateCgpaTotals } from '../core/gpa-core.js';
import { state } from '../core/state.js';
import { parseGradeHistoryRows, parseGradeHistoryText } from '../import/gradeHistory-core.js';
import { showImportModal, stageImport } from './modals.js';

// Campuses whose students import by pasting their portal's grade page.
const GRADE_HISTORY_CAMPUSES = new Set(['nsu']);
// RDS prints two decimals; whether it rounds or cuts the third is not known.
const GRADE_HISTORY_CGPA_TOLERANCE = 0.01;

// The HTML half of the last paste. A textarea only ever receives the plain-text
// half, and the table's cell boundaries are more reliable in the markup.
let _gradeHistoryHtml = '';

registerAction('gradeHistory:read', () => readGradeHistoryPaste());

/** True when the active campus imports grades by paste rather than by PDF. */
export function importsByGradeHistoryPaste() {
  return GRADE_HISTORY_CAMPUSES.has(getActiveCampus().id);
}

function ghNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ghButton(label, action, className) {
  const button = ghNode('button', className, label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function ghModalBody() {
  showImportModal('');
  const content = document.getElementById('importModalContent');
  if (!content) return null;
  content.replaceChildren();
  return content;
}

/** Every table in the pasted markup, as rows of cell text. Parsed inert — nothing in it runs. */
function ghTablesFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body ? doc.body.textContent : '';
  return [...doc.querySelectorAll('table')].map(table => ({
    text,
    rows: [...table.rows].map(row => ({
      cells: [...row.cells].map(cell => cell.textContent),
      summary: row.classList.contains('summary-row'),
    })),
  }));
}

const ghCourseCount = parsed => parsed.semesters.reduce((n, semester) => n + semester.courses.length, 0);

/** The best reading of a paste: the markup's richest table, else the plain text. */
export function readGradeHistory(html, text) {
  let best = parseGradeHistoryText(text);
  for (const table of ghTablesFromHtml(html)) {
    const parsed = parseGradeHistoryRows(table.rows, { text: table.text });
    if (ghCourseCount(parsed) > ghCourseCount(best)) best = parsed;
  }
  return best;
}

export function openGradeHistoryImport() {
  _gradeHistoryHtml = '';
  const content = ghModalBody();
  if (!content) return;
  const campus = getActiveCampus();

  content.append(
    ghNode('div', 'gh-import-title', '📄 Import your grades from RDS'),
    ghNode('p', 'gh-import-lede', `${campus.shortName} has no grade-sheet PDF to upload, so copy the page instead.`),
  );

  const steps = ghNode('ol', 'gh-import-steps');
  [
    'Open RDS and go to Grade History.',
    'Select the whole page (Ctrl/⌘ + A) and copy it.',
    'Paste it into the box below.',
  ].forEach(step => steps.append(ghNode('li', '', step)));

  const box = ghNode('textarea', 'gh-import-box');
  box.id = 'gradeHistoryPaste';
  box.rows = 7;
  box.spellcheck = false;
  box.placeholder = 'Paste your Grade History here';
  box.setAttribute('aria-label', 'Your RDS Grade History, pasted');
  box.addEventListener('paste', event => {
    _gradeHistoryHtml = event.clipboardData ? event.clipboardData.getData('text/html') : '';
  });
  box.addEventListener('input', () => {
    if (box.value === '') _gradeHistoryHtml = '';
  });

  const status = ghNode('p', 'gh-import-status');
  status.id = 'gradeHistoryStatus';
  status.setAttribute('role', 'alert');

  const actions = ghNode('div', 'gh-import-actions');
  actions.append(
    ghButton('Read my grades', 'gradeHistory:read', 'gh-import-primary'),
    ghButton('Cancel', 'modals:hideImport', 'gh-import-secondary'),
  );

  content.append(
    steps,
    box,
    ghNode('p', 'gh-import-note', 'What you paste is read in this browser and goes nowhere else. Shohoj never asks for your RDS password.'),
    status,
    actions,
  );
  box.focus();
}

function readGradeHistoryPaste() {
  const box = document.getElementById('gradeHistoryPaste');
  const status = document.getElementById('gradeHistoryStatus');
  if (!box || !status) return;

  if (!_gradeHistoryHtml && box.value.trim() === '') {
    status.textContent = 'Paste your Grade History page first.';
    return;
  }
  const parsed = readGradeHistory(_gradeHistoryHtml, box.value);
  if (!parsed.semesters.length) {
    status.textContent = 'No grades could be read from that. Make sure you copied the Grade History page, table included.';
    return;
  }
  showGradeHistoryPreview(parsed);
}

function showGradeHistoryPreview(parsed) {
  const { courses, programs } = getActiveCatalog();
  // Titles as the catalogue spells them, so suggestions and the tracker see
  // the same course. Credits stay RDS's: it is the record, the catalogue is not.
  parsed.semesters.forEach(semester => {
    semester.courses.forEach(course => {
      const code = course.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/)?.[1] ?? course.name;
      if (courses[code]) course.name = courses[code].full;
    });
  });
  // The page does not name a programme, and applyImport clears the picker when
  // none is detected — so the one the student already chose is carried through.
  parsed.detectedDept = programs[state.currentDept]?.label ?? null;

  const hadSemesters = state.semesters.length > 0;
  const { grades: scale, retake } = getActiveCampus();
  const computed = calculateCgpaTotals(parsed.semesters, { includeRunning: false, scale, retake }).cgpa;
  const official = parsed.officialCgpa;

  const content = ghModalBody();
  if (!content) return;
  stageImport(parsed);

  const total = ghCourseCount(parsed);
  const count = parsed.semesters.length;
  content.append(
    ghNode('div', 'gh-import-title', '📄 Grade History read'),
    ghNode('p', 'gh-import-lede', `Found ${count} semester${count === 1 ? '' : 's'} and ${total} course${total === 1 ? '' : 's'}.`),
  );

  const table = ghNode('table', 'gh-import-table');
  const head = table.createTHead().insertRow();
  ['Semester', 'Courses', 'TGPA on RDS'].forEach(label => head.append(ghNode('th', '', label)));
  const body = table.createTBody();
  parsed.semesters.forEach((semester, at) => {
    const row = body.insertRow();
    const tgpa = parsed.official[at]?.tgpa;
    row.append(
      ghNode('td', '', semester.running ? `${semester.name} (running)` : semester.name),
      ghNode('td', '', String(semester.courses.length)),
      ghNode('td', '', typeof tgpa === 'number' ? tgpa.toFixed(2) : '—'),
    );
  });
  const wrap = ghNode('div', 'gh-import-table-wrap');
  wrap.append(table);
  content.append(wrap);

  const check = ghNode('p', 'gh-import-check');
  check.id = 'gradeHistoryCheck';
  if (computed === null) {
    check.textContent = 'No graded courses yet, so there is no CGPA to check.';
  } else if (official === null) {
    check.textContent = `CGPA ${computed.toFixed(2)}. RDS's own figure was not in the paste, so it could not be checked.`;
  } else if (Math.abs(computed - official) <= GRADE_HISTORY_CGPA_TOLERANCE) {
    check.classList.add('is-match');
    check.textContent = `CGPA ${computed.toFixed(2)} — matches RDS.`;
  } else {
    check.classList.add('is-mismatch');
    check.textContent = `Shohoj works this out as ${computed.toFixed(2)}, but RDS shows ${official.toFixed(2)}. Check your retakes and withdrawn courses after importing.`;
  }
  content.append(check);

  if (parsed.warnings.length) {
    const notes = ghNode('ul', 'gh-import-warnings');
    parsed.warnings.forEach(warning => notes.append(ghNode('li', '', warning)));
    content.append(notes);
  }
  if (hadSemesters) {
    content.append(ghNode('p', 'gh-import-note', 'Importing replaces the semesters already in your calculator.'));
  }

  const actions = ghNode('div', 'gh-import-actions');
  actions.append(
    ghButton('✅ Import Now', 'modals:applyImport', 'gh-import-primary'),
    ghButton('Cancel', 'modals:hideImport', 'gh-import-secondary'),
  );
  content.append(actions);
}
