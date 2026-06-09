// ── js/ui/freeRoomsTab.js ─────────────────────────────────────────────────────
// Free Rooms tab. Reuses the live CONNECT feed (via connectFeedClient's 10-min
// cache) to answer "which rooms are empty on day D at time T", plus per-room
// free windows for the whole day. Pure availability logic lives in
// js/core/freeRooms.js; this file is the picker + rendering + wiring.

import { fetchConnectFeed, clearConnectFeedCache } from '../core/connectFeedClient.js';
import {
  buildRoomBusyIndex,
  freeRoomsAt,
  freeWindowsForRoom,
  CAMPUS_START_MIN,
  CAMPUS_END_MIN,
} from '../core/freeRooms.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

const DAY_ORDER = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const DAY_SHORT = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };
// Date.getDay() (0=Sun..6=Sat) -> canonical day name.
const WEEKDAY_BY_INDEX = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

function _clampMinute(m) {
  return Math.max(CAMPUS_START_MIN, Math.min(CAMPUS_END_MIN - 1, m));
}
function _nowMinute() {
  const d = new Date();
  return _clampMinute(d.getHours() * 60 + d.getMinutes());
}

const _store = {
  loading: false,
  error: null,
  source: null,
  fetchedAt: 0,
  index: null,                 // Map<room, BusyInterval[]>
  day: WEEKDAY_BY_INDEX[new Date().getDay()],
  minute: _nowMinute(),
  selectedRoom: null,
};

// ── ACTIONS ─────────────────────────────────────────────────────────────────
registerAction('freerooms:refresh',    () => _refresh(true));
registerAction('freerooms:clearCache', () => { clearConnectFeedCache(); _refresh(true); });
registerAction('freerooms:setDay',     (el) => { _store.day = el.dataset.day || _store.day; _store.selectedRoom = null; _rerender(); });
registerAction('freerooms:now',        () => { _store.day = WEEKDAY_BY_INDEX[new Date().getDay()]; _store.minute = _nowMinute(); _store.selectedRoom = null; _rerender(); });
registerAction('freerooms:selectRoom', (el) => {
  const r = el.dataset.room || '';
  _store.selectedRoom = _store.selectedRoom === r ? null : r;
  _rerender();
});

