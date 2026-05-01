// ── js/ui/advising.js ─────────────────────────────────────────────────────────
// Advising Week Checklist: auto-checks from state + section availability + manual ticks.

import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state } from '../core/state.js';
import { COURSE_DB, PREREQS } from '../core/catalog.js';
import { getRetakenKeys } from '../core/calculator.js';
import { getPlanCourses } from './planner.js';
import { escHtml } from '../core/helpers.js';

const MANUAL_STORAGE_KEY = 'shohoj_advising_manual';

// ── Derived data helpers ─────────────────────────────────────────────────────

function _getCompletedCodes() {
  const rk = getRetakenKeys();
  const completed = new Set();
  state.semesters.forEach(sem => {
    if (sem.summary) return;
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.grade) return;
      if (c.grade === 'F' || c.grade === 'F(NT)' || c.grade === 'I') return;
      if (rk.has(`${sem.id}-${i}`)) return;
      const m = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      if (m) completed.add(m[1]);
    });
  });
  return completed;
}

function _checkPrereqs(code, completed) {
  const prereq = PREREQS[code];
  if (!prereq) return { canTake: true, missingHp: [], missingSp: [] };
  return {
    canTake: (prereq.hp || []).every(p => completed.has(p)),
    missingHp: (prereq.hp || []).filter(p => !completed.has(p)),
    missingSp: (prereq.sp || []).filter(p => !completed.has(p)),
  };
}

function _getComputedCGPA() {
  const completedOnly = state.semesters.filter(s => !s.running && !s.summary);
  const summary = state.semesters.find(s => s.summary);
  let pts = 0, earned = 0;
  if (summary) {
    pts   += summary.summaryCGPA * summary.summaryCredits;
    earned += summary.summaryCredits;
  }
  const rkCompleted = getRetakenKeys(completedOnly);
  completedOnly.forEach(sem => {
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
      if (rkCompleted.has(`${sem.id}-${i}`)) return;
      pts    += gp * c.credits;
      if (gp !== null) earned += c.credits;
    });
  });
  return earned > 0 ? pts / earned : null;
}

function _getStandingInfo(cgpa) {
  if (cgpa === null) return null;
  if (cgpa >= 3.97) return { label: 'Perfect Standing',    cls: 'adv-pass', emoji: '🏆' };
  if (cgpa >= 3.65) return { label: 'Higher Distinction',  cls: 'adv-pass', emoji: '🌟' };
  if (cgpa >= 3.50) return { label: 'Distinction',         cls: 'adv-pass', emoji: '⭐' };
  if (cgpa >= 3.00) return { label: 'Good Standing',       cls: 'adv-pass', emoji: '✅' };
  if (cgpa >= 2.50) return { label: 'Satisfactory',        cls: 'adv-pass', emoji: '👍' };
  if (cgpa >= 2.00) return { label: 'Needs Improvement',   cls: 'adv-warn', emoji: '⚠️' };
  return             { label: 'Academic Probation',         cls: 'adv-fail', emoji: '❌' };
}

function _getUnretakenFGrades() {
  const passedCodes = _getCompletedCodes();
  const failed = [];
  state.semesters.forEach(sem => {
    if (sem.summary || sem.running) return;
    sem.courses.forEach(c => {
      if (!c.name.trim()) return;
      if (c.grade !== 'F' && c.grade !== 'F(NT)') return;
      const m = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      const code = m ? m[1] : null;
      if (!code) return;
      if (passedCodes.has(code)) return;
      if (!failed.find(f => f.code === code)) {
        failed.push({ code, name: c.name.replace(/\s*\([^)]+\)$/, '').trim() });
      }
    });
  });
  return failed;
}

function _getTotalEarned() {
  const summary = state.semesters.find(s => s.summary);
  const completedOnly = state.semesters.filter(s => !s.running && !s.summary);
  const rkCompleted = getRetakenKeys(completedOnly);
  let earned = summary ? summary.summaryCredits : 0;
  completedOnly.forEach(sem => {
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
      if (gp > 0 && !rkCompleted.has(`${sem.id}-${i}`)) earned += c.credits;
    });
  });
  return earned;
}

// ── Manual checks ─────────────────────────────────────────────────────────────

const MANUAL_ITEMS = [
  { id: 'financial',   label: 'Financial hold cleared',       desc: 'Check BRACU CONNECT → Accounts for any outstanding dues.' },
  { id: 'appointment', label: 'Advising appointment booked',  desc: 'Book your slot through CONNECT or contact your advisor directly.' },
  { id: 'gradesheet',  label: 'Grade sheet printed or saved', desc: 'Download from CONNECT → Grade Sheet before you visit.' },
  { id: 'studentid',   label: 'Student ID ready',             desc: 'Bring your BRACU student ID card to the advising session.' },
];

