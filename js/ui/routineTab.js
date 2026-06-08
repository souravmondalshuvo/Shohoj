// ── js/ui/routineTab.js ───────────────────────────────────────────────────────
// Routine Builder tab. Pulls live BRACU CONNECT section data via the
// connectFeedClient (10-min cache), lets the student pick courses + sections,
// and flags class/exam clashes in real time. Weekly grid + auto-suggest land
// in a follow-up PR; this iteration ships the picker + section rows + clash
// highlighting + a source/age badge that's honest about freshness.

import { fetchConnectFeed, clearConnectFeedCache } from '../core/connectFeedClient.js';
import { indexByCourse, hasClassClash, hasExamClash } from '../core/connectFeed.js';
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
  encodeRoutinePicks,
  decodeRoutinePicks,
} from '../core/routineState.js';
import { computeGridLayout } from '../core/routineGrid.js';
import {
  buildFacultyRatingMap,
  getRatingForSection,
  formatRatingScore,
} from '../core/routineFaculty.js';
import { fetchRecentReviews, aggregateByFaculty } from '../core/reviews.js';
import { suggestCombinations } from '../core/routineSuggestions.js';
import { resolvePlanImport, summarizePlanImport } from '../core/routinePlannerImport.js';
import { buildExportPlan, paintExportPlan, exportFileName } from '../core/routineExport.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

// Named ROUTINE_STORAGE_KEY (not STORAGE_KEY) to avoid colliding with
// js/core/state.js's STORAGE_KEY once build3.py concatenates every module
// into a single scope — a duplicate top-level `const` is a hard parse error
// that takes down the whole bundle.
const ROUTINE_STORAGE_KEY = 'shohoj_routine_v1';
const DAY_ORDER   = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const DAY_SHORT   = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };
// Date.getDay() (0=Sun..6=Sat) -> canonical day name, for the "today" marker.
const WEEKDAY_BY_INDEX = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
// Grid row height in px; one row = layout.rowMinutes. Kept in one place so the
// grid template and the current-time line agree.
const ROW_PX = 14;

const _store = {
  loading: false,
  error: null,
  source: null,        // 'live' | 'cache' | 'fallback'
  fetchedAt: 0,
  index: null,         // Map<courseCode, NormalizedSection[]>
  courseCodes: [],
  routine: _restoreRoutine(),
  query: '',
  ratingMap: new Map(), // initials -> FacultyRating (built from reviews)
  ratingLoaded: false,
  suggestionsOpen: false,
  suggestionsResult: null, // SuggestionsResult or null
  planImportNote: '',      // last "Import from Planner" summary message
  sortMode: 'section',     // 'section' | 'faculty' | 'seats' | 'time'
  expanded: new Set(),     // courseCodes the user re-opened after picking a section
  hideClashing: false,     // hide (vs. dim) sections that clash with current picks
  shareNote: '',           // transient "link copied" feedback
  pendingShare: _captureSharePayload(), // ?routine=… from a shared link, applied once the feed loads
};

// Curated, well-separated hues for course blocks, ordered so consecutive
// courses land far apart on the wheel. Red (~0/360) is deliberately absent —
// it's reserved for clash highlighting.
const COURSE_HUES = [210, 160, 275, 40, 190, 320, 95, 250, 130, 300];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SORT_MODES = [
  ['section', 'Section #'],
  ['faculty', 'Faculty ★'],
  ['seats',   'Seats'],
  ['time',    'Earliest'],
];

// The Firestore hook caps at Math.min(n, 1000) (js/auth/firebase.js), so 1000
// is the real ceiling — asking for more just gets clamped.
const REVIEWS_FETCH_LIMIT = 1000;

// Cross-session cache for the aggregated faculty rating map. Faculty ratings
// move slowly, so a returning user within the TTL gets instant badges and pays
// zero Firestore reads. Mirrors the CONNECT-feed cache pattern.
const RATING_CACHE_KEY = 'shohoj_routine_ratings_v1';
const RATING_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function _restoreRoutine() {
  try {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
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
  try { localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(_store.routine)); }
  catch {}
}

