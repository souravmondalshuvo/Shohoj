// ── js/ui/planner.js ──────────────────────────────────────────────────────────
// Semester Planner: prerequisite checking, course recommendations,
// plan building, credit validation, and prereq tree visualization.

import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState } from '../core/state.js';
import { COURSE_DB, ALL_COURSES, PREREQS } from '../core/catalog.js';
import { getRetakenKeys } from '../core/calculator.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { getCurrentTotals } from './playground.js';
import { addRunningSemester } from './render.js';

// ── Local planner state ─────────────────────────────────────────────────────
const plan = {
  courses: [],         // array of course codes added to plan
  viewingPrereqs: '',  // course code whose prereq tree is being shown
};

// ── Search/filter state ─────────────────────────────────────────────────────
let _searchQuery = '';
let _filterMode  = 'all'; // 'all' | 'unlocked' | 'locked'
let _restoreSearchFocus = false;
let _searchCursorStart = null;
let _searchCursorEnd = null;
let _assumedGrade = 'A';

// ── Engine: get completed course codes ──────────────────────────────────────
function getCompletedCodes() {
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

// ── Engine: get in-progress course codes (running semester) ─────────────────
function getInProgressCodes() {
  const codes = new Set();
  state.semesters.forEach(sem => {
    if (!sem.running) return;
    sem.courses.forEach(c => {
      if (!c.name.trim()) return;
      const m = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      if (m) codes.add(m[1]);
    });
  });
  return codes;
}

// ── Engine: get codes already scheduled in future/manual semester blocks ─────
function getScheduledCodes() {
  const codes = new Set();
  state.semesters.forEach(sem => {
    if (sem.summary || sem.running) return;
    sem.courses.forEach(c => {
      if (!c.name.trim() || c.grade) return;
      const m = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
      if (m) codes.add(m[1]);
    });
  });
  return codes;
}

// ── Engine: check prerequisites for a course ────────────────────────────────
function checkPrereqs(code, completed) {
  const prereq = PREREQS[code];
  if (!prereq) return { canTake: true, missingHp: [], missingSp: [], hasData: false };

  const missingHp = (prereq.hp || []).filter(p => !completed.has(p));
  const missingSp = (prereq.sp || []).filter(p => !completed.has(p));

  return {
    canTake: missingHp.length === 0,
    missingHp,
    missingSp,
    hasData: true,
  };
}

// ── Engine: count how many downstream courses each code unlocks ─────────────
// Built once from PREREQS; higher count = gating more future courses.
let _unlockCountCache = null;
function getUnlockCount(code) {
  if (!_unlockCountCache) {
    _unlockCountCache = Object.create(null);
    Object.keys(PREREQS).forEach(c => {
      const p = PREREQS[c] || {};
      [...(p.hp || []), ...(p.sp || [])].forEach(req => {
        _unlockCountCache[req] = (_unlockCountCache[req] || 0) + 1;
      });
    });
  }
  return _unlockCountCache[code] || 0;
}

// ── Engine: determine if a course is relevant to the current department ──────
function isRelevantToDept(code, deptCode) {
  if (!deptCode) return true;

  // Direct department match
  const prefix = code.replace(/\d.*/,'');

  // Map department codes to relevant course prefixes
  const deptPrefixes = {
    CSE: ['CSE'],
    CS:  ['CSE'],
    EEE: ['EEE'],
    ECE: ['ECE'],
    BBA: ['ACT','BUS','FIN','MGT','MKT','MSC','MIS'],
    ECO: ['ECO'],
    ENG: ['ENG'],
    ANT: ['ANT','SOC'],
    PHY: ['PHY'],
    APE: ['APE','PHY'],
    MAT: ['MAT'],
    MIC: ['MIC','BCH','BIO'],
    BIO: ['BTE','BIO','BCH','MIC'],
    ARC: ['ARC'],
    PHR: ['PHB','PHR'],
    LAW: ['LAW'],
  };

  // Common GED prefixes relevant to all departments
  const commonPrefixes = ['MAT','PHY','ENG','BNG','EMB','HUM','STA','ECO','CST','DEV','ENV','HST','POL','PSY','SOC','GEO'];

  const relevantPrefixes = deptPrefixes[deptCode] || [];

  if (relevantPrefixes.includes(prefix)) return true;
  if (commonPrefixes.includes(prefix)) return true;

  return false;
}

// ── Engine: get all available courses for planning ──────────────────────────
function getAvailableCourses(completed, dept) {
  const inProgress = getInProgressCodes();
  const scheduled  = getScheduledCodes();
  const deptCode   = dept || state.currentDept || '';
  const results    = [];

  ALL_COURSES.forEach(c => {
    // Skip if already completed, in progress, or already scheduled elsewhere
    if (completed.has(c.code)) return;
    if (inProgress.has(c.code)) return;
    if (scheduled.has(c.code)) return;
    // Skip if already in plan
    if (plan.courses.includes(c.code)) return;
    // Skip 0-credit remedial courses
    if (c.credits === 0) return;

    const check = checkPrereqs(c.code, completed);
    const relevant = isRelevantToDept(c.code, deptCode);

    results.push({
      ...c,
      canTake: check.canTake,
      missingHp: check.missingHp,
      missingSp: check.missingSp,
      hasPrereqData: check.hasData,
      isRelevant: relevant,
      unlockCount: getUnlockCount(c.code),
    });
  });

  // Sort: relevant first, then unlocked, then by downstream unlock count (desc), then level
  results.sort((a, b) => {
    if (a.isRelevant !== b.isRelevant) return a.isRelevant ? -1 : 1;
    if (a.canTake !== b.canTake) return a.canTake ? -1 : 1;
    if (a.unlockCount !== b.unlockCount) return b.unlockCount - a.unlockCount;
    const aNum = parseInt(a.code.replace(/^[A-Z]+/, ''));
    const bNum = parseInt(b.code.replace(/^[A-Z]+/, ''));
    return aNum - bNum;
  });

  return results;
}

// ── Engine: validate the current plan ───────────────────────────────────────
function validatePlan(completed) {
  const totalCredits = plan.courses.reduce((sum, code) => {
    const c = COURSE_DB[code];
    return sum + (c ? c.credits : 0);
  }, 0);

  const issues   = [];
  const warnings = [];

  if (totalCredits > 0 && totalCredits < 9) {
    issues.push(`${totalCredits} credits \u2014 below 9-credit minimum`);
  }
  if (totalCredits > 15) {
    issues.push(`${totalCredits} credits \u2014 exceeds 15-credit maximum`);
  }
  if (totalCredits > 12 && totalCredits <= 15) {
    warnings.push(`${totalCredits} credits \u2014 requires chairman\u2019s permission`);
  }

  const scheduled    = getScheduledCodes();
  const inProgress   = getInProgressCodes();

  plan.courses.forEach(code => {
    const check = checkPrereqs(code, completed);
    if (!check.canTake) {
      issues.push(`${code} \u2014 missing prerequisite${check.missingHp.length > 1 ? 's' : ''}: ${check.missingHp.join(', ')}`);
    }
    if (check.missingSp.length > 0) {
      warnings.push(`${code} \u2014 recommended: ${check.missingSp.join(', ')}`);
    }
  });

  plan.courses.forEach(code => {
    if (completed.has(code)) {
      warnings.push(`${code} \u2014 you\u2019ve already passed this course`);
    } else if (inProgress.has(code)) {
      warnings.push(`${code} \u2014 already in your running semester`);
    } else if (scheduled.has(code)) {
      warnings.push(`${code} \u2014 already scheduled in another semester`);
    }
  });

  return { totalCredits, issues, warnings };
}

// ── Engine: build prereq chain for tree view ────────────────────────────────
function getPrereqChain(code, completed, depth = 0) {
  if (depth > 8) return null;
  const prereq = PREREQS[code];
  const node = {
    code,
    name: COURSE_DB[code]?.name || code,
    completed: completed.has(code),
    children: [],
  };

  if (prereq) {
    const allPrereqs = [...(prereq.hp || []), ...(prereq.sp || [])];
    allPrereqs.forEach(p => {
      const child = getPrereqChain(p, completed, depth + 1);
      if (child) {
        child.isSoft = (prereq.sp || []).includes(p);
        node.children.push(child);
      }
    });
  }

  return node;
}

// ── Engine: project CGPA assuming a uniform grade across planned courses ────
const IMPACT_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D'];

function projectCGPA(plannedCredits, assumedGrade) {
  const { pts, cr } = getCurrentTotals();
  const gp = GRADES[assumedGrade];
  if (gp === null || gp === undefined) return { current: cr > 0 ? pts / cr : null, projected: null, delta: null };
  const newPts = pts + plannedCredits * gp;
  const newCr  = cr + plannedCredits;
  const projected = newCr > 0 ? newPts / newCr : null;
  const current   = cr > 0 ? pts / cr : null;
  return {
    current,
    projected,
    delta: (current !== null && projected !== null) ? projected - current : null,
  };
}

function renderImpactPreview(totalCredits) {
  if (!totalCredits) return '';
  const { current, projected, delta } = projectCGPA(totalCredits, _assumedGrade);
  if (projected === null) return '';
  const sign = delta >= 0 ? '+' : '';
  const deltaColor = delta > 0.005 ? '#2ECC71' : delta < -0.005 ? '#e74c3c' : 'var(--text3)';
  const gradeOpts = IMPACT_GRADES.map(g =>
    `<option value="${escAttr(g)}"${g === _assumedGrade ? ' selected' : ''}>${escHtml(g)}</option>`
  ).join('');
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:10px 12px;border-radius:8px;background:rgba(86,180,233,0.05);border:1px solid rgba(86,180,233,0.15);flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);">
        <span>If all planned courses earn</span>
        <select onchange="onPlannerImpactGrade(this.value)" style="
          padding:3px 8px;border-radius:6px;border:1px solid var(--border);
          background:var(--glass);color:var(--text);
          font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;
        ">${gradeOpts}</select>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:12px;">
        <span style="color:var(--text3);">CGPA</span>
        <span style="color:var(--text2);font-weight:700;">${current !== null ? current.toFixed(2) : '—'}</span>
        <span style="color:var(--text3);">\u2192</span>
        <span style="color:var(--text);font-weight:800;font-family:'Syne',sans-serif;font-size:14px;">${projected.toFixed(2)}</span>
        <span style="color:${deltaColor};font-weight:700;">${delta !== null ? sign + delta.toFixed(2) : ''}</span>
      </div>
    </div>`;
}

// ── Plan actions (exposed to window via main.js) ────────────────────────────
export function addToPlan(code) {
  if (plan.courses.includes(code)) return;
  plan.courses.push(code);
  saveState();
  renderPlanner();
}

export function removeFromPlan(code) {
  plan.courses = plan.courses.filter(c => c !== code);
  saveState();
  renderPlanner();
}

export function clearPlan() {
  plan.courses = [];
  plan.viewingPrereqs = '';
  saveState();
  renderPlanner();
}

export function promoteToRunning() {
  if (plan.courses.length === 0) return;

  const completed = getCompletedCodes();
  const validation = validatePlan(completed);
  if (validation.issues.length > 0) {
    alert('Resolve these issues before starting the semester:\n\n' + validation.issues.join('\n'));
    return;
  }

  const prefill = plan.courses.map(code => {
    const c = COURSE_DB[code];
    if (!c) return null;
    return {
      name: `${c.name} (${c.code})`,
      credits: c.credits,
      grade: '',
      gradePoint: '',
    };
  }).filter(Boolean);

  if (prefill.length === 0) return;

  const hasRunning = state.semesters.some(s => s.running);
  if (hasRunning) {
    const ok = confirm('You already have a running semester in the Calculator.\n\nReplace it with this plan? The existing running semester will be removed.');
    if (!ok) return;
    state.semesters = state.semesters.filter(s => !s.running);
  }

  plan.courses = [];
  plan.viewingPrereqs = '';

  addRunningSemester(prefill);

  if (typeof window.switchCalcTab === 'function') {
    window.switchCalcTab('calculator');
  }
}

export function getPlanCourses() {
  return [...plan.courses];
}

export function setPlanCourses(codes) {
  plan.courses = Array.isArray(codes)
    ? codes.filter(c => typeof c === 'string' && c)
    : [];
  _updatePlannerBadge();
}

export function viewPrereqTree(code) {
  plan.viewingPrereqs = plan.viewingPrereqs === code ? '' : code;
  renderPlanner();
}

export function resetPlanner() {
  plan.courses = [];
  plan.viewingPrereqs = '';
  _searchQuery = '';
  _filterMode = 'all';
  _updatePlannerBadge();
}

export function onPlannerSearch(val) {
  const active = document.activeElement;
  _restoreSearchFocus = !!(active && active.id === 'plannerSearchInput');
  _searchCursorStart = _restoreSearchFocus && typeof active.selectionStart === 'number'
    ? active.selectionStart
    : null;
  _searchCursorEnd = _restoreSearchFocus && typeof active.selectionEnd === 'number'
    ? active.selectionEnd
    : null;

  _searchQuery = val.toLowerCase();
  renderPlanner();
}

export function onPlannerFilter(mode) {
  _filterMode = mode;
  renderPlanner();
}

export function onPlannerImpactGrade(grade) {
  if (IMPACT_GRADES.includes(grade)) {
    _assumedGrade = grade;
    renderPlanner();
  }
}

export function getPlanCourseCount() {
  return plan.courses.length;
}

// ── Render: prereq tree (recursive) ─────────────────────────────────────────
function renderTreeNode(node, depth = 0) {
  const indent = depth * 20;
  const icon = node.completed
    ? '<span style="color:#2ECC71;font-size:13px;">\u2713</span>'
    : '<span style="color:#e74c3c;font-size:13px;">\u2717</span>';
  const softLabel = node.isSoft
    ? ' <span style="font-size:10px;color:var(--text3);font-style:italic">(recommended)</span>'
    : '';
  const nameColor = node.completed ? 'var(--text3)' : 'var(--text)';
  const textDecor = node.completed ? 'text-decoration:line-through;opacity:0.6;' : '';

  let html = `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;margin-left:${indent}px;${textDecor}">
    ${icon}
    <span style="font-size:12px;font-weight:700;color:var(--green);">${escHtml(node.code)}</span>
    <span style="font-size:12px;color:${nameColor};">${escHtml(node.name)}</span>
    ${softLabel}
  </div>`;

  if (node.children.length > 0) {
    node.children.forEach(child => {
      html += renderTreeNode(child, depth + 1);
    });
  }

  return html;
}

// ── Render: main planner ────────────────────────────────────────────────────
export function renderPlanner() {
  const container = document.getElementById('plannerContent');
  if (!container) return;

  const completed = getCompletedCodes();
  const dept = state.currentDept;

  // No department and no semesters at all — show setup prompt
  if (!dept && !state.semesters.length) {
    container.innerHTML = `
      <div class="planner-coming-soon">
        <div class="planner-coming-soon-icon">\ud83d\udcc5</div>
        <div class="planner-coming-soon-title">Set up your department first</div>
        <div class="planner-coming-soon-desc">Select your department and add your completed courses in the Calculator tab to start planning your next semester.</div>
      </div>`;
    _updatePlannerBadge();
    return;
  }

  // No course data at all — summary-only or brand new
  const hasAnyCourses = state.semesters.some(s =>
    !s.summary && s.courses.some(c => c.name.trim())
  );
  if (!hasAnyCourses) {
    const hasSummary = state.semesters.some(s => s.summary);
    container.innerHTML = `
      <div class="planner-coming-soon">
        <div class="planner-coming-soon-icon">\ud83d\udcc5</div>
        <div class="planner-coming-soon-title">${hasSummary ? 'Add completed courses first' : 'Add your courses first'}</div>
        <div class="planner-coming-soon-desc">${hasSummary
          ? 'Your CGPA summary helps with totals, but the planner needs actual completed courses to check prerequisites. Import your transcript or add past courses in the Calculator tab first.'
          : 'Import your transcript or add courses in the Calculator tab so the planner can check prerequisites and suggest what you can take next.'}</div>
      </div>`;
    _updatePlannerBadge();
    return;
  }

  const validation = validatePlan(completed);
  const available  = getAvailableCourses(completed, dept);

  // Apply search filter
  let filtered = _searchQuery
    ? available.filter(c =>
        c.code.toLowerCase().includes(_searchQuery) ||
        c.name.toLowerCase().includes(_searchQuery))
    : available;

  // Apply status filter
  if (_filterMode === 'unlocked') {
    filtered = filtered.filter(c => c.canTake);
  } else if (_filterMode === 'locked') {
    filtered = filtered.filter(c => !c.canTake);
  }

  // Only show first 25 to keep DOM small
  const displayCourses = filtered.slice(0, 25);
  const hasMore = filtered.length > 25;

  // ── Stats strip ───────────────────────────────────────────────────────
  const completedCount = completed.size;
  const unlockedCount  = available.filter(c => c.canTake && c.isRelevant).length;
  const lockedCount    = available.filter(c => !c.canTake && c.isRelevant).length;
  const prereqCoverage = Object.keys(PREREQS).length;

  const statsHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="flex:1;min-width:70px;padding:8px 10px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:var(--green);">${completedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Passed</div>
      </div>
      <div style="flex:1;min-width:70px;padding:8px 10px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:#2ECC71;">${unlockedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Unlocked</div>
      </div>
      <div style="flex:1;min-width:70px;padding:8px 10px;border-radius:8px;background:rgba(231,76,60,0.05);border:1px solid rgba(231,76,60,0.12);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:#e74c3c;">${lockedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Locked</div>
      </div>
      <div style="flex:1;min-width:70px;padding:8px 10px;border-radius:8px;background:rgba(86,180,233,0.06);border:1px solid rgba(86,180,233,0.12);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:#56B4E9;">${prereqCoverage}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Prereqs</div>
      </div>
    </div>`;

  // ── Plan section ──────────────────────────────────────────────────────
  let planHtml = '';
  if (plan.courses.length > 0) {
    const planRows = plan.courses.map(code => {
      const c = COURSE_DB[code];
      if (!c) return '';
      const check = checkPrereqs(code, completed);
      const statusIcon = check.canTake
        ? '<span style="color:#2ECC71;">\u2713</span>'
        : '<span style="color:#e74c3c;">\u2717</span>';
      const warnText = !check.canTake
        ? `<div style="font-size:10px;color:#e74c3c;margin-top:2px;">Missing: ${check.missingHp.map(p => escHtml(p)).join(', ')}</div>`
        : check.missingSp.length > 0
        ? `<div style="font-size:10px;color:#F0A500;margin-top:2px;">Recommended: ${check.missingSp.map(p => escHtml(p)).join(', ')}</div>`
        : '';

      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:rgba(46,204,113,0.04);border:1px solid rgba(46,204,113,0.12);margin-bottom:4px;">
        <span style="flex-shrink:0;">${statusIcon}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:700;color:var(--green);background:rgba(46,204,113,0.10);border-radius:4px;padding:1px 6px;">${escHtml(c.code)}</span>
            <span style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.name)}</span>
          </div>
          ${warnText}
        </div>
        <span style="font-size:12px;color:var(--text2);flex-shrink:0;">${c.credits} cr</span>
        <button onclick="openCourseReviews('${escAttr(code)}', '${escAttr(c.name)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:2px;flex-shrink:0;" title="See faculty reviews">\u2b50</button>
        <button onclick="viewPrereqTree('${escAttr(code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:2px;flex-shrink:0;" title="View prerequisites">\ud83d\udd17</button>
        <button onclick="removeFromPlan('${escAttr(code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:2px;flex-shrink:0;" title="Remove">\u00d7</button>
      </div>`;
    }).join('');

    const creditColor = validation.totalCredits > 15 || (validation.totalCredits > 0 && validation.totalCredits < 9)
      ? '#e74c3c'
      : validation.totalCredits > 12
      ? '#F0A500'
      : '#2ECC71';

    const impactHtml = renderImpactPreview(validation.totalCredits);

    const hasRunning = state.semesters.some(s => s.running);
    const canPromote = validation.issues.length === 0;
    const promoteLabel = hasRunning ? 'Replace Running Semester' : 'Start Semester \u2192';
    const promoteBtn = `
      <button onclick="promoteToRunning()" ${canPromote ? '' : 'disabled'} style="
        width:100%;margin-top:10px;padding:10px 14px;border-radius:10px;
        background:${canPromote ? 'rgba(46,204,113,0.12)' : 'rgba(115,115,115,0.08)'};
        border:1px solid ${canPromote ? 'rgba(46,204,113,0.35)' : 'var(--border)'};
        color:${canPromote ? '#2ECC71' : 'var(--text3)'};
        font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;
        cursor:${canPromote ? 'pointer' : 'not-allowed'};
        transition:background 0.2s,border-color 0.2s;
      " title="${canPromote ? 'Move this plan into a running semester in the Calculator' : 'Fix plan issues first'}">
        \ud83d\udccd ${escHtml(promoteLabel)}
      </button>`;

    planHtml = `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);">Your plan (${plan.courses.length} course${plan.courses.length !== 1 ? 's' : ''})</span>
          <button onclick="clearPlan()" style="font-size:11px;color:var(--text3);background:none;border:none;cursor:pointer;text-decoration:underline;font-family:'DM Sans',sans-serif;">Clear all</button>
        </div>
        ${planRows}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);">
          <span style="font-size:13px;font-weight:700;color:${creditColor};">${validation.totalCredits} credits</span>
          <span style="font-size:11px;color:var(--text3);">Target: 9\u201315 credits</span>
        </div>
        ${impactHtml}
        ${promoteBtn}
      </div>`;

    // Validation issues
    if (validation.issues.length > 0 || validation.warnings.length > 0) {
      let valHtml = '';
      validation.issues.forEach(issue => {
        valHtml += `<div style="font-size:12px;color:#e74c3c;padding:3px 0;">\u26d4 ${escHtml(issue)}</div>`;
      });
      validation.warnings.forEach(warn => {
        valHtml += `<div style="font-size:12px;color:#F0A500;padding:3px 0;">\u26a0 ${escHtml(warn)}</div>`;
      });
      planHtml += `<div style="padding:8px 12px;border-radius:8px;background:rgba(231,76,60,0.05);border:1px solid rgba(231,76,60,0.12);margin-bottom:16px;">${valHtml}</div>`;
    }
  }

  // ── Prereq tree view ──────────────────────────────────────────────────
  let treeHtml = '';
  if (plan.viewingPrereqs) {
    const tree = getPrereqChain(plan.viewingPrereqs, completed);
    if (tree) {
      const courseName = COURSE_DB[plan.viewingPrereqs]?.name || plan.viewingPrereqs;
      treeHtml = `
        <div style="padding:12px 14px;border-radius:10px;background:rgba(86,180,233,0.06);border:1px solid rgba(86,180,233,0.18);margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:700;color:#56B4E9;">Prerequisite chain for ${escHtml(plan.viewingPrereqs)}</span>
            <button onclick="viewPrereqTree('')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;font-family:'DM Sans',sans-serif;">\u00d7</button>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${escHtml(courseName)}</div>
          ${tree.children.length > 0
            ? tree.children.map(child => renderTreeNode(child)).join('')
            : '<div style="font-size:12px;color:var(--text3);font-style:italic;">No prerequisites required.</div>'}
        </div>`;
    }
  }

  // ── Filter tabs ───────────────────────────────────────────────────────
  const filterBtn = (mode, label, count) => {
    const active = _filterMode === mode;
    return `<button onclick="onPlannerFilter('${mode}')" style="
      padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;
      font-family:'DM Sans',sans-serif;cursor:pointer;
      border:1px solid ${active ? 'rgba(46,204,113,0.35)' : 'var(--border)'};
      background:${active ? 'rgba(46,204,113,0.08)' : 'transparent'};
      color:${active ? '#2ECC71' : 'var(--text3)'};
      transition:background 0.2s,border-color 0.2s,color 0.2s;
    ">${label} (${count})</button>`;
  };

  const allCount      = available.length;
  const filterUnlocked = available.filter(c => c.canTake).length;
  const filterLocked   = available.filter(c => !c.canTake).length;

  // ── Suggestions section ───────────────────────────────────────────────
  const courseRows = displayCourses.map(c => {
    const isLocked = !c.canTake;
    const opacity = isLocked ? 'opacity:0.5;' : '';
    const lockIcon = isLocked
      ? `<span style="color:#e74c3c;font-size:11px;flex-shrink:0;" title="Missing: ${c.missingHp.map(p => escAttr(p)).join(', ')}">\ud83d\udd12</span>`
      : c.hasPrereqData
      ? `<span style="color:#2ECC71;font-size:11px;flex-shrink:0;">\ud83d\udd13</span>`
      : '<span style="width:16px;display:inline-block;flex-shrink:0;"></span>';

    const softWarn = c.missingSp.length > 0 && c.canTake
      ? `<span style="font-size:10px;color:#F0A500;margin-left:4px;" title="Recommended: ${c.missingSp.map(p => escAttr(p)).join(', ')}">\u26a0</span>`
      : '';

    const relevanceDim = !c.isRelevant ? 'opacity:0.55;' : '';

    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);${opacity}${relevanceDim}">
      ${lockIcon}
      <span style="font-size:11px;font-weight:700;color:var(--green);background:rgba(46,204,113,0.10);border-radius:4px;padding:1px 6px;flex-shrink:0;">${escHtml(c.code)}</span>
      <span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.name)}${softWarn}</span>
      <span style="font-size:11px;color:var(--text3);flex-shrink:0;">${c.credits} cr</span>
      <button onclick="openCourseReviews('${escAttr(c.code)}', '${escAttr(c.name)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:2px;flex-shrink:0;" title="See faculty reviews for this course">\u2b50</button>
      <button onclick="viewPrereqTree('${escAttr(c.code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:2px;flex-shrink:0;" title="View prerequisites">\ud83d\udd17</button>
      ${!isLocked
        ? `<button onclick="addToPlan('${escAttr(c.code)}')" style="background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.25);color:#2ECC71;cursor:pointer;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;flex-shrink:0;font-family:'DM Sans',sans-serif;">+ Add</button>`
        : `<span style="font-size:10px;color:var(--text3);flex-shrink:0;min-width:50px;text-align:right;">Locked</span>`
      }
    </div>`;
  }).join('');

  // ── Assemble ──────────────────────────────────────────────────────────
  container.innerHTML = `
    ${statsHtml}
    ${planHtml}
    ${treeHtml}
    <div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);">Available courses</span>
        <div style="display:flex;align-items:center;gap:10px;">
          <button onclick="switchCalcTab('reviews')" style="background:none;border:none;color:#2ECC71;cursor:pointer;font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif;text-decoration:underline;padding:0;" title="Browse faculty reviews">\u2b50 Browse Reviews</button>
          <span style="font-size:11px;color:var(--text3);">${filtered.length} found</span>
        </div>
      </div>
      <input type="text" placeholder="Search by course code or name..."
        id="plannerSearchInput"
        value="${escAttr(_searchQuery)}"
        oninput="onPlannerSearch(this.value)"
        style="
          width:100%;padding:8px 12px;margin-bottom:8px;
          background:var(--input-bg);border:1px solid var(--border);
          border-radius:8px;color:var(--text);
          font-family:'DM Sans',sans-serif;font-size:13px;
          outline:none;box-sizing:border-box;
          transition:border-color 0.2s;
        "
        onfocus="this.style.borderColor='rgba(46,204,113,0.55)'"
        onblur="this.style.borderColor=''"
      />
      <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
        ${filterBtn('all', 'All', allCount)}
        ${filterBtn('unlocked', 'Unlocked', filterUnlocked)}
        ${filterBtn('locked', 'Locked', filterLocked)}
      </div>
    </div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto;">
      ${courseRows || '<div style="padding:20px;text-align:center;font-size:13px;color:var(--text3);">No matching courses found.</div>'}
      ${hasMore ? `<div style="padding:8px;text-align:center;font-size:11px;color:var(--text3);">${filtered.length - 25} more courses \u2014 refine your search</div>` : ''}
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text3);line-height:1.6;">
      \ud83d\udd13 = prerequisites met &nbsp; \ud83d\udd12 = prerequisites missing &nbsp; \ud83d\udd17 = view prerequisite chain
      <br>Prerequisite data covers ${prereqCoverage} courses across CSE, EEE, ECE, MAT, PHY, BBA, ECO, and ENG departments.
    </div>`;

  if (_restoreSearchFocus) {
    const searchInput = document.getElementById('plannerSearchInput');
    if (searchInput) {
      requestAnimationFrame(() => {
        searchInput.focus();
        if (typeof searchInput.setSelectionRange === 'function') {
          const end = typeof _searchCursorEnd === 'number'
            ? Math.min(_searchCursorEnd, searchInput.value.length)
            : searchInput.value.length;
          const start = typeof _searchCursorStart === 'number'
            ? Math.min(_searchCursorStart, end)
            : end;
          searchInput.setSelectionRange(start, end);
        }
      });
    }
    _restoreSearchFocus = false;
    _searchCursorStart = null;
    _searchCursorEnd = null;
  }

  _updatePlannerBadge();
}

// ── Update the tab badge with plan course count ─────────────────────────────
function _updatePlannerBadge() {
  const badge = document.getElementById('plannerTabBadge');
  if (!badge) return;
  if (plan.courses.length > 0) {
    badge.textContent = plan.courses.length;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}