function _loadManualChecks() {
  try { return JSON.parse(localStorage.getItem(MANUAL_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function _saveManualChecks(checks) {
  try { localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(checks)); } catch {}
}

export function toggleAdvisingCheck(id) {
  const checks = _loadManualChecks();
  checks[id] = !checks[id];
  _saveManualChecks(checks);
  renderAdvisingChecklist();
}

// ── Section data (lazy fetch) ─────────────────────────────────────────────────

let _sectionsData   = null;
let _sectionsLoaded = false;

function _loadSections() {
  if (_sectionsLoaded) return Promise.resolve(_sectionsData);
  _sectionsLoaded = true;
  return fetch('js/data/sections.json')
    .then(r => r.json())
    .then(d => { _sectionsData = d; return d; })
    .catch(() => { _sectionsLoaded = false; return null; });
}

function _fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function _renderSectionCards(planCodes) {
  if (!_sectionsData) {
    return `<div class="adv-section-loading">Loading section data…</div>`;
  }
  const map      = _sectionsData.sections || {};
  const semester = _sectionsData.label    || '';

  const cards = planCodes.map(code => {
    const secs = map[code] || [];
    const name = COURSE_DB[code]?.name || code;
    if (!secs.length) {
      return `<div class="adv-section-card">
        <div class="adv-sc-head">
          <span class="adv-sc-code">${escHtml(code)}</span>
          <span class="adv-sc-name">${escHtml(name)}</span>
        </div>
        <div class="adv-sc-none">Not offered this semester</div>
      </div>`;
    }

    const rows = secs.map(s => {
      const days    = s.cs.map(d => `${d.day} ${_fmtTime(d.start)}–${_fmtTime(d.end)}`).join(', ');
      const fill    = s.cap > 0 ? Math.round((s.used / s.cap) * 100) : 0;
      const fillCls = fill >= 90 ? 'adv-fill-bad' : fill >= 70 ? 'adv-fill-warn' : 'adv-fill-ok';
      const seats   = s.cap > 0 ? `${s.used}/${s.cap}` : '–';
      return `<div class="adv-sec-row">
        <span class="adv-sec-num">§${escHtml(s.sn)}</span>
        <span class="adv-sec-fac">${escHtml(s.f)}</span>
        <span class="adv-sec-days">${escHtml(days)}</span>
        <span class="adv-sec-seats ${fillCls}">${seats}</span>
      </div>`;
    }).join('');

    return `<div class="adv-section-card">
      <div class="adv-sc-head">
        <span class="adv-sc-code">${escHtml(code)}</span>
        <span class="adv-sc-name">${escHtml(name)}</span>
        <span class="adv-sc-count">${secs.length} section${secs.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="adv-sec-table">${rows}</div>
    </div>`;
  }).join('');

  return `<div class="adv-sub-label">Available Sections · ${escHtml(semester)}</div>${cards}`;
}

// ── Main render ───────────────────────────────────────────────────────────────

let _sectionsFetchTriggered = false;

export function renderAdvisingChecklist() {
  const el = document.getElementById('advisingContent');
  if (!el) return;

  const hasData = state.semesters.length > 0;
  if (!hasData) {
    el.innerHTML = `<div class="adv-empty">
      <div class="adv-empty-icon">📋</div>
      <div class="adv-empty-title">No data yet</div>
      <div class="adv-empty-desc">Add your semesters in the Calculator tab — the checklist will fill in automatically.</div>
    </div>`;
    return;
  }

  // Kick off section fetch once; re-render when it lands
  if (!_sectionsFetchTriggered) {
    _sectionsFetchTriggered = true;
    _loadSections().then(d => {
      if (d && document.getElementById('advisingContent')) renderAdvisingChecklist();
    });
  }

  const cgpa         = _getComputedCGPA();
  const standing     = _getStandingInfo(cgpa);
  const failedCourses = _getUnretakenFGrades();
  const totalEarned  = _getTotalEarned();
  const dept         = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const totalRequired = dept ? dept.totalCredits : null;
  const planCodes    = getPlanCourses();
  const completed    = _getCompletedCodes();
  const manualChecks = _loadManualChecks();

  // ── Item builder ──────────────────────────────────────────────────────────
  function item(cls, emoji, title, desc) {
    return `<div class="adv-item ${cls}">
      <div class="adv-item-icon">${emoji}</div>
      <div class="adv-item-body">
        <div class="adv-item-title">${title}</div>
        ${desc ? `<div class="adv-item-desc">${desc}</div>` : ''}
      </div>
    </div>`;
  }

  // ── Academic standing ─────────────────────────────────────────────────────
  const standingItem = standing
    ? item(
        standing.cls, standing.emoji,
        `CGPA ${cgpa.toFixed(2)} — ${standing.label}`,
        cgpa < 2.0
          ? 'You are on academic probation. Seek counselling before advising.'
          : cgpa < 2.5
          ? 'CGPA below 2.50 — focus on improvement this semester.'
          : null
      )
    : item('adv-neutral', '—', 'CGPA not yet computed', 'Enter graded courses in the Calculator tab.');

  // ── Unretaken F grades ────────────────────────────────────────────────────
  const fItem = failedCourses.length === 0
    ? item('adv-pass', '✅', 'No pending F grades', 'No outstanding failed courses detected.')
    : item('adv-fail', '❌',
        `${failedCourses.length} unretaken F grade${failedCourses.length > 1 ? 's' : ''}`,
        `Retake needed: ${failedCourses.map(f => `<strong>${escHtml(f.code)}</strong>`).join(', ')}. Plan these before you exhaust your allowed attempts.`
      );

  // ── Degree progress ───────────────────────────────────────────────────────
  let degreeItem;
  if (totalRequired) {
    const pct       = Math.min(100, Math.round((totalEarned / totalRequired) * 100));
    const remaining = Math.max(0, totalRequired - totalEarned);
    degreeItem = item(
      'adv-neutral',
      pct >= 100 ? '🎓' : '📊',
      `Degree progress: ${totalEarned}/${totalRequired} credits (${pct}%)`,
      remaining > 0 ? `${remaining} credits remaining to graduation.` : 'Credit requirement met — confirm with your advisor.'
    );
  } else {
    degreeItem = item('adv-neutral', '📊', 'Select a department to see degree progress', null);
  }

  // ── Plan section ──────────────────────────────────────────────────────────
  let planSection = '';
  if (planCodes.length === 0) {
    planSection = `<div class="adv-section">
      <div class="adv-section-label">Next Semester Plan</div>
      ${item('adv-warn', '⚠️', 'No plan built yet', 'Head to the Planner tab to build a course plan before advising.')}
    </div>`;
  } else {
    const totalPlanCredits = planCodes.reduce((s, code) => s + (COURSE_DB[code]?.credits || 0), 0);

    let creditItem;
    if (totalPlanCredits < 9) {
      creditItem = item('adv-fail', '❌', `${totalPlanCredits} credits — below 9-credit minimum`, 'Add more courses to meet the minimum load.');
    } else if (totalPlanCredits > 15) {
      creditItem = item('adv-fail', '❌', `${totalPlanCredits} credits — exceeds 15-credit maximum`, 'Remove courses to comply with the credit cap.');
    } else if (totalPlanCredits > 12) {
      creditItem = item('adv-warn', '⚠️', `${totalPlanCredits} credits — chairman's permission required`, 'Loads above 12 credits need written chairman approval.');
    } else {
      creditItem = item('adv-pass', '✅', `${totalPlanCredits} credits — valid load`, null);
    }

    const prereqIssues = [], prereqWarns = [];
    planCodes.forEach(code => {
      const r = _checkPrereqs(code, completed);
      if (!r.canTake)          prereqIssues.push(`${code}: missing ${r.missingHp.join(', ')}`);
      else if (r.missingSp.length) prereqWarns.push(`${code}: recommended ${r.missingSp.join(', ')}`);
    });

    let prereqItem;
    if (prereqIssues.length) {
      prereqItem = item('adv-fail', '❌',
        `${prereqIssues.length} prerequisite conflict${prereqIssues.length > 1 ? 's' : ''}`,
        prereqIssues.map(i => escHtml(i)).join('<br>'));
    } else if (prereqWarns.length) {
      prereqItem = item('adv-warn', '⚠️', 'Soft prerequisite gaps', prereqWarns.map(w => escHtml(w)).join('<br>'));
    } else {
      prereqItem = item('adv-pass', '✅', 'All prerequisites satisfied', null);
    }

    const pills = planCodes.map(c => `<span class="adv-course-pill">${escHtml(c)}</span>`).join('');

    planSection = `<div class="adv-section">
      <div class="adv-section-label">Next Semester Plan</div>
      ${item('adv-neutral', '📅',
          `${planCodes.length} course${planCodes.length !== 1 ? 's' : ''} planned`,
          `<div class="adv-pills">${pills}</div>`)}
      ${creditItem}
      ${prereqItem}
    </div>`;
  }

  // ── Section availability ──────────────────────────────────────────────────
  let sectionSection = '';
  if (planCodes.length > 0) {
    sectionSection = `<div class="adv-section">${_renderSectionCards(planCodes)}</div>`;
  }

  // ── Manual checklist ──────────────────────────────────────────────────────
  const manualHTML = MANUAL_ITEMS.map(m => {
    const checked = !!manualChecks[m.id];
    return `<label class="adv-manual-item${checked ? ' adv-manual-done' : ''}"
        onclick="window._shohoj_toggleAdvisingCheck('${m.id}'); event.preventDefault()">
      <span class="adv-manual-check">${checked ? '☑' : '☐'}</span>
      <span class="adv-manual-body">
        <span class="adv-manual-label">${escHtml(m.label)}</span>
        <span class="adv-manual-desc">${escHtml(m.desc)}</span>
      </span>
    </label>`;
  }).join('');

  // ── Assemble ──────────────────────────────────────────────────────────────
  el.innerHTML = `<div class="adv-container">
    <div class="adv-section">
      <div class="adv-section-label">Academic Status</div>
      ${standingItem}
      ${fItem}
      ${degreeItem}
    </div>
    ${planSection}
    ${sectionSection}
    <div class="adv-section">
      <div class="adv-section-label">Before You Go</div>
      <div class="adv-manual-list">${manualHTML}</div>
    </div>
  </div>`;
}
