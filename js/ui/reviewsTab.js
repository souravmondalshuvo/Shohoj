// ── js/ui/reviewsTab.js ──────────────────────────────────────────────────────
// Dedicated Faculty Reviews tab — hierarchical browse + per-faculty views.
// Driven by the URL hash so Back button and deep links work.
//
// Routes:
//   #calculator/reviews                     → department list + search shortcut
//   #calculator/reviews/dept/CSE            → course list for that dept
//   #calculator/reviews/course/CSE220       → faculty who have reviews for that course
//   #calculator/reviews/MAK                 → faculty page (all courses)
//   #calculator/reviews/MAK/CSE220          → faculty page filtered to one course

import {
  fetchRecentReviews, fetchReviewsForFaculty, fetchReviewsForCourse,
  aggregateByFaculty, aggregateRatings, isKnownCourseCode,
} from '../core/reviews.js';
import { normalizeInitials, getFacultyProfile, upsertFacultyProfile, suggestFaculty } from '../core/faculty.js';
import { DEPARTMENTS } from '../core/departments.js';
import { COURSE_DB } from '../core/catalog.js';
import { escHtml, escAttr } from '../core/helpers.js';
import { openReviewModal, openReportModal } from './reviews.js';

const LIMITED_DATA_THRESHOLD = 5;
const HIDE_AGGREGATE_UNDER   = 3;

function _isSignedIn() {
  return typeof window._shohoj_currentUid === 'function' && !!window._shohoj_currentUid();
}

