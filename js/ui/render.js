import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState, clearState } from '../core/state.js';
import { calcSemGPA, getRetakenKeys, getSemCreditWarning } from '../core/calculator.js';
import { COURSE_DB } from '../core/catalog.js';
import {
  generateSemesterNames, getLastCompletedSemester,
  countSemesters, getStartSeason, getStartYear,
  escHtml, escAttr, getCurrentSeason, SEASON_ORDER, ordinalSup
} from '../core/helpers.js';
import { resetPlanner, setPlanCourses } from './planner.js';
import { resetPlayground } from './playground.js';
import { openReviewModal } from './reviews.js';
import { normalizeInitials } from '../core/faculty.js';
import { fetchReviewsForFaculty, aggregateRatings } from '../core/reviews.js';
import { registerAction } from '../core/dispatch.js';
import { computeCourseMarks } from '../core/courseMarks.js';

registerAction('render:editSummary',     el => showSummaryForm(Number(el.dataset.semId)));
registerAction('render:removeSemester',  el => removeSemester(Number(el.dataset.semId)));
registerAction('render:hideSummaryForm', () => hideSummaryForm());
registerAction('render:confirmSummary',  () => confirmSummaryForm());
registerAction('render:clearBorder',     el => { el.style.borderColor = ''; });
registerAction('render:courseInput',     (el, ev) => window.onCourseInput?.(ev, Number(el.dataset.semId), Number(el.dataset.idx)));
registerAction('render:pfChange',        el => window.onPFChange?.(Number(el.dataset.semId), Number(el.dataset.idx), el.value));
registerAction('render:autoDetectGrade', el => window.autoDetectGrade?.(Number(el.dataset.semId), Number(el.dataset.idx), el.value, el));
registerAction('render:rateCourse',      el => openRateForCourse(Number(el.dataset.semId), Number(el.dataset.idx)));
registerAction('render:removeCourse',    el => removeCourse(Number(el.dataset.semId), Number(el.dataset.idx)));
registerAction('render:addCourse',       el => addCourse(Number(el.dataset.semId)));
registerAction('render:addSemester',     () => addSemester());
registerAction('render:showSummaryForm', () => showSummaryForm());
registerAction('render:loadSample',      () => loadSampleData());

// ── Per-course marks tracker (#500) ──────────────────────────────────────────
// Mirrors CourseMarksPanel.tsx. Which rows are expanded is view state, so it
// lives here rather than in the saved document.
const _openMarks = new Set();

registerAction('render:toggleMarks', el => {
  const key = `${el.dataset.semId}-${el.dataset.idx}`;
  if (!_openMarks.delete(key)) _openMarks.add(key);
  renderSemesters();
});
registerAction('render:markField',       el => onMarkField(el));
registerAction('render:addMarkComponent', el =>
  setMarks(Number(el.dataset.semId), Number(el.dataset.idx),
    [...marksOf(courseAt(Number(el.dataset.semId), Number(el.dataset.idx))), blankMarkComponent()]));
registerAction('render:removeMarkComponent', el => {
  const semId = Number(el.dataset.semId), idx = Number(el.dataset.idx);
  const ci = Number(el.dataset.ci);
  setMarks(semId, idx, marksOf(courseAt(semId, idx)).filter((_, n) => n !== ci));
});
registerAction('render:applyProjected',  el =>
  applyProjectedLetter(Number(el.dataset.semId), Number(el.dataset.idx), el.dataset.letter));

function courseAt(semId, idx) {
  return state.semesters.find(s => s.id === semId)?.courses?.[idx] ?? null;
}

function marksOf(course) {
  return Array.isArray(course?.marks) ? course.marks : [];
}

function blankMarkComponent() {
  return { name: '', weight: 0, score: null, outOf: 100 };
}

/** Mirrors setCourseMarks in mutations.ts: empty deletes the key, never stores []. */
function setMarks(semId, idx, marks) {
  const course = courseAt(semId, idx);
  if (!course) return;
  if (marks.length === 0) delete course.marks;
  else course.marks = marks;
  saveState();
  window._shohoj_renderAndRecalc();
}

/** Blank score means "not graded yet"; blank weight/outOf mean zero. */
function onMarkField(el) {
  const semId = Number(el.dataset.semId), idx = Number(el.dataset.idx);
  const ci = Number(el.dataset.ci), field = el.dataset.field;
  const course = courseAt(semId, idx);
  if (!course) return;

  const rows = marksOf(course).length ? marksOf(course).map(m => ({ ...m })) : [blankMarkComponent()];
  while (rows.length <= ci) rows.push(blankMarkComponent());

  if (field === 'name') {
    rows[ci].name = el.value;
  } else if (field === 'score') {
    const n = Number(el.value);
    rows[ci].score = el.value.trim() === '' || !Number.isFinite(n) ? null : n;
  } else {
    const n = Number(el.value);
    rows[ci][field] = Number.isFinite(n) ? n : 0;
  }

  setMarks(semId, idx, rows);

  // Same focus restore autoDetectGrade does: the whole container re-rendered
  // out from under the caret, so put it back where the student left it.
  const back = document.querySelector(
    `[data-action="render:markField"][data-sem-id="${semId}"][data-idx="${idx}"][data-ci="${ci}"][data-field="${field}"]`,
  );
  if (back) {
    back.focus();
    const len = back.value.length;
    back.setSelectionRange(len, len);
  }
}

function applyProjectedLetter(semId, idx, letter) {
  const course = courseAt(semId, idx);
  if (!course || !letter) return;
  course.grade = letter;
  course.gradePoint = GRADES[letter] ?? '';
  saveState();
  window._shohoj_renderAndRecalc();
}

