// ── IMPORTS ──────────────────────────────────────────────────────────────────
import { GRADES, detectGrade } from './core/grades.js';
import { DEPARTMENTS } from './core/departments.js';
import { state, saveState, clearState, STORAGE_KEY } from './core/state.js';
import {
  calcSemGPA, getRetakenKeys, autoDetectGrade,
  onPFChange, getSemCreditWarning, onGradePointBlur
} from './core/calculator.js';
import {
  generateSemesterNames, getStartSeason, getStartYear,
  sanitizeRestoredState
} from './core/helpers.js';
import { COURSE_DB, ALL_COURSES } from './core/catalog.js';

import {
  renderSemesters, addSemester, addRunningSemester,
  removeSemester, addCourse, removeCourse,
  loadSampleData, onDeptSelect, onStartSemConfirm,
  showSummaryForm, hideSummaryForm, confirmSummaryForm
} from './ui/render.js';

import {
  onCourseBlur, onCourseInput, onCourseKey,
  closeSuggestions, pickSuggestion, initSuggestionsScrollHandler
} from './ui/suggestions.js';

import { drawTrendChart } from './ui/charts.js';

import { renderDegreeTracker } from './ui/tracker.js';

import {
  runSimulator, updateSetupWizard, buildRetakeSuggestions, toggleRetake
} from './ui/simulator.js';

import {
  exportPDF, showImportModal, hideImportModal,
  importTranscriptPDF, applyImport
} from './ui/modals.js';

import {
  renderPlayground, switchPlaygroundTab, resetPlayground,
  onPlaygroundGradeChange, removePlaygroundChange, clearPlaygroundChanges,
  addPlaygroundChange, onSolverTargetChange, onSolverCourseChange
} from './ui/playground.js';

import {
  renderPlanner, addToPlan, removeFromPlan, clearPlan,
  viewPrereqTree, resetPlanner, onPlannerSearch, onPlannerFilter,
  onPlannerImpactGrade, getPlanCourses, setPlanCourses,
  promoteToRunning
} from './ui/planner.js';

import { initReveal }     from './animations/reveal.js';
import { initCursor }     from './animations/cursor.js';
import { initDotMatrix }  from './animations/dotmatrix.js';

// ── INTERNAL HELPERS (used by modules via window._shohoj_*) ──────────────────
function fmtCr(n) { return n % 1 === 0 ? String(n) : n.toFixed(1); }

window._shohoj_recalc         = recalc;
window._shohoj_renderAndRecalc = () => { renderSemesters(); recalc(); };
window._shohoj_updateSetupWizard = updateSetupWizard;
window._shohoj_getPlanCourses = getPlanCourses;

const LOCAL_CLEAR_KEYS = [
  STORAGE_KEY,
  'shohoj_theme',
  'shohoj_last_sync',
  'shohoj_session_start',
];

const SESSION_CLEAR_KEYS = [
  'shohoj_active_tab',
  'shohoj_cloud_applied',
  'shohoj_skip_first_save',
];

function clearShohojBrowserState() {
  LOCAL_CLEAR_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch (e) {}
  });
  SESSION_CLEAR_KEYS.forEach(key => {
    try { sessionStorage.removeItem(key); } catch (e) {}
  });
}

// ── window.* HANDLERS (called from inline HTML onclick/onchange) ──────────────
window.addSemester       = addSemester;
window.addRunningSemester= addRunningSemester;
window.removeSemester    = removeSemester;
window.renderSemesters   = renderSemesters;
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
window.onGradePointBlur  = onGradePointBlur;
window.exportPDF         = exportPDF;
window.hideImportModal   = hideImportModal;
window.importTranscriptPDF = importTranscriptPDF;
window.applyImport       = applyImport;
// NOTE: do not name this window.clearState — the bundled build strips ES
// imports, so `clearState` becomes a global, and `window.clearState = …`
// would overwrite it, causing bare `clearState()` calls in other modules
// (modals.js:applyImport, render.js, and the arrow below) to recurse into
// themselves and throw RangeError: Maximum call stack size exceeded.
window._shohoj_resetAppState = () => {
  clearState();
  state.semesters = [];
  state.semesterCounter = 0;
  state.currentDept = '';
  state._restoredFromStorage = false;

  const deptSel = document.getElementById('deptSelect');
  if (deptSel) deptSel.value = '';
  const seasonSel = document.getElementById('startSeason');
  if (seasonSel) seasonSel.value = '';
  const yearSel = document.getElementById('startYear');
  if (yearSel) yearSel.value = '';
  const startRow = document.getElementById('startSemRow');
  if (startRow) startRow.style.display = 'none';
  const creditsText = document.getElementById('deptCreditsText');
  if (creditsText) creditsText.textContent = '';
  const creditsBadge = document.getElementById('deptCredits');
  if (creditsBadge) creditsBadge.style.display = 'none';

  resetPlayground();
  resetPlanner();
  renderSemesters();
  recalc();
};

