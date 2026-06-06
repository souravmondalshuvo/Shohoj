// ── js/ui/routineTab.js ───────────────────────────────────────────────────────
// Routine Builder tab. Pulls live BRACU CONNECT section data via the
// connectFeedClient (10-min cache), lets the student pick courses + sections,
// and flags class/exam clashes in real time. Weekly grid + auto-suggest land
// in a follow-up PR; this iteration ships the picker + section rows + clash
// highlighting + a source/age badge that's honest about freshness.

import { fetchConnectFeed, clearConnectFeedCache } from '../core/connectFeedClient.js';
import { indexByCourse } from '../core/connectFeed.js';
import {
  emptyRoutineState,
  pickCourse,
  pickSection,
  unpickCourse,
  clearRoutine,
  pickedCourseCodes,
  selectedSections,
  buildClashMap,
  summarizeRoutine,
} from '../core/routineState.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

const STORAGE_KEY = 'shohoj_routine_v1';
const DAY_ORDER   = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const DAY_SHORT   = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };

const _store = {
  loading: false,
  error: null,
  source: null,        // 'live' | 'cache' | 'fallback'
  fetchedAt: 0,
  index: null,         // Map<courseCode, NormalizedSection[]>
  courseCodes: [],
  routine: _restoreRoutine(),
  query: '',
};

function _restoreRoutine() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRoutineState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.picks !== 'object' || parsed.picks === null) return emptyRoutineState();
    const picks = {};
    for (const [k, v] of Object.entries(parsed.picks)) {
      if (typeof k !== 'string') continue;
      if (v === null || typeof v === 'number') picks[k.toUpperCase()] = v;
    }
    return { picks };
  } catch { return emptyRoutineState(); }
}

function _persistRoutine() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_store.routine)); }
  catch {}
}

// ── ACTIONS (delegated via dispatch.js) ─────────────────────────────────────
registerAction('routine:refresh',     () => _refresh(true));
registerAction('routine:clearCache',  () => { clearConnectFeedCache(); _refresh(true); });
registerAction('routine:addCourse',   (el) => _addCourseFromInput(el));
registerAction('routine:removeCourse',(el) => _onRemoveCourse(el.dataset.code));
registerAction('routine:pickSection', (el) => _onPickSection(el.dataset.code, Number(el.dataset.sid)));
registerAction('routine:unpickSection',(el) => _onUnpickSection(el.dataset.code));
registerAction('routine:clearAll',    () => _onClearAll());
registerAction('routine:addFromSuggest', (el) => _onAddCourseFromSuggest(el.dataset.code));

function _onRemoveCourse(code)         { _store.routine = unpickCourse(_store.routine, code); _persistRoutine(); _rerender(); }
function _onPickSection(code, sid)     { _store.routine = pickSection(_store.routine, code, sid); _persistRoutine(); _rerender(); }
function _onUnpickSection(code)        { _store.routine = pickSection(_store.routine, code, null); _persistRoutine(); _rerender(); }
function _onClearAll()                 { _store.routine = clearRoutine(_store.routine); _persistRoutine(); _rerender(); }
function _onAddCourseFromSuggest(code) {
  if (!code || !_store.index || !_store.index.has(code)) return;
  _store.routine = pickCourse(_store.routine, code);
  _store.query = '';
  const input = document.getElementById('routineCourseInput');
  if (input) input.value = '';
  _persistRoutine();
  _rerender();
}

function _addCourseFromInput() {
  const input = document.getElementById('routineCourseInput');
  if (!input) return;
  const raw = (input.value || '').trim().toUpperCase();
  if (!raw) return;
  if (!_store.index || !_store.index.has(raw)) {
    input.classList.add('routine-input--err');
    setTimeout(() => input.classList.remove('routine-input--err'), 600);
    return;
  }
  _store.routine = pickCourse(_store.routine, raw);
  _persistRoutine();
  input.value = '';
  _store.query = '';
  _rerender();
}

// Live search-as-you-type for the input (no debounce — list is small).
function _onSearchInput(ev) {
  _store.query = (ev.target.value || '').toUpperCase();
  _renderSuggestions();
}

function _attachInputHandlers() {
  const input = document.getElementById('routineCourseInput');
  if (!input) return;
  input.addEventListener('input', _onSearchInput);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      _addCourseFromInput();
    }
  });
}

