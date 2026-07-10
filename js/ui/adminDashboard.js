// ── js/ui/adminDashboard.js ──────────────────────────────────────────────────
// Full-page admin/moderator dashboard. Hides the regular site shell and
// renders a dedicated page with stats, charts, and triage queues for:
//   • Pending paper uploads (approve / delete)
//   • Reports — paper + review (delete reported item or dismiss report)
//   • Feedback (delete)
//   • Lost & found posts (delete; #371 — removes the hidden contact doc too)
//
// Reuses the global window._shohoj_* admin helpers from firebase.js.
// Charts via Chart.js loaded from CDN in index.html.

import { escHtml, escAttr, confirmDestructive } from '../core/helpers.js';
import { getPaperDownloadUrl } from '../core/papers.js';
import { openPreviewModal } from './previewModal.js';

let _open = false;
let _dedicated = false;
const _charts = {};

const ADMIN_STAT_DEFS = [
  ['Total reviews', 'reviews'],
  ['Approved papers', 'papers'],
  ['Pending papers', 'pendingPapers'],
  ['Feedback items', 'feedback'],
  ['Paper reports', 'paperReports'],
  ['Review reports', 'reviewReports'],
];

const EMPTY_ADMIN_STATS = {
  counts: {
    reviews: 0,
    papers: 0,
    pendingPapers: 0,
    feedback: 0,
    paperReports: 0,
    reviewReports: 0,
  },
  activity: [],
  topFaculty: [],
  topCourses: [],
  paperTypes: {},
  feedbackTypes: {},
};

function _nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function _stringLabel(value, fallback = '?') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function _normalizeBreakdown(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [_stringLabel(key), _nonNegativeNumber(value)]),
  );
}

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

export function normalizeAdminStats(stats) {
  const src = stats && typeof stats === 'object' ? stats : {};
  const srcCounts = src.counts && typeof src.counts === 'object' ? src.counts : {};
  const counts = { ...EMPTY_ADMIN_STATS.counts };
  Object.keys(counts).forEach(key => {
    counts[key] = _nonNegativeNumber(srcCounts[key]);
  });

  return {
    counts,
    activity: Array.isArray(src.activity)
      ? src.activity
        .filter(row => row && typeof row.date === 'string')
        .map(row => ({
          date: row.date,
          reviews: _nonNegativeNumber(row.reviews),
          papers: _nonNegativeNumber(row.papers),
          feedback: _nonNegativeNumber(row.feedback),
        }))
      : [],
    topFaculty: Array.isArray(src.topFaculty)
      ? src.topFaculty.map(row => ({
        initials: _stringLabel(row?.initials),
        count: _nonNegativeNumber(row?.count),
      }))
      : [],
    topCourses: Array.isArray(src.topCourses)
      ? src.topCourses.map(row => ({
        code: _stringLabel(row?.code),
        count: _nonNegativeNumber(row?.count),
      }))
      : [],
    paperTypes: _normalizeBreakdown(src.paperTypes),
    feedbackTypes: _normalizeBreakdown(src.feedbackTypes),
  };
}

function _statsSkeletonHtml() {
  return ADMIN_STAT_DEFS.map(([label]) => _statCardSkeleton(label)).join('');
}

export function buildAdminStatsHtml(stats) {
  const normalized = normalizeAdminStats(stats);
  return ADMIN_STAT_DEFS
    .map(([label, key]) => _statCard(label, normalized.counts[key]))
    .join('');
}