// ── DATA ──────────────────────────────────────────────────────────────────
async function _refresh(force = false) {
  _store.loading = true;
  _store.error = null;
  _rerender();
  try {
    const result = await fetchConnectFeed(force ? { forceRefresh: true } : {});
    _store.index = buildRoomBusyIndex(result.sections);
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
export async function renderFreeRoomsTab() {
  const root = document.getElementById('freeRoomsContent');
  if (!root) return;
  if (!_store.index && !_store.loading && !_store.error) { _refresh(false); return; }
  _rerender();
}

function _rerender() {
  const root = document.getElementById('freeRoomsContent');
  if (!root) return;
  // Every interpolation goes through escHtml/escAttr.
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = _html();
  _attachHandlers();
}

function _attachHandlers() {
  const time = document.getElementById('freeRoomsTime');
  if (time) {
    time.addEventListener('input', (ev) => {
      const m = _parseTime(ev.target.value);
      if (m !== null) { _store.minute = _clampMinute(m); _store.selectedRoom = null; _renderResults(); }
    });
  }
}

function _html() {
  if (_store.loading && !_store.index) return _loadingHTML();
  if (_store.error && !_store.index)   return _errorHTML();
  return _mainHTML();
}

function _loadingHTML() {
  return `
    <div class="freerooms-tab">
      <div class="routine-skeleton" aria-hidden="true">
        <div class="rsk rsk-header"></div>
        <div class="rsk rsk-picker"></div>
        <div class="rsk rsk-block"></div>
      </div>
      <div class="routine-loading-note">Fetching live section data from CONNECT…</div>
    </div>`;
}

function _errorHTML() {
  return `
    <div class="freerooms-tab">
      <div class="routine-error">
        <h3>Couldn't reach the Connect feed</h3>
        <p>${escHtml(_store.error || 'Unknown error.')}</p>
        <button class="btn-primary" data-action="freerooms:refresh">Try again</button>
      </div>
    </div>`;
}

function _mainHTML() {
  return `
    <div class="freerooms-tab">
      ${_headerHTML()}
      ${_controlsHTML()}
      <div id="freeRoomsResults">${_resultsHTML()}</div>
    </div>`;
}

function _headerHTML() {
  const sourceLabel = ({ live: 'Live', cache: 'Cached', fallback: 'Offline cache' })[_store.source] || '—';
  const age = _ageLabel(_store.fetchedAt);
  return `
    <div class="routine-header">
      <div class="routine-header-left">
        <h3>🚪 Free Rooms</h3>
        <span class="routine-source-badge routine-source--${_store.source || 'unknown'}" title="Source: ${escAttr(sourceLabel)} • Updated ${escAttr(age)}">
          ${escHtml(sourceLabel)} · ${escHtml(age)}
        </span>
      </div>
      <div class="routine-header-right">
        <button class="btn-secondary btn-sm" data-action="freerooms:refresh" title="Re-fetch from CONNECT now">↻ Refresh</button>
      </div>
    </div>`;
}

function _controlsHTML() {
  const dayChips = DAY_ORDER.map(d =>
    `<button class="freerooms-day ${d === _store.day ? 'is-active' : ''}" data-action="freerooms:setDay" data-day="${d}" aria-pressed="${d === _store.day ? 'true' : 'false'}">${escHtml(DAY_SHORT[d])}</button>`
  ).join('');
  return `
    <div class="freerooms-controls">
      <div class="freerooms-days" role="group" aria-label="Day">${dayChips}</div>
      <div class="freerooms-time-wrap">
        <label class="freerooms-time-label" for="freeRoomsTime">at</label>
        <input type="time" id="freeRoomsTime" class="freerooms-time" value="${escAttr(_hhmm24(_store.minute))}"
               min="${_hhmm24(CAMPUS_START_MIN)}" max="${_hhmm24(CAMPUS_END_MIN - 1)}" />
        <button class="btn-secondary btn-sm" data-action="freerooms:now" title="Jump to right now">Now</button>
      </div>
    </div>`;
}

function _resultsHTML() {
  if (!_store.index) return '';
  const free = freeRoomsAt(_store.index, _store.day, _store.minute);
  const when = `${DAY_SHORT[_store.day]} ${_min2hhmm(_store.minute)}`;
  if (free.length === 0) {
    return `<div class="freerooms-empty">No rooms are free at ${escHtml(when)}.</div>`;
  }
  const cards = free.map(room => _roomCardHTML(room)).join('');
  return `
    <div class="freerooms-summary">${free.length} room${free.length === 1 ? '' : 's'} free · ${escHtml(when)}</div>
    <div class="freerooms-grid">${cards}</div>
    ${_store.selectedRoom ? _roomDetailHTML(_store.selectedRoom) : ''}`;
}

function _renderResults() {
  const el = document.getElementById('freeRoomsResults');
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  if (el) el.innerHTML = _resultsHTML();
}

function _roomCardHTML(room) {
  const until = _freeUntil(room);
  const untilLabel = until === null ? ''
    : until >= CAMPUS_END_MIN ? 'free rest of day'
    : `free until ${_min2hhmm(until)}`;
  const active = _store.selectedRoom === room;
  return `
    <button type="button" class="freerooms-card ${active ? 'is-active' : ''}" data-action="freerooms:selectRoom" data-room="${escAttr(room)}" aria-pressed="${active ? 'true' : 'false'}">
      <span class="freerooms-card-room">${escHtml(room)}</span>
      <span class="freerooms-card-until">${escHtml(untilLabel)}</span>
    </button>`;
}

function _roomDetailHTML(room) {
  const windows = freeWindowsForRoom(_store.index, room, _store.day);
  const rows = windows.length === 0
    ? `<div class="freerooms-empty">Busy all day.</div>`
    : windows.map(w => `<li>${escHtml(_min2hhmm(w.startMin))} – ${escHtml(_min2hhmm(w.endMin))}</li>`).join('');
  return `
    <div class="freerooms-detail">
      <div class="freerooms-detail-head">Free windows · ${escHtml(room)} · ${escHtml(DAY_SHORT[_store.day])}</div>
      <ul class="freerooms-windows">${rows}</ul>
    </div>`;
}

// Minute the room's current free window ends at, or null if not free now.
function _freeUntil(room) {
  const windows = freeWindowsForRoom(_store.index, room, _store.day);
  const w = windows.find(x => _store.minute >= x.startMin && _store.minute < x.endMin);
  return w ? w.endMin : null;
}

// ── TIME HELPERS ──────────────────────────────────────────────────────────
function _parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(min) ? min : null;
}
function _hhmm24(min) {
  const h = Math.floor(min / 60), mm = min % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function _min2hhmm(min) {
  const h = Math.floor(min / 60), mm = min % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(mm).padStart(2, '0')} ${ampm}`;
}
function _ageLabel(fetchedAt) {
  if (!fetchedAt) return 'just now';
  const diff = Date.now() - fetchedAt;
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(fetchedAt).toLocaleString();
}