/** One decimal, but never "83.0" when it is 83. */
function markPct(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Mirrors CourseMarksPanel.tsx. */
function marksPanelHtml(sem, c, i) {
  const rows = marksOf(c).length ? marksOf(c) : [blankMarkComponent()];
  const r = computeCourseMarks(rows);
  const d = `data-sem-id="${sem.id}" data-idx="${i}"`;
  const name = (c.name || '').trim();

  const fieldsHtml = rows.map((row, ci) => `
          <div class="course-marks-row">
            <input type="text" class="course-marks-name" placeholder="Midterm"
              aria-label="Component ${ci + 1} name" value="${escAttr(row.name || '')}"
              data-action="render:markField" ${d} data-ci="${ci}" data-field="name" />
            <input type="text" inputmode="decimal" placeholder="25"
              aria-label="Component ${ci + 1} weight, percent of the course"
              value="${escAttr(row.weight === 0 ? '' : String(row.weight))}"
              data-action="render:markField" ${d} data-ci="${ci}" data-field="weight" />
            <input type="text" inputmode="decimal" placeholder="—"
              aria-label="Component ${ci + 1} score, blank if not graded yet"
              value="${escAttr(row.score === null || row.score === undefined ? '' : String(row.score))}"
              data-action="render:markField" ${d} data-ci="${ci}" data-field="score" />
            <input type="text" inputmode="decimal" placeholder="25"
              aria-label="Component ${ci + 1} total marks"
              value="${escAttr(row.outOf === 0 ? '' : String(row.outOf))}"
              data-action="render:markField" ${d} data-ci="${ci}" data-field="outOf" />
            <button class="btn-remove-course" aria-label="Remove component ${ci + 1}"
              data-action="render:removeMarkComponent" ${d} data-ci="${ci}">×</button>
          </div>`).join('');

  let readout;
  if (!r) {
    readout = `<p class="course-marks-empty">Give at least one component a weight to see where this course stands.</p>`;
  } else {
    const reachable = r.targets.filter(t => t.state === 'reachable');
    const secured = r.targets.filter(t => t.state === 'secured');
    readout = `
        <div class="course-marks-readout">
          <div class="course-marks-stats">
            <span class="course-marks-stat"><strong>${r.inHandPercent === null ? '—' : markPct(r.inHandPercent) + '%'}</strong><small>in hand</small></span>
            <span class="course-marks-stat"><strong>${escHtml(r.worstLetter)} → ${escHtml(r.bestLetter)}</strong><small>floor → ceiling</small></span>
            <span class="course-marks-stat"><strong>${escHtml(r.projectedLetter || '—')}</strong><small>on pace for</small></span>
          </div>
          ${!r.weightsComplete
            ? `<p class="course-marks-note">Weights total ${markPct(r.totalWeight)}%, not 100% — these figures describe the part of the syllabus you have entered.</p>`
            : ''}
          ${secured.length
            ? `<p class="course-marks-note course-marks-secured"><strong>${escHtml(secured[0].letter)}</strong> is secured — you hold it even if everything left scores zero.</p>`
            : ''}
          ${r.remainingWeight > 0 && reachable.length
            ? `<ul class="course-marks-targets">${reachable.map(t => `
              <li><span class="course-marks-target-letter">${escHtml(t.letter)}</span><span>needs <strong>${markPct(t.neededOnRemaining)}%</strong> of the remaining ${markPct(r.remainingWeight)}%</span></li>`).join('')}</ul>`
            : ''}
          ${r.remainingWeight > 0 && !reachable.length && !secured.length
            ? `<p class="course-marks-note">No letter above F is still reachable from here.</p>`
            : ''}
          ${r.projectedLetter
            ? `<button class="btn-add-course course-marks-apply" data-action="render:applyProjected" ${d} data-letter="${escAttr(r.projectedLetter)}"${c.grade === r.projectedLetter ? ' disabled' : ''}>${
                c.grade === r.projectedLetter
                  ? `${escHtml(r.projectedLetter)} applied to this course`
                  : `Use ${escHtml(r.projectedLetter)} in my CGPA projection`
              }</button>`
            : ''}
        </div>`;
  }

  return `
      <div class="course-marks-panel">
        <div class="course-marks-head">
          <span class="course-marks-title">Marks${name ? ` — ${escHtml(name)}` : ''}</span>
          <span class="course-marks-hint">Enter each graded component off your syllabus. Nothing here changes your CGPA until you apply a letter.</span>
        </div>
        <div class="course-marks-grid">
          <div class="course-marks-row course-marks-header">
            <span>Component</span><span>Weight %</span><span>Score</span><span>Out of</span><span></span>
          </div>${fieldsHtml}
        </div>
        <div class="add-course-row">
          <button class="btn-add-course" data-action="render:addMarkComponent" ${d}>+ Add component</button>
        </div>
        ${readout}
      </div>`;
}

const _facultyCourseAggCache = new Map();

const DEMO_PLAN_COURSES = ['CSE221', 'MAT120', 'PHY112'];

export function getRecruiterDemoSemesters() {
  return [
    { name: 'Fall 2024', courses: [
      { name: 'Programming Language I (CSE110)',   credits: 3, grade: 'A-', gradePoint: 3.7, faculty: 'ABC' },
      { name: 'Fundamentals of English (ENG101)',  credits: 3, grade: 'A',  gradePoint: 4.0, faculty: 'XYZ' },
      { name: 'Principles of Physics I (PHY111)',  credits: 3, grade: 'B+', gradePoint: 3.3, faculty: 'PHY' },
    ]},
    { name: 'Spring 2025', courses: [
      { name: 'Programming Language II (CSE111)',  credits: 3, grade: 'B+', gradePoint: 3.3, faculty: 'DEF' },
      { name: 'Data Structures (CSE220)',          credits: 3, grade: 'A-', gradePoint: 3.7, faculty: 'GHI' },
      { name: 'Differential Calculus (MAT110)',    credits: 3, grade: 'B',  gradePoint: 3.0, faculty: 'MAT' },
    ]},
  ];
}

// ── Summary block form state ─────────────────────────────────────────────────
let _summaryFormVisible = false;
let _summaryEditId      = null;
let _dragBindTimer      = null;

export function showSummaryForm(editId = null) {
  _summaryFormVisible = true;
  _summaryEditId      = editId;
  renderSemesters();
  setTimeout(() => {
    const el = document.getElementById('summaryCgpaInput');
    if (el) el.focus();
  }, 30);
}

export function hideSummaryForm() {
  _summaryFormVisible = false;
  _summaryEditId      = null;
  renderSemesters();
}

export function confirmSummaryForm() {
  const cgpaEl      = document.getElementById('summaryCgpaInput');
  const attemptedEl = document.getElementById('summaryAttemptedInput');
  const creditsEl   = document.getElementById('summaryCreditsInput');
  if (!cgpaEl || !attemptedEl || !creditsEl) return;

  const cgpa      = parseFloat(cgpaEl.value);
  const attempted = parseFloat(attemptedEl.value);
  const credits   = parseFloat(creditsEl.value);

  if (isNaN(cgpa) || cgpa < 0 || cgpa > 4.0) {
    cgpaEl.style.borderColor = '#e74c3c';
    cgpaEl.focus();
    return;
  }
  if (isNaN(attempted) || attempted < 0) {
    attemptedEl.style.borderColor = '#e74c3c';
    attemptedEl.focus();
    return;
  }
  if (isNaN(credits) || credits < 0) {
    creditsEl.style.borderColor = '#e74c3c';
    creditsEl.focus();
    return;
  }
  if (credits > attempted) {
    creditsEl.style.borderColor = '#e74c3c';
    creditsEl.focus();
    return;
  }

  if (_summaryEditId !== null) {
    const existing = state.semesters.find(s => s.id === _summaryEditId && s.summary);
    if (existing) {
      existing.summaryCGPA      = cgpa;
      existing.summaryAttempted  = attempted;
      existing.summaryCredits    = credits;
    }
  } else {
    const id = state.semesterCounter++;
    state.semesters.unshift({
      id,
      name:              'Past Semesters',
      summary:           true,
      summaryCGPA:       cgpa,
      summaryAttempted:  attempted,
      summaryCredits:    credits,
      courses:           [],
      running:           false,
    });
  }

  _summaryFormVisible = false;
  _summaryEditId      = null;
  renderSemesters();
  window._shohoj_recalc();
}

// ── Helper: compute ordinal for a given season/year from start ────────────────
function _computeOrdinal(season, year) {
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const deptSeasons = dept && dept.seasons ? dept.seasons : ['Spring', 'Summer', 'Fall'];
  const startSeason = getStartSeason();
  const startYear = parseInt(getStartYear());
  if (!startSeason || !startYear) return null;

  let si = deptSeasons.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = startYear;
  let ordinal = 1;
  while (!(deptSeasons[si] === season && yr === year)) {
    si++;
    if (si >= deptSeasons.length) { si = 0; yr++; }
    ordinal++;
    if (ordinal > 50) break;
  }
  return ordinal;
}

export function getCurrentSemesterForDeptSeasons(now, deptSeasons) {
  const month = now.getMonth() + 1;
  let currentSeason;
  if (month <= 4) currentSeason = 'Spring';
  else if (month <= 8) currentSeason = 'Summer';
  else currentSeason = 'Fall';
  const currentYear = now.getFullYear();

  // If current season isn't in dept's calendar, pick the nearest next one
  let season = currentSeason;
  let year = currentYear;
  if (!deptSeasons.includes(season)) {
    const seasonOrder = ['Spring', 'Summer', 'Fall'];
    const curIdx = seasonOrder.indexOf(season);
    for (let offset = 1; offset <= 3; offset++) {
      const candidate = seasonOrder[(curIdx + offset) % 3];
      if (deptSeasons.includes(candidate)) {
        season = candidate;
        // Wrapping from a later global season into an earlier one means
        // the next offered semester falls in the following calendar year.
        if (seasonOrder.indexOf(candidate) <= curIdx) year = currentYear + 1;
        break;
      }
    }
  }

  return { season, year };
}

function _parseSemesterSeasonYear(name) {
  const match = String(name || '').match(/(Spring|Summer|Fall)\s+(\d{4})/);
  if (!match) return null;
  return { season: match[1], year: parseInt(match[2]) };
}

export function findCurrentSemesterIdForSummaryView(semesters, currentSemester) {
  if (!currentSemester) return null;

  const match = (semesters || []).find(sem => {
    if (!sem || sem.summary || sem.running) return false;
    const parsed = _parseSemesterSeasonYear(sem.name);
    return parsed
      && parsed.season === currentSemester.season
      && parsed.year === currentSemester.year;
  });

  return match ? match.id : null;
}

// ── Helper: get current real-world semester season + year ─────────────────────
function _getCurrentSemester() {
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const deptSeasons = dept && dept.seasons ? dept.seasons : ['Spring', 'Summer', 'Fall'];
  return getCurrentSemesterForDeptSeasons(new Date(), deptSeasons);
}

// ── Helper: advance season/year by one step in dept calendar ─────────────────
function _nextSemester(season, year) {
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const deptSeasons = dept && dept.seasons ? dept.seasons : ['Spring', 'Summer', 'Fall'];
  const idx = deptSeasons.indexOf(season);
  if (idx === -1 || idx === deptSeasons.length - 1) {
    return { season: deptSeasons[0], year: year + 1 };
  }
  return { season: deptSeasons[idx + 1], year };
}

export function getReviewableCourseCode(courseName) {
  const raw = String(courseName || '').trim();
  if (!raw) return '';

  const match = raw.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/i)
    || raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)$/i)
    || raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)\b/i);

  const code = match ? match[1].toUpperCase() : '';
  return code && COURSE_DB[code] ? code : '';
}


