// ── IMPORTS ──────────────────────────────────────────────────────────────────
import { GRADES, detectGrade } from './core/grades.js';
import { DEPARTMENTS } from './core/departments.js';
import { state, saveState, clearState, STORAGE_KEY } from './core/state.js';
import {
  calcSemGPA, getRetakenKeys, autoDetectGrade,
  onPFChange, getSemCreditWarning
} from './core/calculator.js';
import {
  SEASON_ORDER, generateSemesterNames, getStartSeason, getStartYear
} from './core/helpers.js';
import { COURSE_DB, ALL_COURSES } from './core/catalog.js';

import {
  renderSemesters, addSemester, addRunningSemester,
  removeSemester, addCourse, removeCourse,
  loadSampleData, onDeptSelect, onStartSemConfirm
} from './ui/render.js';

import {
  onCourseBlur, onCourseInput, onCourseKey,
  closeSuggestions, pickSuggestion, initSuggestionsScrollHandler
} from './ui/suggestions.js';

import { drawTrendChart } from './ui/charts.js';

import {
  runSimulator, buildWhatIfSelect, onWhatIfChange,
  toggleWhatIf, updateSetupWizard, buildRetakeSuggestions, toggleRetake
} from './ui/simulator.js';

import {
  exportPDF, showImportModal, hideImportModal,
  importTranscriptPDF, applyImport
} from './ui/modals.js';

import { initReveal }     from './animations/reveal.js';
import { initCursor }     from './animations/cursor.js';
import { initDotMatrix }  from './animations/dotmatrix.js';

// ── INTERNAL HELPERS (used by modules via window._shohoj_*) ──────────────────
// Modules that need to trigger recalc or re-render call these.
// This avoids circular imports while keeping logic in one place.
window._shohoj_recalc         = recalc;
window._shohoj_renderAndRecalc = () => { renderSemesters(); recalc(); };
window._shohoj_updateSetupWizard = updateSetupWizard;

// ── window.* HANDLERS (called from inline HTML onclick/onchange) ──────────────
window.addSemester       = addSemester;
window.addRunningSemester= addRunningSemester;
window.removeSemester    = removeSemester;
window.addCourse         = addCourse;
window.removeCourse      = removeCourse;
window.loadSampleData    = loadSampleData;
window.onDeptSelect      = onDeptSelect;
window.onStartSemConfirm = onStartSemConfirm;
window.onCourseBlur      = onCourseBlur;
window.onCourseInput     = onCourseInput;
window.onCourseKey       = onCourseKey;
window.closeSuggestions  = closeSuggestions;
window.pickSuggestion    = pickSuggestion;
window.autoDetectGrade   = autoDetectGrade;
window.onPFChange        = onPFChange;
window.onWhatIfChange    = onWhatIfChange;
window.toggleWhatIf      = toggleWhatIf;
window.exportPDF         = exportPDF;
window.hideImportModal   = hideImportModal;
window.importTranscriptPDF = importTranscriptPDF;
window.applyImport       = applyImport;
window.clearState        = () => { clearState(); state.semesters = []; state.semesterCounter = 0; renderSemesters(); recalc(); };

window._toggleRetake = toggleRetake;

// ── THEME ─────────────────────────────────────────────────────────────────────
const html     = document.documentElement;
const themeBtn = document.getElementById('themeToggle');
const pill     = document.getElementById('togglePill');
let savedTheme = 'dark';
try {
  const _raw = localStorage.getItem('shohoj_theme');
  if (_raw === 'dark' || _raw === 'light') savedTheme = _raw;
} catch(e) {}
html.dataset.theme = savedTheme;
pill.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
themeBtn.addEventListener('click', () => {
  const isDark = html.dataset.theme === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  html.dataset.theme = newTheme;
  pill.textContent = isDark ? '☀️' : '🌙';
  try { localStorage.setItem('shohoj_theme', newTheme); } catch(e) {}
  setTimeout(recalc, 30);
});

// ── SCROLL PROGRESS ───────────────────────────────────────────────────────────
const progressBar = document.getElementById('scroll-progress');
const navEl = document.querySelector('nav');
function updateProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = (scrollTop / docHeight * 100) + '%';
  navEl.classList.toggle('scrolled', scrollTop > 40);
}
window.addEventListener('scroll', updateProgress, { passive: true });

