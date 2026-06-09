// ── js/ui/seatsTab.js ─────────────────────────────────────────────────────────
// Seat Status tab. Reuses the live BRACU CONNECT feed (connectFeedClient,
// 10-min cache → cache → offline fallback) and answers the registration-week
// question "is there a seat open in COURSE X right now?". Type a course code,
// see every matching section with live seats / faculty / room / schedule,
// sortable by section # or seats-left, with an "open seats only" filter. All
// seat math + search lives in the pure core module js/core/seatStatus.js; this
// file is just the renderer + wiring.
//
// Every top-level identifier here is SEATS_-/_seats-prefixed on purpose:
// build3.py concatenates every module into one scope, so a bare `const
// DAY_ORDER` would collide with routineTab.js's and take down the whole bundle
// (see the matching note in routineTab.js).

import { fetchConnectFeed, clearConnectFeedCache } from '../core/connectFeedClient.js';
import { indexByCourse } from '../core/connectFeed.js';
import { seatInfo, searchCourseSections } from '../core/seatStatus.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

// Cap on rendered course groups so a 1-letter query doesn't paint the whole
// catalog; a note tells the student when results were trimmed.
const SEATS_RESULT_LIMIT = 40;

const SEATS_DAY_ORDER = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const SEATS_DAY_SHORT = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };

const _seats = {
  loading: false,
  error: null,
  source: null,        // 'live' | 'cache' | 'fallback'
  fetchedAt: 0,
  index: null,         // Map<courseCode, NormalizedSection[]>
  query: '',
  sortMode: 'section', // 'section' | 'seats'
  availableOnly: false,
};

registerAction('seats:refresh',         () => _seatsRefresh(true));
registerAction('seats:clearCache',      () => { clearConnectFeedCache(); _seatsRefresh(true); });
registerAction('seats:sortSection',     () => { _seats.sortMode = 'section'; _seatsRender(); });
registerAction('seats:sortSeats',       () => { _seats.sortMode = 'seats'; _seatsRender(); });
registerAction('seats:toggleAvailable', () => { _seats.availableOnly = !_seats.availableOnly; _seatsRender(); });

// ── DATA LOADING ────────────────────────────────────────────────────────────
async function _seatsRefresh(force = false) {
  _seats.loading = true;
  _seats.error = null;
  _seatsRender();
  try {
    const result = await fetchConnectFeed(force ? { forceRefresh: true } : {});
    _seats.index = indexByCourse(result.sections);
    _seats.source = result.source;
    _seats.fetchedAt = result.fetchedAt;
  } catch (e) {
    _seats.error = e && e.message ? e.message : 'Failed to load Connect feed.';
  } finally {
    _seats.loading = false;
    _seatsRender();
  }
}

// ── ENTRY ─────────────────────────────────────────────────────────────────────
export function renderSeatsTab() {
  if (!_seats.index && !_seats.loading && !_seats.error) {
    _seatsRefresh(); // fire-and-forget; _seatsRefresh repaints on settle
    return;
  }
  _seatsRender();
}

function _seatsRender() {
  const root = document.getElementById('seatsContent');
  if (!root) return;
  root.innerHTML = _seatsShellHTML();
  _seatsAttachInput();
}

function _seatsAttachInput() {
  const input = document.getElementById('seatsCourseInput');
  if (!input) return;
  // Keep the live value across repaints, and the caret where the student left it.
  input.value = _seats.query;
  input.addEventListener('input', (ev) => {
    _seats.query = (ev.target.value || '').toUpperCase();
    _seatsPaintResults();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && _seats.query) {
      _seats.query = '';
      input.value = '';
      _seatsPaintResults();
    }
  });
}

// Repaint only the results list — leaves the search box (and its focus/caret)
// untouched while the student types.
function _seatsPaintResults() {
  const el = document.getElementById('seatsResults');
  if (!el) return;
  el.innerHTML = _seatsResultsInner();
}

// ── HTML ────────────────────────────────────────────────────────────────────
function _seatsShellHTML() {
  if (_seats.loading && !_seats.index) return _seatsLoadingHTML();
  if (_seats.error  && !_seats.index) return _seatsErrorHTML();
  return _seatsMainHTML();
}

function _seatsLoadingHTML() {
  return `
    <div class="seats-tab">
      <div class="seats-skeleton" aria-hidden="true">
        <div class="ssk ssk-header"></div>
        <div class="ssk ssk-search"></div>
        <div class="ssk ssk-row"></div>
        <div class="ssk ssk-row"></div>
      </div>
      <div class="seats-loading-note">Fetching live section data from CONNECT…</div>
    </div>
  `;
}

function _seatsErrorHTML() {
  return `
    <div class="seats-tab">
      <div class="seats-error">
        <h3>Couldn't reach the Connect feed</h3>
        <p>${escHtml(_seats.error || 'Unknown error.')}</p>
        <button class="btn-primary" data-action="seats:refresh">Try again</button>
      </div>
    </div>
  `;
}

