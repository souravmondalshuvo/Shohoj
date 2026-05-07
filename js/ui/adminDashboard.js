// ── js/ui/adminDashboard.js ──────────────────────────────────────────────────
// Admin/moderator hub. Single overlay surface for triaging:
//   • Pending paper uploads (approve / delete)
//   • Reports — paper + review (delete reported item or dismiss report)
//   • Feedback (delete)
//
// Reuses the global window._shohoj_* admin helpers from firebase.js.

import { escHtml, escAttr } from '../core/helpers.js';
import { getPaperDownloadUrl } from '../core/papers.js';

let _open = false;

function _adminCheck() {
  return typeof window._shohoj_isAdmin === 'function' && window._shohoj_isAdmin();
}

function _adminToast(msg) {
  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast(msg);
  } else {
    alert(msg);
  }
}

function _adminFormatDate(ts) {
  if (!ts) return '';
  const ms = typeof ts === 'object' && ts.toMillis ? ts.toMillis() : Number(ts);
  if (!ms || isNaN(ms)) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function _shellHtml() {
  return `
    <div class="admin-dash-backdrop" id="adminDashBackdrop">
      <div class="admin-dash" role="dialog" aria-label="Admin dashboard">
        <header class="admin-dash-head">
          <div>
            <h2>🛡️ Moderation</h2>
            <p class="admin-dash-sub">Triage pending uploads, reports, and feedback.</p>
          </div>
          <button class="admin-dash-close" id="adminDashClose" aria-label="Close">×</button>
        </header>

        <div class="admin-dash-body">
          <section class="admin-dash-section" data-section="papers">
            <div class="admin-dash-section-head">
              <h3>📄 Pending papers</h3>
              <span class="admin-dash-count" id="adminCountPapers">…</span>
            </div>
            <div class="admin-dash-list" id="adminListPapers">
              ${_skeletonRows(2)}
            </div>
          </section>

          <section class="admin-dash-section" data-section="paperReports">
            <div class="admin-dash-section-head">
              <h3>⚑ Paper reports</h3>
              <span class="admin-dash-count" id="adminCountPaperReports">…</span>
            </div>
            <div class="admin-dash-list" id="adminListPaperReports">
              ${_skeletonRows(2)}
            </div>
          </section>

          <section class="admin-dash-section" data-section="reviewReports">
            <div class="admin-dash-section-head">
              <h3>⚑ Review reports</h3>
              <span class="admin-dash-count" id="adminCountReviewReports">…</span>
            </div>
            <div class="admin-dash-list" id="adminListReviewReports">
              ${_skeletonRows(2)}
            </div>
          </section>

          <section class="admin-dash-section" data-section="feedback">
            <div class="admin-dash-section-head">
              <h3>💬 Feedback</h3>
              <span class="admin-dash-count" id="adminCountFeedback">…</span>
            </div>
            <div class="admin-dash-list" id="adminListFeedback">
              ${_skeletonRows(3)}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function _skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <div class="admin-dash-row admin-dash-row--skeleton">
      <div class="admin-skel admin-skel-line admin-skel-line--lg"></div>
      <div class="admin-skel admin-skel-line admin-skel-line--md"></div>
      <div class="admin-skel admin-skel-line admin-skel-line--sm"></div>
    </div>
  `).join('');
}

function _emptyHtml(msg) {
  return `<div class="admin-dash-empty">${escHtml(msg)}</div>`;
}

function _paperRow(p) {
  const meta = [p.semester, p.facultyInitials].filter(Boolean).map(escHtml).join(' · ');
  return `
    <div class="admin-dash-row" data-id="${escAttr(p.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag admin-dash-tag--code">${escHtml(p.courseCode || '')}</span>
          <span class="admin-dash-tag">${escHtml(p.type || 'paper')}</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(p.title || 'Untitled')}</div>
        <div class="admin-dash-row-meta">${meta}${meta ? ' · ' : ''}${escHtml(_adminFormatDate(p.createdAt))}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="preview" data-path="${escAttr(p.storagePath || '')}">Preview</button>
        <button data-act="approve" data-id="${escAttr(p.id)}" class="admin-dash-btn--ok">Approve</button>
        <button data-act="delete-paper" data-id="${escAttr(p.id)}" data-path="${escAttr(p.storagePath || '')}" class="admin-dash-btn--danger">Delete</button>
      </div>
    </div>
  `;
}

function _paperReportRow(r) {
  return `
    <div class="admin-dash-row" data-id="${escAttr(r.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag">paper · ${escHtml(String(r.paperId).slice(0, 12))}…</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(r.reason || '(no reason)')}</div>
        <div class="admin-dash-row-meta">${escHtml(_adminFormatDate(r.createdAt))}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="delete-paper-by-report" data-paper-id="${escAttr(r.paperId)}" class="admin-dash-btn--danger">Delete paper</button>
        <button data-act="dismiss-paper-report" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

function _reviewReportRow(r) {
  return `
    <div class="admin-dash-row" data-id="${escAttr(r.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag">review · ${escHtml(String(r.reviewId).slice(0, 18))}…</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(r.reason || '(no reason)')}</div>
        <div class="admin-dash-row-meta">${escHtml(_adminFormatDate(r.createdAt))}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="dismiss-review-report" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