// ── SMOOTH ANCHOR SCROLL ──────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ── ACTIVE NAV ON SCROLL ──────────────────────────────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
function updateNav() {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach(l => {
    l.classList.toggle('active', l.getAttribute('href') === '#' + current);
  });
}
window.addEventListener('scroll', updateNav, { passive: true });

// ── PARALLAX ORBS ─────────────────────────────────────────────────────────────
const orbs = document.querySelectorAll('.orb');
const speeds = [0.04, 0.07, 0.05];
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  orbs.forEach((orb, i) => {
    orb.style.translate = '0 ' + (y * speeds[i]) + 'px';
  });
}, { passive: true });

// ── STATE LOAD ────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.currentDept || !saved.semesters?.length) return false;

    const deptSel = document.getElementById('deptSelect');
    if (deptSel) { deptSel.value = saved.currentDept; }
    state.currentDept = saved.currentDept;

    const seasonSel = document.getElementById('startSeason');
    const yearSel   = document.getElementById('startYear');
    if (seasonSel && saved.startSeason) seasonSel.value = saved.startSeason;
    if (yearSel   && saved.startYear)   yearSel.value   = saved.startYear;

    state.semesters       = saved.semesters;
    state.semesterCounter = saved.semesterCounter || saved.semesters.length;

    const dept = DEPARTMENTS[state.currentDept];
    if (dept) {
      document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
      document.getElementById('deptCredits').style.display = '';
    }
    const startRow = document.getElementById('startSemRow');
    if (startRow) startRow.style.display = 'flex';

    state._restoredFromStorage = true;
    renderSemesters();
    recalc();
    return true;
  } catch(e) { return false; }
}

