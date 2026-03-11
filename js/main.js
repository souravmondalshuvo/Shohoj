// ── MAIN ENTRY POINT ─────────────────────────────────
// Bootstraps theme, populates registry, wires animations
// and initialises the calculator.
//
// IMPORTANT: ES modules do NOT expose functions to window scope.
// Any function used in an inline HTML event handler (onclick="fn()")
// must be explicitly assigned to window.fn here.

import { app }                                    from './core/registry.js';
import { recalc }                                 from './core/calculator.js';
import { autoDetectGrade, onPFChange }            from './core/calculator.js';
import { renderSemesters,
         addSemester, removeSemester,
         addCourse, removeCourse,
         loadSampleData }                         from './ui/render.js';
import { updateSetupWizard, initCalculator }      from './ui/setupWizard.js';
import { runSimulator, buildWhatIfSelect,
         onWhatIfChange }                         from './ui/simulator.js';
import { drawTrendChart }                         from './ui/charts.js';
import { hideImportModal, exportPDF }                              from './ui/modals.js';
import { onCourseBlur, onCourseInput,
         onCourseKey, pickSuggestion }            from './ui/suggestions.js';
import { importTranscriptPDF, applyImport }  from './import/importer.js';
import { parseTranscriptText }                    from './import/parser.js';
import { initReveal }                             from './animations/reveal.js';
import { initCursor }                             from './animations/cursor.js';
import { initDotMatrix }                          from './animations/dotmatrix.js';

// ── POPULATE REGISTRY (breaks circular deps) ─────────
app.recalc              = recalc;
app.renderSemesters     = renderSemesters;
app.updateSetupWizard   = updateSetupWizard;
app.runSimulator        = runSimulator;
app.drawTrendChart      = drawTrendChart;
app.buildWhatIfSelect   = buildWhatIfSelect;
app.importTranscriptPDF = importTranscriptPDF;
app.applyImport         = applyImport;
app.parseTranscriptText = parseTranscriptText;

// ── EXPOSE TO WINDOW (inline HTML event handlers need global scope) ───
window.addSemester      = addSemester;
window.removeSemester   = removeSemester;
window.addCourse        = addCourse;
window.removeCourse     = removeCourse;
window.loadSampleData   = loadSampleData;
window.autoDetectGrade  = autoDetectGrade;
window.onPFChange       = onPFChange;
window.onCourseBlur     = onCourseBlur;
window.onCourseInput    = onCourseInput;
window.onCourseKey      = onCourseKey;
window.pickSuggestion   = pickSuggestion;
window.hideImportModal  = hideImportModal;
window.onWhatIfChange   = onWhatIfChange;
window.exportPDF        = exportPDF;

// ── BOOT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const html     = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  const pill     = document.getElementById('togglePill');
  let savedTheme = 'dark';
  try {
    const _raw = localStorage.getItem('shohoj_theme');
    if (_raw === 'dark' || _raw === 'light') savedTheme = _raw;
  } catch(e) {}
  html.dataset.theme = savedTheme;
  if (pill) pill.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const isDark   = html.dataset.theme === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.dataset.theme = newTheme;
    if (pill) pill.textContent = isDark ? '☀️' : '🌙';
    try { localStorage.setItem('shohoj_theme', newTheme); } catch(e) {}
    setTimeout(recalc, 30);
  });

  // Scroll progress bar
  const progressBar = document.getElementById('scroll-progress');
  const navEl       = document.querySelector('nav');
  function updateProgress() {
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.width = (scrollTop / docHeight * 100) + '%';
    if (navEl) navEl.classList.toggle('scrolled', scrollTop > 40);
  }
  window.addEventListener('scroll', updateProgress, { passive: true });

  // Animations + calculator
  initReveal();
  initCursor();
  initDotMatrix();
  initCalculator();
});