// Read a `?routine=…` shared-link payload once at startup and strip it from the
// URL (keeping the hash) so a later refresh can't re-apply and clobber edits.
// The payload is held until the feed loads, then validated + applied.
function _captureSharePayload() {
  try {
    if (typeof location === 'undefined') return null;
    const params = new URLSearchParams(location.search);
    const raw = params.get('routine');
    if (!raw) return null;
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
    return raw;
  } catch { return null; }
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
registerAction('routine:importPlan',  () => _onImportPlan());
registerAction('routine:exportPng',   () => _onExportPng());
registerAction('routine:share',       () => _onShare());
registerAction('routine:suggest',     () => _onSuggest());
registerAction('routine:closeSuggest',() => { _store.suggestionsOpen = false; _store.suggestionsResult = null; _rerender(); });
registerAction('routine:applyCombo',  (el) => _onApplyCombo(Number(el.dataset.idx)));
registerAction('routine:setSort',     (el) => { _store.sortMode = el.dataset.sort || 'section'; _repaintControls(); _repaintList(); });
registerAction('routine:toggleExpand',(el) => _onToggleExpand(el.dataset.code));
registerAction('routine:toggleHideClash', () => { _store.hideClashing = !_store.hideClashing; _repaintControls(); _repaintList(); });

function _onRemoveCourse(code)         { const c = (code || '').toUpperCase(); _store.expanded.delete(c); _store.routine = unpickCourse(_store.routine, code); _persistRoutine(); _rerender(); }
// Picking a section folds the course down to its summary line so attention
// shifts to the courses still being decided. The user can re-open via "Change".
function _onPickSection(code, sid)     { _store.expanded.delete((code || '').toUpperCase()); _store.routine = pickSection(_store.routine, code, sid); _persistRoutine(); _rerender(); }
function _onUnpickSection(code)        { _store.routine = pickSection(_store.routine, code, null); _persistRoutine(); _rerender(); }
function _onToggleExpand(code) {
  const c = (code || '').toUpperCase();
  if (!c) return;
  if (_store.expanded.has(c)) _store.expanded.delete(c);
  else _store.expanded.add(c);
  _repaintList();
}
function _onClearAll()                 {
  _store.routine = clearRoutine(_store.routine);
  _store.suggestionsOpen = false; _store.suggestionsResult = null;
  _persistRoutine(); _rerender();
}
function _onAddCourseFromSuggest(code) {
  if (!code || !_store.index || !_store.index.has(code)) return;
  _store.routine = pickCourse(_store.routine, code);
  _store.query = '';
  const input = document.getElementById('routineCourseInput');
  if (input) input.value = '';
  _persistRoutine();
  _rerender();
}

function _onExportPng() {
  const routine = selectedSections(_store.routine, _store.index);
  const layout = computeGridLayout(routine);
  if (!layout) return;
  // Match the on-screen per-course palette: map sectionId -> course hue so the
  // exported PNG colors line up with the grid.
  const hueMap = _buildHueMap(layout.blocks);
  const sidHue = new Map();
  for (const b of layout.blocks) sidHue.set(b.sectionId, hueMap.get(b.courseCode));
  const plan = buildExportPlan(layout, {
    title: 'Shohoj — Weekly Routine',
    hueForSection: (sid) => sidHue.get(sid) ?? COURSE_HUES[0],
  });

  const scale = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(plan.width * scale);
  canvas.height = Math.round(plan.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  paintExportPlan(ctx, plan);

  let url;
  try { url = canvas.toDataURL('image/png'); }
  catch { return; } // tainted canvas etc. — nothing drawn from cross-origin here, but be safe
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Validate a decoded shared payload against the live feed and replace the
// current routine with it. Codes/sids that no longer exist are skipped; if
// nothing survives, the existing routine is left untouched.
function _applySharedRoutine(encoded) {
  if (!_store.index) return;
  const decoded = decodeRoutinePicks(encoded);
  let next = emptyRoutineState();
  for (const code of pickedCourseCodes(decoded)) {
    const list = _store.index.get(code);
    if (!list) continue;
    next = pickCourse(next, code);
    const sid = decoded.picks[code];
    if (sid != null && list.some(s => s.sectionId === sid)) {
      next = pickSection(next, code, sid);
    }
  }
  if (pickedCourseCodes(next).length === 0) return;
  _store.routine = next;
  _persistRoutine();
}

function _shareUrl() {
  const payload = encodeRoutinePicks(_store.routine);
  const base = (typeof location !== 'undefined') ? location.origin + location.pathname : '';
  return `${base}?routine=${encodeURIComponent(payload)}#calculator/routine`;
}

function _onShare() {
  if (pickedCourseCodes(_store.routine).length === 0) return;
  const url = _shareUrl();
  const flash = (msg) => {
    _store.shareNote = msg;
    _rerender();
    setTimeout(() => { _store.shareNote = ''; _rerender(); }, 2500);
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => flash('✓ Link copied'), () => _fallbackCopy(url, flash));
    } else {
      _fallbackCopy(url, flash);
    }
  } catch { _fallbackCopy(url, flash); }
}

// execCommand fallback for browsers without the async clipboard API.
function _fallbackCopy(text, flash) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    flash(ok ? '✓ Link copied' : 'Press Ctrl/⌘+C to copy');
  } catch { flash('Copy failed'); }
}

function _planCourses() {
  // Bridged from the Semester Planner tab (js/main.js sets this).
  try {
    return typeof window._shohoj_getPlanCourses === 'function'
      ? (window._shohoj_getPlanCourses() || [])
      : [];
  } catch { return []; }
}

function _onImportPlan() {
  if (!_store.index) return;
  const result = resolvePlanImport(
    _planCourses(),
    _store.index,
    pickedCourseCodes(_store.routine),
  );
  let next = _store.routine;
  for (const code of result.importable) {
    next = pickCourse(next, code);
  }
  _store.routine = next;
  _store.planImportNote = summarizePlanImport(result);
  _persistRoutine();
  _rerender();
}

function _onSuggest() {
  if (!_store.index) return;
  const codes = pickedCourseCodes(_store.routine);
  if (codes.length === 0) return;
  _store.suggestionsResult = suggestCombinations(codes, _store.index, _store.ratingMap);
  _store.suggestionsOpen = true;
  _rerender();
}