window._toggleRetake = toggleRetake;

window.handleClearData = async function() {
  const confirmFn = typeof window._shohoj_confirmModal === 'function'
    ? window._shohoj_confirmModal
    : ({ body }) => Promise.resolve(window.confirm(body));

  const confirmed = await confirmFn({
    icon: '🗑️',
    title: 'Clear all data?',
    body: 'This will permanently delete all your saved semesters, grades, and settings on this device. This cannot be undone.',
    confirmLabel: 'Clear everything',
    confirmDanger: true,
  });
  if (!confirmed) return;

  const savedHook = window._shohoj_onSave;
  window._shohoj_onSave = null;

  let cloudDeleted = true;
  try {
    if (typeof window._shohoj_deleteCloudData === 'function') {
      cloudDeleted = await window._shohoj_deleteCloudData();
    }

    clearShohojBrowserState();
    window._shohoj_resetAppState();
    switchCalcTab('calculator');
    html.dataset.theme = 'dark';
    if (pill) pill.textContent = '🌙';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    window._shohoj_onSave = savedHook;
  }

  if (cloudDeleted === false) {
    const warn = 'Local data was cleared, but the cloud copy could not be deleted. It may come back after a refresh.';
    if (typeof window._shohoj_showToast === 'function') window._shohoj_showToast(warn, true);
    else window.alert(warn);
    return;
  }

  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast('All Shohoj data cleared.');
  }
};

// Playground
window.switchPlaygroundTab    = switchPlaygroundTab;
window.onPlaygroundGradeChange = onPlaygroundGradeChange;
window.removePlaygroundChange = removePlaygroundChange;
window.clearPlaygroundChanges = clearPlaygroundChanges;
window.addPlaygroundChange    = addPlaygroundChange;
window.onSolverTargetChange   = onSolverTargetChange;
window.onSolverCourseChange   = onSolverCourseChange;

// Planner
window.addToPlan         = addToPlan;
window.removeFromPlan    = removeFromPlan;
window.clearPlan         = clearPlan;
window.viewPrereqTree    = viewPrereqTree;
window.onPlannerSearch   = onPlannerSearch;
window.onPlannerFilter   = onPlannerFilter;
window.onPlannerImpactGrade = onPlannerImpactGrade;
window.promoteToRunning  = promoteToRunning;

// Summary block
window._shohoj_showSummaryForm    = showSummaryForm;
window._shohoj_hideSummaryForm    = hideSummaryForm;
window._shohoj_confirmSummaryForm = confirmSummaryForm;
window._shohoj_editSummary        = (id) => showSummaryForm(id);

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
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  navEl.classList.toggle('scrolled', scrollTop > 40);
}
window.addEventListener('scroll', updateProgress, { passive: true });

// ── SMOOTH ANCHOR SCROLL ──────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    // If linking to #calculator, ensure calculator tab is active
    if (href === '#calculator') switchCalcTab('calculator');
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
    const saved = sanitizeRestoredState(JSON.parse(raw));
    if (!saved || !saved.semesters?.length) return false;
    // allow restoring even without dept if there's a summary block
    if (!saved.currentDept && !saved.semesters.some(s => s.summary)) return false;

    const deptSel = document.getElementById('deptSelect');
    if (deptSel && saved.currentDept) { deptSel.value = saved.currentDept; }
    state.currentDept = saved.currentDept || '';

    const seasonSel = document.getElementById('startSeason');
    const yearSel   = document.getElementById('startYear');
    if (seasonSel && saved.startSeason) seasonSel.value = saved.startSeason;
    if (yearSel   && saved.startYear)   yearSel.value   = saved.startYear;

    state.semesters       = saved.semesters;
    state.semesterCounter = saved.semesterCounter || saved.semesters.length;
    setPlanCourses(saved.planCourses);

    const dept = DEPARTMENTS[state.currentDept];
    if (dept) {
      document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
      document.getElementById('deptCredits').style.display = '';
      if (seasonSel) {
        const deptSeasons = dept.seasons || ['Spring', 'Summer', 'Fall'];
        const currentVal = seasonSel.value;
        seasonSel.innerHTML = '<option value="" disabled selected>— Season —</option>'
          + deptSeasons.map(s => `<option value="${s}">${s}</option>`).join('');
        if (deptSeasons.includes(currentVal)) seasonSel.value = currentVal;
      }
    }
    const startRow = document.getElementById('startSemRow');
    if (startRow) startRow.style.display = 'flex';

    state._restoredFromStorage = true;
    renderSemesters();
    recalc();
    return true;
  } catch(e) { return false; }
}