// ── Route parser ─────────────────────────────────────────────────────────────
function _parseHash() {
  const hash = window.location.hash || '';

  // Dept route: #calculator/reviews/dept/CSE
  const deptM = hash.match(/^#calculator\/reviews\/dept\/([A-Za-z]{2,6})$/);
  if (deptM) return { view: 'courses', dept: deptM[1].toUpperCase() };

  // Course route: #calculator/reviews/course/CSE220
  const courseM = hash.match(/^#calculator\/reviews\/course\/([A-Za-z]{2,4}\d{3}[A-Za-z]?)$/);
  if (courseM) return { view: 'course', course: courseM[1].toUpperCase() };

  // Faculty route: #calculator/reviews/MAK[/CSE220]
  const facM = hash.match(/^#calculator\/reviews(?:\/([A-Za-z]{2,6}))?(?:\/([A-Za-z]{2,4}\d{3}[A-Za-z]?))?$/);
  if (facM) {
    const initials = facM[1] ? normalizeInitials(facM[1]) : '';
    const course   = facM[2] ? facM[2].toUpperCase() : '';
    if (initials) return { view: 'faculty', initials, course };
  }

  return { view: 'depts' };
}

function _navigate(path) {
  if (window.location.hash !== path) {
    window.location.hash = path;
  } else {
    renderReviewsTab();
  }
}

// ── Public entry ─────────────────────────────────────────────────────────────
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
  } else if (route.view === 'courses') {
    await _renderCourseList(root, route.dept);
  } else if (route.view === 'course') {
    await _renderCoursePage(root, route.course);
  } else {
    _renderDeptList(root);
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

// ── DEPT LIST (root view) ─────────────────────────────────────────────────────
function _renderDeptList(root) {
  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-header">
        <div class="rv-tab-title">⭐ Faculty Reviews</div>
        <div class="rv-tab-sub">Browse by department, or search directly by faculty initials or course code.</div>
      </div>
      <div class="rv-tab-searchwrap">
        <div class="rv-tab-searchrow">
          <input id="_rvt_q" type="text" class="rv-tab-input"
            placeholder="e.g. MAK, CSE220, or Data Structures"
            autocomplete="off" spellcheck="false" />
          <button id="_rvt_go" class="rv-tab-btn-primary">Search</button>
        </div>
        <div id="_rvt_suggestions" class="rv-tab-suggestions-dropdown" hidden></div>
      </div>
      <div class="rv-tab-deptgrid">
        ${Object.entries(DEPARTMENTS).map(([code, d]) => `
          <div class="rv-tab-deptcard" data-dept="${escAttr(code)}" role="button" tabindex="0">
            <div class="rv-tab-deptcard-code">${escHtml(code)}</div>
            <div class="rv-tab-deptcard-label">${escHtml(_shortDeptLabel(d.label))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const input   = root.querySelector('#_rvt_q');
  const go      = root.querySelector('#_rvt_go');
  const dropdown = root.querySelector('#_rvt_suggestions');

  let activeIdx = -1;

  const hideSuggestions = () => {
    dropdown.hidden = true;
    activeIdx = -1;
  };

  const navigate = (href) => {
    hideSuggestions();
    input.value = '';
    _navigate(href);
  };

  const runSearch = () => {
    const raw = (input.value || '').trim().toUpperCase();
    if (!raw) return;
    // If an item is keyboard-selected, use it
    const active = dropdown.querySelector('.rv-sug-item.active');
    if (active && !dropdown.hidden) {
      navigate(active.dataset.href);
      return;
    }
    if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(raw)) {
      navigate(`#calculator/reviews/course/${raw}`);
      return;
    }
    const initials = normalizeInitials(raw);
    if (initials.length >= 2) navigate(`#calculator/reviews/${initials}`);
  };

  const updateSuggestions = () => {
    const raw = (input.value || '').trim();
    if (raw.length < 2) { hideSuggestions(); return; }

    const q = raw.toUpperCase();
    const courses = _suggestCourses(q, 6);
    const faculty = suggestFaculty(q, 5);

    // If input matches a course code exactly, also show a "search as faculty" fallback
    const looksLikeInitials = /^[A-Z]{2,6}$/.test(q);

    if (!courses.length && !faculty.length && !looksLikeInitials) {
      hideSuggestions();
      return;
    }

    let html = '';

    if (courses.length) {
      html += `<div class="rv-sug-label">Courses</div>`;
      html += courses.map(c => `
        <div class="rv-sug-item" data-href="#calculator/reviews/course/${escAttr(c.code)}" role="option" tabindex="-1">
          <span class="rv-sug-code">${escHtml(c.code)}</span>
          <span class="rv-sug-name">${escHtml(c.name)}</span>
        </div>`).join('');
    }

    if (faculty.length) {
      html += `<div class="rv-sug-label">Faculty</div>`;
      html += faculty.map(f => `
        <div class="rv-sug-item" data-href="#calculator/reviews/${escAttr(f.initials)}" role="option" tabindex="-1">
          <span class="rv-sug-code">${escHtml(f.initials)}</span>
          ${f.name ? `<span class="rv-sug-name">${escHtml(f.name)}</span>` : ''}
        </div>`).join('');
    } else if (looksLikeInitials && !faculty.length) {
      html += `<div class="rv-sug-label">Faculty</div>`;
      html += `<div class="rv-sug-item" data-href="#calculator/reviews/${escAttr(q)}" role="option" tabindex="-1">
        <span class="rv-sug-code">${escHtml(q)}</span>
        <span class="rv-sug-name rv-sug-hint">Search by initials</span>
      </div>`;
    }

    dropdown.innerHTML = html;
    dropdown.hidden = false;
    activeIdx = -1;

    dropdown.querySelectorAll('.rv-sug-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        navigate(item.dataset.href);
      });
    });
  };

  input.addEventListener('input', updateSuggestions);

  input.addEventListener('keydown', e => {
    const items = Array.from(dropdown.querySelectorAll('.rv-sug-item'));
    if (!dropdown.hidden && items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
        return;
      }
      if (e.key === 'Escape') { hideSuggestions(); return; }
    }
    if (e.key === 'Enter') runSearch();
  });

  go.onclick = runSearch;

  document.addEventListener('click', e => {
    if (!root.contains(e.target)) hideSuggestions();
  }, { once: false, capture: false });

  root.querySelectorAll('[data-dept]').forEach(card => {
    card.onclick = () => _navigate(`#calculator/reviews/dept/${card.getAttribute('data-dept')}`);
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') card.click(); };
  });
}

