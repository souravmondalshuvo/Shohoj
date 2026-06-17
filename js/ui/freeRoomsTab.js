// ── js/ui/freeRoomsTab.js ─────────────────────────────────────────────────────
// Free Rooms tab. Reuses the live CONNECT feed (via connectFeedClient's 10-min
// cache) to answer "which rooms are empty on day D at time T", plus per-room
// free windows for the whole day. Pure availability logic lives in
// js/core/freeRooms.js; this file is the picker + rendering + wiring.

import { fetchConnectFeed, clearConnectFeedCache } from '../core/connectFeedClient.js';
import {
  buildRoomBusyIndex,
  busyOnDay,
  listAllRooms,
  occupantAt,
  freeRoomsAt,
  freeWindowsForRoom,
  CAMPUS_START_MIN,
  CAMPUS_END_MIN,
} from '../core/freeRooms.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';
import { onFeedUpdate, broadcastFeedResult } from './feedLive.js';
import { openModal } from './modal.js';

const FR_DAY_ORDER = ['SATURDAY','SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const FR_DAY_SHORT = { SATURDAY:'Sat', SUNDAY:'Sun', MONDAY:'Mon', TUESDAY:'Tue', WEDNESDAY:'Wed', THURSDAY:'Thu', FRIDAY:'Fri' };
// Date.getDay() (0=Sun..6=Sat) -> canonical day name.
const FR_WEEKDAY_BY_INDEX = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

// Room type from the code's trailing letter: C=Classroom, L=Lab, T=Tutorial.
const FR_ROOM_TYPES = { C: 'Classroom', L: 'Lab', T: 'Tutorial' };
const FR_TYPE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'C', label: 'Class' },
  { key: 'L', label: 'Lab' },
  { key: 'T', label: 'Tutorial' },
];
function _frRoomTypeKey(room) {
  const last = room.trim().slice(-1).toUpperCase();
  return FR_ROOM_TYPES[last] ? last : 'C';
}
function _frRoomTypeLabel(room) {
  return FR_ROOM_TYPES[_frRoomTypeKey(room)];
}

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
  showAll: false,              // false = free-only view, true = all-rooms board
  roomType: 'ALL',            // type filter (all-rooms view only)
};

// ── ACTIONS ─────────────────────────────────────────────────────────────────
registerAction('freerooms:refresh',    () => _frRefresh(true));
registerAction('freerooms:clearCache', () => { clearConnectFeedCache(); _frRefresh(true); });
registerAction('freerooms:setDay',     (el) => { _frStore.day = el.dataset.day || _frStore.day; _frRerender(); });
registerAction('freerooms:now',        () => { _frStore.day = FR_WEEKDAY_BY_INDEX[new Date().getDay()]; _frStore.minute = _frNowMinute(); _frRerender(); });
registerAction('freerooms:selectRoom', (el) => {
  const room = el.dataset.room || '';
  if (!_frStore.index || !room) return;
  openModal({ title: `📍 ${room} · weekly availability`, bodyHtml: _frRoomWeekHTML(room) });
});
registerAction('freerooms:setView', (el) => {
  _frStore.showAll = el.dataset.view === 'all';
  _frRerender();
});
registerAction('freerooms:setType', (el) => {
  _frStore.roomType = el.dataset.type || 'ALL';
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
    // One fetch serves every tab: let routine/seats repaint from this result
    // instead of going stale until their own next poll.
    broadcastFeedResult(result, _frApplyLiveFeed);
  } catch (e) {
    _frStore.error = e && e.message ? e.message : 'Failed to load Connect feed.';
  } finally {
    _frStore.loading = false;
    _frRerender();
  }
}

// Apply a live poll (or another tab's manual refresh) in place. Skips the
// repaint while the student is typing in the time field — the store is fresh
// either way, and the next interaction repaints from it.
function _frApplyLiveFeed(result) {
  if (_frStore.loading) return; // our own refresh is mid-flight; it will win
  _frStore.index = buildRoomBusyIndex(result.sections);
  _frStore.source = result.source;
  _frStore.fetchedAt = result.fetchedAt;
  const time = document.getElementById('freeRoomsTime');
  if (time && document.activeElement === time) return;
  _frRerender();
}