// ── RECALC — exact logic from script.js ──────────────────────────────────────
function recalc() {
  let totalPts = 0, totalAttempted = 0, totalEarned = 0, totalEarnedCGPA = 0;
  const retakenKeys = getRetakenKeys();
  const completedOnly = state.semesters.filter(s => !s.running);
  const retakenKeysCompleted = getRetakenKeys(completedOnly);
  for (const sem of state.semesters) {
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || !c.credits) return;
      if (c.grade === 'P' || c.grade === 'I') return;
      const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
      if (!sem.running) totalAttempted += c.credits;
      if (!isRetaken) {
        totalPts += gp * c.credits;
        if (gp !== null) totalEarnedCGPA += c.credits;
      }
      if (gp > 0 && !sem.running && !retakenKeysCompleted.has(`${sem.id}-${i}`)) totalEarned += c.credits;
    });
  }

  const cgpa = totalEarnedCGPA > 0 ? totalPts / totalEarnedCGPA : null;

  // What-if CGPA
  let whatIfPts = 0, whatIfCr = 0;
  if (state.whatIfMode && Object.keys(state.whatIfGrades).length > 0) {
    for (const sem of state.semesters) {
      sem.courses.forEach((c, i) => {
        const key = `${sem.id}-${i}`;
        const grade = state.whatIfGrades[key] || c.grade;
        const gp = GRADES[grade];
        if (gp === undefined || !c.credits || grade === 'P' || grade === 'I') return;
        if (retakenKeys.has(key)) return;
        if (gp !== null) { whatIfPts += gp * c.credits; whatIfCr += c.credits; }
      });
    }
  }
  const whatIfCgpa = whatIfCr > 0 ? whatIfPts / whatIfCr : null;

  // CGPA for completed semesters only
  let completedPts = 0, completedEarned = 0;
  state.semesters.filter(s => !s.running).forEach(sem => {
    sem.courses.forEach((c, i) => {
      const gp = GRADES[c.grade];
      if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
      if (retakenKeysCompleted.has(`${sem.id}-${i}`)) return;
      completedPts += gp * c.credits;
      if (gp !== null) completedEarned += c.credits;
    });
  });
  const cgpaCompleted = completedEarned > 0 ? completedPts / completedEarned : null;

  const cgpaEl = document.getElementById('cgpaVal');
  cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
  const hasRunning = state.semesters.some(s => s.running);
  document.querySelector('.cgpa-label').textContent = hasRunning ? 'Projected CGPA' : 'Current CGPA';

  // Incomplete warning
  const hasIncomplete = state.semesters.some(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade));
  let incWarn = document.getElementById('incompleteWarning');
  if (!incWarn) {
    incWarn = document.createElement('div');
    incWarn.id = 'incompleteWarning';
    incWarn.className = 'incomplete-warning';
    const meter = document.querySelector('.cgpa-meter');
    if (meter) meter.parentNode.insertBefore(incWarn, meter.nextSibling);
  }
  if (hasIncomplete) {
    const count = state.semesters.filter(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade)).length;
    incWarn.textContent = `⚠ ${count} semester${count > 1 ? 's have' : ' has'} missing grades — CGPA may be inaccurate`;
    incWarn.style.display = '';
  } else {
    incWarn.style.display = 'none';
  }

  // What-if preview
  let wiPreview = document.getElementById('whatIfPreview');
  if (!wiPreview) {
    wiPreview = document.createElement('div');
    wiPreview.id = 'whatIfPreview';
    wiPreview.className = 'whatif-cgpa-preview';
    const meterBox = document.querySelector('.cgpa-meter');
    if (meterBox) meterBox.insertAdjacentElement('afterend', wiPreview);
  }
  if (state.whatIfMode && whatIfCgpa !== null && cgpa !== null) {
    const delta = whatIfCgpa - cgpa;
    const sign  = delta >= 0 ? '+' : '';
    wiPreview.innerHTML = `
      <span class="whatif-cgpa-label">🔮 What-if CGPA</span>
      <span class="whatif-cgpa-val">${whatIfCgpa.toFixed(2)}</span>
      <span class="whatif-cgpa-delta">${sign}${delta.toFixed(2)}</span>
      <span style="font-size:11px;color:var(--text3);margin-left:4px">(vs current ${cgpa.toFixed(2)})</span>`;
    wiPreview.style.display = 'flex';
  } else {
    wiPreview.style.display = 'none';
  }

  cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
    cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
    cgpa >= 2.5 ? '#F0A500' : '#e74c3c';

  document.getElementById('totalAttempted').textContent = totalAttempted.toFixed(1);
  document.getElementById('totalEarned').textContent = totalEarned.toFixed(1);

  // Credits progress bar
  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const totalRequired = dept ? dept.totalCredits : 0;
  const creditsBox = document.getElementById('creditsProgressBox');
  if (dept && totalRequired > 0) {
    creditsBox.style.display = '';
    const creditsPct = Math.min((totalEarned / totalRequired) * 100, 100);
    document.getElementById('creditsFill').style.width = creditsPct.toFixed(1) + '%';
    document.getElementById('creditsPct').textContent = creditsPct.toFixed(1) + '%';
    document.getElementById('creditsEarnedLabel').textContent = totalEarned.toFixed(0) + ' credits completed';
    document.getElementById('creditsTotalLabel').textContent = 'of ' + totalRequired;
  } else {
    creditsBox.style.display = 'none';
  }

  // Academic standing
  const standingBox = document.getElementById('standingBox');
  const cgpaNum = cgpaCompleted;
  const semCount = state.semesters.filter(s => s.courses.some(c => c.grade && GRADES[c.grade] !== undefined && GRADES[c.grade] !== null && c.credits > 0)).length;

  if (cgpaNum !== null) {
    standingBox.style.display = '';
    const title  = document.getElementById('standingTitle');
    const desc   = document.getElementById('standingDesc');
    const badge  = document.getElementById('standingBadge');
    standingBox.classList.remove('standing-excellent','standing-good','standing-warning','standing-danger');

    let standing, cls, emoji, description;
    if (cgpaNum >= 3.97) {
      standing = 'Perfect Standing'; cls = 'standing-excellent'; emoji = '🏆';
      description = 'Exceptional academic performance. You are at the top of your class.';
    } else if (cgpaNum >= 3.65) {
      standing = 'Higher Distinction'; cls = 'standing-excellent'; emoji = '🌟';
      description = 'Outstanding performance. You qualify for graduation with Higher Distinction (CGPA ≥ 3.65).';
    } else if (cgpaNum >= 3.50) {
      standing = 'Distinction'; cls = 'standing-excellent'; emoji = '⭐';
      description = 'Excellent academic record. You qualify for graduation with Distinction (CGPA ≥ 3.50).';
    } else if (cgpaNum >= 3.00) {
      standing = 'Good Standing'; cls = 'standing-good'; emoji = '✅';
      description = 'You are in good academic standing. Keep it up!';
    } else if (cgpaNum >= 2.50) {
      standing = 'Satisfactory'; cls = 'standing-good'; emoji = '👍';
      description = 'Acceptable academic performance. There is room to improve.';
    } else if (cgpaNum >= 2.00) {
      standing = 'Needs Improvement'; cls = 'standing-warning'; emoji = '⚠️';
      description = 'Your CGPA is below 2.50. Consistent improvement is needed to stay in good standing.';
    } else {
      standing = 'Academic Probation'; cls = 'standing-danger'; emoji = '❌';
      description = 'CGPA below 2.00 — you are on academic probation as per BRACU policy (Summer 2022+). Seek academic counselling immediately.';
    }

    standingBox.classList.add(cls);
    title.textContent  = standing;
    desc.textContent   = description;
    badge.textContent  = emoji;
  } else {
    standingBox.style.display = 'none';
  }

  // Trend chart
  const trendBox = document.getElementById('trendChartBox');
  const trendCanvas = document.getElementById('trendCanvas');
  const semGPAs = [];
  state.semesters.forEach(sem => {
    if (sem.running) return;
    const gpa = calcSemGPA(sem);
    if (gpa !== null) {
      const label = sem.name
        ? sem.name.replace(/\s*\(.*\)$/, '').replace(/(\d{4})/, y => "'" + y.slice(2))
        : `S${sem.id + 1}`;
      semGPAs.push({ label, gpa });
    }
  });
  if (semGPAs.length >= 2) {
    trendBox.style.display = '';
    const gpas = semGPAs.map(d => d.gpa);
    const first = gpas[0];
    const last  = gpas[gpas.length - 1];
    const diff  = last - first;
    let trendLabel, trendColor;
    if (Math.abs(diff) < 0.1) {
      trendLabel = '→ Stable';    trendColor = 'var(--text3)';
    } else if (diff > 0) {
      trendLabel = '↑ Improving'; trendColor = '#2ECC71';
    } else {
      trendLabel = '↓ Declining'; trendColor = '#e74c3c';
    }
    const trendEl = document.getElementById('trendRange');
    trendEl.textContent = trendLabel;
    trendEl.style.color = trendColor;
    trendEl.style.fontWeight = '600';
    requestAnimationFrame(() => drawTrendChart(trendCanvas, semGPAs));
  } else {
    trendBox.style.display = 'none';
  }

  const pct = cgpaCompleted !== null ? Math.min((cgpaCompleted / 4) * 100, 100) : 0;
  document.getElementById('meterFill').style.width = pct + '%';
  document.getElementById('meterPct').textContent = cgpaCompleted !== null ? pct.toFixed(1) + '%' : '0%';

  const statusEl = document.getElementById('meterStatus');
  if (cgpa === null) {
    statusEl.innerHTML = 'Add your courses to get started.';
  } else if (cgpaCompleted >= 3.75) {
    statusEl.innerHTML = `<strong>Outstanding!</strong> CGPA ${cgpaCompleted.toFixed(2)} — Dean's List territory. Keep it up.`;
  } else if (cgpaCompleted >= 3.5) {
    statusEl.innerHTML = `<strong>Excellent.</strong> CGPA ${cgpaCompleted.toFixed(2)} — You're on track for a strong degree.`;
  } else if (cgpaCompleted >= 3.0) {
    statusEl.innerHTML = `<strong>Good standing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Push for 3.5 and you'll stand out.`;
  } else if (cgpaCompleted >= 2.5) {
    statusEl.innerHTML = `<strong>Keep pushing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Consider retaking weak courses for a boost.`;
  } else {
    statusEl.innerHTML = `<strong>Recovery mode.</strong> CGPA ${cgpa.toFixed(2)} — Focus on retakes and consistent grades from here.`;
  }

  runSimulator(cgpa, totalEarnedCGPA, totalPts);
  saveState();
  updateSetupWizard();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire buttons
  document.getElementById('targetCgpa').addEventListener('input', recalc);
  document.getElementById('creditsRemaining').addEventListener('input', recalc);
  document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());
  document.getElementById('addRunningSemBtn').addEventListener('click', () => addRunningSemester());

  // Init suggestions scroll dismissal
  initSuggestionsScrollHandler();

  // Initial render
  document.getElementById('deptCreditsText').textContent = '';
  document.getElementById('deptCredits').style.display = 'none';

  // Load saved state or render blank
  if (!loadState()) {
    renderSemesters();
    recalc();
  }

  // Animations
  initReveal();
  initCursor();
  initDotMatrix(document.getElementById('themeToggle'));
});
