// ── js/ui/feedback.js ─────────────────────────────────────────────────────────
import { escHtml } from '../core/helpers.js';

// ── Module state ──────────────────────────────────────────────────────────────
let _activeTab   = 'submit';
let _selType     = 'general';
let _anonymous   = true;
let _submitting  = false;
let _boardLoaded = false;
let _boardItems  = [];          // [{ id, type, text, context, anonymous, uid?, createdAt }]
let _upvoteCounts = {};         // { feedbackId: number }
let _myUpvotes   = new Set();   // feedbackIds upvoted by current user
let _boardFilter = 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────
function _t() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark ? {
    bg:       '#0f1f14',
    border:   'rgba(46,204,113,0.22)',
    text:     '#e8f0ea',
    text2:    '#a8c4ad',
    text3:    '#6a9070',
    inputBg:  'rgba(46,204,113,0.07)',
    accent:   '#2ecc71',
    accentDim:'rgba(46,204,113,0.14)',
    rowBg:    'rgba(46,204,113,0.03)',
  } : {
    bg:       '#ffffff',
    border:   'rgba(0,0,0,0.12)',
    text:     '#0d2914',
    text2:    '#2d5a3d',
    text3:    '#5a8a6a',
    inputBg:  'rgba(46,204,113,0.05)',
    accent:   '#27ae60',
    accentDim:'rgba(46,204,113,0.08)',
    rowBg:    'rgba(46,204,113,0.02)',
  };
}

function _isAdmin() {
  return !!(window._shohoj_admin_uid &&
    window._shohoj_currentUid?.() &&
    window._shohoj_admin_uid === window._shohoj_currentUid());
}

function _captureContext() {
  const tabEl = document.querySelector('.calc-tab.active');
  const tab   = tabEl?.dataset?.tab || '';
  return tab ? { tab } : {};
}

function _tsMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function _timeAgo(ts) {
  const ms = _tsMs(ts);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

// ── Open / Close ──────────────────────────────────────────────────────────────
export function openFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (!modal) return;
  _activeTab   = 'submit';
  _boardLoaded = false;
  _boardFilter = 'all';
  _renderModal();
  modal.style.display = 'flex';
  requestAnimationFrame(() => { modal.style.opacity = '1'; });
}

export function closeFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (!modal) return;
  modal.style.opacity = '0';
  setTimeout(() => { modal.style.display = 'none'; }, 180);
}