// ── Render summary block ─────────────────────────────────────────────────────
function renderSummaryBlock(sem) {
  const cgpaColor = sem.summaryCGPA >= 3.5 ? '#2ECC71'
    : sem.summaryCGPA >= 3.0 ? '#27ae60'
    : sem.summaryCGPA >= 2.5 ? '#F0A500'
    : '#e74c3c';

  return `
  <div class="semester-block summary-block lg-surface" id="sem-${sem.id}"><div class="lg-shine"></div>
    <div class="semester-head" style="background:rgba(46,204,113,0.06);border-bottom-color:rgba(46,204,113,0.2);">
      <div class="semester-head-left">
        <span style="font-size:16px;margin-right:4px">📊</span>
        <span class="semester-label" style="color:var(--green)">Past Semesters</span>
        <span class="semester-gpa-badge" style="color:${cgpaColor};background:rgba(46,204,113,0.10);border:1px solid rgba(46,204,113,0.22);">
          CGPA ${sem.summaryCGPA.toFixed(2)}
        </span>
        <span class="semester-gpa-badge" style="color:var(--text2);background:var(--glass2);border:1px solid var(--border);">
          ${sem.summaryAttempted ? (sem.summaryAttempted % 1 === 0 ? sem.summaryAttempted : sem.summaryAttempted.toFixed(1)) + ' attempted · ' : ''}${sem.summaryCredits % 1 === 0 ? sem.summaryCredits : sem.summaryCredits.toFixed(1)} cr earned
        </span>
      </div>
      <div class="semester-actions">
        <button class="btn-icon" data-action="render:editSummary" data-sem-id="${sem.id}">Edit</button>
        <button class="btn-icon danger" data-action="render:removeSemester" data-sem-id="${sem.id}">Remove</button>
      </div>
    </div>
    <div style="padding:10px 1.2rem;font-size:12px;color:var(--text3);font-style:italic;">
      This block represents your academic history before using Shohoj. Add new semesters below to continue tracking.
    </div>
  </div>`;
}