let _frLiveSubscribed = false;
function _frGoLive() {
  if (_frLiveSubscribed) return;
  _frLiveSubscribed = true;
  onFeedUpdate(_frApplyLiveFeed);
}

// ── RENDER ──────────────────────────────────────────────────────────────────
export async function renderFreeRoomsTab() {
  const root = document.getElementById('freeRoomsContent');
  if (!root) return;
  _frGoLive();
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
      if (m !== null) { _frStore.minute = _frClampMinute(m); _frRenderResults(); }
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
  const viewToggle = `
    <div class="freerooms-view" role="group" aria-label="View">
      <button class="freerooms-view-btn ${!_frStore.showAll ? 'is-active' : ''}" data-action="freerooms:setView" data-view="free" aria-pressed="${!_frStore.showAll}">Free only</button>
      <button class="freerooms-view-btn ${_frStore.showAll ? 'is-active' : ''}" data-action="freerooms:setView" data-view="all" aria-pressed="${_frStore.showAll}">All rooms</button>
    </div>`;
  const typeFilter = _frStore.showAll ? `
    <div class="freerooms-types" role="group" aria-label="Room type">
      ${FR_TYPE_FILTERS.map(t =>
        `<button class="freerooms-type ${_frStore.roomType === t.key ? 'is-active' : ''}" data-action="freerooms:setType" data-type="${t.key}" aria-pressed="${_frStore.roomType === t.key}">${escHtml(t.label)}</button>`
      ).join('')}
    </div>` : '';
  return `
    <div class="freerooms-controls">
      <div class="freerooms-days" role="group" aria-label="Day">${dayChips}</div>
      <div class="freerooms-time-wrap">
        <label class="freerooms-time-label" for="freeRoomsTime">at</label>
        <input type="time" id="freeRoomsTime" class="freerooms-time" value="${escAttr(_frHhmm24(_frStore.minute))}"
               min="${_frHhmm24(CAMPUS_START_MIN)}" max="${_frHhmm24(CAMPUS_END_MIN - 1)}" />
        <button class="btn-secondary btn-sm" data-action="freerooms:now" title="Jump to right now">Now</button>
      </div>
    </div>
    <div class="freerooms-controls freerooms-controls--view">
      ${viewToggle}
      ${typeFilter}
    </div>`;
}

function _frResultsHTML() {
  if (!_frStore.index) return '';
  return _frStore.showAll ? _frAllRoomsHTML() : _frFreeOnlyHTML();
}

function _frFreeOnlyHTML() {
  const free = freeRoomsAt(_frStore.index, _frStore.day, _frStore.minute);
  const when = `${FR_DAY_SHORT[_frStore.day]} ${_frMin2hhmm(_frStore.minute)}`;
  if (free.length === 0) {
    return `<div class="freerooms-empty">No rooms are free at ${escHtml(when)}.</div>`;
  }
  const cards = free.map(room => _frRoomCardHTML(room)).join('');
  return `
    <div class="freerooms-summary">${free.length} room${free.length === 1 ? '' : 's'} free · ${escHtml(when)}</div>
    <div class="freerooms-grid">${cards}</div>`;
}

function _frAllRoomsHTML() {
  const all = listAllRooms(_frStore.index);
  const rooms = _frStore.roomType === 'ALL'
    ? all
    : all.filter(r => _frRoomTypeKey(r) === _frStore.roomType);
  const when = `${FR_DAY_SHORT[_frStore.day]} ${_frMin2hhmm(_frStore.minute)}`;
  if (rooms.length === 0) {
    return `<div class="freerooms-empty">No rooms match this filter.</div>`;
  }
  const freeCount = rooms.filter(r => !occupantAt(_frStore.index, r, _frStore.day, _frStore.minute)).length;
  const cards = rooms.map(room => _frRoomCardHTML(room)).join('');
  return `
    <div class="freerooms-summary">${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${freeCount} free · ${escHtml(when)}</div>
    <div class="freerooms-grid">${cards}</div>`;
}

