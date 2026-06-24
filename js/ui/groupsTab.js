// ── js/ui/groupsTab.js ────────────────────────────────────────────────────────
// Study Group Finder tab. BRACU students post a study group for a course, browse
// and filter open groups, join/leave, reach each other through a public contact
// link plus a member-only email roster, and report abuse. Theme-aware inline
// styles (same approach as js/ui/feedback.js); all Firestore access flows through
// the wrappers in js/core/studyGroups.js.

import {
  MODES, MODE_LABELS, MIN_CAPACITY, MAX_CAPACITY,
  validateGroupDraft, groupTimestampMs, summarizeMembers,
  createStudyGroup, fetchStudyGroups, fetchMyMemberships, fetchGroupMembers,
  joinStudyGroup, leaveStudyGroup, deleteStudyGroup, reportStudyGroup,
} from '../core/studyGroups.js';
import { escHtml, escAttr, confirmDestructive } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

registerAction('grp:signin',       () => window._shohoj_signIn?.());
registerAction('grp:refresh',      () => _load(true));
registerAction('grp:toggleCreate', () => { _gs.showCreate = !_gs.showCreate; _gs.createMsg = ''; _render(); });
registerAction('grp:createMode',   el => { _gs.createMode = el.dataset.mode; _render(); });
registerAction('grp:submit',       () => _submit());
registerAction('grp:courseFilter', el => { _gs.courseFilter = el.value; _renderList(); });
registerAction('grp:modeFilter',   el => { _gs.modeFilter = el.dataset.mode; _renderList(); });
registerAction('grp:join',         el => _join(el.dataset.id));
registerAction('grp:leave',        el => _leave(el.dataset.id));
registerAction('grp:delete',       el => _delete(el.dataset.id, el.dataset.label));
registerAction('grp:report',       el => _report(el.dataset.id, el.dataset.label));
registerAction('grp:toggleRoster', el => _toggleRoster(el.dataset.id));

// ── State ───────────────────────────────────────────────────────────────────
const _gs = {
  loading: false,
  loaded: false,
  groups: [],
  myGroupIds: new Set(),   // groupIds the current user has joined
  rosters: new Map(),      // groupId -> [member docs] (member-only, lazy)
  expanded: new Set(),     // groupIds whose roster panel is open
  courseFilter: '',
  modeFilter: 'all',
  showCreate: false,
  createMode: MODES[1],    // 'in-person'
  submitting: false,
  createMsg: '',
  createErr: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _isSignedIn() {
  return typeof window._shohoj_currentUid === 'function' && !!window._shohoj_currentUid();
}
function _currentUid() {
  return window._shohoj_currentUid?.() || null;
}
function _isAuthReady() {
  return typeof window._shohoj_isAuthReady === 'function' ? !!window._shohoj_isAuthReady() : true;
}

function _t() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark ? {
    border: 'rgba(46,204,113,0.22)', text: '#e8f0ea', text2: '#a8c4ad', text3: '#6a9070',
    inputBg: 'rgba(46,204,113,0.07)', accent: '#2ecc71', cardBg: 'rgba(46,204,113,0.04)',
    danger: '#e74c3c',
  } : {
    border: 'rgba(0,0,0,0.12)', text: '#0d2914', text2: '#2d5a3d', text3: '#5a8a6a',
    inputBg: 'rgba(46,204,113,0.05)', accent: '#27ae60', cardBg: 'rgba(46,204,113,0.03)',
    danger: '#e74c3c',
  };
}

// Single annotated innerHTML sink — all markup is escaped via escHtml/escAttr
// before reaching here, so the assignment is safe.
function _html(el, markup) {
  if (!el) return;
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  el.innerHTML = markup;
}

function _toast(msg) {
  if (typeof window._shohoj_showToast === 'function') window._shohoj_showToast(msg);
  else alert(msg);
}