// ── DATA LOADING ────────────────────────────────────────────────────────────
async function _refresh(force = false) {
  _store.loading = true;
  _store.error = null;
  _rerender();
  try {
    const result = await fetchConnectFeed(force ? { forceRefresh: true } : {});
    _store.index = indexByCourse(result.sections);
    _store.courseCodes = Array.from(_store.index.keys()).sort();
    _store.source = result.source;
    _store.fetchedAt = result.fetchedAt;
  } catch (e) {
    _store.error = e && e.message ? e.message : 'Failed to load Connect feed.';
  } finally {
    _store.loading = false;
    _rerender();
  }
}

// ── RENDER ──────────────────────────────────────────────────────────────────
export async function renderRoutineTab() {
  const root = document.getElementById('routineContent');
  if (!root) return;
  if (!_store.index && !_store.loading && !_store.error) {
    _refresh(false);
    return;
  }
  _rerender();
}

function _rerender() {
  const root = document.getElementById('routineContent');
  if (!root) return;
  // All interpolations in _html() go through escHtml/escAttr (same pattern as
  // papersTab.js, difficultyMap.js, etc.). Suppress the static-analysis warning.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = _html();
  _attachInputHandlers();
}

function _html() {
  if (_store.loading && !_store.index) return _loadingHTML();
  if (_store.error  && !_store.index) return _errorHTML();
  return _mainHTML();
}

function _loadingHTML() {
  return `
    <div class="routine-tab">
      <div class="routine-loading">
        <div class="routine-spinner" aria-hidden="true"></div>
        <div>Fetching live section data from CONNECT…</div>
      </div>
    </div>
  `;
}

function _errorHTML() {
  return `
    <div class="routine-tab">
      <div class="routine-error">
        <h3>Couldn't reach the Connect feed</h3>
        <p>${escHtml(_store.error || 'Unknown error.')}</p>
        <button class="btn-primary" data-action="routine:refresh">Try again</button>
      </div>
    </div>
  `;
}

function _mainHTML() {
  const summary = summarizeRoutine(_store.routine, _store.index);
  const picked  = pickedCourseCodes(_store.routine);
  const selected = selectedSections(_store.routine, _store.index);
  const clashMap = buildClashMap(selected);

  return `
    <div class="routine-tab">
      ${_headerHTML(summary)}
      ${_pickerHTML()}
      <div class="routine-suggestions" id="routineSuggestions">${_suggestionsHTML()}</div>
      ${picked.length === 0 ? _emptyHTML() : _pickedListHTML(picked, clashMap)}
    </div>
  `;
}

function _headerHTML(summary) {
  const age = _ageLabel(_store.fetchedAt);
  const sourceLabel = ({ live: 'Live', cache: 'Cached', fallback: 'Offline cache' })[_store.source] || '—';
  const sourceClass = `routine-source--${_store.source || 'unknown'}`;
  const clashWarn = (summary.classClashPairs + summary.examClashPairs) > 0
    ? `<span class="routine-clash-warn" title="Class clashes: ${summary.classClashPairs}, exam clashes: ${summary.examClashPairs}">⚠ ${summary.classClashPairs + summary.examClashPairs} clash${(summary.classClashPairs + summary.examClashPairs) === 1 ? '' : 'es'}</span>`
    : '';
  return `
    <div class="routine-header">
      <div class="routine-header-left">
        <h3>🗓️ Routine Builder</h3>
        <span class="routine-source-badge ${sourceClass}" title="Source: ${escAttr(sourceLabel)} • Updated ${escAttr(age)}">
          ${escHtml(sourceLabel)} · ${escHtml(age)}
        </span>
        ${clashWarn}
      </div>
      <div class="routine-header-right">
        <button class="btn-secondary btn-sm" data-action="routine:refresh" title="Re-fetch from CONNECT now">↻ Refresh</button>
        ${Object.keys(_store.routine.picks).length > 0
          ? `<button class="btn-secondary btn-sm" data-action="routine:clearAll" title="Remove all picked courses">Clear</button>`
          : ''}
      </div>
    </div>
  `;
}

function _pickerHTML() {
  return `
    <div class="routine-picker">
      <input type="text" id="routineCourseInput" class="routine-input"
             placeholder="Add course (e.g. CSE220) — start typing for matches"
             autocomplete="off" spellcheck="false" />
      <button class="btn-primary btn-sm" data-action="routine:addCourse">Add</button>
    </div>
  `;
}