// ── Render summary entry form ────────────────────────────────────────────────
function renderSummaryForm() {
  const existing = _summaryEditId !== null
    ? state.semesters.find(s => s.id === _summaryEditId && s.summary)
    : null;

  const cgpaVal      = existing ? existing.summaryCGPA.toFixed(2)     : '';
  const attemptedVal = existing ? existing.summaryAttempted.toString() : '';
  const creditsVal   = existing ? existing.summaryCredits.toString()   : '';
  const title        = existing ? 'Edit Past Semesters' : 'Start from Current CGPA';

  return `
  <div class="semester-block lg-surface" style="border-color:rgba(46,204,113,0.35);" id="summaryFormBlock"><div class="lg-shine"></div>
    <div class="semester-head" style="background:rgba(46,204,113,0.06);border-bottom-color:rgba(46,204,113,0.2);">
      <div class="semester-head-left">
        <span style="font-size:16px;margin-right:4px">📊</span>
        <span class="semester-label" style="color:var(--green)">${title}</span>
      </div>
      <div class="semester-actions">
        <button class="btn-icon danger" data-action="render:hideSummaryForm">Cancel</button>
      </div>
    </div>
    <div style="padding:1rem 1.2rem;display:flex;flex-direction:column;gap:12px;">
      <p style="font-size:13px;color:var(--text2);line-height:1.6;margin:0;">
        Enter your current academic standing. Shohoj will use this as the foundation for all calculations — simulator, playground, degree tracker, and more.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">

        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:100px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);">
            Current CGPA
          </label>
          <input
            id="summaryCgpaInput"
            type="number" min="0" max="4" step="0.01"
            placeholder="e.g. 3.30"
            value="${escAttr(cgpaVal)}"
            style="
              background:var(--input-bg);border:1px solid var(--border);
              border-radius:10px;color:var(--text);
              font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;
              padding:9px 12px;outline:none;width:100%;
              -moz-appearance:textfield;
            "
            data-action="render:clearBorder"
            data-enter-action="render:confirmSummary"
          />
        </div>

        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:100px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);">
            Credits Attempted
          </label>
          <input
            id="summaryAttemptedInput"
            type="number" min="0" step="0.5"
            placeholder="e.g. 45"
            value="${escAttr(attemptedVal)}"
            style="
              background:var(--input-bg);border:1px solid var(--border);
              border-radius:10px;color:var(--text);
              font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;
              padding:9px 12px;outline:none;width:100%;
              -moz-appearance:textfield;
            "
            data-action="render:clearBorder"
            data-enter-action="render:confirmSummary"
          />
        </div>

        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:100px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);">
            Credits Earned
          </label>
          <input
            id="summaryCreditsInput"
            type="number" min="0" step="0.5"
            placeholder="e.g. 42"
            value="${escAttr(creditsVal)}"
            style="
              background:var(--input-bg);border:1px solid var(--border);
              border-radius:10px;color:var(--text);
              font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;
              padding:9px 12px;outline:none;width:100%;
              -moz-appearance:textfield;
            "
            data-action="render:clearBorder"
            data-enter-action="render:confirmSummary"
          />
        </div>

        <button
          class="summary-confirm-btn"
          data-action="render:confirmSummary"
          style="
            background:var(--green);color:#0b0f0d;
            font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;
            padding:9px 20px;border:none;border-radius:10px;cursor:pointer;
            height:40px;white-space:nowrap;flex-shrink:0;
            transition:transform 0.15s,box-shadow 0.15s;
          "
        >Confirm →</button>

      </div>
      <p style="font-size:11px;color:var(--text3);margin:0;">
        💡 Find your CGPA and credits earned on CONNECT → Grade Sheet, or from your official transcript.
      </p>
    </div>
  </div>`;
}

// ── Compute estimated semester count from summary block ──────────────────────
function _estimatedSummarySemCount() {
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const deptSeasons = dept && dept.seasons ? dept.seasons : ['Spring', 'Summer', 'Fall'];
  const startSeason = getStartSeason();
  const startYearNum = parseInt(getStartYear());
  if (!startSeason || !startYearNum) return 0;

  const cur = _getCurrentSemester();
  let si = deptSeasons.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = startYearNum;
  let count = 0;
  while (!(deptSeasons[si] === cur.season && yr === cur.year)) {
    count++;
    si++;
    if (si >= deptSeasons.length) { si = 0; yr++; }
    if (count > 50) break;
  }
  return count;
}

function _isFutureSem(semName) {
  if (!semName) return false;
  const match = semName.match(/(Spring|Summer|Fall)\s+(\d{4})/);
  if (!match) return false;
  const semSeason = match[1];
  const semYear = parseInt(match[2]);
  const now = new Date();
  const curYear = now.getFullYear();
  const month = now.getMonth() + 1;
  let curSeason;
  if (month <= 4) curSeason = 'Spring';
  else if (month <= 8) curSeason = 'Summer';
  else curSeason = 'Fall';
  const order = { Spring: 0, Summer: 1, Fall: 2 };
  const semVal = semYear * 3 + (order[semSeason] || 0);
  const curVal = curYear * 3 + (order[curSeason] || 0);
  return semVal > curVal;
}

