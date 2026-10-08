// The paste box behind "Import Transcript" on a campus with no grade-sheet PDF
// (#843). An NSU student copies their RDS Grade History page and pastes it
// here; js/import/gradeHistory-core.js reads it, and the confirmed result goes
// through the same applyImport as a BRACU PDF.
//
// Nothing pasted is sent anywhere — it is parsed in this tab and, once the
// student confirms, written to the same local state every other import writes.
//
// Only the plain-text half of the clipboard is read. A copied table arrives
// there as one line per row with tabs between cells, which is all the reader
// needs; the HTML half would have to be parsed as markup, and what is read
// should be exactly what the student sees in the box. Everything on screen is
// built with DOM calls, so nothing pasted is ever treated as HTML.

import { getActiveCampus } from '../core/activeCampus.js';
import { hasFeature } from '../core/university.js';
import { getActiveCatalog } from '../core/activeCatalog.js';
import { registerAction } from '../core/dispatch.js';
import { calculateCgpaTotals } from '../core/gpa-core.js';
import { state } from '../core/state.js';
import { parseGradeHistoryText } from '../import/gradeHistory-core.js';
import { showImportModal, stageImport } from './modals.js';

// Campuses whose students import by pasting their portal's grade page.
const GRADE_HISTORY_CAMPUSES = new Set(['nsu']);
// RDS prints two decimals; whether it rounds or cuts the third is not known.
const GRADE_HISTORY_CGPA_TOLERANCE = 0.01;

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

const ghCourseCount = parsed => parsed.semesters.reduce((n, semester) => n + semester.courses.length, 0);

/**
 * The one way into a transcript import, for every button that offers it: the
 * paste box on a campus that pastes, the PDF picker everywhere else.
 */
export function openTranscriptImport() {
  // No reader for this campus's transcript: the buttons that lead here are
  // hidden, and one drawn before the campus was known does nothing.
  if (!hasFeature(getActiveCampus(), 'transcript')) return;
  if (importsByGradeHistoryPaste()) { openGradeHistoryImport(); return; }
  document.getElementById('transcriptFileInput')?.click();
}

export function openGradeHistoryImport() {
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

  if (box.value.trim() === '') {
    status.textContent = 'Paste your Grade History page first.';
    return;
  }
  const parsed = parseGradeHistoryText(box.value);
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