function _suggestionsHTML() {
  const q = _store.query;
  if (!q || q.length < 2 || !_store.index) return '';
  const matches = _store.courseCodes.filter(c => c.startsWith(q)).slice(0, 8);
  if (matches.length === 0) return `<div class="routine-suggest-empty">No course matches "${escHtml(q)}"</div>`;
  return matches.map(code => {
    const list = _store.index.get(code);
    const first = list && list[0];
    const name = first ? first.courseName : '';
    return `
      <button type="button" class="routine-suggest-item" data-action="routine:addFromSuggest" data-code="${escAttr(code)}">
        <span class="routine-suggest-code">${escHtml(code)}</span>
        <span class="routine-suggest-name">${escHtml(name)}</span>
        <span class="routine-suggest-count">${list.length} section${list.length===1?'':'s'}</span>
      </button>
    `;
  }).join('');
}

function _emptyHTML() {
  return `
    <div class="routine-empty">
      <p>Add courses to start planning. Try <code>CSE220</code>, <code>MAT215</code>, <code>BUS102</code>.</p>
    </div>
  `;
}

function _pickedListHTML(picked, clashMap) {
  return `<div class="routine-picked-list">${picked.map(code => _courseBlockHTML(code, clashMap)).join('')}</div>`;
}

function _courseBlockHTML(courseCode, clashMap) {
  const sections = _store.index.get(courseCode) || [];
  const currentSid = _store.routine.picks[courseCode];
  const name = sections[0] ? sections[0].courseName : courseCode;
  return `
    <div class="routine-course-block">
      <div class="routine-course-head">
        <div>
          <span class="routine-course-code">${escHtml(courseCode)}</span>
          <span class="routine-course-name">${escHtml(name)}</span>
        </div>
        <button class="routine-remove-x" data-action="routine:removeCourse" data-code="${escAttr(courseCode)}" aria-label="Remove ${escAttr(courseCode)}">×</button>
      </div>
      <div class="routine-section-list">
        ${sections.map(s => _sectionRowHTML(courseCode, s, currentSid === s.sectionId, clashMap.get(s.sectionId))).join('')}
      </div>
    </div>
  `;
}

function _sectionRowHTML(courseCode, section, isPicked, mark) {
  const seatPct = section.capacity > 0 ? (section.consumedSeat / section.capacity) : 0;
  const seatClass = section.isFull ? 'full' : (seatPct > 0.85 ? 'tight' : 'open');
  const action = isPicked ? 'routine:unpickSection' : 'routine:pickSection';
  const data = `data-code="${escAttr(courseCode)}" data-sid="${section.sectionId}"`;
  const clashClass = isPicked && mark && (mark.classClash || mark.examClash) ? 'routine-section--clash' : '';
  return `
    <button type="button" class="routine-section-row ${isPicked ? 'routine-section--picked' : ''} ${clashClass}" data-action="${action}" ${data}>
      <span class="routine-section-name">§ ${escHtml(section.sectionName || '—')}</span>
      <span class="routine-section-faculty" title="Faculty">${escHtml(section.facultyInitials || 'TBA')}</span>
      <span class="routine-section-schedule">${_formatSchedule(section)}</span>
      <span class="routine-section-room" title="Room">${escHtml(section.roomName || '—')}</span>
      <span class="routine-section-seats routine-seats--${seatClass}" title="Seats">${section.consumedSeat}/${section.capacity}</span>
      <span class="routine-section-exam" title="Mid · Final">${_formatExams(section)}</span>
      ${isPicked && mark && mark.classClash ? `<span class="routine-clash-pill" title="Class clash">CLASS ✕</span>` : ''}
      ${isPicked && mark && mark.examClash  ? `<span class="routine-clash-pill routine-clash-pill--exam" title="Exam clash">EXAM ✕</span>` : ''}
    </button>
  `;
}

function _formatSchedule(section) {
  if (!section.classSlots || section.classSlots.length === 0) return 'No schedule';
  const byDay = [...section.classSlots].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  return byDay.map(s => `${DAY_SHORT[s.day] || s.day.slice(0,3)} ${_min2hhmm(s.startMin)}–${_min2hhmm(s.endMin)}`).join(' · ');
}

function _formatExams(section) {
  const mid = section.midExam ? `M ${section.midExam.date}` : '';
  const fin = section.finalExam ? `F ${section.finalExam.date}` : '';
  return [mid, fin].filter(Boolean).join(' · ') || '—';
}

function _min2hhmm(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(mm).padStart(2,'0')} ${ampm}`;
}

function _ageLabel(fetchedAt) {
  if (!fetchedAt) return 'just now';
  const diff = Date.now() - fetchedAt;
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(fetchedAt).toLocaleString();
}

function _renderSuggestions() {
  const wrap = document.getElementById('routineSuggestions');
  // _suggestionsHTML escapes every interpolation via escHtml/escAttr.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  if (wrap) wrap.innerHTML = _suggestionsHTML();
}
