// ── MAIN ENTRY POINT ─────────────────────────────────
// Bootstraps theme, populates registry, wires animations
// and initialises the calculator. Import order matters.

import { app }                from './core/registry.js';
import { recalc }             from './core/calculator.js';
import { renderSemesters }    from './ui/render.js';
import { updateSetupWizard, initCalculator } from './ui/setupWizard.js';
import { runSimulator, drawTrendChart, buildWhatIfSelect } from './ui/simulator.js';
import { drawTrendChart as _drawTrendChart } from './ui/charts.js';
import { importTranscriptPDF, applyImport } from './import/importer.js';
import { parseTranscriptText } from './import/parser.js';
import { initReveal }         from './animations/reveal.js';
import { initCursor }         from './animations/cursor.js';
import { initDotMatrix }      from './animations/dotmatrix.js';

// ── POPULATE REGISTRY (breaks circular deps) ─────────
app.recalc              = recalc;
app.renderSemesters     = renderSemesters;
app.updateSetupWizard   = updateSetupWizard;
app.runSimulator        = runSimulator;
app.drawTrendChart      = _drawTrendChart;
app.buildWhatIfSelect   = buildWhatIfSelect;
app.importTranscriptPDF = importTranscriptPDF;
app.applyImport         = applyImport;
app.parseTranscriptText = parseTranscriptText;

// ── THEME TOGGLE + SCROLL PROGRESS ───────────────────
// ── THEME TOGGLE ─────────────────────────────────────
    const html = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const pill = document.getElementById('togglePill');
    // Restore saved theme or default to dark
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

    // ── SCROLL PROGRESS BAR ──────────────────────────────
    const progressBar = document.getElementById('scroll-progress');
    const navEl = document.querySelector('nav');

// ── BOOT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initCursor();
  initDotMatrix();
  initCalculator();
});