// Course autocomplete — searches COURSE_DB by code prefix, code contains, name substring
function _suggestCourses(q, limit = 6) {
  const prefix = [], codeHit = [], nameHit = [];
  for (const [code, info] of Object.entries(COURSE_DB)) {
    if (code.startsWith(q))               prefix.push({ code, name: info.name });
    else if (code.includes(q))            codeHit.push({ code, name: info.name });
    else if (info.name.toUpperCase().includes(q)) nameHit.push({ code, name: info.name });
    if (prefix.length + codeHit.length + nameHit.length >= limit * 2) break;
  }
  return [...prefix, ...codeHit, ...nameHit].slice(0, limit);
}

function _shortDeptLabel(label) {
  return label
    .replace(/\s*\([A-Z]{2,6}\)$/, '')
    .trim()
    .replace(/^B\.[A-Z.]+\s+in\s+/i, '')
    .replace(/^Bachelor\s+of\s+/i, '')
    .replace(/^BSc\s+[A-Z]+\s+[—–-]\s+/i, '')
    .trim();
}

// Extract course code from preset name like "Data Structures (CSE220)"
function _extractCode(name) {
  const m = String(name).match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
  return m ? m[1] : null;
}

// All unique course codes for a dept from its curriculum presets
function _deptCourses(dept) {
  const d = DEPARTMENTS[dept];
  if (!d) return [];
  const codes = new Set();
  for (const preset of d.presets) {
    for (const c of preset.courses) {
      const code = _extractCode(c.name);
      if (code) codes.add(code);
    }
  }
  return Array.from(codes).sort();
}

// ── COURSE LIST FOR DEPT ──────────────────────────────────────────────────────
async function _renderCourseList(root, dept) {
  const deptInfo  = DEPARTMENTS[dept];
  const deptLabel = deptInfo ? deptInfo.label : dept;

  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-breadcrumb">
        <a href="#calculator/reviews" class="rv-tab-crumb">← All Departments</a>
        <span class="rv-tab-crumb-sep">›</span>
        <span class="rv-tab-crumb-active">${escHtml(dept)}</span>
      </div>
      <div class="rv-tab-header" style="margin-top:12px;">
        <div class="rv-tab-title">${escHtml(deptLabel)}</div>
        <div class="rv-tab-sub">Select a course to see which faculty have been reviewed for it.</div>
      </div>
      <div id="_rvt_coursebody" class="rv-tab-loading">Loading…</div>
    </div>`;

  const body = root.querySelector('#_rvt_coursebody');

  if (!deptInfo) {
    body.innerHTML = `<div class="rv-tab-note">Unknown department.</div>`;
    return;
  }

  const courses = _deptCourses(dept);

  const recent = await fetchRecentReviews(200);
  const reviewCounts = {};
  for (const r of recent) {
    const c = String(r.courseCode || '').toUpperCase();
    if (c) reviewCounts[c] = (reviewCounts[c] || 0) + 1;
  }

  body.innerHTML = `
    <div class="rv-tab-coursegrid">
      ${courses.map(code => {
        const info  = COURSE_DB[code];
        const name  = info ? info.name : code;
        const count = reviewCounts[code] || 0;
        return `
          <div class="rv-tab-coursecard" data-course="${escAttr(code)}" role="button" tabindex="0">
            <div class="rv-tab-coursecard-code">${escHtml(code)}</div>
            <div class="rv-tab-coursecard-name">${escHtml(name)}</div>
            ${count > 0
              ? `<div class="rv-tab-coursecard-count">${count} review${count !== 1 ? 's' : ''}</div>`
              : `<div class="rv-tab-coursecard-count rv-tab-muted">No reviews yet</div>`
            }
          </div>`;
      }).join('')}
    </div>`;

  body.querySelectorAll('[data-course]').forEach(card => {
    card.onclick = () => _navigate(`#calculator/reviews/course/${card.getAttribute('data-course')}`);
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') card.click(); };
  });
}