function _onApplyCombo(idx) {
  const result = _store.suggestionsResult;
  if (!result || !Number.isFinite(idx)) return;
  const combo = result.suggestions[idx];
  if (!combo) return;
  let next = _store.routine;
  for (const s of combo.sections) {
    next = pickSection(next, s.courseCode, s.sectionId);
  }
  _store.routine = next;
  _store.suggestionsOpen = false;
  _store.suggestionsResult = null;
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

  // Fetch the Connect feed and the review aggregation in parallel.
  // Reviews are best-effort: if they fail, the UI degrades to "no ratings"
  // rather than refusing to render the routine.
  const feedPromise = fetchConnectFeed(force ? { forceRefresh: true } : {});
  const reviewsPromise = _loadFacultyRatings(force);

  try {
    const result = await feedPromise;
    _store.index = indexByCourse(result.sections);
    _dataVersion++; // new section index ⇒ invalidate the clash memo
    _store.courseCodes = Array.from(_store.index.keys()).sort();
    _store.source = result.source;
    _store.fetchedAt = result.fetchedAt;
    // A shared link's picks are applied here — once we have the feed to
    // validate them against — and only on the first load that carries one.
    if (_store.pendingShare) {
      _applySharedRoutine(_store.pendingShare);
      _store.pendingShare = null;
    }
  } catch (e) {
    _store.error = e && e.message ? e.message : 'Failed to load Connect feed.';
  } finally {
    _store.loading = false;
    _rerender();
  }

  // Don't await reviews inside the loading block — once they arrive, just
  // rerender to surface the badges.
  reviewsPromise
    .then(() => { if (_store.index) _rerender(); })
    .catch(() => { /* silent — ratings stay unloaded */ });
}

async function _loadFacultyRatings(force) {
  if (_store.ratingLoaded && !force) return;
  // Cache hit (unless forced): instant badges, no Firestore read.
  if (!force) {
    const cached = _readRatingCache();
    if (cached) { _store.ratingMap = cached; _store.ratingLoaded = true; return; }
  }
  try {
    const reviews = await fetchRecentReviews(REVIEWS_FETCH_LIMIT);
    const aggregated = aggregateByFaculty(reviews || []);
    _store.ratingMap = buildFacultyRatingMap(aggregated);
    _store.ratingLoaded = true;
    _writeRatingCache(_store.ratingMap);
  } catch {
    // Leave ratingMap empty; UI will render sections without badges.
    _store.ratingLoaded = false;
  }
}

