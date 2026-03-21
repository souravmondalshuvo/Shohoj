import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { COURSE_DB, ALL_COURSES } from '../core/catalog.js';
import { state } from '../core/state.js';
import { getRetakenKeys } from '../core/calculator.js';

// ── Local playground state ──────────────────────────────────────────────────
const pg = {
  activeTab: 'changer',
  changes: {},      // key → newGrade
  simCourses: [],   // [{ code, name, credits, grade }]
  solverKey: '',     // course key 'semId-idx' or '__new-CODE'
  solverTarget: '',
};

// ── Grade list (exclude special grades) ─────────────────────────────────────
const GRADE_LIST = Object.keys(GRADES).filter(g => g !== 'P' && g !== 'I' && g !== 'F(NT)');

// ── Helpers ─────────────────────────────────────────────────────────────────
function gradeColor(g) {
  if (!g) return 'var(--text3)';
  if (g.startsWith('A')) return '#2ECC71';
  if (g.startsWith('B')) return '#27ae60';
  if (g.startsWith('C')) return '#F0A500';
  if (g.startsWith('D')) return '#e67e22';
  if (g === 'F') return '#e74c3c';
  return 'var(--text3)';
}

function courseLabel(name) {
  const m = name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
  return m ? m[1] : (name.length > 30 ? name.slice(0, 27) + '...' : name);
}

function getGradedCourses() {
  const rk = getRetakenKeys();
  const courses = [];
  state.semesters.forEach(sem => {
    sem.courses.forEach((c, i) => {
      if (!c.name.trim() || !c.grade) return;
      if (c.grade === 'P' || c.grade === 'I' || c.grade === 'F(NT)') return;
      const gp = GRADES[c.grade];
      if (gp === undefined) return;
      if (rk.has(`${sem.id}-${i}`)) return;
      const semLabel = sem.name.replace(/\s*\(.*\)$/, '');
      courses.push({
        key: `${sem.id}-${i}`,
        name: c.name,
        credits: c.credits,
        grade: c.grade,
        gp,
        sem: semLabel,
        running: !!sem.running,
      });
    });
  });
  return courses;
}

function getCurrentTotals() {
  const rk = getRetakenKeys();
  let pts = 0, cr = 0;
  state.semesters.forEach(sem => {
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || gp === null || !c.credits) return;
      if (c.grade === 'P' || c.grade === 'I' || c.grade === 'F(NT)') return;
      if (rk.has(`${sem.id}-${i}`)) return;
      pts += gp * c.credits;
      cr += c.credits;
    });
  });
  return { pts, cr, cgpa: cr > 0 ? pts / cr : null };
}

// ── Tab switching ───────────────────────────────────────────────────────────
export function switchPlaygroundTab(tab) {
  pg.activeTab = tab;
  renderPlayground();
}

// ── Grade Changer ───────────────────────────────────────────────────────────
export function onPlaygroundGradeChange(key, grade) {
  const courses = getGradedCourses();
  const c = courses.find(x => x.key === key);
  if (c && grade === c.grade) {
    delete pg.changes[key];
  } else {
    pg.changes[key] = grade;
  }
  renderPlayground();
}

export function removePlaygroundChange(key) {
  delete pg.changes[key];
  renderPlayground();
}

export function clearPlaygroundChanges() {
  Object.keys(pg.changes).forEach(k => delete pg.changes[k]);
  renderPlayground();
}

