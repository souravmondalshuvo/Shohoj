// ── js/ui/reviewsTab.js ──────────────────────────────────────────────────────
// Dedicated Faculty Reviews tab — directory + per-faculty + per-course views.
// Driven by the URL hash so Back button and deep links work.
//
// Routes:
//   #calculator/reviews                    → directory (search + faculty list)
//   #calculator/reviews/MAK                → faculty page (all courses)
//   #calculator/reviews/MAK/CSE220         → faculty page filtered to one course

import {
  fetchRecentReviews, fetchReviewsForFaculty, fetchReviewsForCourse,
  aggregateByFaculty, aggregateRatings, isKnownCourseCode,
} from '../core/reviews.js';
import { normalizeInitials } from '../core/faculty.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { openReviewModal, openReportModal } from './reviews.js';

const LIMITED_DATA_THRESHOLD = 5;   // show "limited data" warning under this
const HIDE_AGGREGATE_UNDER   = 3;   // hide aggregate numbers entirely under this

function _isSignedIn() {
  return typeof window._shohoj_currentUid === 'function' && !!window._shohoj_currentUid();
}

// Parse the sub-route after #calculator/reviews
// Returns { view: 'directory'|'faculty', initials?, course? }
function _parseHash() {
  const hash = window.location.hash || '';
  const m = hash.match(/^#calculator\/reviews(?:\/([A-Za-z]{2,6}))?(?:\/([A-Za-z]{2,4}\d{3}[A-Za-z]?))?$/);
  if (!m) return { view: 'directory' };
  const initials = m[1] ? normalizeInitials(m[1]) : '';
  const course   = m[2] ? m[2].toUpperCase() : '';
  if (!initials) return { view: 'directory' };
  return { view: 'faculty', initials, course };
}

function _navigate(path) {
  if (window.location.hash !== path) {
    window.location.hash = path;
  } else {
    // Same hash — still re-render (user clicked a link that matched current URL)
    renderReviewsTab();
  }
}

function _ratePrompt(courseFilter) {
  return courseFilter && isKnownCourseCode(courseFilter)
    ? `<button class="rv-tab-btn-primary rv-tab-btn-full" data-rate>
        + Add your review for ${escHtml(courseFilter)}
      </button>`
    : `<div class="rv-tab-note">Choose a real catalog course chip above, or rate from the calculator/planner, to submit a review.</div>`;
}

// ── Public: main entry, called by main.js when tab activates or hash changes
export async function renderReviewsTab() {
  const root = document.getElementById('reviewsContent');
  if (!root) return;

  if (!_isSignedIn()) {
    root.innerHTML = _signInPrompt();
    return;
  }

  const route = _parseHash();
  if (route.view === 'faculty') {
    await _renderFacultyPage(root, route.initials, route.course);
  } else {
    await _renderDirectory(root);
  }
}

function _signInPrompt() {
  return `
    <div class="rv-tab-empty">
      <div class="rv-tab-empty-icon">🔒</div>
      <div class="rv-tab-empty-title">Sign in to read faculty reviews</div>
      <div class="rv-tab-empty-sub">Reviews are visible to signed-in BRACU students only.</div>
    </div>`;
}

// ── DIRECTORY ────────────────────────────────────────────────────────────────
async function _renderDirectory(root) {
  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-header">
        <div class="rv-tab-title">⭐ Faculty Reviews</div>
        <div class="rv-tab-sub">Search a faculty by initials or a course code. Ratings come from other BRACU students.</div>
      </div>
      <div class="rv-tab-searchrow">
        <input id="_rvt_q" type="text" class="rv-tab-input"
          placeholder="e.g. MAK or CSE220"
          autocomplete="off" spellcheck="false" />
        <button id="_rvt_go" class="rv-tab-btn-primary">Search</button>
      </div>
      <div id="_rvt_body" class="rv-tab-body">
        <div class="rv-tab-loading">Loading recent reviews…</div>
      </div>
    </div>
  `;

  const input = root.querySelector('#_rvt_q');
  const body  = root.querySelector('#_rvt_body');
  const go    = root.querySelector('#_rvt_go');

  const runSearch = async () => {
    const raw = (input.value || '').trim().toUpperCase();
    if (!raw) {
      body.innerHTML = `<div class="rv-tab-loading">Loading recent reviews…</div>`;
      const recent = await fetchRecentReviews(120);
      _renderFacultyList(body, aggregateByFaculty(recent), 'No reviews yet. Be the first to submit one.');
      return;
    }
    body.innerHTML = `<div class="rv-tab-loading">Searching…</div>`;
    // Course-code heuristic: 2–4 letters + 3 digits (+ optional letter)
    if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(raw)) {
      const { reviews } = await fetchReviewsForCourse(raw);
      _renderFacultyList(body, aggregateByFaculty(reviews), `No reviews yet for ${raw}.`, raw);
      return;
    }
    const initials = normalizeInitials(raw);
    if (initials.length < 2) {
      body.innerHTML = `<div class="rv-tab-note">Enter a course code (e.g. CSE220) or faculty initials (e.g. MAK).</div>`;
      return;
    }
    // Direct jump to the faculty page — it'll handle empty state
    _navigate(`#calculator/reviews/${initials}`);
  };

  go.onclick = runSearch;
  input.onkeydown = e => { if (e.key === 'Enter') runSearch(); };

  // Prime with recent reviews on first paint
  const recent = await fetchRecentReviews(120);
  _renderFacultyList(body, aggregateByFaculty(recent), 'No reviews yet. Be the first to submit one.');
}