window._shohoj_applyState = function(saved) {
  try {
    const clean = sanitizeRestoredState(saved);
    if (!clean || !clean.semesters) return;
 
    const deptSel = document.getElementById('deptSelect');
    if (deptSel && clean.currentDept) deptSel.value = clean.currentDept;
    state.currentDept = clean.currentDept || '';
 
    const seasonSel = document.getElementById('startSeason');
    const yearSel   = document.getElementById('startYear');
    if (seasonSel && clean.startSeason) seasonSel.value = clean.startSeason;
    if (yearSel   && clean.startYear)   yearSel.value   = clean.startYear;
 
    state.semesters       = clean.semesters;
    state.semesterCounter = clean.semesterCounter || clean.semesters.length;
    setPlanCourses(clean.planCourses);
    state._restoredFromStorage = true;
 
    const dept = DEPARTMENTS[state.currentDept];
    if (dept) {
      const credTxt   = document.getElementById('deptCreditsText');
      const credBadge = document.getElementById('deptCredits');
      if (credTxt)   credTxt.textContent    = dept.totalCredits + ' Total Credits';
      if (credBadge) credBadge.style.display = 'inline-flex';
      if (seasonSel) {
        const deptSeasons = dept.seasons || ['Spring', 'Summer', 'Fall'];
        const currentVal  = seasonSel.value;
        seasonSel.innerHTML = '<option value="" disabled selected>— Season —</option>'
          + deptSeasons.map(s => `<option value="${s}">${s}</option>`).join('');
        if (deptSeasons.includes(currentVal)) seasonSel.value = currentVal;
      }
    }
 
    const startRow = document.getElementById('startSemRow');
    if (startRow) startRow.style.display = 'flex';
 
    renderSemesters();
    recalc();
  } catch(e) {
    console.error('[Shohoj] _shohoj_applyState failed — falling back to reload:', e);
    window.location.reload();
  }
};

// ── TAB SYSTEM ────────────────────────────────────────────────────────────────
// Three tabs: calculator (default), planner, playground
// State persists in sessionStorage so refreshing keeps your tab.

const TAB_MAP = {
  calculator: 'tabCalculator',
  planner:    'tabPlanner',
  playground: 'tabPlayground',
};

let _activeCalcTab = 'calculator';

function switchCalcTab(tabId) {
  if (!TAB_MAP[tabId]) return;
  _activeCalcTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.calc-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update panels
  Object.entries(TAB_MAP).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.toggle('active', key === tabId);
  });

  // Persist tab choice
  try { sessionStorage.setItem('shohoj_active_tab', tabId); } catch(e) {}

  // Update URL hash for direct linking
  if (history.replaceState) {
    const hash = tabId === 'calculator' ? '#calculator' : `#calculator/${tabId}`;
    history.replaceState(null, '', hash);
  }

  // Trigger re-render for active tab content
  if (tabId === 'playground') {
    renderPlayground(true);
  }
  if (tabId === 'planner') {
    renderPlanner();
  }
  if (tabId === 'calculator') {
    // Re-draw trend chart since canvas may have been hidden
    setTimeout(() => {
      const trendCanvas = document.getElementById('trendCanvas');
      const trendBox = document.getElementById('trendChartBox');
      if (trendBox && trendBox.style.display !== 'none' && trendCanvas) {
        recalc();
      }
    }, 50);
  }
}

// Restore tab from session or URL hash on load
function restoreCalcTab() {
  // Check URL hash first
  const hash = window.location.hash;
  if (hash === '#calculator/planner')    return 'planner';
  if (hash === '#calculator/playground') return 'playground';

  // Then check sessionStorage
  try {
    const saved = sessionStorage.getItem('shohoj_active_tab');
    if (saved && TAB_MAP[saved]) return saved;
  } catch(e) {}

  return 'calculator';
}

window.switchCalcTab = switchCalcTab;