export function renderSemesters() {
  // Phase 5B: when the React calculator island owns #semestersContainer it
  // renders the list and the legacy DOM build must stand down so the two don't
  // fight. Inert until the island opts in by setting this flag.
  if (typeof window !== 'undefined' && window.__SHOHOJ_REACT_SEMESTERS__) return;
  const container = document.getElementById('semestersContainer');
  const hasSummary = state.semesters.some(s => s.summary);
  const hasNonSummary = state.semesters.some(s => !s.summary);

  if (_summaryFormVisible) {
    const editingSummary = _summaryEditId !== null;
    const currentSummary = editingSummary
      ? state.semesters.find(s => s.id === _summaryEditId && s.summary)
      : null;
    const canCreateSummary = !!state.currentDept && !!getStartSeason() && !!getStartYear() && !hasNonSummary;

    if ((editingSummary && !currentSummary) || (!editingSummary && !canCreateSummary)) {
      _summaryFormVisible = false;
      _summaryEditId = null;
    }
  }

  // Footer semester count — include estimated summary semesters
  const nonSummarySems = state.semesters.filter(s => !s.summary);
  const estimatedPastSems = hasSummary ? _estimatedSummarySemCount() : 0;
  const displaySemCount = nonSummarySems.length + estimatedPastSems;
  document.getElementById('semesterCount').textContent = displaySemCount;

  const runBtn = document.getElementById('addRunningSemBtn');
  if (runBtn) runBtn.disabled = state.semesters.some(s => s.running);
  const retakenKeys = getRetakenKeys();

  // If summary form is open, show it first then everything else
  let html = '';
  if (_summaryFormVisible) {
    html += renderSummaryForm();
  }

  // Precompute: is the first non-summary non-running semester the "current" one?
  const currentSemId = hasSummary
    ? findCurrentSemesterIdForSummaryView(state.semesters, _getCurrentSemester())
    : null;

  html += state.semesters.map(sem => {
    // ── Summary block ──────────────────────────────────────────────────────
    if (sem.summary) return renderSummaryBlock(sem);

    const gpa = calcSemGPA(sem);
    const isRunning = !!sem.running;
    const isCurrentSem = sem.id === currentSemId;
    return `
    <div class="semester-block lg-surface${isRunning ? ' semester-running' : ''}" id="sem-${sem.id}" draggable="${isRunning ? 'false' : 'true'}"><div class="lg-shine"></div>
      <div class="semester-head">
        <div class="semester-head-left">
          ${!isRunning ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : ''}
          <span class="semester-label">${escHtml(sem.name)}</span>
          ${isCurrentSem ? '<span class="semester-running-badge" style="background:rgba(46,204,113,0.12);color:#2ECC71;border-color:rgba(46,204,113,0.30);">📍 Current</span>' : _isFutureSem(sem.name) ? '<span class="semester-running-badge" style="background:rgba(86,180,233,0.10);color:#56B4E9;border-color:rgba(86,180,233,0.25);">🔜 Future</span>' : ''}
          ${isRunning
            ? `<span class="semester-running-badge">🎯 Projected</span>${gpa !== null ? `<span class="semester-gpa-badge" style="color:#F0A500;background:rgba(240,165,0,0.10);border:1px solid rgba(240,165,0,0.25);">GPA ${gpa.toFixed(2)}</span>` : ''}`
            : (gpa !== null ? (() => {
                const col = gpa >= 3.5 ? '#2ECC71' : gpa >= 3.0 ? '#27ae60' : gpa >= 2.5 ? '#F0A500' : '#e74c3c';
                const bg  = gpa >= 3.5 ? 'rgba(46,204,113,0.10)' : gpa >= 3.0 ? 'rgba(46,204,113,0.07)' : gpa >= 2.5 ? 'rgba(240,165,0,0.10)' : 'rgba(231,76,60,0.10)';
                const bd  = gpa >= 3.5 ? 'rgba(46,204,113,0.25)' : gpa >= 3.0 ? 'rgba(46,204,113,0.18)' : gpa >= 2.5 ? 'rgba(240,165,0,0.25)' : 'rgba(231,76,60,0.25)';
                return `<span class="semester-gpa-badge" style="color:${col};background:${bg};border:1px solid ${bd}">GPA ${gpa.toFixed(2)}</span>`;
              })() : '')
          }
          ${!isRunning && sem.courses.some(c => c.name.trim() && !c.grade)
            ? `<span class="semester-incomplete-badge">⚠ Incomplete</span>`
            : ''
          }
          ${(() => {
            const w = getSemCreditWarning(sem);
            if (!w) return '';
            const cls = w.type === 'error' ? 'semester-credit-error-badge' : 'semester-credit-warn-badge';
            return `<span class="${cls}">${escHtml(w.msg)}</span>`;
          })()}
        </div>
        <div class="semester-actions">
          <button class="btn-icon danger" data-action="render:removeSemester" data-sem-id="${sem.id}">Remove</button>
        </div>
      </div>
      <div class="courses-table">
        <div class="course-row course-header">
          <span>Course</span>
          <span>Credits</span>
          <span>Grade Point</span>
          <span>Grade</span>
        </div>
        ${sem.courses.map((c, i) => {
          const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
          // Mirrors CourseRow.tsx: a withdrawal is re-enrolled in, not sat
          // again as a special exam, so it is labelled alongside F.
          const supersedeBadgeLabel = (c.grade === 'F' || c.grade === 'F(NT)' || c.grade === 'W') ? 'Retaken' : 'Repeated';
          const _courseCode = getReviewableCourseCode(c.name);
          const canRate = !sem.summary && !!c.name.trim()
            && !!c.grade && c.grade !== 'I'
            && !!_courseCode;
          const facInit = normalizeInitials(c.faculty || '');
          const showChip = canRate && !!facInit;
          // The tracker answers "what do I need on the final", which only means
          // something while the course is still being sat.
          const canTrackMarks = !!sem.running && !sem.summary;
          const marksOpen = _openMarks.has(`${sem.id}-${i}`);
          return `
        <div class="course-row${isRetaken ? ' retaken' : ''}">
          <div class="course-input-wrap" style="position:relative;">
            <input type="text" placeholder="Type course code / title"
              id="course-input-${sem.id}-${i}"
              value="${escAttr(c.name)}"
              autocomplete="off" autocorrect="off" spellcheck="false"
              data-action="render:courseInput" data-sem-id="${sem.id}" data-idx="${i}" />
            ${isRetaken ? `<span class="retaken-badge">${supersedeBadgeLabel}</span>` : ''}
          </div>
          <span class="credits-static-wrap">
            <span class="credits-static">${c.credits}</span>${
              c.name.trim() && c.credits > 0 && ![0.5,1,1.5,2,2.5,3,3.5,4,4.5,6,8,10,12].includes(c.credits)
                ? `<span class="credit-error-dot" title="Unusual credit value: ${c.credits}"></span>`
                : ''
            }</span>
          ${c.grade === 'W'
            ? `<span class="grade-w-badge" title="Withdrawn — counts toward attempted credits, but carries no grade point and does not affect CGPA." style="font-size:12px;font-weight:700;color:var(--text3);text-align:center;padding:4px 6px;background:var(--chip-hover);border-radius:6px;border:1px solid var(--chip-border);">W</span>`
            : c.credits === 0 && c.name.trim() !== ''
            ? c.grade === 'F(NT)'
              ? `<span style="font-size:12px;font-weight:700;color:#e74c3c;text-align:center;padding:4px 6px;background:rgba(231,76,60,0.10);border-radius:6px;border:1px solid rgba(231,76,60,0.25);">NT</span>`
              : `<select class="pf-select" data-action="render:pfChange" data-sem-id="${sem.id}" data-idx="${i}">
                <option value="" disabled ${!c.grade ? 'selected' : ''}>Pass / Fail</option>
                <option value="P" ${c.grade === 'P' ? 'selected' : ''}>P - Pass</option>
                <option value="F" ${c.grade === 'F' ? 'selected' : ''}>F - Fail</option>
              </select>`
            : `<input type="text" inputmode="decimal" placeholder="0.0 – 4.0"
                value="${escAttr(c.grade === 'F(NT)' ? 'NT' : (c.gradePoint !== undefined ? c.gradePoint : (c.grade && GRADES[c.grade] !== null ? GRADES[c.grade] : '')))}"
                data-action="render:autoDetectGrade" data-sem-id="${sem.id}" data-idx="${i}"
                style="text-align:center;" />`
          }
          <span class="grade-letter" id="gl-${sem.id}-${i}"
            style="color:${
              c.grade === 'F' ? '#e74c3c' :
              c.grade === 'F(NT)' ? '#e74c3c' :
              c.grade === 'P' ? '#2ECC71' :
              c.grade && c.grade.startsWith('A') ? '#2ECC71' :
              c.grade && c.grade.startsWith('B') ? '#27ae60' :
              c.grade && c.grade.startsWith('C') ? '#F0A500' :
              c.grade && c.grade.startsWith('D') ? '#e67e22' :
              'var(--text3)'
            };${c.credits === 0 && c.grade !== 'P' && c.grade !== 'F' ? 'visibility:hidden' : ''}"
          >${escHtml(c.grade) || '—'}</span>
          <div class="course-row-actions">
            ${canTrackMarks
              ? `<button class="course-marks-pill${marksOpen ? ' open' : ''}" data-action="render:toggleMarks" data-sem-id="${sem.id}" data-idx="${i}" aria-expanded="${marksOpen}" title="Track marks and see what you need on what's left">📊</button>`
              : ''}
            ${showChip
              ? `<button class="course-faculty-chip" data-action="render:rateCourse" data-sem-id="${sem.id}" data-idx="${i}" data-fac="${escAttr(facInit)}" data-ccode="${escAttr(_courseCode)}" title="${escAttr(facInit)} — view or edit your review"><span class="fac-init">${escHtml(facInit)}</span><span class="fac-score" data-score>–</span></button>`
              : (canRate ? `<button class="course-rate-pill" data-action="render:rateCourse" data-sem-id="${sem.id}" data-idx="${i}" title="Rate this faculty">+ Rate</button>` : '')}
            <button class="btn-remove-course" data-action="render:removeCourse" data-sem-id="${sem.id}" data-idx="${i}">×</button>
          </div>
        </div>${canTrackMarks && marksOpen ? marksPanelHtml(sem, c, i) : ''}`;
        }).join('')}
      </div>
      <div class="add-course-row">
        <button class="btn-add-course" data-action="render:addCourse" data-sem-id="${sem.id}">+ Add course</button>
      </div>
    </div>`;
  }).join('');

  // ── Inline "Add Semester" button after last semester block ────────────────
  if (state.semesters.some(s => s.summary) && state.semesters.filter(s => !s.summary).length > 0) {
    html += `<button class="btn-add-course" data-action="render:addSemester" style="width:100%;margin-top:4px;padding:10px;font-size:13px;font-weight:600;border-radius:10px;">+ Add Semester</button>`;
  }

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  const nonSummaryCount = state.semesters.filter(s => !s.summary).length;
  const hasSummaryBlock = state.semesters.some(s => s.summary);

  if (nonSummaryCount === 0 && !_summaryFormVisible) {
    const _deptDone = !!state.currentDept;
    const _semDone  = _deptDone && getStartSeason() && getStartYear();

    const _emptyHint = !_deptDone
      ? '<div class="empty-state-steps"><div class="empty-state-step"><span class="empty-state-step-num">1</span><span>Pick your <strong>department</strong> in the header above</span></div><div class="empty-state-step"><span class="empty-state-step-num">2</span><span>Set your <strong>starting semester</strong> (e.g. Fall 2022)</span></div><div class="empty-state-step"><span class="empty-state-step-num">3</span><span>Add your first semester and enter grades</span></div></div>'
      : !_semDone
      ? '<div class="empty-state-steps"><div class="empty-state-step" style="opacity:0.45"><span class="empty-state-step-num done">✓</span><span>Department selected</span></div><div class="empty-state-step"><span class="empty-state-step-num active" style="background:var(--green);color:#0b0f0d">2</span><span>Set your <strong>starting semester</strong> above and click <strong>Let\'s go →</strong></span></div></div>'
      : '<div class="empty-state-steps"><div class="empty-state-step" style="opacity:0.45"><span class="empty-state-step-num done">✓</span><span>Department &amp; semester set</span></div><div class="empty-state-step"><span class="empty-state-step-num active" style="background:var(--green);color:#0b0f0d">3</span><span>Click <strong>+ Add Semester</strong> below, or <strong>Import Transcript</strong> to auto-fill</span></div></div>';

    const cgpaBtn = (_semDone && !hasSummaryBlock)
      ? `<button class="btn-sample-ghost" data-action="render:showSummaryForm" style="border-color:rgba(46,204,113,0.4);color:var(--green);">📊 Start from CGPA</button>`
      : '';

    html += `
      <div class="empty-state">
        <div class="empty-state-icon">${!_deptDone ? '👋' : !_semDone ? '📅' : '🎓'}</div>
        <div class="empty-state-title">${!_deptDone ? "Let's get you set up" : !_semDone ? 'Almost ready...' : 'Ready to go!'}</div>
        <div class="empty-state-sub">${!_deptDone ? 'Complete the 3 quick steps below to start tracking your CGPA.' : !_semDone ? 'One more step before you can add semesters.' : 'Add your first semester, import your transcript, or start from your current CGPA.'}</div>
        ${_emptyHint}
        <div class="empty-state-actions">
          <button class="btn-sample" data-action="render:loadSample">Try Demo Mode</button>
          ${_semDone ? '<button class="btn-sample-ghost" data-action="render:addSemester">+ Add semester</button>' : ''}
          ${cgpaBtn}
        </div>
        ${_semDone ? '<div class="empty-arrow">← use the buttons above too &nbsp;↑</div>' : ''}
      </div>`;
  }

  container.innerHTML = html;
  _populateFacultyChips();

  // ── DRAG-AND-DROP ────────────────────────────────────────────────────────
  if (_dragBindTimer) clearTimeout(_dragBindTimer);
  _dragBindTimer = setTimeout(() => {
    _dragBindTimer = null;
    let dragSrcId = null;
    container.querySelectorAll('.semester-block[draggable="true"]').forEach(block => {
      block.addEventListener('dragstart', e => {
        dragSrcId = parseInt(block.id.replace('sem-', ''));
        block.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      block.addEventListener('dragend', () => {
        block.classList.remove('dragging');
        container.querySelectorAll('.semester-block').forEach(b => b.classList.remove('drag-over'));
      });
      block.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.semester-block').forEach(b => b.classList.remove('drag-over'));
        const targetId = parseInt(block.id.replace('sem-', ''));
        if (targetId !== dragSrcId) block.classList.add('drag-over');
      });
      block.addEventListener('dragleave', () => block.classList.remove('drag-over'));
      block.addEventListener('drop', e => {
        e.preventDefault();
        block.classList.remove('drag-over');
        const targetId = parseInt(block.id.replace('sem-', ''));
        if (dragSrcId === null || dragSrcId === targetId) return;
        const srcIdx = state.semesters.findIndex(s => s.id === dragSrcId);
        const tgtIdx = state.semesters.findIndex(s => s.id === targetId);
        if (srcIdx < 0 || tgtIdx < 0) return;
        const tgtSem = state.semesters[tgtIdx];
        if (tgtSem && tgtSem.summary) return;
        const [moved] = state.semesters.splice(srcIdx, 1);
        state.semesters.splice(tgtIdx, 0, moved);
        dragSrcId = null;
        renderSemesters();
        window._shohoj_recalc();
        saveState();
      });
    });
  }, 0);
}

