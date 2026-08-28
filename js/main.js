// ── IMPORTS ──────────────────────────────────────────────────────────────────
import { GRADES, detectGrade } from './core/grades.js';
import { DEPARTMENTS } from './core/departments.js';
import { state, saveState, clearState, STORAGE_KEY } from './core/state.js';
import {
  clearAllShohojData,
  clearPersonalData,
  clearStaleSignedOutData,
  describeStoredPersonalData,
} from './core/personalData.js';
import { registerAction } from './core/dispatch.js'; // also installs the delegated listeners
import {
  calcSemGPA, autoDetectGrade,
  onPFChange, getSemCreditWarning, onGradePointBlur
} from './core/calculator.js';
import { calculateCgpaTotals } from './core/gpa-core.js';
import { MILESTONE_TIERS, standingTierFor } from './core/milestones.js';

// Thresholds and labels come from js/core/milestones.js so the standing box and
// the simulator's goal ladder cannot drift apart (#502). Only the presentation
// — emoji, colour class, copy — lives here. Static config, so module scope.
const STANDING_PRESENTATION = {
  'perfect': { cls: 'standing-excellent', emoji: '🏆',
    description: 'Exceptional academic performance. You are at the top of your class.' },
  'higher-distinction': { cls: 'standing-excellent', emoji: '🌟',
    description: 'Outstanding performance. You qualify for graduation with Higher Distinction (CGPA ≥ 3.65).' },
  'distinction': { cls: 'standing-excellent', emoji: '⭐',
    description: 'Excellent academic record. You qualify for graduation with Distinction (CGPA ≥ 3.50).' },
  'good': { cls: 'standing-good', emoji: '✅',
    description: 'You are in good academic standing. Keep it up!' },
  'satisfactory': { cls: 'standing-good', emoji: '👍',
    description: 'Acceptable academic performance. There is room to improve.' },
  'needs-improvement': { cls: 'standing-warning', emoji: '⚠️',
    description: 'Your CGPA is below 2.50. Consistent improvement is needed to stay in good standing.' },
  'probation': { cls: 'standing-danger', emoji: '❌',
    description: 'CGPA below 2.00 — you are on academic probation as per BRACU policy (Summer 2022+). Seek academic counselling immediately.' },
};
import {
  generateSemesterNames, getStartSeason, getStartYear,
  sanitizeRestoredState
} from './core/helpers.js';
import { COURSE_DB, ALL_COURSES } from './core/catalog.js';