// ── COURSE PAGE (faculty for a course) ───────────────────────────────────────
async function _renderCoursePage(root, courseCode) {
  const info      = COURSE_DB[courseCode];
  const courseName = info ? info.name : courseCode;
  const deptCode  = courseCode.replace(/\d.*/, '');
  const deptInfo  = DEPARTMENTS[deptCode];

  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-breadcrumb">
        <a href="#calculator/reviews" class="rv-tab-crumb">← Departments</a>
        ${deptInfo ? `
          <span class="rv-tab-crumb-sep">›</span>
          <a href="#calculator/reviews/dept/${escAttr(deptCode)}" class="rv-tab-crumb">${escHtml(deptCode)}</a>` : ''}
        <span class="rv-tab-crumb-sep">›</span>
        <span class="rv-tab-crumb-active">${escHtml(courseCode)}</span>
      </div>
      <div class="rv-tab-header" style="margin-top:12px;">
        <div class="rv-tab-title">${escHtml(courseCode)} — ${escHtml(courseName)}</div>
        <div class="rv-tab-sub">Faculty who have been reviewed for this course.</div>
      </div>
      <div id="_rvt_coursefacbody" class="rv-tab-loading">Loading…</div>
    </div>`;

  const body = root.querySelector('#_rvt_coursefacbody');
  const { reviews } = await fetchReviewsForCourse(courseCode);

  if (!reviews.length) {
    body.innerHTML = `
      <div class="rv-tab-empty">
        <div class="rv-tab-empty-icon">📭</div>
        <div class="rv-tab-empty-title">No reviews yet for ${escHtml(courseCode)}</div>
        <div class="rv-tab-empty-sub">Be the first — rate a faculty from the planner or calculator.</div>
      </div>`;
    return;
  }

  const groups = aggregateByFaculty(reviews);
  await _loadFacultyProfiles(groups.map(g => g.facultyInitials));

  body.innerHTML = `
    <div class="rv-tab-facultygrid">
      ${groups.map(g => _facultyCardHtml(g, courseCode)).join('')}
    </div>`;

  body.querySelectorAll('[data-faculty]').forEach(card => {
    card.onclick = () => {
      const fi     = card.getAttribute('data-faculty');
      const course = card.getAttribute('data-course') || '';
      _navigate(course
        ? `#calculator/reviews/${fi}/${course}`
        : `#calculator/reviews/${fi}`);
    };
  });
}

// Fetch faculty profiles from Firestore and merge into local cache
async function _loadFacultyProfiles(initialsArr) {
  if (typeof window._shohoj_fetchFacultyProfiles !== 'function' || !initialsArr.length) return;
  try {
    const profiles = await window._shohoj_fetchFacultyProfiles(initialsArr);
    for (const p of profiles) upsertFacultyProfile(p);
  } catch (_) { /* names are optional */ }
}