// ── _buildSemesterName: unified naming logic for summary-aware semesters ─────
function _buildSemesterName(season, year) {
  const ordinal = _computeOrdinal(season, year);
  if (ordinal) {
    return `${season} ${year} (${ordinalSup(ordinal)} Semester)`;
  }
  return `${season} ${year}`;
}

export function addSemester(prefill = null) {
  const hasSummary = state.semesters.some(s => s.summary);
  if (!hasSummary && (!state.currentDept || !getStartSeason() || !getStartYear())) return;

  const id = state.semesterCounter++;
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const deptSeasons = dept && dept.seasons ? dept.seasons : ['Spring', 'Summer', 'Fall'];
  const existingNonSummary = state.semesters.filter(s => !s.running && !s.summary);

  let name;
  if (hasSummary) {
    let targetSeason, targetYear;

    const allNonSummary = state.semesters.filter(s => !s.summary);
    if (allNonSummary.length === 0) {
      const cur = _getCurrentSemester();
      targetSeason = cur.season;
      targetYear = cur.year;
    } else {
      const last = allNonSummary[allNonSummary.length - 1];
      const match = last.name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
      if (match) {
        const next = _nextSemester(match[1], parseInt(match[2]));
        targetSeason = next.season;
        targetYear = next.year;
      } else {
        const cur = _getCurrentSemester();
        targetSeason = cur.season;
        targetYear = cur.year;
      }
    }

    name = _buildSemesterName(targetSeason, targetYear);
  } else {
    const completedCount = existingNonSummary.length;
    const allNames = generateSemesterNames(getStartSeason(), getStartYear(), completedCount + 1, deptSeasons);
    name = allNames[completedCount] || `Semester ${completedCount + 1}`;
  }

  const courses = prefill || [{ name: '', credits: 0, grade: '', gradePoint: '' }];
  state.semesters.push({ id, name, courses });
  renderSemesters();
  window._shohoj_recalc();
}

