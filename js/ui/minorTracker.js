// ── js/ui/minorTracker.js ─────────────────────────────────────────────────────
// The legacy calculator's minor panel (#766), under the degree tracker. It is
// the legacy rendering of src/features/calculator/MinorTracker.tsx: the same
// model (js/core/minorProgress.js, a twin of the shell's), the same classes,
// and the same `currentMinor` field in shohoj_cgpa_v1, so a minor picked on
// either surface is the one the other shows.
//
// The picker is wired through data-action rather than an inline onchange: the
// bundle's CSP blocks inline handlers.

import { state, saveState } from '../core/state.js';
import { registerAction } from '../core/dispatch.js';
import { escHtml } from '../core/helpers.js';
import { MINOR_PROGRAMS, getMinorProgram } from '../core/minors.js';
import { computeMinorProgress } from '../core/minorProgress.js';

const _MINOR_STATUS_MARK = { earned: '✓', 'in-progress': '◐', unmet: '○' };

function _minorFmtCr(n) {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function _minorRowHTML({ status, code, title, note, credits }) {
  return `
    <li class="minor-req minor-req--${status}">
      <span class="minor-req-mark" aria-hidden="true">${_MINOR_STATUS_MARK[status]}</span>
      <span class="minor-req-body">
        <span class="minor-req-title"><span class="minor-req-code">${escHtml(code)}</span> ${escHtml(title)}</span>
        <span class="minor-req-note">${escHtml(note)}</span>
      </span>
      <span class="minor-req-credits">${escHtml(credits)} cr</span>
    </li>`;
}

// A requirement with alternatives reads as published ("MAT223 or CSE330")
// until one is taken, then names the one that counted.
function _minorCoreRowHTML({ requirement, status, match }) {
  return _minorRowHTML({
    status,
    code: match ? match.code : requirement.codes.join(' or '),
    title: requirement.title,
    note: status === 'earned' && match ? `Earned · ${match.grade}`
      : status === 'in-progress' ? 'In progress'
      : 'Not taken',
    credits: String(requirement.credits),
  });
}

function _minorStatHTML(value, dim, label, note = '') {
  return `
    <div class="tracker-stat">
      <div class="tracker-stat-val">${escHtml(value)}${dim ? `<span class="tracker-stat-dim"> / ${escHtml(dim)}</span>` : ''}</div>
      <div class="tracker-stat-label">${escHtml(label)}</div>
      ${note ? `<div class="tracker-stat-note">${escHtml(note)}</div>` : ''}
    </div>`;
}

function _minorBodyHTML(progress) {
  if (!progress) {
    return `
      <p class="minor-empty">
        Pick a minor above and Shohoj will check your courses against its requirements — which
        ones you have cleared, which are in progress, and how many elective credits are left.
      </p>`;
  }
  const { program, electives } = progress;
  const stats = `
    <div class="tracker-stats minor-stats">
      ${_minorStatHTML(_minorFmtCr(progress.creditsEarned), String(progress.totalRequired), 'Credits Earned')}
      ${_minorStatHTML(String(progress.coreEarned), String(program.core.length), 'Core Courses')}
      ${_minorStatHTML(_minorFmtCr(electives.creditsEarned), String(electives.creditsRequired), 'Elective Credits')}
      ${_minorStatHTML(
        progress.complete ? 'Done' : _minorFmtCr(progress.creditsRemaining),
        '',
        progress.complete ? 'Requirements' : 'Credits Left',
        progress.creditsInProgress > 0 ? `${_minorFmtCr(progress.creditsInProgress)} cr in progress` : '',
      )}
    </div>`;

  const bar = `
    <div class="tracker-bar-wrap">
      <div class="tracker-bar-bg">
        <div class="tracker-bar-fill" style="width:${progress.progressPct.toFixed(1)}%"></div>
      </div>
      <div class="tracker-bar-labels">
        <span>${progress.progressPct.toFixed(0)}% complete</span>
        <span>${progress.complete ? 'All requirements met' : `${_minorFmtCr(progress.creditsRemaining)} credits remaining`}</span>
      </div>
    </div>`;

  const coreCredits = program.core.reduce((s, r) => s + r.credits, 0);
  const core = `
    <div class="minor-section">
      <h5 class="minor-section-title">Core Courses<span class="minor-section-dim">${coreCredits} credits</span></h5>
      <ul class="minor-req-list" data-testid="minor-core-list">${progress.core.map(_minorCoreRowHTML).join('')}</ul>
    </div>`;

  const electiveRows = [
    ...electives.earnedCourses.map((c) => _minorRowHTML({
      status: 'earned', code: c.code, title: c.title, note: `Earned · ${c.grade}`, credits: _minorFmtCr(c.credits),
    })),
    ...electives.inProgressCourses.map((c) => _minorRowHTML({
      status: 'in-progress', code: c.code, title: c.title, note: 'In progress', credits: _minorFmtCr(c.credits),
    })),
  ].join('');
  const elective = `
    <div class="minor-section">
      <h5 class="minor-section-title">Elective Courses<span class="minor-section-dim">${electives.creditsRequired} credits</span></h5>
      ${electiveRows
        ? `<ul class="minor-req-list" data-testid="minor-elective-list">${electiveRows}</ul>`
        : '<p class="minor-elective-empty">No elective credits counted yet. Any of these will count:</p>'}
      <ul class="minor-option-list">${program.electives.options.map((o) => `<li>${escHtml(o.label)}</li>`).join('')}</ul>
    </div>`;

  const source = `
    <p class="minor-source">
      Requirements transcribed from the ${escHtml(program.source)}. Confirm with your
      department before you plan around them.
    </p>`;

  return stats + bar + core + elective + source;
}

export function renderMinorTracker() {
  const box = document.getElementById('minorTrackerBox');
  const content = document.getElementById('minorTrackerContent');
  if (!box || !content) return;

  // Nothing to measure yet: the panel appears with the calculator's first
  // semester, the same moment the rest of the results do.
  if (!state.semesters.length) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';

  const program = getMinorProgram(state.currentMinor);
  const progress = computeMinorProgress(state.semesters, program);
  const options = MINOR_PROGRAMS.map((m) =>
    `<option value="${escHtml(m.code)}"${program && program.code === m.code ? ' selected' : ''}>${escHtml(m.shortLabel)}</option>`,
  ).join('');

  // Every interpolation is escaped (escHtml) or a number we formatted.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  content.innerHTML = `
    <div class="tracker-header minor-header">
      <div>
        <h4>Minor</h4>
        <div class="tracker-subtitle">${progress
          ? `${escHtml(progress.program.label)} · ${progress.program.totalCredits} credits`
          : 'Track a minor alongside your degree.'}</div>
      </div>
      <div class="minor-picker">
        <select class="pf-select" aria-label="Minor program" data-action="minor:select" data-testid="minor-select">
          <option value=""${program ? '' : ' selected'}>No minor</option>
          ${options}
        </select>
      </div>
    </div>
    ${_minorBodyHTML(progress)}`;
}

registerAction('minor:select', (el) => {
  // Store the canonical code, or '' — never whatever the element carried.
  state.currentMinor = getMinorProgram(el.value)?.code ?? '';
  saveState();
  renderMinorTracker();
});