function _shellHtml(opts = {}) {
  const closeLabel = opts.dedicated ? '← Back to Shohoj' : '← Back';
  return `
    <div class="admin-page" id="adminPage" role="main">
      <header class="admin-page-head">
        <div class="admin-page-head-text">
          <h1><svg class="admin-head-badge" width="34" height="34" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="14" fill="#f5b942"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="'Noto Sans Bengali','Hind Siliguri','SolaimanLipi',serif" font-size="44" font-weight="900" fill="#2a1c00">স</text></svg> Admin Dashboard</h1>
          <p>Stats, activity, and triage queues — all in one place.</p>
        </div>
        <div class="admin-page-head-actions">
          <button id="adminRefreshBtn" class="admin-btn-ghost" title="Reload everything">↻ Refresh</button>
          <button id="adminCloseBtn"   class="admin-btn-ghost" title="Back to site">${closeLabel}</button>
        </div>
      </header>

      <div class="admin-page-body">

        <!-- Stats cards -->
        <section class="admin-stats-grid" id="adminStatsGrid">
          ${_statCardSkeleton('Total reviews')}
          ${_statCardSkeleton('Approved papers')}
          ${_statCardSkeleton('Pending papers')}
          ${_statCardSkeleton('Feedback items')}
          ${_statCardSkeleton('Paper reports')}
          ${_statCardSkeleton('Review reports')}
        </section>

        <!-- Charts -->
        <section class="admin-charts-grid">
          <div class="admin-chart-card admin-chart-card--wide">
            <h3>Activity (last 30 days)</h3>
            ${_chartCanvasWrap('adminActivityChart')}
          </div>
          <div class="admin-chart-card">
            <h3>Top faculty by reviews</h3>
            ${_chartCanvasWrap('adminTopFacultyChart')}
          </div>
          <div class="admin-chart-card">
            <h3>Top courses by uploads</h3>
            ${_chartCanvasWrap('adminTopCoursesChart')}
          </div>
          <div class="admin-chart-card">
            <h3>Paper types</h3>
            ${_chartCanvasWrap('adminPaperTypesChart')}
          </div>
          <div class="admin-chart-card">
            <h3>Feedback breakdown</h3>
            ${_chartCanvasWrap('adminFeedbackTypesChart')}
          </div>
        </section>

        <!-- Moderation queues -->
        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>📄 Pending papers</h2>
            <span class="admin-dash-count" id="adminCountPapers">…</span>
          </header>
          <div class="admin-dash-list" id="adminListPapers">${_skeletonRows(2)}</div>
        </section>

        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>⚑ Paper reports</h2>
            <span class="admin-dash-count" id="adminCountPaperReports">…</span>
          </header>
          <div class="admin-dash-list" id="adminListPaperReports">${_skeletonRows(2)}</div>
        </section>

        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>⚑ Review reports</h2>
            <span class="admin-dash-count" id="adminCountReviewReports">…</span>
          </header>
          <div class="admin-dash-list" id="adminListReviewReports">${_skeletonRows(2)}</div>
        </section>

        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>⚑ Study group reports</h2>
            <span class="admin-dash-count" id="adminCountStudyGroupReports">…</span>
          </header>
          <div class="admin-dash-list" id="adminListStudyGroupReports">${_skeletonRows(2)}</div>
        </section>

        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>💬 Feedback</h2>
            <span class="admin-dash-count" id="adminCountFeedback">…</span>
          </header>
          <div class="admin-dash-list" id="adminListFeedback">${_skeletonRows(3)}</div>
        </section>

        <section class="admin-mod-section">
          <header class="admin-mod-section-head">
            <h2>🧳 Lost &amp; found</h2>
            <span class="admin-dash-count" id="adminCountLostFound">…</span>
          </header>
          <div class="admin-dash-list" id="adminListLostFound">${_skeletonRows(3)}</div>
        </section>

      </div>
    </div>
  `;
}

function _statCardSkeleton(label) {
  return `
    <div class="admin-stat-card">
      <div class="admin-stat-label">${escHtml(label)}</div>
      <div class="admin-stat-value"><span class="admin-skel admin-stat-value-skel"></span></div>
    </div>
  `;
}

