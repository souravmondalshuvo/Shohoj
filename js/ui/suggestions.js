import { COURSE_DB, ALL_COURSES } from '../core/catalog.js';
import { state } from '../core/state.js';
import { escHtml, escAttr } from '../core/helpers.js';

let activeInput = null;
// When suggestions are (re)shown we briefly ignore scroll-driven closes: focusing
// or typing into an input near the fold makes the browser auto-scroll it into
// view, and that programmatic scroll would otherwise wipe the list the user just
// opened (a UX papercut, and the source of a flaky e2e — see repro-suggestion).
let lastSuggestionShownAt = 0;

function getPortal() {
  return document.getElementById('suggestions-portal');
}

function showPortalSuggestions(inputEl, semId, cIdx, matches) {
  const portal = getPortal();
  const rect = inputEl.getBoundingClientRect();
  const top  = rect.bottom + 4;
  const left = rect.left;
  const w    = rect.width;
  // XSS FIX: escape c.full, c.code, c.name before inserting into HTML.
  // Selection is wired via a delegated mousedown listener (see initSuggestions);
  // inline on* handlers are blocked by the production bundle's hardened CSP.
  let html = `<div class="course-suggestions" id="sug-${semId}-${cIdx}"
    style="top:${top}px;left:${left}px;width:${w}px;">`;
  html += matches.map((c, i) => `
    <div class="suggestion-item" data-idx="${i}"
      data-sem-id="${semId}" data-c-idx="${cIdx}"
      data-full="${escAttr(c.full)}" data-credits="${c.credits}">
      <span class="suggestion-code">${escHtml(c.code)}</span>
      <span class="suggestion-name">${escHtml(c.name)}</span>
      <span class="suggestion-credits">${c.credits} cr</span>
    </div>`).join('');
  html += '</div>';
  portal.innerHTML = html;
  lastSuggestionShownAt = Date.now();
}

export function onCourseBlur(e, semId, cIdx) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem || !sem.courses[cIdx]) return;
  const val = e.target.value.trim();
  const course = sem.courses[cIdx];
  const prevName = course.name;
  const exactMatch = COURSE_DB[val.toUpperCase()]
    || ALL_COURSES.find(c =>
      c.full.toLowerCase() === val.toLowerCase() ||
      c.name.toLowerCase() === val.toLowerCase()
    );

  let resolvedName = val;
  let resolvedCredits;
  if (exactMatch) {
    resolvedName = exactMatch.full;
    resolvedCredits = exactMatch.credits;
  } else if (!val) {
    resolvedCredits = 0;
  } else {
    resolvedCredits = 0;
  }

  const identityChanged = prevName !== resolvedName;
  const creditsChanged = course.credits !== resolvedCredits;
  if (identityChanged || creditsChanged) {
    course.name = resolvedName;
    course.credits = resolvedCredits;

    // If the course identity changed, any previous grade belongs to the old row.
    if (identityChanged) {
      course.grade = '';
      course.gradePoint = '';
    }

    window._shohoj_renderAndRecalc();
    if (resolvedName) {
      const liveInput = document.getElementById(`course-input-${semId}-${cIdx}`);
      const wrap = liveInput ? liveInput.closest('.course-input-wrap') : null;
      if (wrap) {
        let tick = wrap.querySelector('.course-saved-tick');
        if (!tick) {
          tick = document.createElement('span');
          tick.className = 'course-saved-tick';
          tick.textContent = '✓';
          wrap.appendChild(tick);
        }
        tick.classList.add('visible');
        clearTimeout(tick._hideTimer);
        tick._hideTimer = setTimeout(() => tick.classList.remove('visible'), 1400);
      }
    }
  }
}

export function onCourseInput(e, semId, cIdx) {
  const raw = e.target.value.trim();
  const val = raw.toLowerCase();
  activeInput = e.target;

  if (!val) { getPortal().innerHTML = ''; return; }

  const exactMatch = COURSE_DB[raw.toUpperCase()];
  const t1 = exactMatch ? [exactMatch] : [];
  const t2 = ALL_COURSES.filter(c => c !== exactMatch && c.code.toLowerCase().startsWith(val));
  const t3 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && c.code.toLowerCase().includes(val));
  const t4 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && !t3.includes(c) && c.name.toLowerCase().includes(val));

  const matches = [...t1, ...t2, ...t3, ...t4].slice(0, 8);
  if (!matches.length) { getPortal().innerHTML = ''; return; }
  showPortalSuggestions(e.target, semId, cIdx, matches);
}