// ── Render: shell ─────────────────────────────────────────────────────────────
function _renderModal() {
  const card    = document.getElementById('feedbackModalCard');
  const content = document.getElementById('feedbackModalContent');
  if (!card || !content) return;
  const t = _t();
  card.style.background   = t.bg;
  card.style.borderColor  = t.border;
  content.style.color     = t.text;

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:${t.text};">Feedback</div>
      <button onclick="closeFeedbackModal()" style="background:none;border:none;color:${t.text3};font-size:22px;cursor:pointer;line-height:1;padding:0 2px;">×</button>
    </div>
    <div style="display:flex;background:${t.inputBg};border-radius:30px;padding:3px;margin-bottom:20px;position:relative;">
      <div id="fbPill" style="position:absolute;top:3px;left:3px;width:calc(50% - 3px);height:calc(100% - 6px);background:${t.accent};border-radius:27px;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);pointer-events:none;"></div>
      <button id="fbTabSubmit" onclick="window._shohoj_fbTab('submit')" style="position:relative;z-index:1;flex:1;padding:7px 0;font-size:12px;font-weight:700;border:none;background:transparent;color:#000;cursor:pointer;border-radius:27px;font-family:inherit;">Submit</button>
      <button id="fbTabBoard"  onclick="window._shohoj_fbTab('board')"  style="position:relative;z-index:1;flex:1;padding:7px 0;font-size:12px;font-weight:700;border:none;background:transparent;color:${t.text2};cursor:pointer;border-radius:27px;font-family:inherit;">Board</button>
    </div>
    <div id="fbContent"></div>
  `;
  _renderTabContent();
}

// ── Render: tab content ───────────────────────────────────────────────────────
function _renderTabContent() {
  const el = document.getElementById('fbContent');
  if (!el) return;
  const t   = _t();
  const uid = window._shohoj_currentUid?.();

  if (_activeTab === 'submit') {
    el.innerHTML = _submitHtml(t, uid);
    const ta = document.getElementById('fbText');
    if (ta) {
      ta.addEventListener('input', () => {
        const ct = document.getElementById('fbCharCount');
        if (ct) ct.textContent = ta.value.length + ' / 500';
      });
    }
    _syncTypeButtons();
    _syncAnonToggle();
  } else {
    el.innerHTML = `<div style="text-align:center;padding:28px 0;color:${t.text3};font-size:13px;">Loading…</div>`;
    if (!_boardLoaded) {
      _loadBoard();
    } else {
      _renderBoardContent();
    }
  }
}

// ── Render: submit tab ────────────────────────────────────────────────────────
function _submitHtml(t, uid) {
  if (!uid) {
    return `<div style="text-align:center;padding:36px 0;color:${t.text2};font-size:14px;line-height:1.6;">
      Sign in with your BRACU Google account<br>to submit feedback.
    </div>`;
  }
  return `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.text3};margin-bottom:8px;">Type</div>
      <div style="display:flex;gap:6px;">
        ${[['bug','Bug'],['feature','Feature'],['general','General']].map(([v,l]) => `
          <button id="fbType_${v}" onclick="window._shohoj_fbSelectType('${v}')" style="
            flex:1;padding:7px 0;font-size:12px;font-weight:700;border-radius:20px;
            border:1px solid ${t.border};background:${t.inputBg};color:${t.text2};
            cursor:pointer;font-family:inherit;transition:all 0.15s;
          ">${l}</button>
        `).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <textarea id="fbText" maxlength="500"
        placeholder="Describe the bug, request the feature, or share a thought…"
        style="width:100%;min-height:90px;padding:10px 12px;border-radius:10px;
          border:1px solid ${t.border};background:${t.inputBg};color:${t.text};
          font-size:14px;font-family:inherit;resize:vertical;outline:none;
          box-sizing:border-box;line-height:1.5;"></textarea>
      <div id="fbCharCount" style="text-align:right;font-size:11px;color:${t.text3};margin-top:3px;">0 / 500</div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div style="font-size:13px;color:${t.text2};">Submit anonymously</div>
      <div onclick="window._shohoj_fbToggleAnon()" style="cursor:pointer;position:relative;width:38px;height:22px;flex-shrink:0;">
        <div id="fbAnonTrack" style="position:absolute;inset:0;border-radius:22px;background:${t.accent};transition:background 0.2s;"></div>
        <div id="fbAnonPill" style="position:absolute;top:3px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform 0.2s;transform:translateX(16px);"></div>
      </div>
    </div>
    <button id="fbSubmitBtn" onclick="window._shohoj_doSubmit()" style="
      width:100%;padding:11px;border-radius:10px;border:none;
      background:${t.accent};color:#000;font-size:14px;font-weight:700;
      cursor:pointer;font-family:inherit;
      transition:transform 0.2s ease, box-shadow 0.2s ease, opacity 0.15s ease;
      box-shadow:0 0 0 0 rgba(46,204,113,0.4);
    ">Send</button>
    <div id="fbMsg" style="text-align:center;font-size:13px;margin-top:10px;min-height:18px;color:${t.text2};"></div>
  `;
}

function _syncTypeButtons() {
  const t = _t();
  ['bug','feature','general'].forEach(v => {
    const btn = document.getElementById(`fbType_${v}`);
    if (!btn) return;
    const on = v === _selType;
    btn.style.background   = on ? t.accent    : t.inputBg;
    btn.style.color        = on ? '#000'      : t.text2;
    btn.style.borderColor  = on ? t.accent    : t.border;
  });
}

function _syncAnonToggle() {
  const t     = _t();
  const track = document.getElementById('fbAnonTrack');
  const pill  = document.getElementById('fbAnonPill');
  if (!track || !pill) return;
  const offColor = t.bg === '#ffffff' ? '#d0d0d0' : 'rgba(255,255,255,0.18)';
  track.style.background  = _anonymous ? t.accent : offColor;
  pill.style.transform    = _anonymous ? 'translateX(16px)' : 'translateX(3px)';
}

function _syncTabPill() {
  const pill      = document.getElementById('fbPill');
  const btnSubmit = document.getElementById('fbTabSubmit');
  const btnBoard  = document.getElementById('fbTabBoard');
  if (!pill || !btnSubmit || !btnBoard) return;
  const t = _t();
  if (_activeTab === 'submit') {
    pill.style.transform = 'translateX(0)';
    btnSubmit.style.color = '#000';
    btnBoard.style.color  = t.text2;
  } else {
    pill.style.transform = 'translateX(100%)';
    btnSubmit.style.color = t.text2;
    btnBoard.style.color  = '#000';
  }
}

// ── Render: board tab ─────────────────────────────────────────────────────────
async function _loadBoard() {
  const uid = window._shohoj_currentUid?.();
  if (!uid) {
    _boardItems  = [];
    _boardLoaded = true;
    _renderBoardContent();
    return;
  }
  try {
    const [items, allUpvotes] = await Promise.all([
      window._shohoj_fetchAllFeedback?.() ?? [],
      window._shohoj_fetchAllUpvotes?.()  ?? [],
    ]);
    _boardItems   = items || [];
    _upvoteCounts = {};
    _myUpvotes    = new Set();
    for (const uv of (allUpvotes || [])) {
      if (!uv.feedbackId) continue;
      _upvoteCounts[uv.feedbackId] = (_upvoteCounts[uv.feedbackId] || 0) + 1;
      if (uv.uid === uid) _myUpvotes.add(uv.feedbackId);
    }
    _boardLoaded = true;
  } catch (e) {
    _boardItems  = [];
    _boardLoaded = true;
  }
  _renderBoardContent();
}

function _renderBoardContent() {
  const el = document.getElementById('fbContent');
  if (!el) return;
  const t   = _t();
  const uid = window._shohoj_currentUid?.();

  if (!uid) {
    el.innerHTML = `<div style="text-align:center;padding:36px 0;color:${t.text2};font-size:14px;line-height:1.6;">
      Sign in with your BRACU Google account<br>to view and upvote feedback.
    </div>`;
    return;
  }

  const filtered = _boardFilter === 'all'
    ? _boardItems
    : _boardItems.filter(i => i.type === _boardFilter);

  const sorted = [...filtered].sort((a, b) => {
    const diff = (_upvoteCounts[b.id] || 0) - (_upvoteCounts[a.id] || 0);
    return diff !== 0 ? diff : _tsMs(b.createdAt) - _tsMs(a.createdAt);
  });

  const filterBtns = ['all','bug','feature','general'].map(f => {
    const on = _boardFilter === f;
    return `<button onclick="window._shohoj_fbFilter('${f}')" style="
      padding:5px 11px;font-size:11px;font-weight:700;border-radius:20px;
      border:1px solid ${on ? t.accent : t.border};
      background:${on ? t.accent : t.inputBg};
      color:${on ? '#000' : t.text2};
      cursor:pointer;font-family:inherit;transition:all 0.15s;
    ">${f === 'all' ? 'All' : f === 'bug' ? 'Bug' : f === 'feature' ? 'Feature' : 'General'}</button>`;
  }).join('');

  const typeColor = { bug: '#e74c3c', feature: '#3498db', general: t.text3 };

  const rows = sorted.length === 0
    ? `<div style="text-align:center;padding:32px 0;color:${t.text3};font-size:13px;">
        No feedback yet${_boardFilter !== 'all' ? ' in this category' : ''}.
       </div>`
    : sorted.map(item => {
        const count  = _upvoteCounts[item.id] || 0;
        const voted  = _myUpvotes.has(item.id);
        const delBtn = _isAdmin()
          ? `<button onclick="window._shohoj_fbAdminDel('${item.id}')" title="Delete"
               style="background:none;border:none;cursor:pointer;color:rgba(231,76,60,0.45);
                      font-size:16px;padding:0 2px;line-height:1;transition:color 0.15s;
                      margin-left:4px;">×</button>`
          : '';
        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid ${t.border};">
            <div onclick="window._shohoj_fbUpvote('${item.id}')"
                 style="display:flex;flex-direction:column;align-items:center;gap:2px;
                        min-width:34px;cursor:pointer;
                        color:${voted ? t.accent : t.text3};
                        transition:color 0.15s;user-select:none;">
              <span style="font-size:13px;">${voted ? '▲' : '△'}</span>
              <span style="font-size:11px;font-weight:700;">${count}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px;">
                <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;
                             text-transform:uppercase;color:${typeColor[item.type]||t.text3};">
                  ${item.type}
                </span>
                ${item.context?.tab ? `<span style="font-size:10px;color:${t.text3};">${escHtml(item.context.tab)}</span>` : ''}
                <span style="font-size:10px;color:${t.text3};margin-left:auto;">${_timeAgo(item.createdAt)}</span>
                ${delBtn}
              </div>
              <div style="font-size:13px;color:${t.text};line-height:1.5;word-break:break-word;">
                ${escHtml(item.text || '')}
              </div>
            </div>
          </div>`;
      }).join('');

  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">${filterBtns}</div>
    <div style="max-height:320px;overflow-y:auto;padding-right:2px;">${rows}</div>
  `;
}

// ── Global event handlers ─────────────────────────────────────────────────────
window._shohoj_fbTab = function(tab) {
  if (_activeTab === tab) return;
  _activeTab = tab;
  _syncTabPill();
  _renderTabContent();
};

window._shohoj_fbSelectType = function(type) {
  _selType = type;
  _syncTypeButtons();
};

window._shohoj_fbToggleAnon = function() {
  _anonymous = !_anonymous;
  _syncAnonToggle();
};

window._shohoj_fbFilter = function(f) {
  _boardFilter = f;
  _renderBoardContent();
};

window._shohoj_doSubmit = async function() {
  if (_submitting) return;
  const uid  = window._shohoj_currentUid?.();
  if (!uid) return;
  const text = (document.getElementById('fbText')?.value || '').trim();
  if (!text) {
    const msg = document.getElementById('fbMsg');
    if (msg) { msg.style.color = '#e74c3c'; msg.textContent = 'Please enter your feedback.'; }
    return;
  }
  _submitting = true;
  const btn = document.getElementById('fbSubmitBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Sending…'; }

  const hook = window._shohoj_submitFeedback;
  if (!hook) { _submitting = false; return; }

  const res = await hook({
    type: _selType,
    text,
    context:   _captureContext(),
    anonymous: _anonymous,
    uid:       _anonymous ? null : uid,
  });

  _submitting = false;
  const msg = document.getElementById('fbMsg');
  if (res?.ok) {
    if (msg) { msg.style.color = '#2ecc71'; msg.textContent = 'Sent! Thanks for your feedback.'; }
    if (btn) { btn.textContent = 'Sent'; }
    const ta = document.getElementById('fbText');
    if (ta) ta.value = '';
    const ct = document.getElementById('fbCharCount');
    if (ct) ct.textContent = '0 / 500';
    _boardLoaded = false;
  } else {
    if (msg) { msg.style.color = '#e74c3c'; msg.textContent = res?.error || 'Failed to submit.'; }
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'Send'; }
  }
};