function _timeAgo(g) {
  const ms = groupTimestampMs(g);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

// ── Data ────────────────────────────────────────────────────────────────────
async function _load(force = false) {
  if (_gs.loading) return;
  if (_gs.loaded && !force) { _render(); return; }
  _gs.loading = true;
  _render();
  try {
    const [groups, memberships] = await Promise.all([
      fetchStudyGroups(),
      fetchMyMemberships(),
    ]);
    _gs.groups = Array.isArray(groups) ? groups : [];
    _gs.myGroupIds = new Set((memberships || []).map(m => m.groupId).filter(Boolean));
    _gs.loaded = true;
  } catch (e) {
    _gs.groups = [];
  }
  _gs.loading = false;
  _render();
}

// ── Render: shell ─────────────────────────────────────────────────────────────
export function renderGroupsTab() {
  const root = document.getElementById('groupsContent');
  if (!root) return;
  if (!_isAuthReady()) {
    _html(root, _wrap(`<div style="text-align:center;padding:40px 0;color:${_t().text3};font-size:13px;">Loading…</div>`));
    return;
  }
  if (!_isSignedIn()) {
    _html(root, _signInPrompt());
    return;
  }
  if (!_gs.loaded && !_gs.loading) { _load(); return; }
  _render();
}

function _wrap(inner) {
  return `<div style="max-width:760px;margin:0 auto;">${inner}</div>`;
}

function _signInPrompt() {
  const t = _t();
  return _wrap(`
    <div style="text-align:center;padding:48px 16px;color:${t.text2};">
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:${t.text};margin-bottom:8px;">🧑‍🤝‍🧑 Study Group Finder</div>
      <p style="font-size:14px;line-height:1.6;margin:0 auto 18px;max-width:380px;">
        Sign in with your BRACU email to post a study group, find classmates for a course, and join open groups.
      </p>
      <button data-action="grp:signin" style="padding:10px 18px;border-radius:10px;border:none;background:${t.accent};color:#000;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Sign in with Google</button>
    </div>
  `);
}

function _render() {
  const root = document.getElementById('groupsContent');
  if (!root) return;
  if (!_isSignedIn()) { _html(root, _signInPrompt()); return; }
  const t = _t();
  _html(root, _wrap(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:${t.text};">🧑‍🤝‍🧑 Study Groups</div>
        <div style="font-size:12px;color:${t.text3};margin-top:2px;">Find classmates for a course, or post your own group.</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button data-action="grp:refresh" title="Refresh" style="padding:8px 12px;border-radius:9px;border:1px solid ${t.border};background:${t.inputBg};color:${t.text2};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">↻</button>
        <button data-action="grp:toggleCreate" style="padding:8px 14px;border-radius:9px;border:none;background:${t.accent};color:#000;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">${_gs.showCreate ? 'Close' : '+ Post a group'}</button>
      </div>
    </div>
    ${_gs.showCreate ? _createForm(t) : ''}
    ${_filters(t)}
    <div id="groupsList"></div>
  `));
  _renderList();
}

// ── Render: create form ───────────────────────────────────────────────────────
function _createForm(t) {
  const field = (label, inner) => `
    <label style="display:block;margin-bottom:10px;">
      <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${t.text3};margin-bottom:4px;">${label}</span>
      ${inner}
    </label>`;
  const inputStyle = `width:100%;padding:9px 11px;border-radius:9px;border:1px solid ${t.border};background:${t.inputBg};color:${t.text};font-size:14px;font-family:inherit;box-sizing:border-box;outline:none;`;
  const modePills = MODES.map(m => {
    const on = m === _gs.createMode;
    return `<button type="button" data-action="grp:createMode" data-mode="${escAttr(m)}" style="flex:1;padding:7px 0;font-size:12px;font-weight:700;border-radius:8px;border:1px solid ${on ? t.accent : t.border};background:${on ? t.accent : t.inputBg};color:${on ? '#000' : t.text2};cursor:pointer;font-family:inherit;">${escHtml(MODE_LABELS[m])}</button>`;
  }).join('');
  return `
    <div style="border:1px solid ${t.border};background:${t.cardBg};border-radius:12px;padding:16px;margin-bottom:16px;">
      ${field('Course code', `<input id="grpCourse" placeholder="e.g. CSE220" style="${inputStyle}" />`)}
      ${field('Group name', `<input id="grpTitle" maxlength="80" placeholder="e.g. Algorithms midterm grind" style="${inputStyle}" />`)}
      ${field('Description (optional)', `<textarea id="grpDesc" maxlength="500" placeholder="What you'll work on, who it's for…" style="${inputStyle}min-height:64px;resize:vertical;line-height:1.5;"></textarea>`)}
      ${field('Meeting mode', `<div style="display:flex;gap:6px;">${modePills}</div>`)}
      ${field('When / where (optional)', `<input id="grpSchedule" maxlength="120" placeholder="e.g. Sun & Tue, 4–6pm, Library 3rd floor" style="${inputStyle}" />`)}
      ${field('Contact link (group chat)', `<input id="grpContact" maxlength="300" placeholder="https://m.me/… or https://discord.gg/…" style="${inputStyle}" />`)}
      ${field(`Capacity (${MIN_CAPACITY}–${MAX_CAPACITY})`, `<input id="grpCapacity" type="number" min="${MIN_CAPACITY}" max="${MAX_CAPACITY}" value="6" style="${inputStyle}max-width:120px;" />`)}
      <button data-action="grp:submit" style="width:100%;margin-top:6px;padding:11px;border-radius:10px;border:none;background:${t.accent};color:#000;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;${_gs.submitting ? 'opacity:0.6;' : ''}">${_gs.submitting ? 'Posting…' : 'Post study group'}</button>
      ${_gs.createMsg ? `<div style="text-align:center;font-size:13px;margin-top:10px;color:${_gs.createErr ? t.danger : t.accent};">${escHtml(_gs.createMsg)}</div>` : ''}
    </div>`;
}

// ── Render: filters ───────────────────────────────────────────────────────────
function _filters(t) {
  const pills = ['all', ...MODES].map(m => {
    const on = m === _gs.modeFilter;
    const label = m === 'all' ? 'All' : MODE_LABELS[m];
    return `<button data-action="grp:modeFilter" data-mode="${escAttr(m)}" style="padding:5px 12px;font-size:12px;font-weight:700;border-radius:20px;border:1px solid ${on ? t.accent : t.border};background:${on ? t.accent : t.inputBg};color:${on ? '#000' : t.text2};cursor:pointer;font-family:inherit;">${escHtml(label)}</button>`;
  }).join('');
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
      <input data-action="grp:courseFilter" value="${escAttr(_gs.courseFilter)}" placeholder="Filter by course code…"
        style="flex:1;min-width:160px;padding:8px 11px;border-radius:9px;border:1px solid ${t.border};background:${t.inputBg};color:${t.text};font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;" />
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>
    </div>`;
}

// ── Render: list ──────────────────────────────────────────────────────────────
function _visibleGroups() {
  const q = _gs.courseFilter.trim().toUpperCase();
  return _gs.groups.filter(g => {
    if (_gs.modeFilter !== 'all' && g.mode !== _gs.modeFilter) return false;
    if (q && !String(g.courseCode || '').toUpperCase().includes(q)) return false;
    return true;
  });
}

function _renderList() {
  const el = document.getElementById('groupsList');
  if (!el) return;
  const t = _t();
  if (_gs.loading) {
    _html(el, `<div style="text-align:center;padding:32px 0;color:${t.text3};font-size:13px;">Loading study groups…</div>`);
    return;
  }
  const groups = _visibleGroups();
  if (groups.length === 0) {
    const msg = _gs.groups.length === 0
      ? 'No study groups yet. Be the first to post one!'
      : 'No groups match your filters.';
    _html(el, `<div style="text-align:center;padding:32px 0;color:${t.text3};font-size:13px;">${escHtml(msg)}</div>`);
    return;
  }
  const sorted = [...groups].sort((a, b) => groupTimestampMs(b) - groupTimestampMs(a));
  _html(el, sorted.map(g => _groupCard(g, t)).join(''));
}

function _groupCard(g, t) {
  const uid = _currentUid();
  const joined = _gs.myGroupIds.has(g.id);
  const isCreator = uid && g.creatorUid === uid;
  const roster = _gs.rosters.get(g.id);
  const count = (joined && Array.isArray(roster)) ? roster.length : null;
  const sum = summarizeMembers(count, g.capacity);

  const modeBadge = `<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${t.text3};border:1px solid ${t.border};border-radius:6px;padding:2px 7px;">${escHtml(MODE_LABELS[g.mode] || g.mode || '')}</span>`;
  const joinedBadge = joined ? `<span style="font-size:10px;font-weight:700;color:${t.accent};">✓ Joined</span>` : '';
  const full = sum.isFull && !joined;

  const joinBtn = joined
    ? `<button data-action="grp:leave" data-id="${escAttr(g.id)}" style="padding:7px 14px;border-radius:8px;border:1px solid ${t.border};background:${t.inputBg};color:${t.text2};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Leave</button>`
    : `<button data-action="grp:join" data-id="${escAttr(g.id)}" ${full ? 'disabled' : ''} style="padding:7px 14px;border-radius:8px;border:none;background:${full ? t.border : t.accent};color:${full ? t.text3 : '#000'};font-size:12px;font-weight:700;cursor:${full ? 'not-allowed' : 'pointer'};font-family:inherit;">${full ? 'Full' : 'Join'}</button>`;

  const rosterBtn = joined
    ? `<button data-action="grp:toggleRoster" data-id="${escAttr(g.id)}" style="padding:7px 12px;border-radius:8px;border:1px solid ${t.border};background:${t.inputBg};color:${t.text2};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">${_gs.expanded.has(g.id) ? 'Hide members' : 'Members'}</button>`
    : '';

  const delBtn = isCreator
    ? `<button data-action="grp:delete" data-id="${escAttr(g.id)}" data-label="${escAttr(g.title || g.courseCode || 'this group')}" title="Delete your group" style="background:none;border:none;cursor:pointer;color:rgba(231,76,60,0.6);font-size:12px;font-weight:700;font-family:inherit;">Delete</button>`
    : `<button data-action="grp:report" data-id="${escAttr(g.id)}" data-label="${escAttr(g.title || g.courseCode || 'this group')}" title="Report this group" style="background:none;border:none;cursor:pointer;color:${t.text3};font-size:12px;font-weight:700;font-family:inherit;">Report</button>`;

  const desc = g.description ? `<div style="font-size:13px;color:${t.text};line-height:1.5;margin:6px 0;word-break:break-word;">${escHtml(g.description)}</div>` : '';
  const schedule = g.schedule ? `<div style="font-size:12px;color:${t.text2};margin-bottom:4px;">🕑 ${escHtml(g.schedule)}</div>` : '';
  const contact = g.contactLink
    ? `<a href="${escAttr(g.contactLink)}" target="_blank" rel="noopener noreferrer nofollow" style="font-size:12px;color:${t.accent};font-weight:700;text-decoration:none;word-break:break-all;">🔗 Open group chat</a>`
    : '';

  const rosterPanel = (joined && _gs.expanded.has(g.id)) ? _rosterPanel(g, t) : '';

  return `
    <div style="border:1px solid ${t.border};background:${t.cardBg};border-radius:12px;padding:14px 16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
        <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:${t.accent};">${escHtml(g.courseCode || '')}</span>
        ${modeBadge}
        <span style="font-size:11px;color:${t.text3};">${escHtml(sum.label)}</span>
        ${joinedBadge}
        <span style="font-size:11px;color:${t.text3};margin-left:auto;">${escHtml(_timeAgo(g))}</span>
      </div>
      <div style="font-size:15px;font-weight:700;color:${t.text};word-break:break-word;">${escHtml(g.title || 'Untitled group')}</div>
      ${desc}
      ${schedule}
      ${contact}
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;">
        ${joinBtn}
        ${rosterBtn}
        <span style="margin-left:auto;">${delBtn}</span>
      </div>
      ${rosterPanel}
    </div>`;
}

function _rosterPanel(g, t) {
  const roster = _gs.rosters.get(g.id);
  if (!Array.isArray(roster)) {
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid ${t.border};font-size:12px;color:${t.text3};">Loading members…</div>`;
  }
  if (roster.length === 0) {
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid ${t.border};font-size:12px;color:${t.text3};">No members yet.</div>`;
  }
  const rows = roster.map(m => `<div style="font-size:12px;color:${t.text2};padding:3px 0;word-break:break-all;">${escHtml(m.email || '—')}</div>`).join('');
  return `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${t.border};">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${t.text3};margin-bottom:6px;">Members</div>
      ${rows}
    </div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function _submit() {
  if (_gs.submitting) return;
  const get = id => document.getElementById(id)?.value || '';
  const draft = {
    courseCode: get('grpCourse'),
    title: get('grpTitle'),
    description: get('grpDesc'),
    mode: _gs.createMode,
    schedule: get('grpSchedule'),
    contactLink: get('grpContact'),
    capacity: Number(get('grpCapacity')),
  };
  const err = validateGroupDraft(draft);
  if (err) { _gs.createMsg = err; _gs.createErr = true; _render(); return; }

  _gs.submitting = true; _gs.createMsg = ''; _render();
  const res = await createStudyGroup(draft);
  _gs.submitting = false;
  if (res?.ok) {
    _gs.showCreate = false;
    _gs.createMode = MODES[1];
    _gs.createMsg = '';
    await _load(true);
  } else {
    _gs.createMsg = res?.error || 'Could not post group.';
    _gs.createErr = true;
    _render();
  }
}

async function _join(groupId) {
  if (!groupId) return;
  const res = await joinStudyGroup(groupId);
  if (res?.ok) {
    _gs.myGroupIds.add(groupId);
    _gs.rosters.delete(groupId);
    _renderList();
  } else if (res?.error) {
    _toast(res.error);
  }
}

async function _leave(groupId) {
  if (!groupId) return;
  const res = await leaveStudyGroup(groupId);
  if (res?.ok) {
    _gs.myGroupIds.delete(groupId);
    _gs.expanded.delete(groupId);
    _gs.rosters.delete(groupId);
    _renderList();
  } else if (res?.error) {
    _toast(res.error);
  }
}

async function _delete(groupId, label) {
  if (!groupId) return;
  if (!confirmDestructive('Delete this study group?', label || 'this group')) return;
  const res = await deleteStudyGroup(groupId);
  if (res?.ok) {
    _gs.groups = _gs.groups.filter(g => g.id !== groupId);
    _gs.myGroupIds.delete(groupId);
    _renderList();
  } else if (res?.error) {
    _toast(res.error);
  }
}

async function _report(groupId, label) {
  if (!groupId) return;
  const reason = window.prompt(`Report "${label || 'this group'}" — what's wrong? (spam, abuse, dead link…)`);
  if (reason == null) return;
  const trimmed = reason.trim();
  if (trimmed.length < 3) { _toast('Please add a short reason.'); return; }
  const res = await reportStudyGroup(groupId, trimmed);
  _toast(res?.ok ? 'Reported. Thanks — an admin will review it.' : (res?.error || 'Report failed.'));
}

async function _toggleRoster(groupId) {
  if (!groupId) return;
  if (_gs.expanded.has(groupId)) {
    _gs.expanded.delete(groupId);
    _renderList();
    return;
  }
  _gs.expanded.add(groupId);
  _renderList();
  if (!_gs.rosters.has(groupId)) {
    const members = await fetchGroupMembers(groupId);
    _gs.rosters.set(groupId, Array.isArray(members) ? members : []);
    _renderList();
  }
}