export function onCourseKey(e, semId, cIdx) {
  const portal = getPortal();
  const box = portal.querySelector('.course-suggestions');
  if (!box) return;
  const items = box.querySelectorAll('.suggestion-item');
  let active = box.querySelector('.suggestion-item.active');
  let idx = active ? parseInt(active.dataset.idx) : -1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = Math.min(idx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = Math.max(idx - 1, 0);
  } else if (e.key === 'Enter' && active) {
    e.preventDefault();
    active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return;
  } else if (e.key === 'Escape') {
    portal.innerHTML = ''; return;
  } else { return; }

  items.forEach(el => el.classList.remove('active'));
  if (items[idx]) items[idx].classList.add('active');
}

export function closeSuggestions() {
  getPortal().innerHTML = '';
}

export function pickSuggestion(semId, cIdx, fullName, credits) {
  getPortal().innerHTML = '';
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return;
  sem.courses[cIdx].name    = fullName;
  sem.courses[cIdx].credits = credits;
  sem.courses[cIdx].grade      = '';
  sem.courses[cIdx].gradePoint = '';

  window._shohoj_renderAndRecalc();
  window._shohoj_updateSetupWizard();

  setTimeout(() => {
    const block = document.getElementById(`sem-${semId}`);
    if (!block) return;
    const rows = block.querySelectorAll('.course-row:not(.course-header)');
    const row  = rows[cIdx];
    if (!row) return;
    const gpInput = row.querySelector('input[inputmode="decimal"]');
    const pfSelect = row.querySelector('.pf-select');
    if (pfSelect) pfSelect.focus();
    else if (gpInput) gpInput.focus();
  }, 30);
}

export function initSuggestionsScrollHandler() {
  // Close the (absolutely-positioned) suggestion list on a genuine user scroll,
  // but ignore the programmatic auto-scroll that immediately follows opening it
  // (focusing/typing an input near the fold). Without this grace window that
  // auto-scroll wipes the list the moment it appears.
  const SCROLL_CLOSE_GRACE_MS = 500;
  window.addEventListener('scroll', () => {
    if (!activeInput || !getPortal().innerHTML) return;
    if (Date.now() - lastSuggestionShownAt < SCROLL_CLOSE_GRACE_MS) return;
    getPortal().innerHTML = '';
  }, { passive: true });

  // ── CSP-safe event wiring ────────────────────────────────────────────────
  // The production bundle hardens its CSP and drops 'unsafe-inline' from
  // script-src, which blocks inline on* handler attributes (hashes don't cover
  // event handlers). So the course-row interactions — picking a suggestion,
  // keyboard nav, and resolving a typed code on blur — are delegated here
  // instead of via onmousedown/onkeydown/onblur in the markup.

  // Pick a suggestion. mousedown (not click) so it fires before the input
  // blurs; preventDefault keeps focus on the input until pickSuggestion runs.
  getPortal().addEventListener('mousedown', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    e.preventDefault();
    pickSuggestion(
      Number(item.dataset.semId),
      Number(item.dataset.cIdx),
      item.dataset.full,
      Number(item.dataset.credits)
    );
  });

  // Keyboard navigation within a course input's suggestion list.
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (el && el.dataset && el.dataset.action === 'render:courseInput') {
      onCourseKey(e, Number(el.dataset.semId), Number(el.dataset.idx));
    }
  });

  // Blur handling for course inputs (resolve typed code) and grade-point
  // inputs (commit grade). focusout is used because blur does not bubble.
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.action === 'render:courseInput') {
      onCourseBlur(e, Number(el.dataset.semId), Number(el.dataset.idx));
      setTimeout(() => closeSuggestions(), 180);
    } else if (el.dataset.action === 'render:autoDetectGrade') {
      window.onGradePointBlur?.(Number(el.dataset.semId), Number(el.dataset.idx), el);
    }
  });
}