export function addRunningSemester(prefill = null) {
  if (state.semesters.some(s => s.running)) return;
  const hasSummary = state.semesters.some(s => s.summary);
  if (!hasSummary && (!state.currentDept || !getStartSeason() || !getStartYear())) return;
  let runningName;

  if (hasSummary) {
    const allNonSummary = state.semesters.filter(s => !s.summary);
    let targetSeason, targetYear;

    if (allNonSummary.length === 0) {
      const cur = _getCurrentSemester();
      targetSeason = cur.season;
      targetYear = cur.year;
    } else {
      const last = allNonSummary[allNonSummary.length - 1];
      const match = last.name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
      if (match) {
        const next = _nextSemester(match[1], parseInt(match[2]));
        targetSeason = next.season;
        targetYear = next.year;
      } else {
        const cur = _getCurrentSemester();
        targetSeason = cur.season;
        targetYear = cur.year;
      }
    }

    const ordinal = _computeOrdinal(targetSeason, targetYear);
    runningName = ordinal
      ? `${targetSeason} ${targetYear} (${ordinalSup(ordinal)} Semester)`
      : `${targetSeason} ${targetYear}`;
  } else {
    runningName = generateNextSemesterName();
  }

  const courses = Array.isArray(prefill) && prefill.length
    ? prefill
    : [{ name:'', credits:0, grade:'', gradePoint:'' }];

  state.semesters.push({
    id: Date.now(),
    name: runningName + ' (Running)',
    running: true,
    courses,
  });
  renderSemesters();
  window._shohoj_recalc();
}

function generateNextSemesterName() {
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const SEASONS = dept && dept.seasons ? dept.seasons : ['Spring','Summer','Fall'];
  const completedSems = state.semesters.filter(s => !s.running && !s.summary);
  if (!completedSems.length) return 'Current Semester';
  const last = [...completedSems].reverse()[0];
  if (!last || !last.name) return 'Current Semester';
  const match = last.name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
  if (!match) return 'Current Semester';
  let season = match[1], year = parseInt(match[2]);
  const idx = SEASONS.indexOf(season);
  if (idx === -1 || idx === SEASONS.length - 1) { season = SEASONS[0]; year++; }
  else { season = SEASONS[idx + 1]; }
  return `${season} ${year}`;
}

export function removeSemester(id) {
  state.semesters = state.semesters.filter(s => s.id !== id);
  renderSemesters();
  window._shohoj_recalc();
}

export function addCourse(semId) {
  const sem = state.semesters.find(s => s.id === semId);
  if (sem) { sem.courses.push({ name: '', credits: 0, grade: '', faculty: '' }); }
  renderSemesters();
  window._shohoj_recalc();
}

export function openRateForCourse(semId, cIdx) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem || !sem.courses[cIdx]) return;
  const c = sem.courses[cIdx];
  const courseCode = getReviewableCourseCode(c.name);
  if (!courseCode) {
    if (typeof window._shohoj_showToast === 'function') {
      window._shohoj_showToast('Select a valid catalog course before submitting a faculty review.', true);
    }
    return;
  }
  openReviewModal({
    facultyInitials: c.faculty || '',
    courseCode,
    semester: sem.name || '',
    onSubmitted: (payload) => {
      const nextFac = normalizeInitials(payload && payload.facultyInitials);
      if (!nextFac) return;
      const sem2 = state.semesters.find(s => s.id === semId);
      if (!sem2 || !sem2.courses[cIdx]) return;
      sem2.courses[cIdx].faculty = nextFac;
      _facultyCourseAggCache.delete(`${nextFac}|${courseCode}`);
      saveState();
      renderSemesters();
    },
  });
}