function _feedbackRow(f) {
  const tag = (f.type || 'general').toUpperCase();
  const author = f.anonymous ? 'anonymous' : (f.uid ? `uid ${String(f.uid).slice(0, 8)}…` : '—');
  return `
    <div class="admin-dash-row" data-id="${escAttr(f.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag">${escHtml(tag)}</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(f.text || '')}</div>
        <div class="admin-dash-row-meta">${escHtml(author)} · ${escHtml(_adminFormatDate(f.createdAt))}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="delete-feedback" data-id="${escAttr(f.id)}" class="admin-dash-btn--danger">Delete</button>
      </div>
    </div>
  `;
}

async function _loadPapers() {
  const list = document.getElementById('adminListPapers');
  const count = document.getElementById('adminCountPapers');
  if (!list || !count) return;
  const items = await window._shohoj_fetchUnapprovedPapers?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_paperRow).join('') : _emptyHtml('No pending uploads.');
}

async function _loadPaperReports() {
  const list = document.getElementById('adminListPaperReports');
  const count = document.getElementById('adminCountPaperReports');
  if (!list || !count) return;
  const items = await window._shohoj_fetchPaperReports?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_paperReportRow).join('') : _emptyHtml('No paper reports.');
}

async function _loadReviewReports() {
  const list = document.getElementById('adminListReviewReports');
  const count = document.getElementById('adminCountReviewReports');
  if (!list || !count) return;
  const items = await window._shohoj_fetchReviewReports?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_reviewReportRow).join('') : _emptyHtml('No review reports.');
}

async function _loadFeedback() {
  const list = document.getElementById('adminListFeedback');
  const count = document.getElementById('adminCountFeedback');
  if (!list || !count) return;
  const items = await window._shohoj_fetchAllFeedback?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_feedbackRow).join('') : _emptyHtml('No feedback.');
}

function _refreshAll() {
  _loadPapers();
  _loadPaperReports();
  _loadReviewReports();
  _loadFeedback();
}

async function _onAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (btn.disabled) return;
  btn.disabled = true;

  try {
    if (act === 'preview') {
      const path = btn.dataset.path;
      if (!path) return;
      const url = await getPaperDownloadUrl(path);
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    if (act === 'approve') {
      const res = await window._shohoj_approvePaper?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Approve failed');
      _adminToast('Approved.');
      _loadPapers();
      return;
    }
    if (act === 'delete-paper') {
      if (!confirm('Delete this paper and its file? This cannot be undone.')) return;
      const res = await window._shohoj_deletePaper?.(btn.dataset.id, btn.dataset.path);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Deleted.');
      _loadPapers();
      return;
    }
    if (act === 'delete-paper-by-report') {
      if (!confirm('Delete the reported paper? This cannot be undone.')) return;
      const res = await window._shohoj_deletePaper?.(btn.dataset.paperId);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Paper deleted.');
      _loadPapers();
      _loadPaperReports();
      return;
    }
    if (act === 'dismiss-paper-report') {
      const res = await window._shohoj_deletePaperReport?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Dismiss failed');
      _loadPaperReports();
      return;
    }
    if (act === 'dismiss-review-report') {
      const res = await window._shohoj_deleteReviewReport?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Dismiss failed');
      _loadReviewReports();
      return;
    }
    if (act === 'delete-feedback') {
      if (!confirm('Delete this feedback?')) return;
      const res = await window._shohoj_adminDeleteFeedback?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Deleted.');
      _loadFeedback();
      return;
    }
  } finally {
    btn.disabled = false;
  }
}

export function openAdminDashboard() {
  if (_open) return;
  if (!_adminCheck()) {
    _adminToast('Admin only.');
    return;
  }
  _open = true;
  const wrap = document.createElement('div');
  wrap.id = 'adminDashRoot';
  wrap.innerHTML = _shellHtml();
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');

  const backdrop = document.getElementById('adminDashBackdrop');
  document.getElementById('adminDashClose').addEventListener('click', closeAdminDashboard);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeAdminDashboard(); });
  backdrop.addEventListener('click', _onAction);

  _refreshAll();
}

export function closeAdminDashboard() {
  _open = false;
  const root = document.getElementById('adminDashRoot');
  if (root) root.remove();
  document.body.classList.remove('modal-open');
  // Strip #admin from URL if present, fall back to #calculator
  if (window.location.hash === '#admin' && history.replaceState) {
    history.replaceState(null, '', '#calculator');
  }
}

window._shohoj_openAdminDashboard = openAdminDashboard;
window._shohoj_closeAdminDashboard = closeAdminDashboard;

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#admin' && _adminCheck()) {
    openAdminDashboard();
  }
});

window.addEventListener('shohoj:auth-changed', () => {
  // If we navigated to #admin while signed out and admin auth just resolved, open it.
  if (window.location.hash === '#admin' && _adminCheck() && !_open) {
    openAdminDashboard();
  }
  // If admin signs out while open, close.
  if (_open && !_adminCheck()) {
    closeAdminDashboard();
  }
});