function _renderFacultyList(container, groups, emptyMsg, courseScope = '') {
  if (!groups.length) {
    container.innerHTML = `<div class="rv-tab-note">${escHtml(emptyMsg)}</div>`;
    return;
  }
  const scopeLabel = courseScope
    ? `<div class="rv-tab-note" style="text-align:left;padding:0 4px 8px;">Faculty who have taught <strong>${escHtml(courseScope)}</strong>:</div>`
    : '';
  container.innerHTML = scopeLabel + `
    <div class="rv-tab-facultygrid">
      ${groups.map(g => _facultyCardHtml(g, courseScope)).join('')}
    </div>`;
  container.querySelectorAll('[data-faculty]').forEach(card => {
    card.onclick = () => {
      const fi = card.getAttribute('data-faculty');
      const course = card.getAttribute('data-course') || '';
      _navigate(course
        ? `#calculator/reviews/${fi}/${course}`
        : `#calculator/reviews/${fi}`);
    };
  });
}

function _facultyCardHtml(g, courseScope = '') {
  const showAgg = g.count >= HIDE_AGGREGATE_UNDER;
  const limited = g.count < LIMITED_DATA_THRESHOLD;
  return `
    <div class="rv-tab-facultycard" data-faculty="${escAttr(g.facultyInitials)}" data-course="${escAttr(courseScope)}" role="button" tabindex="0">
      <div class="rv-tab-facultycard-top">
        <span class="rv-tab-facultycard-initials">${escHtml(g.facultyInitials)}</span>
        <span class="rv-tab-facultycard-count">${g.count} review${g.count !== 1 ? 's' : ''}</span>
      </div>
      ${showAgg
        ? `<div class="rv-tab-facultycard-stars">${_starBar(g.overall)}</div>`
        : `<div class="rv-tab-facultycard-stars rv-tab-muted">Too few reviews — aggregate hidden</div>`
      }
      ${limited && showAgg
        ? `<div class="rv-tab-limited-note">Limited data (${g.count} review${g.count !== 1 ? 's' : ''})</div>`
        : ''
      }
    </div>`;
}