window._shohoj_fbUpvote = async function(feedbackId) {
  const uid = window._shohoj_currentUid?.();
  if (!uid || !window._shohoj_toggleUpvote) return;

  const wasUpvoted = _myUpvotes.has(feedbackId);
  if (wasUpvoted) {
    _myUpvotes.delete(feedbackId);
    _upvoteCounts[feedbackId] = Math.max(0, (_upvoteCounts[feedbackId] || 0) - 1);
  } else {
    _myUpvotes.add(feedbackId);
    _upvoteCounts[feedbackId] = (_upvoteCounts[feedbackId] || 0) + 1;
  }
  _renderBoardContent();

  const res = await window._shohoj_toggleUpvote(feedbackId, wasUpvoted);
  if (!res?.ok) {
    if (wasUpvoted) {
      _myUpvotes.add(feedbackId);
      _upvoteCounts[feedbackId]++;
    } else {
      _myUpvotes.delete(feedbackId);
      _upvoteCounts[feedbackId] = Math.max(0, (_upvoteCounts[feedbackId] || 1) - 1);
    }
    _renderBoardContent();
  }
};

window._shohoj_fbAdminDel = async function(feedbackId) {
  if (!_isAdmin() || !window._shohoj_adminDeleteFeedback) return;
  if (!confirm('Delete this feedback entry?')) return;
  const res = await window._shohoj_adminDeleteFeedback(feedbackId);
  if (res?.ok) {
    _boardItems = _boardItems.filter(i => i.id !== feedbackId);
    delete _upvoteCounts[feedbackId];
    _myUpvotes.delete(feedbackId);
    _renderBoardContent();
  }
};