function _statCard(label, value) {
  return `
    <div class="admin-stat-card">
      <div class="admin-stat-label">${escHtml(label)}</div>
      <div class="admin-stat-value">${escHtml(String(value))}</div>
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

function _chartCanvasWrap(canvasId) {
  return `
    <div class="admin-chart-canvas-wrap">
      <div class="admin-chart-skel admin-skel" data-skel-for="${escAttr(canvasId)}"></div>
      <canvas id="${escAttr(canvasId)}"></canvas>
    </div>
  `;
}

function _clearChartSkeleton(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const skel = wrap.querySelector('.admin-chart-skel');
  if (skel) skel.remove();
}

function _restoreChartSkeleton(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap || wrap.querySelector('.admin-chart-skel')) return;
  const msg = wrap.querySelector('.admin-chart-empty');
  if (msg) msg.remove();
  canvas.hidden = false;
  const skel = document.createElement('div');
  skel.className = 'admin-chart-skel admin-skel';
  skel.dataset.skelFor = canvasId;
  wrap.insertBefore(skel, canvas);
}

function _emptyHtml(msg) {
  return `<div class="admin-dash-empty">${escHtml(msg)}</div>`;
}

function _setChartEmpty(canvasId, msg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  _clearChartSkeleton(canvasId);
  const wrap = canvas.parentElement;
  if (!wrap) return;
  canvas.hidden = true;
  let el = wrap.querySelector('.admin-chart-empty');
  if (!el) {
    el = document.createElement('div');
    el.className = 'admin-chart-empty';
    wrap.appendChild(el);
  }
  el.textContent = msg;
}

function _clearChartEmpty(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const el = wrap?.querySelector('.admin-chart-empty');
  if (el) el.remove();
  canvas.hidden = false;
}

function _setAllChartsEmpty(msg) {
  ['adminActivityChart', 'adminTopFacultyChart', 'adminTopCoursesChart',
   'adminPaperTypesChart', 'adminFeedbackTypesChart'].forEach(id => _setChartEmpty(id, msg));
}


function _paperRow(p) {
  const meta = [p.semester, p.facultyInitials].filter(Boolean).map(escHtml).join(' · ');
  const label = [p.courseCode, p.title || 'Untitled'].filter(Boolean).join(' — ');
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
        <button data-act="preview" data-paper-id="${escAttr(p.id || '')}" data-mime="${escAttr(p.mimeType || '')}" data-title="${escAttr(label)}">Preview</button>
        <button data-act="approve" data-id="${escAttr(p.id)}" class="admin-dash-btn--ok">Approve</button>
        <button data-act="delete-paper" data-id="${escAttr(p.id)}" data-path="${escAttr(p.storagePath || '')}" data-label="${escAttr(label)}" class="admin-dash-btn--danger">Delete</button>
      </div>
    </div>
  `;
}

