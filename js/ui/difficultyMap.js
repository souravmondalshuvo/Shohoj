// ── js/ui/difficultyMap.js ────────────────────────────────────────────────────
// Course Difficulty Map tab — aggregates difficulty + workload ratings across
// all seeded and user-submitted reviews, grouped by course.

import { fetchRecentReviews, aggregateRatings } from '../core/reviews.js';
import { COURSE_DB, getCourseDept, getCoursePrefix } from '../core/catalog.js';
import { escHtml, escAttr } from '../core/helpers.js';

const MIN_REVIEWS  = 3;
const FETCH_LIMIT  = 5000;

// ── Data layer ────────────────────────────────────────────────────────────────

async function _buildIndex() {
  const all = await fetchRecentReviews(FETCH_LIMIT);
  const byCourse = new Map();
  for (const r of all) {
    const code = r.courseCode;
    if (!code) continue;
    if (!byCourse.has(code)) byCourse.set(code, []);
    byCourse.get(code).push(r);
  }
  const entries = [];
  for (const [code, revs] of byCourse) {
    if (revs.length < MIN_REVIEWS) continue;
    const agg = aggregateRatings(revs);
    if (!agg) continue;
    const info = COURSE_DB[code] || { code, name: code, credits: null };
    const dept  = getCourseDept(code) || getCoursePrefix(code) || '?';
    entries.push({
      code,
      name:       info.name || code,
      credits:    info.credits ?? null,
      dept,
      count:      revs.length,
      difficulty: agg.ratings.difficulty,
      workload:   agg.ratings.workload,
    });
  }
  return entries;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function _scoreClass(v) {
  if (v === null) return '';
  if (v <= 2.0)  return 'great';
  if (v <= 3.0)  return 'good';
  if (v <= 3.7)  return 'mid';
  if (v <= 4.3)  return 'warn';
  return 'bad';
}

function _scoreColor(v) {
  if (v === null) return 'var(--text3)';
  if (v <= 2.0)  return '#2ECC71';
  if (v <= 3.0)  return '#A8D820';
  if (v <= 3.7)  return '#F0A500';
  if (v <= 4.3)  return '#E67E22';
  return '#E74C3C';
}

function _diffLabel(v) {
  if (v === null) return '—';
  if (v <= 2.0)  return 'Easy';
  if (v <= 3.0)  return 'Moderate';
  if (v <= 3.7)  return 'Challenging';
  if (v <= 4.3)  return 'Hard';
  return 'Brutal';
}

function _workloadLabel(v) {
  if (v === null) return '—';
  if (v <= 2.0)  return 'Light';
  if (v <= 3.0)  return 'Moderate';
  if (v <= 3.7)  return 'Heavy';
  if (v <= 4.3)  return 'Very Heavy';
  return 'Extreme';
}

// ── State ─────────────────────────────────────────────────────────────────────

let _cache      = null;
let _activeDept = 'ALL';
let _sortBy     = 'difficulty';

// ── HTML helpers ──────────────────────────────────────────────────────────────

function _barHtml(val, label) {
  const pct   = val !== null ? Math.round((val / 5) * 100) : 0;
  const color = _scoreColor(val);
  const cls   = _scoreClass(val);
  const num   = val !== null ? val.toFixed(1) : '—';
  return `<div class="dm-bar-row">
    <span class="dm-bar-label">${escHtml(label)}</span>
    <div class="dm-bar-track"><div class="dm-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="dm-bar-value dm-bar-value--${cls}">${num}</span>
  </div>`;
}

function _cardHtml(e) {
  const cls  = _scoreClass(e.difficulty);
  const tag  = _diffLabel(e.difficulty);
  return `<button class="dm-card" onclick="window._dm_goToCourse('${escAttr(e.code)}')" title="${escAttr(e.name)}">
    <div class="dm-card-head">
      <span class="dm-card-code">${escHtml(e.code)}</span>
      <span class="dm-card-tag dm-card-tag--${cls}">${escHtml(tag)}</span>
    </div>
    <div class="dm-card-name">${escHtml(e.name)}</div>
    ${_barHtml(e.difficulty, 'Difficulty')}
    ${_barHtml(e.workload,   'Workload')}
    <div class="dm-card-foot">${e.count} review${e.count !== 1 ? 's' : ''}</div>
  </button>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function _render(root, entries) {
  const depts    = ['ALL', ...Array.from(new Set(entries.map(e => e.dept))).sort()];
  const filtered = _activeDept === 'ALL' ? entries : entries.filter(e => e.dept === _activeDept);
  const sorted   = [...filtered].sort((a, b) => (b[_sortBy] ?? 0) - (a[_sortBy] ?? 0));
  const total    = entries.reduce((s, e) => s + e.count, 0);

  const pillsHtml = depts.map(d => {
    const active = d === _activeDept ? ' dm-pill--active' : '';
    const label  = d === 'ALL' ? 'All' : d;
    return `<button class="dm-pill${active}" onclick="window._dm_setDept('${escAttr(d)}')">${escHtml(label)}</button>`;
  }).join('');

  const sortHtml = `<div class="dm-sort">
    <span class="dm-sort-label">Sort</span>
    <button class="dm-sort-btn${_sortBy === 'difficulty' ? ' dm-sort-btn--active' : ''}" onclick="window._dm_setSort('difficulty')">Difficulty</button>
    <button class="dm-sort-btn${_sortBy === 'workload'   ? ' dm-sort-btn--active' : ''}" onclick="window._dm_setSort('workload')">Workload</button>
  </div>`;

  const gridHtml = sorted.length
    ? sorted.map(_cardHtml).join('')
    : `<div class="dm-empty">No courses with enough reviews in this department yet.</div>`;

  root.innerHTML = `<div class="dm-root">
    <div class="dm-header">
      <div class="dm-title">Course Difficulty Map</div>
      <div class="dm-subtitle">Based on ${total} review${total !== 1 ? 's' : ''} · Courses with fewer than ${MIN_REVIEWS} reviews are hidden</div>
    </div>
    <div class="dm-controls">
      <div class="dm-pills">${pillsHtml}</div>
      ${sortHtml}
    </div>
    <div class="dm-grid">${gridHtml}</div>
  </div>`;
}

// ── Public entry ──────────────────────────────────────────────────────────────

export async function renderDifficultyMapTab() {
  const root = document.getElementById('difficultyMapContent');
  if (!root) return;

  window._dm_setDept = (dept) => { _activeDept = dept; if (_cache) _render(root, _cache); };
  window._dm_setSort = (by)   => { _sortBy = by;       if (_cache) _render(root, _cache); };
  window._dm_goToCourse = (code) => {
    window.location.hash = `#calculator/reviews/course/${code}`;
    if (typeof window.switchCalcTab === 'function') window.switchCalcTab('reviews');
  };

  if (_cache) { _render(root, _cache); return; }

  root.innerHTML = '<div class="dm-loading">Loading…</div>';
  try {
    _cache = await _buildIndex();
    _render(root, _cache);
  } catch (err) {
    root.innerHTML = '<div class="dm-empty">Failed to load data.</div>';
    console.error('[difficultyMap]', err);
  }
}
