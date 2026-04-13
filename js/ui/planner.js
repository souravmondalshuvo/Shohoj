// ── js/ui/planner.js ──────────────────────────────────────────────────────────
// Semester Planner: prerequisite checking, course recommendations,
// plan building, credit validation, and prereq tree visualization.

import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state } from '../core/state.js';
import { COURSE_DB, ALL_COURSES, PREREQS } from '../core/catalog.js';
import { getRetakenKeys } from '../core/calculator.js';
import { escHtml, escAttr } from '../core/helpers.js';

// ── Local planner state ─────────────────────────────────────────────────────
const plan = {
  courses: [],         // array of course codes added to plan
  viewingPrereqs: '',  // course code whose prereq tree is being shown
};

// ── Engine: get completed course codes ──────────────────────────────────────
function getCompletedCodes() {
  const rk = getRetakenKeys();
  const completed = new Set();
  state.semesters.forEach(sem => {
    if (sem.summary) return;  // summary block doesn't have individual courses
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.grade) return;
      if (c.grade === 'F' || c.grade === 'F(NT)' || c.grade === 'I') return;
      if (rk.has(`${sem.id}-${i}`)) return;  // retaken copy — skip
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

// ── Engine: get all unlocked courses for a department ───────────────────────
function getUnlockedCourses(completed, dept) {
  const inProgress = getInProgressCodes();
  const deptCode = dept || state.currentDept || '';
  const results = [];

  ALL_COURSES.forEach(c => {
    // Skip if already completed or in progress
    if (completed.has(c.code)) return;
    if (inProgress.has(c.code)) return;
    // Skip if already in plan
    if (plan.courses.includes(c.code)) return;
    // Skip 0-credit remedial courses
    if (c.credits === 0) return;

    const check = checkPrereqs(c.code, completed);

    // Determine relevance to current department
    const isCoreDept = c.code.startsWith(deptCode) ||
      c.code.startsWith('CSE') && (deptCode === 'CS') ||
      ['MAT', 'PHY', 'ENG', 'BNG', 'EMB', 'HUM', 'STA', 'ECO'].some(p => c.code.startsWith(p));

    results.push({
      ...c,
      canTake: check.canTake,
      missingHp: check.missingHp,
      missingSp: check.missingSp,
      hasPrereqData: check.hasData,
      isCoreDept,
    });
  });

  // Sort: unlocked first, then by department relevance, then by course level
  results.sort((a, b) => {
    // Unlocked before locked
    if (a.canTake !== b.canTake) return a.canTake ? -1 : 1;
    // Core dept courses first
    if (a.isCoreDept !== b.isCoreDept) return a.isCoreDept ? -1 : 1;
    // Lower course number first
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

  const issues = [];
  const warnings = [];

  // Credit range check
  if (totalCredits > 0 && totalCredits < 9) {
    issues.push(`${totalCredits} credits — below 9-credit minimum`);
  }
  if (totalCredits > 15) {
    issues.push(`${totalCredits} credits — exceeds 15-credit maximum`);
  }
  if (totalCredits > 12 && totalCredits <= 15) {
    warnings.push(`${totalCredits} credits — requires chairman's permission`);
  }

  // Prereq check for each planned course
  plan.courses.forEach(code => {
    const check = checkPrereqs(code, completed);
    if (!check.canTake) {
      issues.push(`${code} — missing prerequisite${check.missingHp.length > 1 ? 's' : ''}: ${check.missingHp.join(', ')}`);
    }
    if (check.missingSp.length > 0) {
      warnings.push(`${code} — recommended: ${check.missingSp.join(', ')}`);
    }
  });

  // Duplicate check — already completed
  plan.courses.forEach(code => {
    if (completed.has(code)) {
      warnings.push(`${code} — you've already passed this course`);
    }
  });

  return { totalCredits, issues, warnings };
}

// ── Engine: build prereq chain for a course (for tree view) ─────────────────
function getPrereqChain(code, completed, depth = 0) {
  if (depth > 8) return null; // safety
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

// ── Plan actions ────────────────────────────────────────────────────────────
export function addToPlan(code) {
  if (plan.courses.includes(code)) return;
  plan.courses.push(code);
  renderPlanner();
}

export function removeFromPlan(code) {
  plan.courses = plan.courses.filter(c => c !== code);
  renderPlanner();
}

export function clearPlan() {
  plan.courses = [];
  plan.viewingPrereqs = '';
  renderPlanner();
}

export function viewPrereqTree(code) {
  plan.viewingPrereqs = plan.viewingPrereqs === code ? '' : code;
  renderPlanner();
}

export function resetPlanner() {
  plan.courses = [];
  plan.viewingPrereqs = '';
}

// ── Search/filter state ─────────────────────────────────────────────────────
let _searchQuery = '';

export function onPlannerSearch(val) {
  _searchQuery = val.trim().toLowerCase();
  renderPlanner();
}

// ── Render: prereq tree (recursive) ─────────────────────────────────────────
function renderTreeNode(node, depth = 0) {
  const indent = depth * 20;
  const icon = node.completed
    ? '<span style="color:#2ECC71;font-size:13px;">✓</span>'
    : '<span style="color:#e74c3c;font-size:13px;">✗</span>';
  const softLabel = node.isSoft ? ' <span style="font-size:10px;color:var(--text3);font-style:italic">(recommended)</span>' : '';
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

  // No department or no semesters at all
  if (!dept && !state.semesters.length) {
    container.innerHTML = `
      <div class="planner-coming-soon">
        <div class="planner-coming-soon-icon">📅</div>
        <div class="planner-coming-soon-title">Set up your department first</div>
        <div class="planner-coming-soon-desc">Select your department and add your completed courses in the Calculator tab to start planning your next semester.</div>
      </div>`;
    return;
  }

  const validation = validatePlan(completed);
  const unlocked = getUnlockedCourses(completed, dept);

  // Filter by search
  const filtered = _searchQuery
    ? unlocked.filter(c =>
        c.code.toLowerCase().includes(_searchQuery) ||
        c.name.toLowerCase().includes(_searchQuery))
    : unlocked;

  // Only show first 20 to keep DOM small
  const displayCourses = filtered.slice(0, 20);
  const hasMore = filtered.length > 20;

  // ── Plan section ──────────────────────────────────────────────────────
  let planHtml = '';
  if (plan.courses.length > 0) {
    const planRows = plan.courses.map(code => {
      const c = COURSE_DB[code];
      if (!c) return '';
      const check = checkPrereqs(code, completed);
      const statusIcon = check.canTake
        ? '<span style="color:#2ECC71;">✓</span>'
        : '<span style="color:#e74c3c;">✗</span>';
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
        <button onclick="viewPrereqTree('${escAttr(code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:2px;flex-shrink:0;" title="View prerequisites">🔗</button>
        <button onclick="removeFromPlan('${escAttr(code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:2px;flex-shrink:0;" title="Remove">×</button>
      </div>`;
    }).join('');

    // Credit total bar
    const creditColor = validation.totalCredits > 15 || (validation.totalCredits > 0 && validation.totalCredits < 9)
      ? '#e74c3c'
      : validation.totalCredits > 12
      ? '#F0A500'
      : '#2ECC71';

    planHtml = `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);">Your plan (${plan.courses.length} courses)</span>
          <button onclick="clearPlan()" style="font-size:11px;color:var(--text3);background:none;border:none;cursor:pointer;text-decoration:underline;">Clear all</button>
        </div>
        ${planRows}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);">
          <span style="font-size:13px;font-weight:700;color:${creditColor};">${validation.totalCredits} credits</span>
          <span style="font-size:11px;color:var(--text3);">Target: 9–15 credits</span>
        </div>
      </div>`;

    // Validation issues
    if (validation.issues.length > 0 || validation.warnings.length > 0) {
      let valHtml = '';
      validation.issues.forEach(issue => {
        valHtml += `<div style="font-size:12px;color:#e74c3c;padding:3px 0;">⛔ ${escHtml(issue)}</div>`;
      });
      validation.warnings.forEach(warn => {
        valHtml += `<div style="font-size:12px;color:#F0A500;padding:3px 0;">⚠ ${escHtml(warn)}</div>`;
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
            <button onclick="viewPrereqTree('')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;">×</button>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${escHtml(courseName)}</div>
          ${tree.children.length > 0
            ? tree.children.map(child => renderTreeNode(child)).join('')
            : '<div style="font-size:12px;color:var(--text3);font-style:italic;">No prerequisites required.</div>'}
        </div>`;
    }
  }

  // ── Suggestions section ───────────────────────────────────────────────
  const courseRows = displayCourses.map(c => {
    const prereqCheck = checkPrereqs(c.code, completed);
    const isLocked = !c.canTake;
    const opacity = isLocked ? 'opacity:0.5;' : '';
    const lockIcon = isLocked
      ? `<span style="color:#e74c3c;font-size:11px;flex-shrink:0;" title="Missing: ${c.missingHp.map(p => escAttr(p)).join(', ')}">🔒</span>`
      : c.hasPrereqData
      ? `<span style="color:#2ECC71;font-size:11px;flex-shrink:0;">🔓</span>`
      : '';

    const softWarn = c.missingSp.length > 0 && c.canTake
      ? `<span style="font-size:10px;color:#F0A500;margin-left:4px;" title="Recommended: ${c.missingSp.map(p => escAttr(p)).join(', ')}">⚠</span>`
      : '';

    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);${opacity}">
      ${lockIcon}
      <span style="font-size:11px;font-weight:700;color:var(--green);background:rgba(46,204,113,0.10);border-radius:4px;padding:1px 6px;flex-shrink:0;">${escHtml(c.code)}</span>
      <span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.name)}${softWarn}</span>
      <span style="font-size:11px;color:var(--text3);flex-shrink:0;">${c.credits} cr</span>
      <button onclick="viewPrereqTree('${escAttr(c.code)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:2px;flex-shrink:0;" title="View prerequisites">🔗</button>
      ${!isLocked
        ? `<button onclick="addToPlan('${escAttr(c.code)}')" style="background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.25);color:#2ECC71;cursor:pointer;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;flex-shrink:0;">+ Add</button>`
        : `<span style="font-size:10px;color:var(--text3);flex-shrink:0;min-width:50px;text-align:right;">Locked</span>`
      }
    </div>`;
  }).join('');

  const completedCount = completed.size;
  const unlockedCount = unlocked.filter(c => c.canTake).length;
  const lockedCount = unlocked.filter(c => !c.canTake).length;

  // ── Stats strip ───────────────────────────────────────────────────────
  const statsHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="flex:1;min-width:80px;padding:8px 10px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:var(--green);">${completedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Completed</div>
      </div>
      <div style="flex:1;min-width:80px;padding:8px 10px;border-radius:8px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.15);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:#2ECC71;">${unlockedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Unlocked</div>
      </div>
      <div style="flex:1;min-width:80px;padding:8px 10px;border-radius:8px;background:rgba(231,76,60,0.05);border:1px solid rgba(231,76,60,0.12);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:'Syne',sans-serif;color:#e74c3c;">${lockedCount}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600;">Locked</div>
      </div>
    </div>`;

  // ── Assemble ──────────────────────────────────────────────────────────
  container.innerHTML = `
    ${statsHtml}
    ${planHtml}
    ${treeHtml}
    <div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);">Available courses</span>
        <span style="font-size:11px;color:var(--text3);">${filtered.length} courses</span>
      </div>
      <input type="text" placeholder="Search by course code or name..."
        value="${escAttr(_searchQuery)}"
        oninput="onPlannerSearch(this.value)"
        style="
          width:100%;padding:8px 12px;
          background:var(--input-bg);border:1px solid var(--border);
          border-radius:8px;color:var(--text);
          font-family:'DM Sans',sans-serif;font-size:13px;
          outline:none;box-sizing:border-box;
          transition:border-color 0.2s;
        "
        onfocus="this.style.borderColor='rgba(46,204,113,0.55)'"
        onblur="this.style.borderColor=''"
      />
    </div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto;">
      ${courseRows || '<div style="padding:20px;text-align:center;font-size:13px;color:var(--text3);">No matching courses found.</div>'}
      ${hasMore ? `<div style="padding:8px;text-align:center;font-size:11px;color:var(--text3);">${filtered.length - 20} more courses — refine your search</div>` : ''}
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text3);line-height:1.6;">
      🔓 = prerequisites met &nbsp; 🔒 = prerequisites missing &nbsp; 🔗 = view prerequisite chain
      ${!PREREQS[Object.keys(PREREQS)[0]] ? '' : `<br>Prerequisite data available for: CSE, EEE, ECE, MAT courses. Other departments coming soon.`}
    </div>`;
}