// ── FACULTY PAGE ─────────────────────────────────────────────────────────────
async function _renderFacultyPage(root, initials, courseFilter) {
  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-breadcrumb">
        <a href="#calculator/reviews" class="rv-tab-crumb">← All faculty</a>
        ${courseFilter
          ? `<a href="#calculator/reviews/${escAttr(initials)}" class="rv-tab-crumb">${escHtml(initials)}</a>
             <span class="rv-tab-crumb-sep">›</span>
             <span class="rv-tab-crumb-active">${escHtml(courseFilter)}</span>`
          : `<span class="rv-tab-crumb-active">${escHtml(initials)}</span>`
        }
      </div>
      <div id="_rvt_facbody" class="rv-tab-loading">Loading reviews…</div>
    </div>`;

  const body = root.querySelector('#_rvt_facbody');

  // Fetch all reviews for this faculty in one page so we can build course chips.
  // If the faculty has more than 200 we'll paginate later.
  const { reviews, nextCursor } = await fetchReviewsForFaculty(initials, '', { pageSize: 200 });

  if (!reviews.length) {
    body.innerHTML = `
      <div class="rv-tab-empty">
        <div class="rv-tab-empty-icon">📭</div>
        <div class="rv-tab-empty-title">No reviews yet for ${escHtml(initials)}</div>
        <div class="rv-tab-empty-sub">Be the first — rate this faculty from the planner or calculator for a specific course.</div>
        ${courseFilter && isKnownCourseCode(courseFilter) ? '<button class="rv-tab-btn-primary" id="_rvt_rateempty">+ Add your review</button>' : '<div class="rv-tab-note">Open a specific catalog course to submit the first review.</div>'}
      </div>`;
    const btn = body.querySelector('#_rvt_rateempty');
    if (btn) btn.onclick = () => openReviewModal({ facultyInitials: initials, courseCode: courseFilter });
    return;
  }

  // Build unique course chip list from all reviews for this faculty
  const courseSet = new Set();
  reviews.forEach(r => { if (r.courseCode) courseSet.add(String(r.courseCode).toUpperCase()); });
  const courses = Array.from(courseSet).sort();

  const scoped = courseFilter
    ? reviews.filter(r => String(r.courseCode || '').toUpperCase() === courseFilter)
    : reviews;

  const agg = aggregateRatings(scoped);
  const r = agg ? agg.ratings : null;
  const overallVals = r ? ['teaching','marking','behavior'].map(k => r[k]).filter(v => v !== null) : [];
  const overall = overallVals.length ? overallVals.reduce((s,v)=>s+v,0)/overallVals.length : null;

  const showAgg = scoped.length >= HIDE_AGGREGATE_UNDER;
  const limited = scoped.length < LIMITED_DATA_THRESHOLD;

  const chipsHtml = courses.length > 1 ? `
    <div class="rv-tab-chiprow">
      <a href="#calculator/reviews/${escAttr(initials)}"
         class="rv-tab-chip${courseFilter ? '' : ' active'}">All courses</a>
      ${courses.map(c => `
        <a href="#calculator/reviews/${escAttr(initials)}/${escAttr(c)}"
           class="rv-tab-chip${c === courseFilter ? ' active' : ''}">${escHtml(c)}</a>
      `).join('')}
    </div>` : '';

  const aggHtml = showAgg ? `
    <div class="rv-tab-aggcard">
      <div class="rv-tab-aggcard-top">
        <div class="rv-tab-aggcard-name">${escHtml(initials)}${courseFilter ? ` <span class="rv-tab-aggcard-course">· ${escHtml(courseFilter)}</span>` : ''}</div>
        <div class="rv-tab-aggcard-count">${scoped.length} review${scoped.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="rv-tab-aggcard-stars">${_starBar(overall)}</div>
      ${limited ? `<div class="rv-tab-limited-note">Limited data — take averages with a grain of salt.</div>` : ''}
      <div class="rv-tab-aggcard-grid">
        ${_dimCell('Teaching',   r.teaching)}
        ${_dimCell('Marking',    r.marking)}
        ${_dimCell('Behavior',   r.behavior)}
        ${_dimCell('Difficulty', r.difficulty)}
        ${_dimCell('Workload',   r.workload)}
      </div>
      ${_ratePrompt(courseFilter)}
    </div>` : `
    <div class="rv-tab-aggcard">
      <div class="rv-tab-aggcard-top">
        <div class="rv-tab-aggcard-name">${escHtml(initials)}${courseFilter ? ` <span class="rv-tab-aggcard-course">· ${escHtml(courseFilter)}</span>` : ''}</div>
        <div class="rv-tab-aggcard-count">${scoped.length} review${scoped.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="rv-tab-muted" style="margin:8px 0;">Not enough reviews to show averages yet (need at least ${HIDE_AGGREGATE_UNDER}).</div>
      ${_ratePrompt(courseFilter)}
    </div>`;

  const reviewsHtml = scoped.length ? `
    <div class="rv-tab-reviewslist">
      <div class="rv-tab-reviewslist-title">What students say</div>
      ${scoped
        .filter(x => x.text && x.text.trim().length > 0)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 40)
        .map(x => `
          <div class="rv-tab-reviewitem">
            <div class="rv-tab-reviewitem-meta">
              ${x.courseCode ? `<span class="rv-tab-reviewitem-course">${escHtml(String(x.courseCode).toUpperCase())}</span>` : ''}
              ${x.semester ? `<span class="rv-tab-reviewitem-sem">· ${escHtml(x.semester)}</span>` : ''}
              <button class="rv-tab-reviewitem-report" data-report="${escAttr(x.id)}" title="Report this review">⚠ Report</button>
            </div>
            <div class="rv-tab-reviewitem-text">${escHtml(x.text)}</div>
          </div>
        `).join('')}
      ${nextCursor ? `<div class="rv-tab-note">More reviews exist — refine by course to see them.</div>` : ''}
    </div>
  ` : '';

  body.innerHTML = chipsHtml + aggHtml + reviewsHtml;

  body.querySelectorAll('[data-rate]').forEach(btn => {
    btn.onclick = () => openReviewModal({ facultyInitials: initials, courseCode: courseFilter });
  });
  body.querySelectorAll('[data-report]').forEach(btn => {
    btn.onclick = () => openReportModal(btn.getAttribute('data-report'));
  });
}

function _dimCell(label, value) {
  const v = (typeof value === 'number') ? value.toFixed(1) : '—';
  return `
    <div class="rv-tab-dimcell">
      <div class="rv-tab-dimcell-label">${label}</div>
      <div class="rv-tab-dimcell-value">${v}</div>
    </div>`;
}

function _starBar(score) {
  if (score === null || score === undefined || isNaN(score)) {
    return `<span class="rv-tab-muted">No ratings yet</span>`;
  }
  const full = Math.round(score);
  const stars = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  return `<span class="rv-tab-stars">${stars}</span>
          <span class="rv-tab-score">${score.toFixed(1)}</span>`;
}

// Listen for hash changes so the tab re-renders when the user clicks chips /
// breadcrumb links. Also fires Back/Forward navigation.
window.addEventListener('hashchange', () => {
  const hash = window.location.hash || '';
  if (hash.startsWith('#calculator/reviews')) {
    // Activate the reviews tab if it isn't already, then re-render.
    if (typeof window.switchCalcTab === 'function') {
      window.switchCalcTab('reviews');
    } else {
      renderReviewsTab();
    }
  }
});