async function _populateFacultyChips() {
  const chips = document.querySelectorAll('.course-faculty-chip[data-fac]');
  if (!chips.length) return;
  const byKey = new Map();
  chips.forEach(el => {
    const fac = el.getAttribute('data-fac') || '';
    const cc  = el.getAttribute('data-ccode') || '';
    if (!fac) return;
    const key = `${fac}|${cc}`;
    if (!byKey.has(key)) byKey.set(key, { fac, cc, els: [] });
    byKey.get(key).els.push(el);
  });

  for (const [key, group] of byKey) {
    const cached = _facultyCourseAggCache.get(key);
    if (cached && cached.state === 'ready') {
      _applyChipScore(group.els, cached.overall, cached.count);
      continue;
    }
    if (cached && cached.state === 'loading') continue;
    _facultyCourseAggCache.set(key, { state: 'loading' });
    fetchReviewsForFaculty(group.fac, group.cc, { pageSize: 100 })
      .then(({ reviews }) => {
        const agg = aggregateRatings(reviews);
        let overall = null;
        let count = 0;
        if (agg) {
          count = agg.count;
          const vals = ['teaching', 'marking', 'behavior']
            .map(k => agg.ratings[k])
            .filter(v => typeof v === 'number');
          overall = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        }
        _facultyCourseAggCache.set(key, { state: 'ready', overall, count });
        const live = document.querySelectorAll(`.course-faculty-chip[data-fac="${CSS.escape(group.fac)}"][data-ccode="${CSS.escape(group.cc)}"]`);
        _applyChipScore(live, overall, count);
      })
      .catch(() => {
        _facultyCourseAggCache.delete(key);
      });
  }
}

function _applyChipScore(els, overall, count) {
  const HIDE_UNDER = 3;
  const txt = (overall === null || count < HIDE_UNDER) ? '–' : overall.toFixed(1);
  els.forEach(el => {
    const s = el.querySelector('[data-score]');
    if (s) s.textContent = txt;
  });
}

export function removeCourse(semId, cIdx) {
  const sem = state.semesters.find(s => s.id === semId);
  if (sem && sem.courses.length > 1) {
    sem.courses.splice(cIdx, 1);
    renderSemesters();
    window._shohoj_recalc();
  }
}

export function loadSampleData() {
  if (state.semesters.length > 0 &&
      !confirm('This will replace your current data with demo data. Continue?')) return false;
  state.semesters = [];
  state.semesterCounter = 0;
  resetPlanner();
  setPlanCourses(DEMO_PLAN_COURSES);
  resetPlayground();
  const sample = getRecruiterDemoSemesters();
  sample.forEach(s => {
    const id = state.semesterCounter++;
    state.semesters.push({ id, name: s.name, courses: s.courses });
  });

  state.currentDept = 'CSE';
  const deptSel = document.getElementById('deptSelect');
  if (deptSel) deptSel.value = 'CSE';
  const credEl = document.getElementById('deptCredits');
  if (credEl) credEl.style.display = 'inline-flex';
  const credTxt = document.getElementById('deptCreditsText');
  if (credTxt) credTxt.textContent = '136 Total Credits';
  const startSeason = document.getElementById('startSeason');
  if (startSeason) startSeason.value = 'Fall';
  const startYear = document.getElementById('startYear');
  if (startYear) startYear.value = '2024';
  const startRow = document.getElementById('startSemRow');
  if (startRow) startRow.style.display = 'flex';

  renderSemesters();
  window._shohoj_recalc();
  saveState();
  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast('Demo mode loaded. Explore CGPA, planner, and degree progress.');
  }
  return true;
}

export function onDeptSelect() {
  const sel = document.getElementById('deptSelect');
  state.currentDept = sel.value;
  if (!state.currentDept) return;
  resetPlanner();
  resetPlayground();
  window._shohoj_updateSetupWizard();
  const dept = DEPARTMENTS[state.currentDept];
  const creditsEl = document.getElementById('deptCredits');
  if (creditsEl) creditsEl.style.display = 'inline-flex';
  document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';

  const seasonSel = document.getElementById('startSeason');
  if (seasonSel) {
    const deptSeasons = dept.seasons || ['Spring', 'Summer', 'Fall'];
    const currentVal = seasonSel.value;
    seasonSel.innerHTML = '<option value="" disabled selected>— Season —</option>'
      + deptSeasons.map(s => `<option value="${s}">${s}</option>`).join('');
    if (deptSeasons.includes(currentVal)) seasonSel.value = currentVal;
  }

  const startRow = document.getElementById('startSemRow');
  if (startRow) startRow.style.display = 'flex';
  if (state._restoredFromStorage) {
    state._restoredFromStorage = false;
  } else {
    state.semesters = [];
    state.semesterCounter = 0;
  }
  renderSemesters();
  window._shohoj_recalc();
}

export function onStartSemConfirm() {
  if (!state.currentDept) return;
  if (!getStartSeason() || !getStartYear()) return;
  const dept = DEPARTMENTS[state.currentDept];
  const deptSeasons = dept.seasons || ['Spring', 'Summer', 'Fall'];
  const startSeason = getStartSeason();
  const startYear   = parseInt(getStartYear());
  const last        = getLastCompletedSemester(deptSeasons);

  const startIdx = deptSeasons.indexOf(startSeason) + startYear * deptSeasons.length;
  const lastIdx  = deptSeasons.indexOf(last.season)  + last.year  * deptSeasons.length;
  const semCount = startIdx > lastIdx ? 0 : countSemesters(startSeason, startYear, last.season, last.year, deptSeasons);

  const semNames = generateSemesterNames(startSeason, startYear, semCount, deptSeasons);
  if (state._restoredFromStorage) {
    state._restoredFromStorage = false;
    renderSemesters();
    window._shohoj_recalc();
    return;
  }

  state.semesters = [];
  state.semesterCounter = 0;
  clearState();
  resetPlayground();

  for (let idx = 0; idx < semCount; idx++) {
    const id = state.semesterCounter++;
    const preset = dept.presets[idx];
    const courses = preset
      ? preset.courses.map(c => ({
          name: c.name || '',
          credits: c.credits || 0,
          grade: '',
          gradePoint: '',
        }))
      : [{ name: '', credits: 0, grade: '', gradePoint: '' }];
    state.semesters.push({ id, name: semNames[idx], courses });
  }

  renderSemesters();
  window._shohoj_recalc();
}