function renderGradeChanger(courses, totals) {
  const changeKeys = Object.keys(pg.changes);

  // Calculate what-if CGPA with all changes applied
  let newPts = totals.pts, newCr = totals.cr;
  const changeDetails = [];
  for (const [key, newGrade] of Object.entries(pg.changes)) {
    const c = courses.find(x => x.key === key);
    if (!c) continue;
    const newGp = GRADES[newGrade];
    if (newGp === undefined) continue;
    const delta = c.credits * (newGp - c.gp);
    newPts += delta;
    const impact = newCr > 0 ? delta / newCr : 0;
    changeDetails.push({ ...c, newGrade, newGp, impact });
  }
  const newCgpa = newCr > 0 ? newPts / newCr : null;
  const cgpaDelta = totals.cgpa !== null && newCgpa !== null ? newCgpa - totals.cgpa : 0;

  // Hero: before → after
  let heroHtml = '';
  if (changeKeys.length > 0 && totals.cgpa !== null && newCgpa !== null) {
    const sign = cgpaDelta >= 0 ? '+' : '';
    const deltaColor = cgpaDelta >= 0 ? '#2ECC71' : '#e74c3c';
    heroHtml = `
      <div class="pg-hero">
        <div class="pg-hero-block">
          <div class="pg-hero-label">Current</div>
          <div class="pg-hero-val">${totals.cgpa.toFixed(2)}</div>
        </div>
        <div class="pg-hero-arrow">→</div>
        <div class="pg-hero-block">
          <div class="pg-hero-label">What-if</div>
          <div class="pg-hero-val" style="color:#F0A500">${newCgpa.toFixed(2)}</div>
        </div>
        <div class="pg-hero-delta" style="background:${cgpaDelta >= 0 ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)'};color:${deltaColor}">${sign}${cgpaDelta.toFixed(2)}</div>
      </div>`;
  }

  // Changes list
  let changesHtml = '';
  if (changeDetails.length > 0) {
    const rows = changeDetails.map(ch => `
      <div class="pg-change-row">
        <div class="pg-change-course">
          <strong>${courseLabel(ch.name)}</strong>
          <span class="pg-change-meta">${ch.sem} · ${ch.credits} cr</span>
        </div>
        <div class="pg-change-grades">
          <span style="color:${gradeColor(ch.grade)}">${ch.grade}</span>
          <span style="color:var(--text3)">→</span>
          <span style="color:${gradeColor(ch.newGrade)};font-weight:700">${ch.newGrade}</span>
        </div>
        <div class="pg-change-impact" style="color:${ch.impact >= 0 ? '#2ECC71' : '#e74c3c'}">${ch.impact >= 0 ? '+' : ''}${ch.impact.toFixed(3)}</div>
        <button class="pg-change-remove" onclick="removePlaygroundChange('${ch.key}')" title="Remove">×</button>
      </div>`).join('');

    changesHtml = `
      <div class="pg-changes-header">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text3)">Changes (${changeDetails.length})</span>
        <button class="pg-clear-btn" onclick="clearPlaygroundChanges()">Clear all</button>
      </div>
      <div class="pg-changes-list">${rows}</div>`;
  }

  // Course picker — show all graded courses not yet changed
  const available = courses.filter(c => !pg.changes[c.key]);
  const gradeOpts = GRADE_LIST.map(g => `<option value="${g}">${g}</option>`).join('');
  const courseOpts = available.map(c =>
    `<option value="${c.key}">${courseLabel(c.name)} (${c.grade}) — ${c.sem}</option>`
  ).join('');

  const pickerHtml = available.length > 0 ? `
    <div class="pg-add-row">
      <select class="pg-course-select" id="pgChangerCourseSelect">
        <option value="" disabled selected>+ Pick a course to change</option>
        ${courseOpts}
      </select>
      <select class="pg-grade-select" id="pgChangerGradeSelect">
        <option value="" disabled selected>New grade</option>
        ${gradeOpts}
      </select>
      <button class="pg-add-btn" onclick="addPlaygroundChange()">Add</button>
    </div>` : `<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">All courses have been modified</div>`;

  return `${heroHtml}${changesHtml}${pickerHtml}`;
}

export function addPlaygroundChange() {
  const courseEl = document.getElementById('pgChangerCourseSelect');
  const gradeEl = document.getElementById('pgChangerGradeSelect');
  if (!courseEl || !gradeEl || !courseEl.value || !gradeEl.value) return;
  pg.changes[courseEl.value] = gradeEl.value;
  renderPlayground();
}

// ── Reverse Solver ──────────────────────────────────────────────────────────
export function onSolverTargetChange(val) {
  pg.solverTarget = val;
  renderPlayground();
}

export function onSolverCourseChange(key) {
  pg.solverKey = key;
  renderPlayground();
}

