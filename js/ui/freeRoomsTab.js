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

const FR_DAY_ORDER = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const FR_DAY_SHORT = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };
// Date.getDay() (0=Sun..6=Sat) -> canonical day name.
const FR_WEEKDAY_BY_INDEX = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

function _frClampMinute(m) {
  return Math.max(CAMPUS_START_MIN, Math.min(CAMPUS_END_MIN - 1, m));
}
function _frNowMinute() {
  const d = new Date();
  return _frClampMinute(d.getHours() * 60 + d.getMinutes());
}

const _frStore = {
  loading: false,
  error: null,
  source: null,
  fetchedAt: 0,
  index: null,                 // Map<room, BusyInterval[]>
  day: FR_WEEKDAY_BY_INDEX[new Date().getDay()],
  minute: _frNowMinute(),
  selectedRoom: null,
};

// ── ACTIONS ─────────────────────────────────────────────────────────────────
registerAction('freerooms:refresh',    () => _frRefresh(true));
registerAction('freerooms:clearCache', () => { clearConnectFeedCache(); _frRefresh(true); });
registerAction('freerooms:setDay',     (el) => { _frStore.day = el.dataset.day || _frStore.day; _frStore.selectedRoom = null; _frRerender(); });
registerAction('freerooms:now',        () => { _frStore.day = FR_WEEKDAY_BY_INDEX[new Date().getDay()]; _frStore.minute = _frNowMinute(); _frStore.selectedRoom = null; _frRerender(); });
registerAction('freerooms:selectRoom', (el) => {
  const r = el.dataset.room || '';
  _frStore.selectedRoom = _frStore.selectedRoom === r ? null : r;
  _frRerender();
});

// ── DATA ──────────────────────────────────────────────────────────────────
async function _frRefresh(force = false) {
  _frStore.loading = true;
  _frStore.error = null;
  _frRerender();
  try {
    const result = await fetchConnectFeed(force ? { forceRefresh: true } : {});
    _frStore.index = buildRoomBusyIndex(result.sections);
    _frStore.source = result.source;
    _frStore.fetchedAt = result.fetchedAt;
  } catch (e) {
    _frStore.error = e && e.message ? e.message : 'Failed to load Connect feed.';
  } finally {
    _frStore.loading = false;
    _frRerender();
  }
}

// ── RENDER ──────────────────────────────────────────────────────────────────
export async function renderFreeRoomsTab() {
  const root = document.getElementById('freeRoomsContent');
  if (!root) return;
  if (!_frStore.index && !_frStore.loading && !_frStore.error) { _frRefresh(false); return; }
  _frRerender();
}

function _frRerender() {
  const root = document.getElementById('freeRoomsContent');
  if (!root) return;
  // Every interpolation goes through escHtml/escAttr.
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = _frHtml();
  _frAttachHandlers();
}

function _frAttachHandlers() {
  const time = document.getElementById('freeRoomsTime');
  if (time) {
    time.addEventListener('input', (ev) => {
      const m = _frParseTime(ev.target.value);
      if (m !== null) { _frStore.minute = _frClampMinute(m); _frStore.selectedRoom = null; _frRenderResults(); }
    });
  }
}

function _frHtml() {
  if (_frStore.loading && !_frStore.index) return _frLoadingHTML();
  if (_frStore.error && !_frStore.index)   return _frErrorHTML();
  return _frMainHTML();
}

