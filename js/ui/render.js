import { GRADES } from '../core/grades.js';
import { DEPARTMENTS } from '../core/departments.js';
import { state, saveState, clearState } from '../core/state.js';
import { calcSemGPA, getRetakenKeys, getSemCreditWarning } from '../core/calculator.js';
import {
  SEASON_ORDER, generateSemesterNames, getLastCompletedSemester,
  countSemesters, getStartSeason, getStartYear
} from '../core/helpers.js';

export function renderSemesters() {
  const container = document.getElementById('semestersContainer');
  const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  document.getElementById('semesterCount').textContent = state.semesters.length;
  const runBtn = document.getElementById('addRunningSemBtn');
  if (runBtn) runBtn.disabled = state.semesters.some(s => s.running);
  const retakenKeys = getRetakenKeys();

  container.innerHTML = state.semesters.map(sem => {
    const gpa = calcSemGPA(sem);
    const isRunning = !!sem.running;
    return `
    <div class="semester-block lg-surface${isRunning ? ' semester-running' : ''}" id="sem-${sem.id}" draggable="${isRunning ? 'false' : 'true'}"><div class="lg-shine"></div>
      <div class="semester-head">
        <div class="semester-head-left">
          ${!isRunning ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : ''}           <span class="semester-label">${sem.name}</span>
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
            return `<span class="${cls}">${w.msg}</span>`;
          })()}
        </div>
        <div class="semester-actions">
          <button class="btn-icon danger" onclick="removeSemester(${sem.id})">Remove</button>
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
          return `
        <div class="course-row${isRetaken ? ' retaken' : ''}${state.whatIfMode ? ' whatif-active' : ''}">
          <div class="course-input-wrap" style="position:relative;">
            <input type="text" placeholder="Type course code / title"
              id="course-input-${sem.id}-${i}"
              value="${esc(c.name)}"
              autocomplete="off"
              oninput="onCourseInput(event,${sem.id},${i})"
              onkeydown="onCourseKey(event,${sem.id},${i})"
              onblur="onCourseBlur(event,${sem.id},${i});setTimeout(()=>closeSuggestions('sug-${sem.id}-${i}'),180)" />
            ${isRetaken ? `<span class="retaken-badge">Retaken</span>` : ''}
          </div>
          <span class="credits-static-wrap">
            <span class="credits-static">${c.credits}</span>${
              c.name.trim() && c.credits > 0 && ![0.5,1,1.5,2,2.5,3,3.5,4].includes(c.credits)
                ? `<span class="credit-error-dot" title="Unusual credit value: ${c.credits}"></span>`
                : c.name.trim() && c.credits > 0 && c.credits > 4
                ? `<span class="credit-error-dot" title="Credits above 4 is unusual"></span>`
                : ''
            }</span>
          ${c.credits === 0 && c.name.trim() !== ''
            ? `<select class="pf-select" onchange="onPFChange(${sem.id},${i},this.value)">
                <option value="" disabled ${!c.grade ? 'selected' : ''}>P / F</option>
                <option value="P" ${c.grade === 'P' ? 'selected' : ''}>P — Pass</option>
                <option value="F" ${c.grade === 'F' ? 'selected' : ''}>F — Fail</option>
              </select>`
            : `<input type="text" inputmode="decimal" placeholder="0.0 – 4.0"
                value="${c.grade === 'F(NT)' ? 'NT' : (c.gradePoint !== undefined ? c.gradePoint : (c.grade && GRADES[c.grade] !== null ? GRADES[c.grade] : ''))}"
                oninput="autoDetectGrade(${sem.id},${i},this.value,this)"
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
            }">${c.grade || '—'}</span>
          ${state.whatIfMode && c.grade && c.grade !== 'P' && c.grade !== 'F(NT)' ? buildWhatIfSelect(sem.id, i, c.grade) : ''}
          <button class="btn-remove-course" onclick="removeCourse(${sem.id},${i})">×</button>
        </div>`;
        }).join('')}
      </div>
      <div class="add-course-row">
        <button class="btn-add-course" onclick="addCourse(${sem.id})">+ Add course</button>
      </div>
    </div>`;
  }).join('');

  // ── EMPTY STATE ──────────────────────────────────────
  if (state.semesters.length === 0) {
    const _deptDone = !!state.currentDept;
    const _semDone  = _deptDone && getStartSeason() && getStartYear();
    const _emptyHint = !_deptDone
      ? '<div class="empty-state-steps"><div class="empty-state-step"><span class="empty-state-step-num">1</span><span>Pick your <strong>department</strong> in the header above</span></div><div class="empty-state-step"><span class="empty-state-step-num">2</span><span>Set your <strong>starting semester</strong> (e.g. Fall 2022)</span></div><div class="empty-state-step"><span class="empty-state-step-num">3</span><span>Add your first semester and enter grades</span></div></div>'
      : !_semDone
      ? '<div class="empty-state-steps"><div class="empty-state-step" style="opacity:0.45"><span class="empty-state-step-num done">✓</span><span>Department selected</span></div><div class="empty-state-step"><span class="empty-state-step-num active" style="background:var(--green);color:#0b0f0d">2</span><span>Set your <strong>starting semester</strong> above and click <strong>Let\'s go →</strong></span></div></div>'
      : '<div class="empty-state-steps"><div class="empty-state-step" style="opacity:0.45"><span class="empty-state-step-num done">✓</span><span>Department &amp; semester set</span></div><div class="empty-state-step"><span class="empty-state-step-num active" style="background:var(--green);color:#0b0f0d">3</span><span>Click <strong>+ Add Semester</strong> below, or <strong>Import Transcript</strong> to auto-fill</span></div></div>';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${!_deptDone ? '👋' : !_semDone ? '📅' : '🎓'}</div>
        <div class="empty-state-title">${!_deptDone ? "Let's get you set up" : !_semDone ? 'Almost ready...' : 'Ready to go!'}</div>
        <div class="empty-state-sub">${!_deptDone ? 'Complete the 3 quick steps below to start tracking your CGPA.' : !_semDone ? 'One more step before you can add semesters.' : 'Add your first semester, or load sample data to explore.'}</div>
        ${_emptyHint}
        <div class="empty-state-actions">
          <button class="btn-sample" onclick="loadSampleData()">✨ Load sample data</button>
          ${_semDone ? '<button class="btn-sample-ghost" onclick="addSemester()">+ Add semester</button>' : ''}
        </div>
        ${_semDone ? '<div class="empty-arrow">← use the buttons above too &nbsp;↑</div>' : ''}
      </div>`;
  }

  // ── DRAG-AND-DROP ────────────────────────────────────
  setTimeout(() => {
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

function buildWhatIfSelect(semId, cIdx, currentGrade) {
  const key = semId + '-' + cIdx;
  const selected = state.whatIfGrades[key] || currentGrade;
  const grades = Object.keys(GRADES).filter(g => g !== 'P' && g !== 'I' && g !== 'F(NT)');
  const opts = grades.map(g =>
    '<option value="' + g + '"' + (selected === g ? ' selected' : '') + '>?' + g + '</option>'
  ).join('');
  return '<select class="whatif-grade-select" style="font-size:10px;padding:1px 4px;' +
         'border-radius:5px;max-width:64px;cursor:pointer;" ' +
         'onchange="onWhatIfChange(' + semId + ',' + cIdx + ',this.value)" ' +
         'title="What-if grade">' + opts + '</select>';
}

export function addSemester(prefill = null) {
  const id = state.semesterCounter++;
  const completedCount = state.semesters.filter(s => !s.running).length;
  const allNames = generateSemesterNames(getStartSeason(), getStartYear(), completedCount + 1);
  const name = allNames[completedCount] || `Semester ${completedCount + 1}`;
  const courses = prefill || [{ name: '', credits: 0, grade: '', gradePoint: '' }];
  state.semesters.push({ id, name, courses });
  renderSemesters();
  window._shohoj_recalc();
}

export function addRunningSemester() {
  if (state.semesters.some(s => s.running)) return;
  const nextName = generateNextSemesterName();
  state.semesters.push({
    id: Date.now(),
    name: nextName + ' (Running)',
    running: true,
    courses: [{ name:'', credits:0, grade:'', gradePoint:'' }]
  });
  renderSemesters();
  window._shohoj_recalc();
}

function generateNextSemesterName() {
  const SEASONS = ['Spring','Summer','Fall'];
  if (!state.semesters.length) return 'Current Semester';
  const last = [...state.semesters].reverse().find(s => !s.running);
  if (!last || !last.name) return 'Current Semester';
  const match = last.name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
  if (!match) return 'Current Semester';
  let season = match[1], year = parseInt(match[2]);
  const idx = SEASONS.indexOf(season);
  if (idx === 2) { season = 'Spring'; year++; }
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
  if (sem) { sem.courses.push({ name: '', credits: 0, grade: '' }); }
  renderSemesters();
  window._shohoj_recalc();
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
      !confirm('This will replace your current data. Continue?')) return;
  state.semesters = [];
  state.semesterCounter = 0;
  const sample = [
    { name: 'Fall 2024', courses: [
      { name: 'Programming Language I (CSE110)',   credits: 3, grade: 'B+', gradePoint: 3.3 },
      { name: 'Fundamentals of English (ENG101)',  credits: 3, grade: 'A-', gradePoint: 3.7 },
      { name: 'Remedial Mathematics (MAT092)',     credits: 0, grade: 'P',  gradePoint: 'P' },
      { name: 'Principles of Physics I (PHY111)', credits: 3, grade: 'B',  gradePoint: 3.0 },
    ]},
    { name: 'Spring 2025', courses: [
      { name: 'Programming Language II (CSE111)',  credits: 3, grade: 'B-', gradePoint: 2.7 },
      { name: 'Discrete Mathematics (CSE230)',     credits: 3, grade: 'B+', gradePoint: 3.3 },
      { name: 'Differential Calculus (MAT110)',    credits: 3, grade: 'A',  gradePoint: 4.0 },
      { name: 'Principles of Physics II (PHY112)', credits: 3, grade: 'B',  gradePoint: 3.0 },
    ]},
  ];
  sample.forEach(s => {
    const id = state.semesterCounter++;
    state.semesters.push({ id, name: s.name, courses: s.courses });
  });
  renderSemesters();
  window._shohoj_recalc();
  saveState();
}

export function onDeptSelect() {
  const sel = document.getElementById('deptSelect');
  state.currentDept = sel.value;
  if (!state.currentDept) return;
  window._shohoj_updateSetupWizard();
  const dept = DEPARTMENTS[state.currentDept];
  const creditsEl = document.getElementById('deptCredits');
  if (creditsEl) creditsEl.style.display = 'inline-flex';
  document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
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
  const startSeason = getStartSeason();
  const startYear   = parseInt(getStartYear());
  const last        = getLastCompletedSemester();

  const startIdx = SEASON_ORDER.indexOf(startSeason) + startYear * 3;
  const lastIdx  = SEASON_ORDER.indexOf(last.season)  + last.year  * 3;
  const semCount = startIdx > lastIdx ? 0 : countSemesters(startSeason, startYear, last.season, last.year);

  const semNames = generateSemesterNames(startSeason, startYear, semCount);
  if (state._restoredFromStorage) {
    state._restoredFromStorage = false;
    renderSemesters();
    window._shohoj_recalc();
    return;
  }

  state.semesters = [];
  state.semesterCounter = 0;
  clearState();

  for (let idx = 0; idx < semCount; idx++) {
    const id = state.semesterCounter++;
    const preset = dept.presets[idx];
    const courses = preset
      ? preset.courses.map(c => ({ name: '', credits: 0, grade: '', gradePoint: '' }))
      : [{ name: '', credits: 0, grade: '', gradePoint: '' }];
    state.semesters.push({ id, name: semNames[idx], courses });
  }

  renderSemesters();
  window._shohoj_recalc();
}
 