function renderReverseSolver(courses, totals) {
  if (totals.cgpa === null) {
    return `<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px">Add some graded courses first to use the Reverse Solver.</div>`;
  }

  // Course options: running semester courses + all graded courses
  const courseOpts = courses.map(c =>
    `<option value="${c.key}"${pg.solverKey === c.key ? ' selected' : ''}>${courseLabel(c.name)}${c.running ? ' 🟡' : ''} (${c.grade}) — ${c.sem}</option>`
  ).join('');

  // Input row
  let resultHtml = '';

  if (pg.solverTarget && pg.solverKey) {
    const target = parseFloat(pg.solverTarget);
    const c = courses.find(x => x.key === pg.solverKey);

    if (c && !isNaN(target) && target >= 0 && target <= 4.0) {
      // Math: targetCgpa = (totalPts - oldPts + newPts) / totalCr
      // newGp = (target * totalCr - totalPts + c.credits * c.gp) / c.credits
      const neededGp = (target * totals.cr - totals.pts + c.credits * c.gp) / c.credits;

      // Find minimum grade that meets or exceeds neededGp
      const sortedGrades = GRADE_LIST
        .map(g => ({ grade: g, gp: GRADES[g] }))
        .filter(x => x.gp !== null && x.gp !== undefined)
        .sort((a, b) => a.gp - b.gp);

      const minGrade = sortedGrades.find(x => x.gp >= neededGp);

      if (neededGp > 4.0) {
        // Calculate ceiling — what's the best possible CGPA with A in this course
        const bestPossible = (totals.pts - c.credits * c.gp + c.credits * 4.0) / totals.cr;
        resultHtml = `
          <div class="pg-solver-result pg-solver-impossible">
            <div class="pg-solver-icon">⛔</div>
            <div>
              <div class="pg-solver-msg">Not possible with <strong>${courseLabel(c.name)}</strong> alone</div>
              <div class="pg-solver-detail">Even with an A (4.0), your CGPA would be <strong>${bestPossible.toFixed(2)}</strong> — below your target of <strong>${target.toFixed(2)}</strong>. Consider retaking multiple courses.</div>
            </div>
          </div>`;
      } else if (neededGp <= 0) {
        resultHtml = `
          <div class="pg-solver-result pg-solver-easy">
            <div class="pg-solver-icon">🎉</div>
            <div>
              <div class="pg-solver-msg">You've already reached ${target.toFixed(2)} CGPA!</div>
              <div class="pg-solver-detail">Any grade in <strong>${courseLabel(c.name)}</strong> will keep you above your target.</div>
            </div>
          </div>`;
      } else if (minGrade) {
        const newCgpa = (totals.pts - c.credits * c.gp + c.credits * minGrade.gp) / totals.cr;
        resultHtml = `
          <div class="pg-solver-result pg-solver-found">
            <div class="pg-solver-answer">
              <div class="pg-solver-answer-label">You need at least</div>
              <div class="pg-solver-answer-grade" style="color:${gradeColor(minGrade.grade)}">${minGrade.grade}</div>
              <div class="pg-solver-answer-gp">(${minGrade.gp.toFixed(1)} GP)</div>
            </div>
            <div class="pg-solver-explain">
              <div>in <strong>${courseLabel(c.name)}</strong> (${c.credits} cr, currently ${c.grade})</div>
              <div style="margin-top:4px">
                CGPA: <span style="color:var(--text3)">${totals.cgpa.toFixed(2)}</span>
                → <strong style="color:#2ECC71">${newCgpa.toFixed(2)}</strong>
                <span style="color:#2ECC71;font-size:11px;margin-left:4px">+${(newCgpa - totals.cgpa).toFixed(2)}</span>
              </div>
            </div>
          </div>`;
      }
    }
  }

  return `
    <div class="pg-solver-inputs">
      <div class="pg-solver-input-group">
        <label class="pg-solver-label">Target CGPA</label>
        <input type="number" class="pg-solver-target" min="0" max="4" step="0.01"
          placeholder="e.g. 3.00" value="${pg.solverTarget}"
          oninput="onSolverTargetChange(this.value)" />
      </div>
      <div class="pg-solver-input-group" style="flex:2">
        <label class="pg-solver-label">Course</label>
        <select class="pg-solver-course-select" onchange="onSolverCourseChange(this.value)">
          <option value="" disabled ${!pg.solverKey ? 'selected' : ''}>Pick a course</option>
          ${courseOpts}
        </select>
      </div>
    </div>
    ${resultHtml}`;
}

// ── Semester Simulator ──────────────────────────────────────────────────────
export function addSimCourse() {
  pg.simCourses.push({ code: '', name: '', credits: 3, grade: '' });
  renderPlayground();
}

export function removeSimCourse(idx) {
  pg.simCourses.splice(idx, 1);
  renderPlayground();
}

export function onSimCourseChange(idx, field, value) {
  if (field === 'credits') value = parseFloat(value) || 0;
  pg.simCourses[idx][field] = value;
  // If code changed, try to fill name + credits from catalog
  if (field === 'code') {
    const entry = COURSE_DB[value.toUpperCase()];
    if (entry) {
      pg.simCourses[idx].name = entry.name;
      pg.simCourses[idx].credits = entry.credits;
    }
  }
  renderPlayground();
}