function _paperReportRow(r) {
  const target = `paper ${String(r.paperId || '').slice(0, 12)}...`;
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
        <button data-act="delete-paper-by-report" data-id="${escAttr(r.id)}" data-paper-id="${escAttr(r.paperId)}" data-label="${escAttr(target)}" class="admin-dash-btn--danger">Delete paper</button>
        <button data-act="dismiss-paper-report" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

function _reviewReportRow(r) {
  const target = `review ${String(r.reviewId || '').slice(0, 18)}...`;
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
        <button data-act="delete-review-by-report" data-id="${escAttr(r.id)}" data-review-id="${escAttr(r.reviewId)}" data-label="${escAttr(target)}" class="admin-dash-btn--danger">Delete review</button>
        <button data-act="dismiss-review-report" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

function _studyGroupReportRow(r) {
  const target = `group ${String(r.groupId || '').slice(0, 12)}...`;
  return `
    <div class="admin-dash-row" data-id="${escAttr(r.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag">group · ${escHtml(String(r.groupId).slice(0, 12))}…</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(r.reason || '(no reason)')}</div>
        <div class="admin-dash-row-meta">${escHtml(_adminFormatDate(r.createdAt))}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="delete-group-by-report" data-id="${escAttr(r.id)}" data-group-id="${escAttr(r.groupId)}" data-label="${escAttr(target)}" class="admin-dash-btn--danger">Delete group</button>
        <button data-act="dismiss-group-report" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

function _feedbackRow(f) {
  const tag = (f.type || 'general').toUpperCase();
  const author = f.anonymous ? 'anonymous' : (f.uid ? `uid ${String(f.uid).slice(0, 8)}…` : '—');
  const snippet = String(f.text || '').slice(0, 60);
  const label = `${tag}: ${snippet}${(f.text || '').length > 60 ? '…' : ''}`;
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
        <button data-act="delete-feedback" data-id="${escAttr(f.id)}" data-label="${escAttr(label)}" class="admin-dash-btn--danger">Delete</button>
      </div>
    </div>
  `;
}

// Pure row builder for a lost & found post (#371) — exported for unit tests.
// No contact info exists on the post by design; the uid prefix + createdAt is
// all the identity a moderator gets.
export function buildLostFoundRowHtml(p) {
  const tag = p.type === 'found' ? 'FOUND' : 'LOST';
  const status = p.status === 'resolved' ? ' · resolved' : '';
  const where = [p.locationHint, p.roomCode].filter(Boolean).join(' · ');
  const author = p.creatorUid ? `uid ${String(p.creatorUid).slice(0, 8)}…` : '—';
  const label = `${tag}: ${String(p.title || '').slice(0, 60)}`;
  return `
    <div class="admin-dash-row" data-id="${escAttr(p.id)}">
      <div class="admin-dash-row-main">
        <div class="admin-dash-row-head">
          <span class="admin-dash-tag">${escHtml(tag)}</span>
        </div>
        <div class="admin-dash-row-title">${escHtml(p.title || '')}</div>
        ${p.description ? `<div class="admin-dash-row-meta">${escHtml(p.description)}</div>` : ''}
        <div class="admin-dash-row-meta">${escHtml(author)} · ${escHtml(_adminFormatDate(p.createdAt))}${escHtml(status)}${where ? ` · ${escHtml(where)}` : ''}</div>
      </div>
      <div class="admin-dash-row-actions">
        <button data-act="delete-lostfound" data-id="${escAttr(p.id)}" data-label="${escAttr(label)}" class="admin-dash-btn--danger">Delete</button>
      </div>
    </div>
  `;
}

async function _loadLostFound() {
  const list = document.getElementById('adminListLostFound');
  const count = document.getElementById('adminCountLostFound');
  if (!list || !count) return;
  count.textContent = '…';
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  list.innerHTML = _skeletonRows(3);
  const items = await window._shohoj_fetchAllLostFound?.() ?? [];
  count.textContent = items.length;
  // Rows are built from escHtml/escAttr-escaped post fields (see the XSS unit test).
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  list.innerHTML = items.length ? items.map(buildLostFoundRowHtml).join('') : _emptyHtml('No lost & found posts.');
}

async function _loadPapers() {
  const list = document.getElementById('adminListPapers');
  const count = document.getElementById('adminCountPapers');
  if (!list || !count) return;
  count.textContent = '…';
  list.innerHTML = _skeletonRows(2);
  const items = await window._shohoj_fetchUnapprovedPapers?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_paperRow).join('') : _emptyHtml('No pending uploads.');
}

async function _loadPaperReports() {
  const list = document.getElementById('adminListPaperReports');
  const count = document.getElementById('adminCountPaperReports');
  if (!list || !count) return;
  count.textContent = '…';
  list.innerHTML = _skeletonRows(2);
  const items = await window._shohoj_fetchPaperReports?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_paperReportRow).join('') : _emptyHtml('No paper reports.');
}

async function _loadReviewReports() {
  const list = document.getElementById('adminListReviewReports');
  const count = document.getElementById('adminCountReviewReports');
  if (!list || !count) return;
  count.textContent = '…';
  list.innerHTML = _skeletonRows(2);
  const items = await window._shohoj_fetchReviewReports?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_reviewReportRow).join('') : _emptyHtml('No review reports.');
}

async function _loadStudyGroupReports() {
  const list = document.getElementById('adminListStudyGroupReports');
  const count = document.getElementById('adminCountStudyGroupReports');
  if (!list || !count) return;
  count.textContent = '…';
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  list.innerHTML = _skeletonRows(2);
  const items = await window._shohoj_fetchStudyGroupReports?.() ?? [];
  count.textContent = items.length;
  // Rows are built from escHtml/escAttr-escaped admin-only report data.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  list.innerHTML = items.length ? items.map(_studyGroupReportRow).join('') : _emptyHtml('No study group reports.');
}