function _frRenderResults() {
  const el = document.getElementById('freeRoomsResults');
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  if (el) el.innerHTML = _frResultsHTML();
}

function _frRoomCardHTML(room) {
  const occ = occupantAt(_frStore.index, room, _frStore.day, _frStore.minute);
  let stateClass, statusLabel;
  if (!occ) {
    const until = _frFreeUntil(room);
    stateClass = 'is-free';
    statusLabel = (until === null || until >= CAMPUS_END_MIN)
      ? 'free rest of day'
      : `free until ${_frMin2hhmm(until)}`;
  } else {
    stateClass = occ.kind === 'lab' ? 'is-lab' : 'is-class';
    const sec = occ.sectionName ? `${occ.courseCode} Section ${occ.sectionName}` : occ.courseCode;
    statusLabel = `${occ.kind === 'lab' ? 'in lab' : 'in class'} · ${sec} · until ${_frMin2hhmm(occ.endMin)}`;
  }
  return `
    <button type="button" class="freerooms-card ${stateClass}" data-action="freerooms:selectRoom" data-room="${escAttr(room)}" aria-haspopup="dialog" title="${escAttr(room)} — view weekly availability">
      <span class="freerooms-card-room">${escHtml(room)}<span class="freerooms-card-type">${escHtml(_frRoomTypeLabel(room))}</span></span>
      <span class="freerooms-card-until">${escHtml(statusLabel)}</span>
    </button>`;
}

// Chronological free + busy segments for one day, clamped to campus hours and
// sorted by start (free before busy when they touch at a boundary). Free windows
// are the merged complement; busy segments carry the occupying course/section.
function _frDayTimeline(room, day) {
  const free = freeWindowsForRoom(_frStore.index, room, day)
    .map(w => ({ startMin: w.startMin, endMin: w.endMin, busy: false, label: 'free' }));
  const busy = busyOnDay(_frStore.index, room, day)
    .map(i => {
      const sec = i.sectionName ? `${i.courseCode} Section ${i.sectionName}` : i.courseCode;
      return {
        startMin: Math.max(i.startMin, CAMPUS_START_MIN),
        endMin: Math.min(i.endMin, CAMPUS_END_MIN),
        busy: true,
        lab: i.kind === 'lab',
        label: i.kind === 'lab' ? `${sec} · lab` : sec,
      };
    })
    .filter(s => s.endMin > s.startMin);
  return [...free, ...busy].sort((a, b) => (a.startMin - b.startMin) || (a.busy ? 1 : -1));
}

// Body HTML for the room's weekly-availability modal: a free/busy timeline per
// day, with the currently-selected day highlighted.
function _frRoomWeekHTML(room) {
  const rows = FR_DAY_ORDER.map(day => {
    const segs = _frDayTimeline(room, day);
    const active = day === _frStore.day;
    const segHtml = segs.length === 0
      ? `<li class="freerooms-seg freerooms-seg--none">No class data</li>`
      : segs.map(s => {
          const cls = !s.busy ? 'freerooms-seg--free' : (s.lab ? 'freerooms-seg--lab' : 'freerooms-seg--busy');
          return `<li class="freerooms-seg ${cls}">
             <span class="freerooms-seg-time">${escHtml(_frMin2hhmm(s.startMin))} – ${escHtml(_frMin2hhmm(s.endMin))}</span>
             <span class="freerooms-seg-label">${escHtml(s.label)}</span>
           </li>`;
        }).join('');
    return `
      <div class="freerooms-day-row ${active ? 'is-active' : ''}">
        <div class="freerooms-day-name">${escHtml(FR_DAY_SHORT[day])}</div>
        <ul class="freerooms-day-segs">${segHtml}</ul>
      </div>`;
  }).join('');
  return `<div class="freerooms-week">${rows}</div>`;
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