function _frLoadingHTML() {
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

function _frErrorHTML() {
  return `
    <div class="freerooms-tab">
      <div class="routine-error">
        <h3>Couldn't reach the Connect feed</h3>
        <p>${escHtml(_frStore.error || 'Unknown error.')}</p>
        <button class="btn-primary" data-action="freerooms:refresh">Try again</button>
      </div>
    </div>`;
}

function _frMainHTML() {
  return `
    <div class="freerooms-tab">
      ${_frHeaderHTML()}
      ${_frControlsHTML()}
      <div id="freeRoomsResults">${_frResultsHTML()}</div>
    </div>`;
}

function _frHeaderHTML() {
  const sourceLabel = ({ live: 'Live', cache: 'Cached', fallback: 'Offline cache' })[_frStore.source] || '—';
  const age = _frAgeLabel(_frStore.fetchedAt);
  return `
    <div class="routine-header">
      <div class="routine-header-left">
        <h3>🚪 Free Rooms</h3>
        <span class="routine-source-badge routine-source--${_frStore.source || 'unknown'}" title="Source: ${escAttr(sourceLabel)} • Updated ${escAttr(age)}">
          ${escHtml(sourceLabel)} · ${escHtml(age)}
        </span>
      </div>
      <div class="routine-header-right">
        <button class="btn-secondary btn-sm" data-action="freerooms:refresh" title="Re-fetch from CONNECT now">↻ Refresh</button>
      </div>
    </div>`;
}

function _frControlsHTML() {
  const dayChips = FR_DAY_ORDER.map(d =>
    `<button class="freerooms-day ${d === _frStore.day ? 'is-active' : ''}" data-action="freerooms:setDay" data-day="${d}" aria-pressed="${d === _frStore.day ? 'true' : 'false'}">${escHtml(FR_DAY_SHORT[d])}</button>`
  ).join('');
  return `
    <div class="freerooms-controls">
      <div class="freerooms-days" role="group" aria-label="Day">${dayChips}</div>
      <div class="freerooms-time-wrap">
        <label class="freerooms-time-label" for="freeRoomsTime">at</label>
        <input type="time" id="freeRoomsTime" class="freerooms-time" value="${escAttr(_frHhmm24(_frStore.minute))}"
               min="${_frHhmm24(CAMPUS_START_MIN)}" max="${_frHhmm24(CAMPUS_END_MIN - 1)}" />
        <button class="btn-secondary btn-sm" data-action="freerooms:now" title="Jump to right now">Now</button>
      </div>
    </div>`;
}

function _frResultsHTML() {
  if (!_frStore.index) return '';
  const free = freeRoomsAt(_frStore.index, _frStore.day, _frStore.minute);
  const when = `${FR_DAY_SHORT[_frStore.day]} ${_frMin2hhmm(_frStore.minute)}`;
  if (free.length === 0) {
    return `<div class="freerooms-empty">No rooms are free at ${escHtml(when)}.</div>`;
  }
  const cards = free.map(room => _frRoomCardHTML(room)).join('');
  return `
    <div class="freerooms-summary">${free.length} room${free.length === 1 ? '' : 's'} free · ${escHtml(when)}</div>
    <div class="freerooms-grid">${cards}</div>
    ${_frStore.selectedRoom ? _frRoomDetailHTML(_frStore.selectedRoom) : ''}`;
}

function _frRenderResults() {
  const el = document.getElementById('freeRoomsResults');
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  if (el) el.innerHTML = _frResultsHTML();
}

function _frRoomCardHTML(room) {
  const until = _frFreeUntil(room);
  const untilLabel = until === null ? ''
    : until >= CAMPUS_END_MIN ? 'free rest of day'
    : `free until ${_frMin2hhmm(until)}`;
  const active = _frStore.selectedRoom === room;
  return `
    <button type="button" class="freerooms-card ${active ? 'is-active' : ''}" data-action="freerooms:selectRoom" data-room="${escAttr(room)}" aria-pressed="${active ? 'true' : 'false'}">
      <span class="freerooms-card-room">${escHtml(room)}</span>
      <span class="freerooms-card-until">${escHtml(untilLabel)}</span>
    </button>`;
}

function _frRoomDetailHTML(room) {
  const windows = freeWindowsForRoom(_frStore.index, room, _frStore.day);
  const rows = windows.length === 0
    ? `<div class="freerooms-empty">Busy all day.</div>`
    : windows.map(w => `<li>${escHtml(_frMin2hhmm(w.startMin))} – ${escHtml(_frMin2hhmm(w.endMin))}</li>`).join('');
  return `
    <div class="freerooms-detail">
      <div class="freerooms-detail-head">Free windows · ${escHtml(room)} · ${escHtml(FR_DAY_SHORT[_frStore.day])}</div>
      <ul class="freerooms-windows">${rows}</ul>
    </div>`;
}

// Minute the room's current free window ends at, or null if not free now.
function _frFreeUntil(room) {
  const windows = freeWindowsForRoom(_frStore.index, room, _frStore.day);
  const w = windows.find(x => _frStore.minute >= x.startMin && _frStore.minute < x.endMin);
  return w ? w.endMin : null;
}

// ── TIME HELPERS ──────────────────────────────────────────────────────────
function _frParseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(min) ? min : null;
}
function _frHhmm24(min) {
  const h = Math.floor(min / 60), mm = min % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function _frMin2hhmm(min) {
  const h = Math.floor(min / 60), mm = min % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(mm).padStart(2, '0')} ${ampm}`;
}
function _frAgeLabel(fetchedAt) {
  if (!fetchedAt) return 'just now';
  const diff = Date.now() - fetchedAt;
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(fetchedAt).toLocaleString();
}