// ── FACULTY PAGE ─────────────────────────────────────────────────────────────
async function _renderFacultyPage(root, initials, courseFilter) {
  await _loadFacultyProfiles([initials]);
  const profile     = getFacultyProfile(initials);
  const facultyName = profile?.name || '';

  root.innerHTML = `
    <div class="rv-tab">
      <div class="rv-tab-breadcrumb">
        <a href="#calculator/reviews" class="rv-tab-crumb">← Departments</a>
        ${courseFilter
          ? `<span class="rv-tab-crumb-sep">›</span>
             <a href="#calculator/reviews/course/${escAttr(courseFilter)}" class="rv-tab-crumb">${escHtml(courseFilter)}</a>
             <span class="rv-tab-crumb-sep">›</span>
             <span class="rv-tab-crumb-active">${escHtml(initials)}</span>`
          : `<span class="rv-tab-crumb-sep">›</span>
             <span class="rv-tab-crumb-active">${escHtml(initials)}</span>`
        }
      </div>
      <div id="_rvt_facbody" class="rv-tab-loading">Loading reviews…</div>
    </div>`;

  const body = root.querySelector('#_rvt_facbody');

  const { reviews, nextCursor } = await fetchReviewsForFaculty(initials, '', { pageSize: 200 });

  if (!reviews.length) {
    body.innerHTML = `
      <div class="rv-tab-empty">
        <div class="rv-tab-empty-icon">📭</div>
        <div class="rv-tab-empty-title">No reviews yet for ${escHtml(initials)}</div>
        <div class="rv-tab-empty-sub">Be the first — rate this faculty from the planner or calculator for a specific course.</div>
        ${courseFilter && isKnownCourseCode(courseFilter)
          ? '<button class="rv-tab-btn-primary" id="_rvt_rateempty">+ Add your review</button>'
          : '<div class="rv-tab-note">Open a specific catalog course to submit the first review.</div>'
        }
      </div>`;
    const btn = body.querySelector('#_rvt_rateempty');
    if (btn) btn.onclick = () => openReviewModal({ facultyInitials: initials, courseCode: courseFilter });
    return;
  }

  const courseSet = new Set();
  reviews.forEach(r => { if (r.courseCode) courseSet.add(String(r.courseCode).toUpperCase()); });
  const courses = Array.from(courseSet).sort();

  const scoped = courseFilter
    ? reviews.filter(r => String(r.courseCode || '').toUpperCase() === courseFilter)
    : reviews;

  const agg = aggregateRatings(scoped);
  const r = agg ? agg.ratings : null;
  const overallVals = r ? ['teaching','marking','behavior'].map(k => r[k]).filter(v => v !== null) : [];
  const overall = overallVals.length ? overallVals.reduce((s,v) => s+v, 0) / overallVals.length : null;

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

  const nameHtml = facultyName
    ? `<div class="rv-tab-aggcard-facultyname">${escHtml(facultyName)}</div>`
    : '';

  const aggHtml = showAgg ? `
    <div class="rv-tab-aggcard">
      <div class="rv-tab-aggcard-top">
        <div>
          <div class="rv-tab-aggcard-name">${escHtml(initials)}${courseFilter ? ` <span class="rv-tab-aggcard-course">· ${escHtml(courseFilter)}</span>` : ''}</div>
          ${nameHtml}
        </div>
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
    </div>
    ${_verdictHtml(scoped, r)}` : `
    <div class="rv-tab-aggcard">
      <div class="rv-tab-aggcard-top">
        <div>
          <div class="rv-tab-aggcard-name">${escHtml(initials)}${courseFilter ? ` <span class="rv-tab-aggcard-course">· ${escHtml(courseFilter)}</span>` : ''}</div>
          ${nameHtml}
        </div>
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
              ${x.semester   ? `<span class="rv-tab-reviewitem-sem">· ${escHtml(x.semester)}</span>` : ''}
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

function _ratePrompt(courseFilter) {
  return courseFilter && isKnownCourseCode(courseFilter)
    ? `<button class="rv-tab-btn-primary rv-tab-btn-full" data-rate>
        + Add your review for ${escHtml(courseFilter)}
      </button>`
    : `<div class="rv-tab-note">Choose a real catalog course chip above, or rate from the calculator/planner, to submit a review.</div>`;
}

// ── Faculty card (shared between course page and search results) ──────────────
function _facultyCardHtml(g, courseScope = '') {
  const profile = getFacultyProfile(g.facultyInitials);
  const name    = profile?.name || '';
  const showAgg = g.count >= HIDE_AGGREGATE_UNDER;
  const limited = g.count < LIMITED_DATA_THRESHOLD;
  return `
    <div class="rv-tab-facultycard" data-faculty="${escAttr(g.facultyInitials)}" data-course="${escAttr(courseScope)}" role="button" tabindex="0">
      <div class="rv-tab-facultycard-top">
        <span class="rv-tab-facultycard-initials">${escHtml(g.facultyInitials)}</span>
        <span class="rv-tab-facultycard-count">${g.count} review${g.count !== 1 ? 's' : ''}</span>
      </div>
      ${name ? `<div class="rv-tab-facultycard-name">${escHtml(name)}</div>` : ''}
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

// ── Verdict ───────────────────────────────────────────────────────────────────
function _verdictHtml(scoped, ratings) {
  if (!ratings || scoped.length < LIMITED_DATA_THRESHOLD) return '';

  const qualityVals = ['teaching', 'marking', 'behavior'].map(k => ratings[k]).filter(v => v !== null);
  if (!qualityVals.length) return '';
  const qualityAvg = qualityVals.reduce((s, v) => s + v, 0) / qualityVals.length;

  let verdict, cls, reason;
  if (qualityAvg >= 4.2) {
    verdict = 'Take this faculty';
    cls     = 'rv-verdict--great';
    reason  = 'Consistently rated excellent — strong teaching, fair marking, and good conduct.';
  } else if (qualityAvg >= 3.7) {
    verdict = 'Generally recommended';
    cls     = 'rv-verdict--good';
    reason  = 'Above-average ratings across most dimensions. Most students have a positive experience.';
  } else if (qualityAvg >= 3.0) {
    verdict = 'Mixed — proceed with caution';
    cls     = 'rv-verdict--mixed';
    reason  = 'Student experiences vary. Some find this faculty fine; others have concerns.';
  } else if (qualityAvg >= 2.5) {
    verdict = 'Think twice';
    cls     = 'rv-verdict--warn';
    reason  = 'Below-average ratings on key dimensions. Consider alternatives if possible.';
  } else {
    verdict = 'Avoid if possible';
    cls     = 'rv-verdict--bad';
    reason  = 'Rated poorly across teaching, marking, and/or conduct by most reviewers.';
  }

  const tags = [];
  if (ratings.difficulty !== null && ratings.difficulty >= 4.0)
    tags.push(`Difficult exams (${ratings.difficulty.toFixed(1)}/5)`);
  if (ratings.workload !== null && ratings.workload >= 4.0)
    tags.push(`Heavy workload (${ratings.workload.toFixed(1)}/5)`);

  const effortHtml = tags.length
    ? `<div class="rv-verdict-tags">${tags.map(t => `<span class="rv-verdict-tag">${escHtml(t)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="rv-verdict ${escAttr(cls)}">
      <div class="rv-verdict-header">
        <span class="rv-verdict-label">AI Verdict</span>
        <span class="rv-verdict-result">${escHtml(verdict)}</span>
      </div>
      <div class="rv-verdict-reason">${escHtml(reason)}</div>
      ${effortHtml}
      <div class="rv-verdict-basis">Based on ${scoped.length} review${scoped.length !== 1 ? 's' : ''} · Quality score ${qualityAvg.toFixed(2)}/5</div>
    </div>`;
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
  const full  = Math.round(score);
  const stars = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  return `<span class="rv-tab-stars">${stars}</span>
          <span class="rv-tab-score">${score.toFixed(1)}</span>`;
}

// ── Hash change listener ──────────────────────────────────────────────────────
window.addEventListener('hashchange', () => {
  const hash = window.location.hash || '';
  if (hash.startsWith('#calculator/reviews')) {
    if (typeof window.switchCalcTab === 'function') {
      window.switchCalcTab('reviews');
    } else {
      renderReviewsTab();
    }
  }
});