async function _loadFeedback() {
  const list = document.getElementById('adminListFeedback');
  const count = document.getElementById('adminCountFeedback');
  if (!list || !count) return;
  count.textContent = '…';
  list.innerHTML = _skeletonRows(3);
  const items = await window._shohoj_fetchAllFeedback?.() ?? [];
  count.textContent = items.length;
  list.innerHTML = items.length ? items.map(_feedbackRow).join('') : _emptyHtml('No feedback.');
}

function _isLight() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function _chartTextColor() {
  return _isLight() ? '#1a1c1e' : 'rgba(255,255,255,0.85)';
}

function _chartGridColor() {
  return _isLight() ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
}

function _ensureChartLib() {
  return typeof window.Chart === 'function' || typeof window.Chart === 'object';
}

function _destroyChart(key) {
  if (_charts[key]) {
    _charts[key].destroy();
    _charts[key] = null;
  }
}

function _renderActivityChart(activity) {
  const canvas = document.getElementById('adminActivityChart');
  if (!canvas || !_ensureChartLib()) return;
  _destroyChart('activity');
  if (!Array.isArray(activity) || !activity.some(d => d.reviews || d.papers || d.feedback)) {
    _setChartEmpty('adminActivityChart', 'No recent activity yet.');
    return;
  }
  _clearChartSkeleton('adminActivityChart');
  _clearChartEmpty('adminActivityChart');
  const labels = activity.map(d => d.date.slice(5)); // MM-DD
  _charts.activity = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Reviews',  data: activity.map(d => d.reviews),  borderColor: '#2ECC71', backgroundColor: 'rgba(46,204,113,0.18)', tension: 0.35, fill: true },
        { label: 'Papers',   data: activity.map(d => d.papers),   borderColor: '#52a0ff', backgroundColor: 'rgba(82,160,255,0.16)', tension: 0.35, fill: true },
        { label: 'Feedback', data: activity.map(d => d.feedback), borderColor: '#f5b942', backgroundColor: 'rgba(245,185,66,0.16)', tension: 0.35, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'xy', intersect: false },
      plugins: {
        legend: { labels: { color: _chartTextColor() } },
        tooltip: { mode: 'nearest', axis: 'xy', intersect: false },
      },
      scales: {
        x: { ticks: { color: _chartTextColor(), maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: _chartGridColor() } },
        y: { beginAtZero: true, ticks: { color: _chartTextColor(), precision: 0 }, grid: { color: _chartGridColor() } },
      },
    },
  });
}

function _renderBarChart(canvasId, key, labels, values, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !_ensureChartLib()) return;
  _destroyChart(key);
  if (!labels.length || !values.some(v => Number(v) > 0)) {
    _setChartEmpty(canvasId, 'No data yet.');
    return;
  }
  _clearChartSkeleton(canvasId);
  _clearChartEmpty(canvasId);
  _charts[key] = new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: _chartTextColor(), precision: 0 }, grid: { color: _chartGridColor() } },
        y: { ticks: { color: _chartTextColor() }, grid: { display: false } },
      },
    },
  });
}

function _renderDoughnut(canvasId, key, labels, values, palette) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !_ensureChartLib()) return;
  _destroyChart(key);
  if (!labels.length || !values.some(v => Number(v) > 0)) {
    _setChartEmpty(canvasId, 'No data yet.');
    return;
  }
  _clearChartSkeleton(canvasId);
  _clearChartEmpty(canvasId);
  _charts[key] = new window.Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette, borderColor: 'transparent', borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: _chartTextColor(), padding: 12 } } },
    },
  });
}