// FacultyRating entries are flat, JSON-safe objects ({ initials, overall,
// count, tier }), so we serialize the map as a list and rebuild it keyed by
// the same normalized initials buildFacultyRatingMap used.
function _readRatingCache() {
  try {
    const raw = localStorage.getItem(RATING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number' || !Array.isArray(parsed.entries)) return null;
    if (Date.now() - parsed.at > RATING_CACHE_TTL_MS) return null;
    const map = new Map();
    for (const e of parsed.entries) {
      if (e && typeof e.initials === 'string') map.set(e.initials, e);
    }
    return map.size > 0 ? map : null;
  } catch { return null; }
}

function _writeRatingCache(map) {
  try {
    const entries = Array.from(map.values());
    localStorage.setItem(RATING_CACHE_KEY, JSON.stringify({ at: Date.now(), entries }));
  } catch { /* quota / disabled storage — caching is best-effort */ }
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

// Full rebuild of the tab. Reserved for structural changes (data load,
// add/remove course, pick/unpick, apply combination) — anything that can add
// or remove whole regions. Sort/expand/hide-clash use the scoped repaints
// below so a single click doesn't tear down the grid and every section row.
function _rerender() {
  const root = document.getElementById('routineContent');
  if (!root) return;
  const scrollY = (typeof window !== 'undefined') ? window.scrollY : 0;
  // All interpolations in _html() go through escHtml/escAttr (same pattern as
  // papersTab.js, difficultyMap.js, etc.). Suppress the static-analysis warning.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = _html();
  _attachInputHandlers();
  // window.scrollTo clamps to max scroll, so a shorter page can't overscroll.
  if (typeof window !== 'undefined') window.scrollTo(0, scrollY);
}

// Repaint just the picked-course list (section rows, collapse state, candidate
// clashes, hidden-clash note). Leaves the grid, stats and picker untouched.
// Falls back to a full render if the list container isn't on the page yet
// (e.g. going from zero courses to one adds the region structurally).
function _repaintList() {
  const el = document.getElementById('routinePickedList');
  if (!el) { _rerender(); return; }
  const { picked, selected, clashMap } = _computeViewState();
  if (picked.length === 0) { _rerender(); return; }
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  el.innerHTML = _pickedListInner(picked, clashMap, selected);
}

// Repaint just the controls bar (stats chips + sort buttons + hide-clash
// toggle active state). Used alongside _repaintList for sort/hide changes.
function _repaintControls() {
  const el = document.getElementById('routineControls');
  if (!el) { _rerender(); return; }
  const { picked, summary, selected } = _computeViewState();
  if (picked.length === 0) { _rerender(); return; }
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  el.innerHTML = _controlsInner(picked, summary, selected);
}

function _html() {
  if (_store.loading && !_store.index) return _loadingHTML();
  if (_store.error  && !_store.index) return _errorHTML();
  return _mainHTML();
}

function _loadingHTML() {
  return `
    <div class="routine-tab">
      <div class="routine-skeleton" aria-hidden="true">
        <div class="rsk rsk-header"></div>
        <div class="rsk rsk-picker"></div>
        <div class="rsk rsk-block"></div>
        <div class="rsk rsk-block"></div>
      </div>
      <div class="routine-loading-note">Fetching live section data from CONNECT…</div>
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

// ── CLASH MEMO ──────────────────────────────────────────────────────────────
// Every derived value below (view state + per-section candidate clashes) is a
// pure function of the user's picks and the current section index. Those only
// change on structural actions (add/remove/pick/unpick/applyCombo/clear) and on
// feed refresh — never on a sort/expand/hide click. So we cache on a signature
// of (dataVersion + picks) and reuse it across display-only repaints.
let _dataVersion = 0;
let _memoKey = null;
let _memoView = null;
let _memoCandClash = new Map(); // sectionId -> { cls, exam, codes }

function _picksSignature() {
  const picks = _store.routine.picks;
  const parts = Object.keys(picks).sort().map(k => `${k}:${picks[k]}`);
  return `${_dataVersion}|${parts.join(',')}`;
}

// Invalidate the memo whenever the signature changes. Cheap to call often.
function _ensureMemo() {
  const sig = _picksSignature();
  if (sig !== _memoKey) {
    _memoKey = sig;
    _memoView = null;
    _memoCandClash = new Map();
  }
}

// Shared per-render view state. Centralised so the scoped repaints
// (_repaintList / _repaintControls) derive from exactly the same data as a
// full render. Memoized: recomputed only when picks/index change.
function _computeViewState() {
  _ensureMemo();
  if (_memoView) return _memoView;
  const summary = summarizeRoutine(_store.routine, _store.index);
  const picked  = pickedCourseCodes(_store.routine);
  const selected = selectedSections(_store.routine, _store.index);
  const clashMap = buildClashMap(selected);
  _memoView = { summary, picked, selected, clashMap };
  return _memoView;
}

function _mainHTML() {
  const { summary, picked, selected, clashMap } = _computeViewState();

  return `
    <div class="routine-tab">
      ${_headerHTML(summary)}
      ${_pickerHTML()}
      <div class="routine-suggestions" id="routineSuggestions">${_suggestionsHTML()}</div>
      ${picked.length > 0 ? _controlsHTML(picked, summary, selected) : ''}
      ${picked.length === 0 ? _emptyHTML() : _pickedListHTML(picked, clashMap, selected)}
      ${picked.length >= 1 ? _suggestionsToolbarHTML(picked.length) : ''}
      ${_store.suggestionsOpen ? _suggestionsPanelHTML() : ''}
      ${selected.length > 0 ? _gridHTML(selected, clashMap) : ''}
    </div>
  `;
}

// ── WEEKLY GRID ─────────────────────────────────────────────────────────────
function _gridHTML(routine, clashMap) {
  const layout = computeGridLayout(routine);
  if (!layout) return '';

  // CSS grid: 1 time-label column + N day columns; 1 header row + totalRows rows.
  const gridStyle = `grid-template-columns: 56px repeat(${layout.days.length}, minmax(0, 1fr)); grid-template-rows: 28px repeat(${layout.totalRows}, ${ROW_PX}px);`;

  const today = WEEKDAY_BY_INDEX[new Date().getDay()];
  const dayHeaders = layout.days.map((d, i) => {
    const isToday = d === today;
    return `
    <div class="routine-grid-day-header ${isToday ? 'routine-grid-day-header--today' : ''}" style="grid-column: ${i + 2}; grid-row: 1;">${escHtml(DAY_SHORT[d] || d.slice(0, 3))}</div>
  `;
  }).join('');

  // Time labels every 2 rows (= every hour).
  const timeLabels = [];
  for (let r = 0; r < layout.totalRows; r++) {
    const min = layout.startMin + r * layout.rowMinutes;
    if (min % 60 !== 0) continue;
    timeLabels.push(`<div class="routine-grid-time" style="grid-column: 1; grid-row: ${r + 2} / span ${Math.min(2, layout.totalRows - r)};">${_hourLabel(min)}</div>`);
  }

  // Background row separators so an empty grid still reads as a schedule.
  const rowSep = [];
  for (let r = 0; r < layout.totalRows; r++) {
    const min = layout.startMin + r * layout.rowMinutes;
    const cls = (min % 60 === 0) ? 'routine-grid-row routine-grid-row--hour' : 'routine-grid-row';
    rowSep.push(`<div class="${cls}" style="grid-column: 1 / -1; grid-row: ${r + 2};"></div>`);
  }

  const hueMap = _buildHueMap(layout.blocks);
  const blocks = layout.blocks.map(b => _gridBlockHTML(b, clashMap, hueMap)).join('');

  return `
    <div class="routine-grid-wrap">
      <div class="routine-grid-head">
        <div class="routine-grid-title">Weekly schedule</div>
        <button class="btn-secondary btn-sm" data-action="routine:exportPng" title="Download this schedule as a PNG image">⬇ Export PNG</button>
      </div>
      <div class="routine-grid" style="${gridStyle}">
        ${rowSep.join('')}
        ${dayHeaders}
        ${timeLabels.join('')}
        ${blocks}
        ${_nowLineHTML(layout)}
      </div>
    </div>
  `;
}

// Thin line across the day columns at the current local time. Returns '' when
// "now" falls outside the grid's displayed hours. The line sits on the right
// grid row and is nudged within that row by the sub-row fraction.
function _nowLineHTML(layout) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < layout.startMin || nowMin >= layout.endMin) return '';
  const rowsFromStart = (nowMin - layout.startMin) / layout.rowMinutes;
  const rowIndex = Math.floor(rowsFromStart);     // 0-based data row
  const frac = rowsFromStart - rowIndex;          // position within the row
  // Header is grid-row 1; data rows start at 2. Span day columns (skip labels).
  return `<div class="routine-grid-now" style="grid-column: 2 / -1; grid-row: ${rowIndex + 2}; transform: translateY(calc(${frac.toFixed(4)} * ${ROW_PX}px));" aria-hidden="true"></div>`;
}

function _gridBlockHTML(block, clashMap, hueMap) {
  const mark = clashMap.get(block.sectionId);
  const isClash = mark && (mark.classClash || mark.examClash);
  const hue = (hueMap && hueMap.get(block.courseCode)) ?? COURSE_HUES[0];
  // Overlapping blocks share a day column; tile them side-by-side at 1/N width
  // and offset by sub-column. --sub-x drives the X translate so the hover lift
  // (translateY) can compose with it instead of snapping the block back.
  const isSplit = block.subCols > 1;
  const styleParts = [
    `grid-column: ${block.dayCol + 2}`,
    `grid-row: ${block.gridRowStart + 1} / span ${block.gridRowSpan}`,
    `--routine-hue: ${hue}`,
  ];
  if (isSplit) {
    styleParts.push(`width: calc(100% / ${block.subCols})`);
    styleParts.push(`--sub-x: calc(100% * ${block.subCol})`);
  }
  const styles = styleParts.join('; ');
  const rating = _store.ratingLoaded
    ? getRatingForSection({ facultyInitials: block.facultyInitials }, _store.ratingMap)
    : null;
  const ratingBadge = (rating && rating.tier !== 'unknown')
    ? ` <span class="routine-grid-block-rating routine-faculty-badge--${rating.tier}">★ ${escHtml(formatRatingScore(rating.overall))}</span>`
    : '';
  const ratingTitle = rating && rating.tier !== 'unknown'
    ? ` — ★${formatRatingScore(rating.overall)} (${rating.count} review${rating.count === 1 ? '' : 's'})`
    : '';
  const title = `${block.courseCode} §${block.sectionName} — ${_min2hhmm(block.startMin)}–${_min2hhmm(block.endMin)} — ${block.facultyInitials || 'TBA'}${ratingTitle} — ${block.roomName || ''}`;
  return `
    <div class="routine-grid-block ${isClash ? 'routine-grid-block--clash' : ''} ${isSplit ? 'routine-grid-block--split' : ''}" style="${styles}" title="${escAttr(title)}">
      <div class="routine-grid-block-code">${escHtml(block.courseCode)}</div>
      <div class="routine-grid-block-meta">${escHtml(block.facultyInitials || 'TBA')}${ratingBadge} · §${escHtml(block.sectionName)}</div>
      <div class="routine-grid-block-time">${_min2hhmm(block.startMin)}–${_min2hhmm(block.endMin)}</div>
    </div>
  `;
}

// Build a courseCode -> hue map by walking the grid blocks in first-appearance
// order and assigning successive palette entries (cycling if there are more
// courses than colors). Per-course (not per-section) so every block of a course
// shares one stable, distinct color.
function _buildHueMap(blocks) {
  const map = new Map();
  let i = 0;
  for (const b of blocks) {
    if (!map.has(b.courseCode)) {
      map.set(b.courseCode, COURSE_HUES[i % COURSE_HUES.length]);
      i++;
    }
  }
  return map;
}

function _hourLabel(min) {
  const h = Math.floor(min / 60);
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh} ${ampm}`;
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
        ${_store.shareNote
          ? `<span class="routine-share-note" role="status">${escHtml(_store.shareNote)}</span>`
          : ''}
        ${Object.keys(_store.routine.picks).length > 0
          ? `<button class="btn-secondary btn-sm" data-action="routine:share" title="Copy a shareable link to this routine">🔗 Share</button>`
          : ''}
        <button class="btn-secondary btn-sm" data-action="routine:refresh" title="Re-fetch from CONNECT now">↻ Refresh</button>
        ${Object.keys(_store.routine.picks).length > 0
          ? `<button class="btn-secondary btn-sm" data-action="routine:clearAll" title="Remove all picked courses">Clear</button>`
          : ''}
      </div>
    </div>
  `;
}

function _pickerHTML() {
  const planCount = _planCourses().length;
  const importBtn = planCount > 0
    ? `<button class="btn-secondary btn-sm" data-action="routine:importPlan" title="Add courses from your Semester Planner that are offered this semester">↧ Import from Planner (${planCount})</button>`
    : '';
  const note = _store.planImportNote
    ? `<div class="routine-plan-note">${escHtml(_store.planImportNote)}</div>`
    : '';
  return `
    <div class="routine-picker">
      <input type="text" id="routineCourseInput" class="routine-input"
             placeholder="Add course (e.g. CSE220) — start typing for matches"
             autocomplete="off" spellcheck="false" />
      <button class="btn-primary btn-sm" data-action="routine:addCourse">Add</button>
      ${importBtn}
    </div>
    ${note}
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

// ── CONTROLS: status bar + sort + clash filter ──────────────────────────────
function _controlsHTML(picked, summary, selected) {
  return `
    <div class="routine-controls" id="routineControls">${_controlsInner(picked, summary, selected)}</div>
  `;
}

function _controlsInner(picked, summary, selected) {
  const credits  = _plannedCredits(picked);
  const clashes  = summary.classClashPairs + summary.examClashPairs;
  const clashChip = clashes > 0
    ? `<span class="routine-stat routine-stat--clash" title="Class clashes: ${summary.classClashPairs}, exam clashes: ${summary.examClashPairs}">⚠ ${clashes} clash${clashes === 1 ? '' : 'es'}</span>`
    : `<span class="routine-stat routine-stat--ok">✓ no clashes</span>`;
  const sortBtns = SORT_MODES.map(([mode, label]) =>
    `<button class="routine-sort-btn ${_store.sortMode === mode ? 'is-active' : ''}" data-action="routine:setSort" data-sort="${mode}">${label}</button>`
  ).join('');
  // Hiding clashes only does anything once at least one section is resolved.
  const hideToggle = selected.length > 0
    ? `<button class="routine-chip-toggle ${_store.hideClashing ? 'is-active' : ''}" data-action="routine:toggleHideClash" title="Hide sections that clash with your current picks">${_store.hideClashing ? '◉ Hiding clashes' : '◯ Hide clashes'}</button>`
    : '';
  return `
      <div class="routine-stats">
        <span class="routine-stat">${picked.length} course${picked.length === 1 ? '' : 's'}</span>
        <span class="routine-stat">${credits} cr</span>
        <span class="routine-stat">${summary.resolvedCount}/${picked.length} set</span>
        ${clashChip}
      </div>
      <div class="routine-controls-right">
        ${hideToggle}
        <div class="routine-sort" role="group" aria-label="Sort sections">
          <span class="routine-sort-label">Sort</span>${sortBtns}
        </div>
      </div>
  `;
}

function _plannedCredits(picked) {
  let total = 0;
  for (const code of picked) {
    const list = _store.index.get(code) || [];
    if (list.length === 0) continue;
    const sid = _store.routine.picks[code];
    const sec = (sid != null && list.find(s => s.sectionId === sid)) || list[0];
    if (sec && Number.isFinite(sec.credits)) total += sec.credits;
  }
  return total;
}

function _pickedListHTML(picked, clashMap, selected) {
  return `<div class="routine-picked-list" id="routinePickedList">${_pickedListInner(picked, clashMap, selected)}</div>`;
}

function _pickedListInner(picked, clashMap, selected) {
  return picked.map(code => _courseBlockHTML(code, clashMap, selected)).join('');
}

function _courseBlockHTML(courseCode, clashMap, selected) {
  const sections = _store.index.get(courseCode) || [];
  const currentSid = _store.routine.picks[courseCode];
  const name = sections[0] ? sections[0].courseName : courseCode;
  const resolved = currentSid != null ? sections.find(s => s.sectionId === currentSid) : null;

  // A resolved course folds to a one-line summary unless re-opened via "Change".
  if (resolved && !_store.expanded.has(courseCode)) {
    return _collapsedCourseHTML(courseCode, name, resolved, clashMap.get(resolved.sectionId));
  }

  const rows = [];
  let hidden = 0;
  for (const s of _sortSections(sections)) {
    const isPicked = currentSid === s.sectionId;
    const cand = isPicked ? null : _candidateClash(s, courseCode, selected);
    if (_store.hideClashing && !isPicked && cand && (cand.cls || cand.exam)) { hidden++; continue; }
    rows.push(_sectionRowHTML(courseCode, s, isPicked, clashMap.get(s.sectionId), cand));
  }
  const body = rows.length > 0
    ? rows.join('')
    : `<div class="routine-section-empty">Every section clashes with your current picks.</div>`;
  const hiddenNote = hidden > 0
    ? `<div class="routine-section-hidden">${hidden} clashing section${hidden === 1 ? '' : 's'} hidden</div>`
    : '';
  const collapseBtn = resolved
    ? `<button class="routine-change-btn" data-action="routine:toggleExpand" data-code="${escAttr(courseCode)}">Collapse ▴</button>`
    : '';

  return `
    <div class="routine-course-block">
      <div class="routine-course-head">
        <div>
          <span class="routine-course-code">${escHtml(courseCode)}</span>
          <span class="routine-course-name">${escHtml(name)}</span>
        </div>
        <div class="routine-course-actions">
          ${collapseBtn}
          <button class="routine-remove-x" data-action="routine:removeCourse" data-code="${escAttr(courseCode)}" aria-label="Remove ${escAttr(courseCode)}">×</button>
        </div>
      </div>
      <div class="routine-section-list">
        ${_sectionHeadHTML()}
        ${body}
      </div>
      ${hiddenNote}
    </div>
  `;
}

function _collapsedCourseHTML(courseCode, name, section, mark) {
  const clash = mark && (mark.classClash || mark.examClash);
  const clashPill = clash
    ? `<span class="routine-clash-pill" title="This section clashes with another pick">⚠ clash</span>`
    : '';
  return `
    <div class="routine-course-block routine-course-block--collapsed ${clash ? 'routine-course-block--clash' : ''}">
      <div class="routine-course-head">
        <div class="routine-collapsed-main">
          <span class="routine-course-code">${escHtml(courseCode)}</span>
          <span class="routine-course-name">${escHtml(name)}</span>
          <span class="routine-collapsed-pick">
            <span class="routine-collapsed-sec">§ ${escHtml(section.sectionName || '—')}</span>
            <span class="routine-collapsed-fac">${escHtml(section.facultyInitials || 'TBA')}${_facultyBadgeHTML(section)}</span>
            <span class="routine-collapsed-sched">${_formatSchedule(section)}</span>
            ${clashPill}
          </span>
        </div>
        <div class="routine-course-actions">
          <button class="routine-change-btn" data-action="routine:toggleExpand" data-code="${escAttr(courseCode)}">Change ▾</button>
          <button class="routine-remove-x" data-action="routine:removeCourse" data-code="${escAttr(courseCode)}" aria-label="Remove ${escAttr(courseCode)}">×</button>
        </div>
      </div>
    </div>
  `;
}

function _sectionHeadHTML() {
  return `
    <div class="routine-section-head" aria-hidden="true">
      <span>Sec</span>
      <span>Faculty</span>
      <span>Schedule</span>
      <span>Room</span>
      <span>Seats</span>
      <span>Mid · Final</span>
    </div>
  `;
}

// Sort a course's sections by the active mode. Full sections always sink to the
// bottom (they can't be taken), and section number is the universal tie-break.
function _sortSections(sections) {
  const mode = _store.sortMode;
  const decorated = sections.map(s => ({ s, full: !!s.isFull, num: _sectionNum(s.sectionName) }));
  let primary;
  if (mode === 'faculty')   primary = (a, b) => _ratingValue(b.s) - _ratingValue(a.s);
  else if (mode === 'seats') primary = (a, b) => _seatsLeft(b.s) - _seatsLeft(a.s);
  else if (mode === 'time')  primary = (a, b) => _earliestStart(a.s) - _earliestStart(b.s);
  else                       primary = (a, b) => a.num - b.num;
  decorated.sort((a, b) => {
    if (a.full !== b.full) return a.full ? 1 : -1;
    const p = primary(a, b);
    if (p !== 0) return p;
    return a.num - b.num;
  });
  return decorated.map(d => d.s);
}

function _sectionNum(name) {
  const n = parseInt(name, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
function _seatsLeft(section) {
  return Math.max(0, (section.capacity || 0) - (section.consumedSeat || 0));
}
function _earliestStart(section) {
  if (!section.classSlots || section.classSlots.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...section.classSlots.map(s => s.startMin));
}
function _ratingValue(section) {
  if (!_store.ratingLoaded) return -1;
  const r = getRatingForSection(section, _store.ratingMap);
  return r && r.tier !== 'unknown' ? r.overall : -1;
}

// Does this (unpicked) section clash with any resolved pick from another course?
// Memoized per sectionId under the current picks signature — the result depends
// only on this section vs the selected picks of *other* courses, and a section's
// course is fixed, so sectionId is a sufficient key.
function _candidateClash(section, courseCode, selected) {
  _ensureMemo();
  const cached = _memoCandClash.get(section.sectionId);
  if (cached) return cached;
  let cls = false, exam = false;
  const codes = new Set();
  for (const other of selected) {
    if (other.courseCode === courseCode) continue;
    if (hasClassClash(section, other)) { cls = true; codes.add(other.courseCode); }
    if (hasExamClash(section, other))  { exam = true; codes.add(other.courseCode); }
  }
  const result = { cls, exam, codes: Array.from(codes) };
  _memoCandClash.set(section.sectionId, result);
  return result;
}

function _sectionRowHTML(courseCode, section, isPicked, mark, cand) {
  const seatPct = section.capacity > 0 ? (section.consumedSeat / section.capacity) : 0;
  const seatClass = section.isFull ? 'full' : (seatPct > 0.85 ? 'tight' : 'open');
  const action = isPicked ? 'routine:unpickSection' : 'routine:pickSection';
  const data = `data-code="${escAttr(courseCode)}" data-sid="${section.sectionId}"`;
  const pickedClash = isPicked && mark && (mark.classClash || mark.examClash);
  const candClash = !isPicked && cand && (cand.cls || cand.exam);
  const classes = [
    'routine-section-row',
    isPicked ? 'routine-section--picked' : '',
    pickedClash ? 'routine-section--clash' : '',
    candClash ? 'routine-section--candclash' : '',
  ].filter(Boolean).join(' ');
  const candTitle = candClash ? `Clashes with ${cand.codes.join(', ')}` : '';
  const seatTitle = section.isFull
    ? 'Section full'
    : `${section.consumedSeat}/${section.capacity} seats taken · ${_seatsLeft(section)} left`;
  return `
    <button type="button" class="${classes}" data-action="${action}" ${data}>
      <span class="routine-section-name">§ ${escHtml(section.sectionName || '—')}</span>
      <span class="routine-section-faculty" title="Faculty">${escHtml(section.facultyInitials || 'TBA')}${_facultyBadgeHTML(section)}</span>
      <span class="routine-section-schedule">${_formatSchedule(section)}</span>
      <span class="routine-section-room" title="Room">${escHtml(section.roomName || '—')}</span>
      <span class="routine-section-seats routine-seats--${seatClass}" title="${escAttr(seatTitle)}">${escHtml(_seatText(section))}</span>
      <span class="routine-section-exam" title="Mid · Final exam">${_formatExams(section)}</span>
      ${isPicked && mark && mark.classClash ? `<span class="routine-clash-pill" title="Class clash">CLASS ✕</span>` : ''}
      ${isPicked && mark && mark.examClash  ? `<span class="routine-clash-pill routine-clash-pill--exam" title="Exam clash">EXAM ✕</span>` : ''}
      ${candClash && cand.cls  ? `<span class="routine-clash-pill routine-clash-pill--cand" title="${escAttr(candTitle)}">clash</span>` : ''}
      ${candClash && cand.exam && !cand.cls ? `<span class="routine-clash-pill routine-clash-pill--cand routine-clash-pill--candexam" title="${escAttr(candTitle)}">exam</span>` : ''}
    </button>
  `;
}

function _facultyBadgeHTML(section) {
  if (!_store.ratingLoaded) return '';
  const r = getRatingForSection(section, _store.ratingMap);
  if (!r) return '';
  if (r.tier === 'unknown') return '';
  const score = formatRatingScore(r.overall);
  const title = r.tier === 'low-sample'
    ? `Low sample (${r.count} review${r.count === 1 ? '' : 's'})`
    : `Faculty rating ${score} from ${r.count} review${r.count === 1 ? '' : 's'}`;
  return ` <span class="routine-faculty-badge routine-faculty-badge--${r.tier}" title="${escAttr(title)}">★ ${escHtml(score)}</span>`;
}

function _formatSchedule(section) {
  if (!section.classSlots || section.classSlots.length === 0) return 'No schedule';
  const byDay = [...section.classSlots].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  return byDay.map(s => `${DAY_SHORT[s.day] || s.day.slice(0,3)} ${_min2hhmm(s.startMin)}–${_min2hhmm(s.endMin)}`).join(' · ');
}

function _formatExams(section) {
  const mid = section.midExam ? `Mid ${_examDate(section.midExam.date)}` : '';
  const fin = section.finalExam ? `Final ${_examDate(section.finalExam.date)}` : '';
  return [mid, fin].filter(Boolean).join(' · ') || 'No exam dates';
}

// "2026-07-26" -> "Jul 26". Parse the parts by hand so a Date timezone shift
// can't roll the day backward.
function _examDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return dateStr || '';
  return `${MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[3])}`;
}

// Seat count, made actionable: full sections say so, nearly-full sections show
// how many are left, the rest show taken/capacity.
function _seatText(section) {
  if (section.isFull) return 'FULL';
  const left = _seatsLeft(section);
  const pct = section.capacity > 0 ? section.consumedSeat / section.capacity : 0;
  if (pct > 0.85) return `${left} left`;
  return `${section.consumedSeat}/${section.capacity}`;
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

// ── SUGGESTIONS (PR 6) ──────────────────────────────────────────────────────
function _suggestionsToolbarHTML(pickedCount) {
  return `
    <div class="routine-suggest-toolbar">
      <button class="btn-primary btn-sm" data-action="routine:suggest" title="Find the best clash-free section combinations">
        ✨ Auto-suggest combinations
      </button>
      <span class="routine-suggest-hint">${pickedCount} course${pickedCount === 1 ? '' : 's'} picked</span>
    </div>
  `;
}

function _suggestionsPanelHTML() {
  const r = _store.suggestionsResult;
  if (!r) return '';
  const headerNote = [];
  if (r.skippedCourses.length > 0) {
    headerNote.push(`<span class="routine-suggest-warn">Skipped (no open sections): ${escHtml(r.skippedCourses.join(', '))}</span>`);
  }
  if (r.truncated) {
    headerNote.push(`<span class="routine-suggest-warn">⚠ Search truncated at ${r.enumerated} combos — too many to enumerate.</span>`);
  }
  if (r.suggestions.length === 0) {
    return `
      <div class="routine-suggest-panel">
        <div class="routine-suggest-panel-head">
          <h4>No clash-free combinations found</h4>
          <button class="routine-remove-x" data-action="routine:closeSuggest" aria-label="Close">×</button>
        </div>
        <div class="routine-suggest-empty">
          Try removing a course or relaxing your picker. Enumerated ${r.enumerated}, all had class clashes.
          ${headerNote.join(' ')}
        </div>
      </div>
    `;
  }
  return `
    <div class="routine-suggest-panel">
      <div class="routine-suggest-panel-head">
        <h4>Top ${r.suggestions.length} clash-free combination${r.suggestions.length === 1 ? '' : 's'}</h4>
        <div class="routine-suggest-meta">
          ${r.feasible} feasible of ${r.enumerated} enumerated
          ${headerNote.length ? '· ' + headerNote.join(' · ') : ''}
        </div>
        <button class="routine-remove-x" data-action="routine:closeSuggest" aria-label="Close">×</button>
      </div>
      <div class="routine-suggest-cards">
        ${r.suggestions.map((s, i) => _comboCardHTML(s, i)).join('')}
      </div>
    </div>
  `;
}

function _comboCardHTML(combo, idx) {
  const b = combo.breakdown;
  const rating = b.avgRating === null ? '—' : b.avgRating.toFixed(1);
  const ratingClass = b.avgRating === null ? 'unknown'
    : b.avgRating >= 4.3 ? 'excellent'
    : b.avgRating >= 3.7 ? 'good'
    : b.avgRating >= 3.0 ? 'mid'
    : b.avgRating >= 2.0 ? 'warn' : 'bad';
  const seatNotes = [];
  if (b.fullCount > 0)  seatNotes.push(`${b.fullCount} FULL`);
  if (b.tightCount > 0) seatNotes.push(`${b.tightCount} tight`);
  const examNote = b.examClashPairs > 0
    ? `<span class="routine-suggest-card-warn">⚠ ${b.examClashPairs} exam clash${b.examClashPairs === 1 ? '' : 'es'}</span>` : '';
  return `
    <div class="routine-suggest-card" data-idx="${idx}">
      <div class="routine-suggest-card-head">
        <span class="routine-suggest-card-rank">#${idx + 1}</span>
        <span class="routine-suggest-card-rating routine-faculty-badge--${ratingClass}" title="Average faculty rating">★ ${escHtml(rating)}</span>
        <span class="routine-suggest-card-score" title="Score">score ${combo.score.toFixed(1)}</span>
        ${seatNotes.length ? `<span class="routine-suggest-card-seats">${escHtml(seatNotes.join(' · '))}</span>` : ''}
        ${examNote}
      </div>
      <div class="routine-suggest-card-list">
        ${combo.sections.map(s => _comboSectionLineHTML(s)).join('')}
      </div>
      <div class="routine-suggest-card-actions">
        <button class="btn-primary btn-sm" data-action="routine:applyCombo" data-idx="${idx}">Apply this combination</button>
      </div>
    </div>
  `;
}

function _comboSectionLineHTML(section) {
  return `
    <div class="routine-suggest-line">
      <span class="routine-suggest-line-code">${escHtml(section.courseCode)}</span>
      <span class="routine-suggest-line-sec">§${escHtml(section.sectionName)}</span>
      <span class="routine-suggest-line-fac">${escHtml(section.facultyInitials || 'TBA')}</span>
      <span class="routine-suggest-line-sched">${_formatSchedule(section)}</span>
    </div>
  `;
}