function renderSemesterSimulator(courses, totals) {
  if (totals.cgpa === null) {
    return `<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px">Add some graded courses first to use the Semester Simulator.</div>`;
  }

  // Calculate projected CGPA with sim courses
  let simPts = totals.pts, simCr = totals.cr;
  pg.simCourses.forEach(sc => {
    if (!sc.grade || !sc.credits) return;
    const gp = GRADES[sc.grade];
    if (gp === undefined || gp === null) return;
    simPts += gp * sc.credits;
    simCr += sc.credits;
  });
  const simCgpa = simCr > 0 ? simPts / simCr : null;
  const simDelta = totals.cgpa !== null && simCgpa !== null ? simCgpa - totals.cgpa : 0;

  const gradeOpts = GRADE_LIST.map(g => `<option value="${g}">${g}</option>`).join('');

  const rows = pg.simCourses.map((sc, idx) => {
    const gradeSelected = GRADE_LIST.map(g =>
      `<option value="${g}"${sc.grade === g ? ' selected' : ''}>${g}</option>`
    ).join('');
    return `
      <div class="pg-sim-row">
        <input type="text" class="pg-sim-code" placeholder="e.g. CSE220"
          value="${sc.code}" oninput="onSimCourseChange(${idx},'code',this.value)" />
        <span class="pg-sim-name">${sc.name || '—'}</span>
        <span class="pg-sim-cr">${sc.credits} cr</span>
        <select class="pg-sim-grade" onchange="onSimCourseChange(${idx},'grade',this.value)">
          <option value="" disabled ${!sc.grade ? 'selected' : ''}>Grade</option>
          ${gradeSelected}
        </select>
        <button class="pg-change-remove" onclick="removeSimCourse(${idx})">×</button>
      </div>`;
  }).join('');

  let heroHtml = '';
  if (pg.simCourses.some(sc => sc.grade && sc.credits)) {
    const sign = simDelta >= 0 ? '+' : '';
    const deltaColor = simDelta >= 0 ? '#2ECC71' : '#e74c3c';
    heroHtml = `
      <div class="pg-hero">
        <div class="pg-hero-block">
          <div class="pg-hero-label">Current</div>
          <div class="pg-hero-val">${totals.cgpa.toFixed(2)}</div>
        </div>
        <div class="pg-hero-arrow">→</div>
        <div class="pg-hero-block">
          <div class="pg-hero-label">Projected</div>
          <div class="pg-hero-val" style="color:${simDelta >= 0 ? '#2ECC71' : '#e74c3c'}">${simCgpa.toFixed(2)}</div>
        </div>
        <div class="pg-hero-delta" style="background:${simDelta >= 0 ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)'};color:${deltaColor}">${sign}${simDelta.toFixed(2)}</div>
      </div>`;
  }

  return `
    ${heroHtml}
    <div class="pg-sim-list">${rows}</div>
    <button class="pg-sim-add" onclick="addSimCourse()">+ Add course</button>
    <div style="font-size:11px;color:var(--text3);margin-top:8px">Type a course code to auto-fill name and credits from the catalog.</div>`;
}

// ── Main render ─────────────────────────────────────────────────────────────
export function renderPlayground() {
  const box = document.getElementById('playgroundBox');
  const content = document.getElementById('playgroundContent');
  if (!box || !content) return;

  const courses = getGradedCourses();
  const totals = getCurrentTotals();

  if (!state.semesters.length || totals.cgpa === null) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';

  const tabs = [
    { id: 'changer',   label: '✏️ Grade Changer',      desc: 'Change any grade, see impact' },
    { id: 'solver',    label: '🎯 Reverse Solver',      desc: 'What grade do I need?' },
    { id: 'simulator', label: '📊 Semester Simulator',   desc: 'Plan next semester' },
  ];

  const tabsHtml = tabs.map(t => `
    <button class="pg-tab${pg.activeTab === t.id ? ' pg-tab-active' : ''}"
      onclick="switchPlaygroundTab('${t.id}')">
      <span class="pg-tab-label">${t.label}</span>
      <span class="pg-tab-desc">${t.desc}</span>
    </button>`).join('');

  let bodyHtml = '';
  if (pg.activeTab === 'changer')   bodyHtml = renderGradeChanger(courses, totals);
  if (pg.activeTab === 'solver')    bodyHtml = renderReverseSolver(courses, totals);
  if (pg.activeTab === 'simulator') bodyHtml = renderSemesterSimulator(courses, totals);

  content.innerHTML = `
    <div class="pg-tabs">${tabsHtml}</div>
    <div class="pg-body">${bodyHtml}</div>`;
}