function _seatsMainHTML() {
  const sourceLabel = ({ live: 'Live', cache: 'Cached', fallback: 'Offline cache' })[_seats.source] || '—';
  const sourceClass = `seats-source--${_seats.source || 'unknown'}`;
  const age = _seatsAgeLabel(_seats.fetchedAt);
  return `
    <div class="seats-tab">
      <div class="seats-header">
        <div class="seats-header-left">
          <h3>🪑 Seat Status</h3>
          <span class="seats-source-badge ${sourceClass}" title="Source: ${escAttr(sourceLabel)} • Updated ${escAttr(age)}">
            ${escHtml(sourceLabel)} · ${escHtml(age)}
          </span>
        </div>
        <div class="seats-header-right">
          <button class="btn-secondary btn-sm" data-action="seats:refresh" title="Re-fetch from CONNECT now">↻ Refresh</button>
        </div>
      </div>

      <div class="seats-searchbar">
        <input
          id="seatsCourseInput"
          type="text"
          class="seats-search-input"
          placeholder="Search a course code, e.g. CSE220"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search a course code to check seat availability"
        />
      </div>

      <div class="seats-controls">
        <div class="seats-sort" role="group" aria-label="Sort sections">
          <span class="seats-sort-label">Sort</span>
          <button class="seats-chip ${_seats.sortMode === 'section' ? 'is-active' : ''}" data-action="seats:sortSection" aria-pressed="${_seats.sortMode === 'section'}">Section #</button>
          <button class="seats-chip ${_seats.sortMode === 'seats' ? 'is-active' : ''}" data-action="seats:sortSeats" aria-pressed="${_seats.sortMode === 'seats'}">Seats left</button>
        </div>
        <button class="seats-chip seats-chip--filter ${_seats.availableOnly ? 'is-active' : ''}" data-action="seats:toggleAvailable" aria-pressed="${_seats.availableOnly}" title="Hide sections with no seats left">Open seats only</button>
      </div>

      <div id="seatsResults" class="seats-results">${_seatsResultsInner()}</div>
    </div>
  `;
}

function _seatsResultsInner() {
  if (!_seats.index) return '';
  const q = _seats.query.trim();
  if (q === '') {
    return `<div class="seats-empty">Type a course code above to check live seat availability.</div>`;
  }
  const all = searchCourseSections(_seats.index, q, {
    availableOnly: _seats.availableOnly,
    sort: _seats.sortMode,
  });
  if (all.length === 0) {
    const extra = _seats.availableOnly ? ' with open seats' : '';
    return `<div class="seats-empty">No course matches “${escHtml(q)}”${extra}.</div>`;
  }
  const groups = all.slice(0, SEATS_RESULT_LIMIT);
  const trimmedNote = all.length > groups.length
    ? `<div class="seats-trimmed-note">Showing the first ${groups.length} of ${all.length} matching courses — keep typing to narrow.</div>`
    : '';
  return trimmedNote + groups.map(_seatsGroupHTML).join('');
}

function _seatsGroupHTML(group) {
  const s = group.summary;
  const openText = s.openSections === 0
    ? 'no open sections'
    : `${s.openSections} open · ${s.seatsLeft} seat${s.seatsLeft === 1 ? '' : 's'} left`;
  return `
    <div class="seats-course">
      <div class="seats-course-head">
        <span class="seats-course-code">${escHtml(group.courseCode)}</span>
        <span class="seats-course-name">${escHtml(group.courseName || '')}</span>
        <span class="seats-course-summary">${escHtml(`${s.totalSections} section${s.totalSections === 1 ? '' : 's'} · ${openText}`)}</span>
      </div>
      <div class="seats-section-list">
        ${group.sections.map(_seatsSectionRowHTML).join('')}
      </div>
    </div>
  `;
}

function _seatsSectionRowHTML(section) {
  const info = seatInfo(section);
  const seatTitle = info.status === 'full'
    ? 'Section full'
    : `${info.taken}/${info.capacity} seats taken · ${info.left} left`;
  return `
    <div class="seats-section-row seats-row--${info.status}">
      <span class="seats-section-name">§ ${escHtml(section.sectionName || '—')}</span>
      <span class="seats-section-faculty" title="Faculty">${escHtml(section.facultyInitials || 'TBA')}</span>
      <span class="seats-section-schedule">${escHtml(_seatsFormatSchedule(section))}</span>
      <span class="seats-section-room" title="Room">${escHtml(section.roomName || '—')}</span>
      <span class="seats-section-seats seats-seats--${info.status}" title="${escAttr(seatTitle)}">${escHtml(_seatsText(info))}</span>
    </div>
  `;
}

// ── FORMATTERS ────────────────────────────────────────────────────────────────
function _seatsText(info) {
  if (info.status === 'full') return 'FULL';
  if (info.status === 'tight') return `${info.left} left`;
  return `${info.taken}/${info.capacity}`;
}

function _seatsFormatSchedule(section) {
  if (!section.classSlots || section.classSlots.length === 0) return 'No schedule';
  const byDay = [...section.classSlots].sort((a, b) => SEATS_DAY_ORDER.indexOf(a.day) - SEATS_DAY_ORDER.indexOf(b.day));
  return byDay.map(s => `${SEATS_DAY_SHORT[s.day] || s.day.slice(0, 3)} ${_seatsMin2hhmm(s.startMin)}–${_seatsMin2hhmm(s.endMin)}`).join(' · ');
}

function _seatsMin2hhmm(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function _seatsAgeLabel(fetchedAt) {
  if (!fetchedAt) return 'just now';
  const diff = Date.now() - fetchedAt;
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(fetchedAt).toLocaleString();
}