// ── RECALC ───────────────────────────────────────────────────────────────────
function recalc() {
  let totalPts = 0, totalAttempted = 0, totalEarned = 0, totalEarnedCGPA = 0;

  // ── Inject summary block contribution first ────────────────────────────────
  const summaryBlock = state.semesters.find(s => s.summary);
  if (summaryBlock) {
    const sp = summaryBlock.summaryCGPA * summaryBlock.summaryCredits;
    totalPts        += sp;
    totalEarnedCGPA += summaryBlock.summaryCredits;
    totalAttempted  += summaryBlock.summaryAttempted || summaryBlock.summaryCredits;
    totalEarned     += summaryBlock.summaryCredits;
  }

  const retakenKeys = getRetakenKeys();
  const completedOnly = state.semesters.filter(s => !s.running && !s.summary);
  const retakenKeysCompleted = getRetakenKeys(completedOnly);
  for (const sem of state.semesters) {
    if (sem.summary) continue;   // already handled above
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

  let completedPts = 0, completedEarned = 0;

  // inject summary into completed totals
  if (summaryBlock) {
    completedPts    += summaryBlock.summaryCGPA * summaryBlock.summaryCredits;
    completedEarned += summaryBlock.summaryCredits;
  }

  state.semesters.filter(s => !s.running && !s.summary).forEach(sem => {
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

  const hasIncomplete = state.semesters.some(s => !s.running && !s.summary && s.courses.some(c => c.name.trim() && !c.grade));
  let incWarn = document.getElementById('incompleteWarning');
  if (!incWarn) {
    incWarn = document.createElement('div');
    incWarn.id = 'incompleteWarning';
    incWarn.className = 'incomplete-warning';
    const meter = document.querySelector('.cgpa-meter');
    if (meter) meter.parentNode.insertBefore(incWarn, meter.nextSibling);
  }
  if (hasIncomplete) {
    const count = state.semesters.filter(s => !s.running && !s.summary && s.courses.some(c => c.name.trim() && !c.grade)).length;
    incWarn.textContent = `⚠ ${count} semester${count > 1 ? 's have' : ' has'} missing grades — CGPA may be inaccurate`;
    incWarn.style.display = '';
  } else {
    incWarn.style.display = 'none';
  }

  cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
    cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
    cgpa >= 2.5 ? '#F0A500' : '#e74c3c';

  document.getElementById('totalAttempted').textContent = fmtCr(totalAttempted);
  document.getElementById('totalEarned').textContent = fmtCr(totalEarned);

  const dept = state.currentDept ? DEPARTMENTS[state.currentDept] : null;
  const totalRequired = dept ? dept.totalCredits : 0;

  const crRemEl = document.getElementById('creditsRemaining');
  if (dept && totalRequired > 0 && document.activeElement !== crRemEl) {
    const autoRemaining = Math.max(0, totalRequired - totalEarned);
    const autoVal = fmtCr(autoRemaining);
    if (!crRemEl.value || crRemEl.dataset.auto === crRemEl.value) {
      crRemEl.value = autoVal;
    }
    crRemEl.dataset.auto = autoVal;
  }

  renderDegreeTracker(totalEarned);

  const standingBox = document.getElementById('standingBox');
  const cgpaNum = cgpaCompleted;
  const semCount = state.semesters.filter(s => !s.summary && s.courses.some(c => c.grade && GRADES[c.grade] !== undefined && GRADES[c.grade] !== null && c.credits > 0)).length;

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

  const trendBox = document.getElementById('trendChartBox');
  const trendCanvas = document.getElementById('trendCanvas');
  const semGPAs = [];
  state.semesters.forEach(sem => {
    if (sem.running || sem.summary) return;
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
  } else if (cgpaCompleted === null) {
    if (hasRunning) {
      statusEl.innerHTML = `<strong>Projected only.</strong> CGPA ${cgpa.toFixed(2)} is based on running courses. Add completed semesters to assess your standing.`;
    } else {
      statusEl.innerHTML = 'Add completed graded courses to see your academic standing.';
    }
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
  renderPlayground();
  saveState();
  updateSetupWizard();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('targetCgpa').addEventListener('input', recalc);
  document.getElementById('creditsRemaining').addEventListener('input', recalc);
  document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());
  document.getElementById('addRunningSemBtn').addEventListener('click', () => addRunningSemester());

  initSuggestionsScrollHandler();

  document.getElementById('deptCreditsText').textContent = '';
  document.getElementById('deptCredits').style.display = 'none';

  if (!loadState()) {
    renderSemesters();
    recalc();
  }

  // Restore active tab from session/URL hash
  const savedTab = restoreCalcTab();
  if (savedTab !== 'calculator') switchCalcTab(savedTab);

  initReveal();
  initCursor();
  initDotMatrix(document.getElementById('themeToggle'));
});