async function _loadStatsAndCharts() {
  const grid = document.getElementById('adminStatsGrid');
  if (grid) {
    grid.innerHTML = _statsSkeletonHtml();
  }
  ['adminActivityChart','adminTopFacultyChart','adminTopCoursesChart',
   'adminPaperTypesChart','adminFeedbackTypesChart'].forEach(id => {
    const key = {
      adminActivityChart:'activity', adminTopFacultyChart:'topFaculty',
      adminTopCoursesChart:'topCourses', adminPaperTypesChart:'paperTypes',
      adminFeedbackTypesChart:'feedbackTypes',
    }[id];
    _destroyChart(key);
    _restoreChartSkeleton(id);
  });

  let stats;
  try {
    stats = await window._shohoj_fetchAdminStats?.();
  } catch (e) {
    console.warn('[Shohoj] admin stats failed:', e);
  }
  if (!stats) {
    if (grid) grid.innerHTML = _emptyHtml('Could not load dashboard stats.');
    _setAllChartsEmpty('Could not load chart data.');
    return;
  }
  stats = normalizeAdminStats(stats);

  if (grid) {
    grid.innerHTML = buildAdminStatsHtml(stats);
  }

  // Wait briefly for Chart.js if it's still loading.
  if (!_ensureChartLib()) {
    await new Promise(r => setTimeout(r, 600));
  }

  if (!_ensureChartLib()) {
    _setAllChartsEmpty('Charts could not load.');
    return;
  }

  _renderActivityChart(stats.activity);

  _renderBarChart(
    'adminTopFacultyChart', 'topFaculty',
    stats.topFaculty.map(f => f.initials),
    stats.topFaculty.map(f => f.count),
    '#2ECC71',
  );
  _renderBarChart(
    'adminTopCoursesChart', 'topCourses',
    stats.topCourses.map(c => c.code),
    stats.topCourses.map(c => c.count),
    '#52a0ff',
  );

  const ptKeys = Object.keys(stats.paperTypes);
  _renderDoughnut(
    'adminPaperTypesChart', 'paperTypes',
    ptKeys,
    ptKeys.map(k => stats.paperTypes[k]),
    ['#2ECC71', '#52a0ff', '#f5b942', '#ff7676', '#a78bfa'],
  );

  const ftKeys = Object.keys(stats.feedbackTypes);
  _renderDoughnut(
    'adminFeedbackTypesChart', 'feedbackTypes',
    ftKeys,
    ftKeys.map(k => stats.feedbackTypes[k]),
    ['#ff7676', '#52a0ff', '#a0a0a0'],
  );
}

async function _refreshAll() {
  const btn = document.getElementById('adminRefreshBtn');
  const prevLabel = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.classList.add('admin-btn-ghost--loading');
    btn.textContent = '↻ Refreshing…';
  }
  try {
    await Promise.all([
      _loadStatsAndCharts(),
      _loadPapers(),
      _loadPaperReports(),
      _loadReviewReports(),
      _loadStudyGroupReports(),
      _loadFeedback(),
      _loadLostFound(),
    ]);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('admin-btn-ghost--loading');
      btn.textContent = prevLabel;
    }
  }
}