import {
  renderSemesters, addSemester, addRunningSemester,
  removeSemester, addCourse, removeCourse,
  loadSampleData, onDeptSelect, onStartSemConfirm,
  showSummaryForm, hideSummaryForm,
  openRateForCourse
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

import { openCourseReviewsPanel, openReviewsDirectory } from './ui/reviews.js';
import { renderReviewsTab } from './ui/reviewsTab.js';
import { renderDifficultyMapTab } from './ui/difficultyMap.js';
import { renderPapersTab } from './ui/papersTab.js';
import { renderRoutineTab } from './ui/routineTab.js';
import { renderSeatsTab } from './ui/seatsTab.js';
import { renderFreeRoomsTab } from './ui/freeRoomsTab.js';
import { renderGroupsTab } from './ui/groupsTab.js';
import { openFeedbackModal, closeFeedbackModal } from './ui/feedback.js';
import { initAssistantFab } from './ui/assistantFab.js';
import { initSignInPortal, unlockForDemo } from './ui/signinPortal.js';

import { initReveal }     from './animations/reveal.js';
import { initCursor }     from './animations/cursor.js';
import { initDotMatrix }  from './animations/dotmatrix.js';

// ── INTERNAL HELPERS (used by modules via window._shohoj_*) ──────────────────
function fmtCr(n) { return n % 1 === 0 ? String(n) : n.toFixed(1); }

window._shohoj_recalc         = recalc;
window._shohoj_renderAndRecalc = () => { renderSemesters(); recalc(); };
window._shohoj_updateSetupWizard = updateSetupWizard;
window._shohoj_getPlanCourses = getPlanCourses;
// Bridge for the React CGPA island (Vite build): hands the shared state +
// start-semester inputs to the typed core so React can compute the same totals.
window._shohoj_getCgpaInputs = () => ({
  semesters: state.semesters,
  startSeason: getStartSeason(),
  startYear: getStartYear(),
});

// Typed write path for the React calculator island (Phase 5B): the island
// replaces state.semesters then this recomputes + persists exactly like the
// legacy mutators. recalc() broadcasts shohoj:recalc, which the island's bridge
// listens to; renderSemesters() early-returns once the island owns the
// container. Catalog membership is exposed so the island can gate rate-ability
// without bundling the catalog data (which stays in JS).
window._shohoj_setSemesters = function(semesters) {
  if (!Array.isArray(semesters)) return;
  state.semesters = semesters;
  renderSemesters();
  recalc();
  saveState();
};
// js/auth/firebase.js is a separate module bundle and cannot import this;
// it calls through here when it writes something that belongs in the
// cloud snapshot (a review receipt) without touching calculator state.
window._shohoj_saveState = saveState;
window._shohoj_isKnownCourse = (code) => !!COURSE_DB[code];
// The catalog list (code/name/full/credits) for the island's autocomplete. The
// data stays in JS; the island reads it through this bridge and matches with the
// typed searchCourses helper.
window._shohoj_courseCatalog = ALL_COURSES;

// ── "Saved on this device" notice ────────────────────────────────────────────
// Sign-out clears the device, but that never helped the student who NEVER
// signed in — and on a shared lab machine their semesters, routine and
// watchlist are just as present. They had no way to know anything was stored
// (nothing said so) and no practical way to remove it: Clear Data sits at the
// foot of the calculator, which someone on Routine Builder or Seat Status never
// scrolls to. Invisible storage is the defect; a student cannot act on what
// they cannot see (#627).
//
// So this names the contents and puts the wipe beside the sign-in, under the
// tab bar where it is present on whichever tab they are on. It lives here
// rather than in js/auth/firebase.js because it is about the device, not the
// session — and because firebase.js is a separate module that never loads at
// all on a build without Firebase, where the disclosure still applies.
const DEVICE_NOTICE_RELOAD_MS = 900;

function deviceNoticeEl() {
  return document.getElementById('authNudgeBanner');
}

function renderDeviceNotice(signedIn) {
  const existing = deviceNoticeEl();
  const stored = signedIn ? [] : describeStoredPersonalData();

  if (stored.length === 0) {
    if (existing) existing.style.display = 'none';
    return;
  }
  if (existing) {
    existing.style.display = '';
    existing.querySelector('#deviceNoticeSummary').textContent = stored.join(' · ');
    return;
  }

  const canSignIn = typeof window._shohoj_signIn === 'function';
  const notice = document.createElement('div');
  notice.id = 'authNudgeBanner';
  notice.dataset.testid = 'device-notice';
  notice.style.cssText = `
    margin: 1.2rem 2rem 1.2rem;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(86,180,233,0.07);
    border: 1px solid rgba(86,180,233,0.25);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 13px;
    color: var(--text2);
  `;
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  notice.innerHTML = `
    <span>📱 Saved on this device: <strong id="deviceNoticeSummary"></strong><br>
      ${canSignIn
        ? 'Sign in with your BRACU G-Suite account to back it up and reach it from any device.'
        : 'It stays in this browser until you remove it.'}</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;">
      <button data-action="device:forget" data-testid="device-notice-forget" style="
        padding:8px 16px;border-radius:8px;
        background:rgba(231,76,60,0.10);
        border:1px solid rgba(231,76,60,0.30);
        color:#e74c3c;font-family:'DM Sans',sans-serif;
        font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;
      ">Remove from this device</button>
      ${canSignIn ? `<button data-action="auth:signin" class="gauth-reauth-btn" style="
        display:inline-flex;align-items:center;gap:8px;
        padding:8px 16px;border-radius:8px;
        background:rgba(255,255,255,0.07);
        border:1px solid rgba(255,255,255,0.14);
        color:#e8f0ea;font-family:'DM Sans',sans-serif;
        font-size:13px;font-weight:600;cursor:pointer;
        white-space:nowrap;flex-shrink:0;
      ">Sign in with Google</button>` : ''}
    </span>
  `;
  // Set as text, never interpolated: the summary is built from our own labels
  // and integers, and keeping it out of the innerHTML string keeps it that way.
  notice.querySelector('#deviceNoticeSummary').textContent = stored.join(' · ');

  const tabs = document.getElementById('calcTabs');
  if (tabs?.parentNode) tabs.parentNode.insertBefore(notice, tabs.nextSibling);
}

// The signed-out counterpart of the sign-out wipe: same key list, same ordering.
// The difference is that this student has no account holding a copy, so the
// dialog says so rather than promising anything comes back.
async function forgetThisDevice() {
  const stored = describeStoredPersonalData();
  if (stored.length === 0) return;

  const confirmFn = typeof window._shohoj_confirmModal === 'function'
    ? window._shohoj_confirmModal
    : ({ body }) => Promise.resolve(window.confirm(body));

  const confirmed = await confirmFn({
    icon:  '🗑️',
    title: 'Remove your data from this device?',
    body:
      `This removes ${stored.join(', ')} from this browser. You are not signed in, `
      + 'so there is no backup to restore it from — this cannot be undone.',
    confirmLabel:  'Remove everything',
    confirmDanger: true,
  });
  if (!confirmed) return;

  // Empty the in-memory copy before the wipe, or a render on the way out writes
  // the snapshot straight back — the ordering the sign-out path needs too.
  window._shohoj_onSave = null;
  window._shohoj_resetAppState();
  clearPersonalData();

  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast('Removed from this device');
  }
  // Reload for the reason sign-out does: routine, seats, reviews and the profile
  // each hold their own copy in memory, and one missed is the leak.
  setTimeout(() => window.location.reload(), DEVICE_NOTICE_RELOAD_MS);
}

registerAction('device:forget', () => { void forgetThisDevice(); });

// firebase.js announces both states through this event. Before it resolves —
// or on a build where it never loads — a session marker stands in, so a signed
// -in student does not get a flash of the notice on every page load.
window.addEventListener('shohoj:auth-changed', (event) => {
  renderDeviceNotice(!!event.detail?.signedIn);
});

document.addEventListener('DOMContentLoaded', () => {
  let looksSignedIn = false;
  try { looksSignedIn = localStorage.getItem('shohoj_session_start') !== null; } catch (e) {}
  renderDeviceNotice(looksSignedIn);
});

// ── window.* HANDLERS (called from inline HTML onclick/onchange) ──────────────
window.addSemester       = addSemester;
window.addRunningSemester= addRunningSemester;
window.removeSemester    = removeSemester;
window.renderSemesters   = renderSemesters;
window.addCourse         = addCourse;
window.removeCourse      = removeCourse;
window.loadSampleData    = loadSampleData;
window.loadDemoMode      = startDemoMode;
window._shohoj_loadDemoMode = startDemoMode;
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
window.openRateForCourse = openRateForCourse;
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

    // Reset the app FIRST, then wipe. Resetting re-renders, which fires
    // saveState(), and switchCalcTab records the tab — both write storage, so
    // wiping first left an empty snapshot and a fresh shohoj_active_tab behind
    // on a button that promises to delete everything (#627).
    window._shohoj_resetAppState();
    switchCalcTab('calculator');
    html.dataset.theme = 'dark';
    if (pill) pill.textContent = '🌙';
    clearAllShohojData();
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

// Reviews
window.openCourseReviews   = (code, name) => openCourseReviewsPanel(code, name || '');
window.openReviewsDirectory = openReviewsDirectory;

// Summary block
window._shohoj_showSummaryForm    = showSummaryForm;
window._shohoj_hideSummaryForm    = hideSummaryForm;
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
    if (!href || href === '#') return;
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
// Before anything is read back, clear a device the pre-#627 sign-out abandoned.
//
// This runs here, at boot, rather than off the auth callback, for two reasons.
// It has to happen BEFORE the app loads state into memory, or the wipe races a
// re-render that writes the whole snapshot straight back — which is exactly what
// it did from the auth callback. And it does not need auth at all: a signed-in
// device always carries `shohoj_session_start`, so the predicate is already
// false for them without waiting on Firebase. See js/core/personalData.js for
// the full matrix, and tests/staleSignedOutData.test.js for the argument that it
// cannot touch a student who never signed in.
clearStaleSignedOutData();

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
  reviews:    'tabReviews',
  difficulty: 'tabDifficulty',
  papers:     'tabPapers',
  routine:    'tabRoutine',
  seats:      'tabSeats',
  freerooms:  'tabFreeRooms',
  groups:     'tabGroups',
};

let _activeCalcTab = 'calculator';

// Wire the dropdown groups in the tab bar. Desktop (fine pointer + hover) opens
// a group on hover OR click; touch/coarse pointers open on click only. Clicking
// outside the bar or pressing Escape closes everything.
function initTabGroups() {
  const tabs = document.getElementById('calcTabs');
  if (!tabs) return;
  const groups = Array.from(tabs.querySelectorAll('.calc-tab-group'));
  if (!groups.length) return;

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // mouseleave closes on a short delay, not instantly: the pointer briefly
  // crosses dead space when travelling from the trigger to a menu item, and a
  // layout shift (e.g. the Planner badge widening the Plan pill) can move the
  // trigger out from under a stationary cursor. A grace period lets the pointer
  // re-enter the group before the menu snaps shut.
  //
  // The grace period only helps when the pointer comes back, though, and when
  // the PAGE moved rather than the pointer it never does — the menu then shuts
  // a fifth of a second after a click that asked for it (#608). So a menu that
  // was clicked open is sticky: dismissed by a click elsewhere, Escape, or
  // picking an item, but not by the pointer leaving. Hovered menus still
  // follow the pointer out.
  let closeTimer;
  let clickedOpen = false;
  const setOpen = (group, open) => {
    group.classList.toggle('open', open);
    group.querySelector('.calc-tab-trigger')?.setAttribute('aria-expanded', String(open));
  };
  const open = (group, byClick) => {
    clearTimeout(closeTimer);
    // Hovering a different group is an explicit move: it takes over, and the
    // menu it opens is hovered rather than clicked.
    clickedOpen = byClick === true;
    closeAll(group);
    setOpen(group, true);
  };
  const closeAll = (except) => groups.forEach(g => { if (g !== except) setOpen(g, false); });
  const closeNow = (group) => { clearTimeout(closeTimer); clickedOpen = false; setOpen(group, false); };
  const scheduleClose = (group) => {
    if (clickedOpen) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => setOpen(group, false), 180);
  };

  groups.forEach(group => {
    const trigger = group.querySelector('.calc-tab-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      // Hover devices: hover already opens it, so a click just guarantees open.
      // Coarse pointers have no hover, so the click toggles.
      if (canHover || !group.classList.contains('open')) open(group, true);
      else closeNow(group);
    });
    if (canHover) {
      group.addEventListener('mouseenter', () => open(group));
      group.addEventListener('mouseleave', () => scheduleClose(group));
    }
  });

  // Both of these are explicit dismissals, so they clear the sticky flag as
  // well as the class — otherwise a clicked-then-dismissed menu would leave a
  // stale flag behind for the next hover.
  const dismissAll = () => { clearTimeout(closeTimer); clickedOpen = false; closeAll(); };
  document.addEventListener('click', e => { if (!tabs.contains(e.target)) dismissAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') dismissAll(); });
}

function _moveTabSlider(tabId) {
  const slider = document.getElementById('calcTabSlider');
  if (!slider) return;
  // Nothing to sit under: hide it as well as collapsing it, because at width 0
  // its own borders still paint a sliver in the bar's left cap.
  const park = () => { slider.dataset.active = 'false'; slider.style.width = '0px'; };
  // The active tab may be a single top-level button (Calculator/Groups) or a
  // menu item inside a dropdown group; in the latter case the slider tracks the
  // group's trigger pill, not the (possibly hidden) menu item.
  const item = document.querySelector(`#calcTabs [data-tab="${tabId}"]`);
  if (!item) { park(); return; }
  const group = item.closest('.calc-tab-group');
  const target = group ? group.querySelector('.calc-tab-trigger') : item;
  if (!target) { park(); return; }
  // offsetLeft is measured against the offset parent: the bar for single tabs,
  // the (position:relative) group for a trigger — so add the group's own offset.
  const left = group ? group.offsetLeft + target.offsetLeft : target.offsetLeft;
  slider.style.left  = left + 'px';
  slider.style.width = target.offsetWidth + 'px';
  slider.dataset.active = 'true';
}

function switchCalcTab(tabId) {
  if (!TAB_MAP[tabId]) return;
  _activeCalcTab = tabId;

  // Update tab buttons — single tabs and menu items both carry data-tab.
  document.querySelectorAll('#calcTabs [data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  // A group's trigger pill reflects the active state of whichever child tab is
  // selected, so the bar shows where you are even with the menu closed.
  document.querySelectorAll('#calcTabs .calc-tab-group').forEach(group => {
    const has = !!group.querySelector(`[data-tab="${tabId}"]`);
    const trigger = group.querySelector('.calc-tab-trigger');
    if (trigger) trigger.classList.toggle('active', has);
  });

  _moveTabSlider(tabId);

  // Update panels
  Object.entries(TAB_MAP).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.toggle('active', key === tabId);
  });

  // Persist tab choice
  try { sessionStorage.setItem('shohoj_active_tab', tabId); } catch(e) {}

  // Update URL hash for direct linking — but don't clobber sub-routes like
  // #calculator/reviews/MAK when the user is already on the reviews tab.
  if (history.replaceState) {
    const currentHash = window.location.hash || '';
    const onReviewsSubroute = tabId === 'reviews' && currentHash.startsWith('#calculator/reviews/');
    if (!onReviewsSubroute) {
      const hash = tabId === 'calculator' ? '#calculator' : `#calculator/${tabId}`;
      history.replaceState(null, '', hash);
    }
  }

  // Trigger re-render for active tab content
  if (tabId === 'playground') {
    renderPlayground(true);
  }
  if (tabId === 'planner') {
    renderPlanner();
  }
  if (tabId === 'reviews') {
    renderReviewsTab();
  }
  if (tabId === 'difficulty') {
    renderDifficultyMapTab();
  }
  if (tabId === 'papers') {
    renderPapersTab();
  }
  if (tabId === 'routine') {
    renderRoutineTab();
  }
  if (tabId === 'seats') {
    renderSeatsTab();
  }
  if (tabId === 'freerooms') {
    renderFreeRoomsTab();
  }
  if (tabId === 'groups') {
    renderGroupsTab();
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
  // Check URL hash first — reviews accepts sub-routes for faculty/course deep links
  const hash = window.location.hash || '';
  if (hash === '#calculator/planner')         return 'planner';
  if (hash === '#calculator/playground')      return 'playground';
  if (hash.startsWith('#calculator/reviews')) return 'reviews';
  if (hash === '#calculator/difficulty')      return 'difficulty';
  if (hash === '#calculator/papers')          return 'papers';
  if (hash.startsWith('#calculator/routine'))  return 'routine';
  if (hash.startsWith('#calculator/seats'))     return 'seats';
  if (hash.startsWith('#calculator/freerooms')) return 'freerooms';
  if (hash.startsWith('#calculator/groups'))    return 'groups';

  // Then check sessionStorage
  try {
    const saved = sessionStorage.getItem('shohoj_active_tab');
    if (saved && TAB_MAP[saved]) return saved;
  } catch(e) {}

  return 'calculator';
}

window.switchCalcTab       = switchCalcTab;
window.openFeedbackModal   = openFeedbackModal;
window.closeFeedbackModal  = closeFeedbackModal;

function scrollToCalculator() {
  document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startDemoMode() {
  // Unlock BEFORE loading: the calculator is hidden while signed out, and
  // loadSampleData() renders into a container inside it. Filling a hidden
  // subtree works but scrollToCalculator() would then land on a collapsed
  // section, so the section has to exist at its real height first.
  unlockForDemo();
  const loaded = loadSampleData();
  if (!loaded) return;
  switchCalcTab('calculator');
  scrollToCalculator();
}

// The portal's own "try demo mode" link runs through the action dispatcher,
// which lives in signinPortal.js and must not import main.js back (circular).
window._shohoj_startDemo = startDemoMode;

// ── RECALC ───────────────────────────────────────────────────────────────────
function recalc() {
  const gpaOptions = {
    startSeason: getStartSeason(),
    startYear: getStartYear(),
  };
  const projectedTotals = calculateCgpaTotals(state.semesters, {
    ...gpaOptions,
    includeRunning: true,
    includeSummary: true,
  });
  const completedTotals = calculateCgpaTotals(state.semesters, {
    ...gpaOptions,
    includeRunning: false,
    includeSummary: true,
  });
  const totalPts = projectedTotals.points;
  const totalAttempted = projectedTotals.attemptedCredits;
  const totalEarned = projectedTotals.earnedCredits;
  const totalEarnedCGPA = projectedTotals.cgpaCredits;
  const cgpa = projectedTotals.cgpa;
  const cgpaCompleted = completedTotals.cgpa;

  const hasRunning = state.semesters.some(s => s.running);
  // The React island (Vite build only) owns #cgpaVal + .cgpa-label and sets this
  // flag on mount; skip the vanilla writes so the two don't fight. The flag is
  // never set on the build3.py / un-bundled path, so behavior there is unchanged.
  if (!window.__SHOHOJ_REACT_SUMMARY__) {
    const cgpaEl = document.getElementById('cgpaVal');
    cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
    cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
      cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
      cgpa >= 2.5 ? '#F0A500' : '#e74c3c';
    document.querySelector('.cgpa-label').textContent = hasRunning ? 'Projected CGPA' : 'Current CGPA';
  }

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

  // The React footer island (Vite build only) owns these two credit totals.
  // build3.py / un-bundled source never sets this flag, so vanilla stays as-is.
  if (!window.__SHOHOJ_REACT_CREDIT_TOTALS__) {
    document.getElementById('totalAttempted').textContent = fmtCr(totalAttempted);
    document.getElementById('totalEarned').textContent = fmtCr(totalEarned);
  }

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

    const tierId = standingTierFor(cgpaNum);
    const tier = MILESTONE_TIERS.find(t => t.id === tierId);
    const presentation = STANDING_PRESENTATION[tierId];
    const standing = tier.standingLabel;
    const cls = presentation.cls;
    const emoji = presentation.emoji;
    const description = presentation.description;

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

  // The React meter island (Vite build only) owns #meterFill, #meterPct, and
  // #meterStatus. Vanilla/build3.py keeps writing these nodes directly.
  if (!window.__SHOHOJ_REACT_METER__) {
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
  }

  runSimulator(cgpa, totalEarnedCGPA, totalPts);
  renderPlayground();
  saveState();
  updateSetupWizard();

  // Notify React islands (Vite build only) that the calculator recomputed.
  // No-op on the vanilla / build3.py path where nothing listens.
  window.dispatchEvent(new CustomEvent('shohoj:recalc'));
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function _wireInlineReplacements() {
  const on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  // Department / start-semester pickers (replaces inline onchange on selects).
  on('heroDemoBtn', 'click', () => startDemoMode());
  on('deptSelect', 'change', () => onDeptSelect());
  on('startSeason', 'change', () => { renderSemesters(); recalc(); });
  on('startYear',   'change', () => { renderSemesters(); recalc(); });
  on('startSemConfirmBtn', 'click', () => onStartSemConfirm());

  // Calculator tab strip (replaces inline onclick on each .calc-tab button).
  // Selecting any tab — single or inside a dropdown — switches and then closes
  // any open group so the menu doesn't linger over the panel.
  document.querySelectorAll('#calcTabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchCalcTab(btn.dataset.tab);
      btn.closest('.calc-tab-group')?.classList.remove('open');
    });
  });
  initTabGroups();

  // Transcript import / export / clear-data buttons.
  on('importPdfBtn', 'click', () => {
    document.getElementById('transcriptFileInput')?.click();
  });
  on('transcriptFileInput', 'change', e => importTranscriptPDF(e.target));
  on('exportPdfBtn',  'click', () => exportPDF());
  on('clearDataBtn',  'click', () => window.handleClearData());

  // Modal backdrop closes — click on the backdrop only, not the inner card.
  const closeOnBackdrop = (modalId, closer) => {
    const m = document.getElementById(modalId);
    if (!m) return;
    m.addEventListener('click', e => { if (e.target === m) closer(); });
  };
  closeOnBackdrop('importModal',   () => hideImportModal());
  closeOnBackdrop('feedbackModal', () => closeFeedbackModal());
  closeOnBackdrop('coffeeModal',   () => {
    const m = document.getElementById('coffeeModal');
    if (m) m.style.display = 'none';
  });

  // Coffee modal close (×) + footer feedback / coffee links.
  on('coffeeModalClose', 'click', () => {
    const m = document.getElementById('coffeeModal');
    if (m) m.style.display = 'none';
  });
  document.querySelectorAll('.js-open-feedback').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); openFeedbackModal(); });
  });
  document.querySelectorAll('.js-open-coffee').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const m = document.getElementById('coffeeModal');
      if (m) m.style.display = 'flex';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Skip calculator init on pages that don't host it (e.g., the admin page).
  if (!document.getElementById('targetCgpa')) return;
  document.getElementById('targetCgpa').addEventListener('input', recalc);
  document.getElementById('creditsRemaining').addEventListener('input', recalc);
  document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());
  document.getElementById('addRunningSemBtn').addEventListener('click', () => addRunningSemester());

  _wireInlineReplacements();

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
  // Position slider on the initial active tab after layout settles
  requestAnimationFrame(() => _moveTabSlider(_activeCalcTab));

  initReveal();
  initCursor();
  initDotMatrix(document.getElementById('themeToggle'));

  // Assistant launcher — mounts itself only once auth resolves and the Worker
  // reports the assistant configured, so this call is safe before either.
  initAssistantFab();

  // Campus gate. Must run before the ?demo=1 check below, which unlocks it.
  initSignInPortal();

  // Auto-launch demo mode when embedded via ?demo=1 (e.g. the portfolio
  // site's live preview iframe). Skipped if local data already exists, so it
  // never overwrites a returning user's own semesters.
  if (new URLSearchParams(window.location.search).get('demo') === '1' && state.semesters.length === 0) {
    startDemoMode();
  }
});