async function _onAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (btn.disabled) return;
  btn.disabled = true;

  try {
    if (act === 'preview') {
      const paperId = btn.dataset.paperId;
      if (!paperId) return;
      btn.textContent = 'Loading…';
      const url = await getPaperDownloadUrl(paperId);
      btn.textContent = 'Preview';
      if (!url) {
        _adminToast('Could not load preview.');
        return;
      }
      openPreviewModal({ url, title: btn.dataset.title || 'Preview', mimeType: btn.dataset.mime });
      return;
    }
    if (act === 'approve') {
      const res = await window._shohoj_approvePaper?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Approve failed');
      _adminToast('Approved.');
      _loadPapers();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'delete-paper') {
      if (!confirmDestructive('Delete this paper and its R2 file?', btn.dataset.label || 'this paper')) return;
      const res = await window._shohoj_deletePaper?.(btn.dataset.id, btn.dataset.path);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Deleted.');
      _loadPapers();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'delete-paper-by-report') {
      if (!confirmDestructive('Delete the reported paper, its R2 file, and this report?', btn.dataset.label)) return;
      const res = await window._shohoj_deletePaperByReport?.(btn.dataset.id, btn.dataset.paperId);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast(res.missingPaper ? 'Report dismissed; paper was already gone.' : 'Paper and report deleted.');
      _loadPapers();
      _loadPaperReports();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'delete-review-by-report') {
      if (!confirmDestructive('Delete the reported review and this report?', btn.dataset.label)) return;
      const res = await window._shohoj_deleteReviewByReport?.(btn.dataset.id, btn.dataset.reviewId);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast(res.missingReview ? 'Report dismissed; review was already gone.' : 'Review and report deleted.');
      _loadReviewReports();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'dismiss-paper-report') {
      const res = await window._shohoj_deletePaperReport?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Dismiss failed');
      _loadPaperReports();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'dismiss-review-report') {
      const res = await window._shohoj_deleteReviewReport?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Dismiss failed');
      _loadReviewReports();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'delete-group-by-report') {
      if (!confirmDestructive('Delete the reported study group and this report?', btn.dataset.label)) return;
      const res = await window._shohoj_deleteStudyGroupByReport?.(btn.dataset.id, btn.dataset.groupId);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast(res.missingGroup ? 'Report dismissed; group was already gone.' : 'Group and report deleted.');
      _loadStudyGroupReports();
      return;
    }
    if (act === 'dismiss-group-report') {
      const res = await window._shohoj_deleteStudyGroupReport?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Dismiss failed');
      _loadStudyGroupReports();
      return;
    }
    if (act === 'delete-feedback') {
      if (!confirmDestructive('Delete this feedback entry?', btn.dataset.label || 'this feedback')) return;
      const res = await window._shohoj_adminDeleteFeedback?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Deleted.');
      _loadFeedback();
      _loadStatsAndCharts();
      return;
    }
    if (act === 'delete-lostfound') {
      if (!confirmDestructive('Delete this lost & found post (and its contact record)?', btn.dataset.label || 'this post')) return;
      const res = await window._shohoj_adminDeleteLostFound?.(btn.dataset.id);
      if (!res?.ok) return _adminToast(res?.error || 'Delete failed');
      _adminToast('Deleted.');
      _loadLostFound();
      return;
    }
  } finally {
    btn.disabled = false;
  }
}

export function openAdminDashboard(opts = {}) {
  if (_open) return;
  if (!_adminCheck()) {
    _adminToast('Admin only.');
    return;
  }
  _open = true;
  _dedicated = !!opts.dedicated;

  let mount;
  if (opts.host) {
    mount = document.getElementById(opts.host);
    if (!mount) return;
    mount.innerHTML = _shellHtml({ dedicated: _dedicated });
  } else {
    mount = document.createElement('div');
    mount.id = 'adminPageRoot';
    mount.innerHTML = _shellHtml({ dedicated: false });
    document.body.appendChild(mount);
    document.body.classList.add('admin-mode');
  }
  window.scrollTo(0, 0);

  const closeBtn   = document.getElementById('adminCloseBtn');
  const refreshBtn = document.getElementById('adminRefreshBtn');
  if (closeBtn)   closeBtn.addEventListener('click', closeAdminDashboard);
  if (refreshBtn) refreshBtn.addEventListener('click', _refreshAll);
  document.getElementById('adminPage').addEventListener('click', _onAction);

  _refreshAll();
}

export function closeAdminDashboard() {
  _open = false;
  Object.keys(_charts).forEach(_destroyChart);
  if (_dedicated) {
    // On the dedicated /admin/ page, "close" returns to the main site.
    window.location.href = '../';
    return;
  }
  const root = document.getElementById('adminPageRoot');
  if (root) root.remove();
  document.body.classList.remove('admin-mode');
}

window._shohoj_openAdminDashboard = openAdminDashboard;
window._shohoj_closeAdminDashboard = closeAdminDashboard;

window.addEventListener('shohoj:auth-changed', () => {
  // If the admin signs out while open on the dedicated page, send them home.
  if (_open && _dedicated && !_adminCheck()) {
    closeAdminDashboard();
  }
});
