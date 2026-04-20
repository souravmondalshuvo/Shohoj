// ── js/ui/reviews.js ──────────────────────────────────────────────────────────
// Faculty review submission modal + inline widgets.
// Follows the same vanilla-HTML modal pattern used by firebase.js (confirm,
// migration, sign-in modals): build an overlay DOM node, append to body,
// wire buttons, remove on close.

import { submitReview, RATING_KEYS, fetchReviewsForCourse, aggregateByFaculty,
         fetchReviewsForFaculty, aggregateRatings, fetchRecentReviews,
         reportReview } from '../core/reviews.js';
import { normalizeInitials, isValidInitials } from '../core/faculty.js';
import { escHtml, escAttr } from '../core/helpers.js';

const RATING_LABELS = {
  teaching:   { label: 'Teaching Quality', hint: 'Clarity, prep, engagement' },
  marking:    { label: 'Marking Fairness', hint: 'Consistency, transparency' },
  behavior:   { label: 'Behavior & Attitude', hint: 'Respect, approachability' },
  difficulty: { label: 'Course Difficulty', hint: '1 = easy, 5 = brutal' },
  workload:   { label: 'Workload', hint: '1 = light, 5 = heavy' },
};

function _theme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  return {
    isDark,
    bg:     isDark ? '#0d1f12' : '#f0faf3',
    text:   isDark ? '#e8f0ea' : '#0d2914',
    text2:  isDark ? '#8aab90' : '#3a6b47',
    border: isDark ? 'rgba(46,204,113,0.20)' : 'rgba(46,204,113,0.28)',
    input:  isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };
}

function _injectKeyframes() {
  if (document.getElementById('shohojReviewKeyframes')) return;
  const s = document.createElement('style');
  s.id = 'shohojReviewKeyframes';
  s.textContent = `
    @keyframes reviewFadeIn { from{opacity:0;transform:scale(0.97) translateY(8px);} to{opacity:1;transform:scale(1) translateY(0);} }
    .rv-star { cursor:pointer;font-size:20px;line-height:1;padding:2px;color:#555;transition:color 0.15s,transform 0.1s;user-select:none; }
    .rv-star:hover { transform:scale(1.15); }
    .rv-star.filled { color:#F0A500; }
    .rv-row { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06); }
    .rv-row:last-of-type { border-bottom:none; }
    .rv-row-label { flex:1;min-width:0; }
    .rv-row-title { font-size:13px;font-weight:600; }
    .rv-row-hint  { font-size:11px;opacity:0.6;margin-top:2px; }
    .rv-row-stars { display:flex;gap:2px;flex-shrink:0; }
    .rv-input {
      width:100%;padding:10px 12px;border-radius:10px;
      font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;
      outline:none;box-sizing:border-box;
    }
    .rv-input:focus { border-color:rgba(46,204,113,0.55); }
  `;
  document.head.appendChild(s);
}

function _starsRow(dimKey, initial = 0) {
  return `
    <div class="rv-row-stars" data-dim="${dimKey}">
      ${[1,2,3,4,5].map(n => `
        <span class="rv-star${n <= initial ? ' filled' : ''}" data-val="${n}">★</span>
      `).join('')}
    </div>`;
}

// Public: open the review modal.
// opts: { facultyInitials, courseCode, semester, onSubmitted }
// Returns a promise that resolves with { submitted:boolean, skipped:boolean }.
export function openReviewModal(opts = {}) {
  _injectKeyframes();
  const { isDark, bg, text, text2, border, input } = _theme();
  const initialInitials = normalizeInitials(opts.facultyInitials || '');
  const courseCode = String(opts.courseCode || '').toUpperCase();
  const semester = String(opts.semester || '');

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'reviewModal';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.72);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;
      animation:reviewFadeIn 0.2s ease;padding:16px;
    `;

    overlay.innerHTML = `
      <div style="
        background:${bg};border:1px solid ${border};border-radius:20px;
        padding:24px 22px;max-width:440px;width:100%;max-height:92vh;overflow-y:auto;
        box-shadow:0 32px 80px rgba(0,0,0,0.55);color:${text};
        position:relative;
      ">
        <button id="_rvClose" style="
          position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;
          background:${input};border:1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(0,0,0,0.08)'};
          color:${text2};font-size:18px;line-height:1;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
        ">×</button>

        <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px;">
          Rate your faculty
        </div>
        <div style="font-size:12px;color:${text2};line-height:1.5;margin-bottom:16px;">
          Pseudonymous to other students. Reviews are immutable once submitted from the client.
          ${courseCode ? `<br>Course: <strong style="color:${text}">${escHtml(courseCode)}</strong>` : ''}
          ${semester ? ` · ${escHtml(semester)}` : ''}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${text2};">
            Faculty Initials
          </label>
          <input id="_rvInitials" class="rv-input" type="text" maxlength="6"
            placeholder="e.g. MNR" value="${escAttr(initialInitials)}"
            style="background:${input};border:1px solid ${border};color:${text};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;" />
          <div id="_rvInitialsErr" style="font-size:11px;color:#e74c3c;display:none;">
            Initials must be 2–6 letters.
          </div>
        </div>

        <div style="border:1px solid ${border};border-radius:12px;padding:2px 14px;margin-bottom:14px;background:${input};">
          ${Object.entries(RATING_LABELS).map(([key, { label, hint }]) => `
            <div class="rv-row">
              <div class="rv-row-label">
                <div class="rv-row-title" style="color:${text};">${label}</div>
                <div class="rv-row-hint" style="color:${text2};">${hint}</div>
              </div>
              ${_starsRow(key, 0)}
            </div>
          `).join('')}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${text2};">
            Your experience (optional)
          </label>
          <textarea id="_rvText" class="rv-input" rows="3" maxlength="500"
            placeholder="What stood out? Keep it honest and respectful."
            style="background:${input};border:1px solid ${border};color:${text};resize:vertical;min-height:64px;"></textarea>
          <div id="_rvCount" style="font-size:11px;color:${text2};text-align:right;">0 / 500</div>
        </div>

        <div id="_rvError" style="font-size:12px;color:#e74c3c;display:none;margin-bottom:10px;"></div>

        <div style="display:flex;gap:10px;">
          <button id="_rvSkip" style="
            flex:1;padding:12px;border-radius:10px;
            background:${input};border:1px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.10)'};
            color:${text2};font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;
          ">Skip</button>
          <button id="_rvSubmit" style="
            flex:1.4;padding:12px;border-radius:10px;
            background:#2ECC71;border:none;color:#0b0f0d;
            font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;
          ">Submit Review</button>
        </div>
      </div>
    `;

    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);

    // ── Rating state ──────────────────────────────────────────────────────
    const ratings = { teaching: 0, marking: 0, behavior: 0, difficulty: 0, workload: 0 };

    overlay.querySelectorAll('.rv-row-stars').forEach(group => {
      const dim = group.dataset.dim;
      const stars = Array.from(group.querySelectorAll('.rv-star'));
      stars.forEach(star => {
        star.addEventListener('click', () => {
          const v = parseInt(star.dataset.val);
          ratings[dim] = v;
          stars.forEach(s => {
            s.classList.toggle('filled', parseInt(s.dataset.val) <= v);
          });
        });
      });
    });

    // ── Initials live-normalize ──────────────────────────────────────────
    const initialsEl = overlay.querySelector('#_rvInitials');
    initialsEl.addEventListener('input', () => {
      initialsEl.value = normalizeInitials(initialsEl.value);
      overlay.querySelector('#_rvInitialsErr').style.display = 'none';
    });

    // ── Text counter ─────────────────────────────────────────────────────
    const textEl = overlay.querySelector('#_rvText');
    const countEl = overlay.querySelector('#_rvCount');
    textEl.addEventListener('input', () => {
      countEl.textContent = `${textEl.value.length} / 500`;
    });

    // ── Close helpers ────────────────────────────────────────────────────
    const close = (result) => {
      document.body.classList.remove('modal-open');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.15s';
      setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); }, 150);
      resolve(result);
    };

    overlay.querySelector('#_rvClose').onclick = () => close({ submitted: false, skipped: true });
    overlay.querySelector('#_rvSkip').onclick  = () => close({ submitted: false, skipped: true });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close({ submitted: false, skipped: true });
    });

    // ── Submit ───────────────────────────────────────────────────────────
    const submitBtn = overlay.querySelector('#_rvSubmit');
    const errEl = overlay.querySelector('#_rvError');
    submitBtn.addEventListener('click', async () => {
      errEl.style.display = 'none';

      const initials = normalizeInitials(initialsEl.value);
      if (!isValidInitials(initials)) {
        overlay.querySelector('#_rvInitialsErr').style.display = '';
        initialsEl.focus();
        return;
      }
      const missing = RATING_KEYS.find(k => ratings[k] < 1);
      if (missing) {
        errEl.textContent = `Please rate "${RATING_LABELS[missing].label}"`;
        errEl.style.display = '';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      submitBtn.style.opacity = '0.7';

      const payload = {
        facultyInitials: initials,
        courseCode,
        semester,
        ratings,
        text: textEl.value.trim(),
      };
      const res = await submitReview(payload);
      if (res.ok) {
        if (typeof window._shohoj_showToast === 'function') {
          window._shohoj_showToast('Review submitted — thank you ');
        }
        if (typeof opts.onSubmitted === 'function') opts.onSubmitted(payload);
        close({ submitted: true, skipped: false });
      } else {
        errEl.textContent = res.error || 'Submission failed';
        errEl.style.display = '';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
        submitBtn.style.opacity = '';
      }
    });

    // Focus the first empty field
    setTimeout(() => {
      if (!initialsEl.value) initialsEl.focus();
    }, 60);
  });
}

// ── Small helpers for display ────────────────────────────────────────────────
function _starBar(score) {
  if (score === null || score === undefined || isNaN(score)) {
    return `<span style="color:#555;font-size:12px;">No ratings yet</span>`;
  }
  const full = Math.round(score);
  const stars = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  return `<span style="color:#F0A500;letter-spacing:1px;">${stars}</span>
          <span style="margin-left:6px;font-size:11px;color:var(--text3);">${score.toFixed(1)}</span>`;
}

function _needsSignInBody(text, text2) {
  return `
    <div style="padding:28px 14px;text-align:center;">
      <div style="font-size:26px;margin-bottom:10px;">🔒</div>
      <div style="font-size:13px;color:${text};font-weight:600;margin-bottom:4px;">Sign in to read reviews</div>
      <div style="font-size:12px;color:${text2};">Faculty reviews are visible to signed-in BRACU students only.</div>
    </div>`;
}

function _buildOverlay(innerHtml) {
  _injectKeyframes();
  const { isDark, bg, text, text2, border, input } = _theme();
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(0,0,0,0.72);
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
    display:flex;align-items:center;justify-content:center;
    animation:reviewFadeIn 0.2s ease;padding:16px;
  `;
  overlay.innerHTML = `
    <div style="
      background:${bg};border:1px solid ${border};border-radius:20px;
      padding:24px 22px;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;
      box-shadow:0 32px 80px rgba(0,0,0,0.55);color:${text};position:relative;
    ">
      <button data-close style="
        position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;
        background:${input};border:1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(0,0,0,0.08)'};
        color:${text2};font-size:18px;line-height:1;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
      ">×</button>
      ${innerHtml}
    </div>`;
  document.body.classList.add('modal-open');
  document.body.appendChild(overlay);

  const close = () => {
    document.body.classList.remove('modal-open');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.15s';
    setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); }, 150);
  };
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  return { overlay, close, theme: { isDark, bg, text, text2, border, input } };
}

// ── Course review panel ──────────────────────────────────────────────────────
// Shows aggregate ratings per faculty who taught `courseCode`, plus latest
// review text snippets. Opened from the planner course rows.
export async function openCourseReviewsPanel(courseCode, courseName = '') {
  const code = String(courseCode || '').toUpperCase();
  const signedIn = typeof window._shohoj_currentUid === 'function' && window._shohoj_currentUid();

  const headerHtml = `
    <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px;">
      ${escHtml(code)} reviews
    </div>
    ${courseName ? `<div style="font-size:12px;color:var(--text2);margin-bottom:14px;">${escHtml(courseName)}</div>` : '<div style="margin-bottom:10px;"></div>'}
  `;

  if (!signedIn) {
    const { theme } = _buildOverlay(headerHtml + _needsSignInBody('var(--text)', 'var(--text2)'));
    return;
  }

  const loadingHtml = headerHtml + `
    <div id="_cr_body" style="padding:28px 14px;text-align:center;color:var(--text3);font-size:12px;">
      Loading reviews…
    </div>`;
  const { overlay, theme } = _buildOverlay(loadingHtml);
  const body = overlay.querySelector('#_cr_body');

  const { reviews, nextCursor } = await fetchReviewsForCourse(code);
  const groups = aggregateByFaculty(reviews);

  if (!groups.length) {
    body.innerHTML = `
      <div style="padding:24px 6px;text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">📭</div>
        <div style="font-size:13px;color:${theme.text};font-weight:600;margin-bottom:4px;">No reviews yet</div>
        <div style="font-size:12px;color:${theme.text2};line-height:1.5;">Be the first — rate a faculty who taught you ${escHtml(code)}.</div>
      </div>`;
    return;
  }

  const countNote = `
    <div style="font-size:11px;color:${theme.text2};margin-bottom:10px;text-align:right;">
      Showing ${reviews.length} review${reviews.length !== 1 ? 's' : ''}${nextCursor ? ' (more available)' : ''}
    </div>`;

  const rowsHtml = countNote + groups.map(g => {
    const latest = reviews
      .filter(r => normalizeInitials(r.facultyInitials) === g.facultyInitials && r.text)
      .slice(0, 2);
    const latestHtml = latest.length
      ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
          ${latest.map(r => `
            <div style="font-size:11px;color:${theme.text2};line-height:1.45;padding-left:8px;border-left:2px solid ${theme.border};display:flex;gap:6px;align-items:flex-start;">
              <span style="flex:1;">${escHtml(r.text.slice(0, 220))}${r.text.length > 220 ? '…' : ''}</span>
              <button data-report="${escAttr(r.id)}" title="Report this review" style="
                flex-shrink:0;background:transparent;border:none;color:${theme.text2};
                font-size:11px;opacity:0.5;cursor:pointer;padding:0 4px;
              ">⚠ Report</button>
            </div>`).join('')}
         </div>`
      : '';
    return `
      <div style="padding:12px 14px;border:1px solid ${theme.border};border-radius:12px;background:${theme.input};margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:14px;color:${theme.text};letter-spacing:0.5px;">${escHtml(g.facultyInitials)}</span>
            <span style="font-size:11px;color:${theme.text2};">${g.count} review${g.count !== 1 ? 's' : ''}</span>
          </div>
          <div>${_starBar(g.overall)}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:4px 12px;margin-top:8px;font-size:11px;color:${theme.text2};">
          <div>Teach: <strong style="color:${theme.text};">${g.ratings.teaching !== null ? g.ratings.teaching.toFixed(1) : '—'}</strong></div>
          <div>Marks: <strong style="color:${theme.text};">${g.ratings.marking !== null ? g.ratings.marking.toFixed(1) : '—'}</strong></div>
          <div>Behav: <strong style="color:${theme.text};">${g.ratings.behavior !== null ? g.ratings.behavior.toFixed(1) : '—'}</strong></div>
          <div>Diff: <strong style="color:${theme.text};">${g.ratings.difficulty !== null ? g.ratings.difficulty.toFixed(1) : '—'}</strong></div>
          <div>Work: <strong style="color:${theme.text};">${g.ratings.workload !== null ? g.ratings.workload.toFixed(1) : '—'}</strong></div>
        </div>
        ${latestHtml}
        <button data-rate="${escAttr(g.facultyInitials)}" style="
          margin-top:10px;padding:6px 12px;border-radius:8px;
          background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.28);
          color:#2ECC71;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;
        ">+ Add your rating for ${escHtml(g.facultyInitials)}</button>
      </div>`;
  }).join('');

  body.innerHTML = rowsHtml;

  body.querySelectorAll('[data-rate]').forEach(btn => {
    btn.onclick = () => {
      const fi = btn.getAttribute('data-rate');
      openReviewModal({ facultyInitials: fi, courseCode: code });
    };
  });
  body.querySelectorAll('[data-report]').forEach(btn => {
    btn.onclick = () => openReportModal(btn.getAttribute('data-report'));
  });
}

// ── Report review modal ─────────────────────────────────────────────────────
export function openReportModal(reviewId) {
  _injectKeyframes();
  const { isDark, bg, text, text2, border, input } = _theme();
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;
      animation:reviewFadeIn 0.2s ease;padding:16px;
    `;
    overlay.innerHTML = `
      <div style="background:${bg};border:1px solid ${border};border-radius:16px;padding:22px;max-width:420px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.55);color:${text};">
        <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:800;margin-bottom:6px;">Report this review</div>
        <div style="font-size:12px;color:${text2};line-height:1.5;margin-bottom:12px;">
          Tell us what's wrong — abuse, harassment, personal info, or off-topic content.
          An admin will review it.
        </div>
        <textarea id="_rpText" class="rv-input" rows="3" maxlength="300"
          placeholder="What's the issue?"
          style="background:${input};border:1px solid ${border};color:${text};resize:vertical;min-height:72px;"></textarea>
        <div id="_rpErr" style="font-size:11px;color:#e74c3c;display:none;margin-top:6px;"></div>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button id="_rpCancel" style="
            flex:1;padding:11px;border-radius:10px;background:${input};
            border:1px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.10)'};
            color:${text2};font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;
          ">Cancel</button>
          <button id="_rpSubmit" style="
            flex:1;padding:11px;border-radius:10px;background:#e74c3c;border:none;color:#fff;
            font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;
          ">Send report</button>
        </div>
      </div>
    `;
    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    const close = v => {
      document.body.classList.remove('modal-open');
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(v);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    overlay.querySelector('#_rpCancel').onclick = () => close(false);
    overlay.querySelector('#_rpSubmit').onclick = async () => {
      const txt = overlay.querySelector('#_rpText').value.trim();
      const errEl = overlay.querySelector('#_rpErr');
      errEl.style.display = 'none';
      const res = await reportReview(reviewId, txt);
      if (res.ok) {
        if (typeof window._shohoj_showToast === 'function') {
          window._shohoj_showToast('Report submitted — thanks');
        }
        close(true);
      } else {
        errEl.textContent = res.error || 'Report failed';
        errEl.style.display = '';
      }
    };
  });
}

// ── Reviews directory ────────────────────────────────────────────────────────
// A browsable modal: search by course code or faculty initials, see aggregates.
export async function openReviewsDirectory() {
  const signedIn = typeof window._shohoj_currentUid === 'function' && window._shohoj_currentUid();

  const headerHtml = `
    <div style="font-family:'Syne',sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px;">
      ⭐ Faculty Reviews
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:14px;">
      Anonymous ratings from BRACU students. Search by course code or faculty initials.
    </div>`;

  if (!signedIn) {
    _buildOverlay(headerHtml + _needsSignInBody('var(--text)', 'var(--text2)'));
    return;
  }

  const { overlay, theme } = _buildOverlay(headerHtml + `
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <input id="_rd_q" class="rv-input" type="text" placeholder="e.g. CSE110 or MNR"
        style="background:${_theme().input};border:1px solid ${_theme().border};color:var(--text);flex:1;" />
      <button id="_rd_go" style="
        padding:10px 16px;border-radius:10px;background:#2ECC71;color:#0b0f0d;
        border:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;
      ">Search</button>
    </div>
    <div id="_rd_body" style="padding:8px 4px;color:var(--text3);font-size:12px;">
      Loading recent reviews…
    </div>
  `);

  const body = overlay.querySelector('#_rd_body');
  const input = overlay.querySelector('#_rd_q');
  const go    = overlay.querySelector('#_rd_go');

  const renderGroups = (groups, emptyMsg) => {
    if (!groups.length) {
      body.innerHTML = `<div style="padding:22px 6px;text-align:center;color:${theme.text2};font-size:12px;">${escHtml(emptyMsg)}</div>`;
      return;
    }
    body.innerHTML = groups.map(g => `
      <div style="padding:10px 12px;border:1px solid ${theme.border};border-radius:10px;background:${theme.input};margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:14px;color:${theme.text};letter-spacing:0.5px;">${escHtml(g.facultyInitials)}</span>
          <span style="font-size:11px;color:${theme.text2};">${g.count} review${g.count !== 1 ? 's' : ''}</span>
        </div>
        <div>${_starBar(g.overall)}</div>
      </div>`).join('');
  };

  const runSearch = async () => {
    const raw = (input.value || '').trim().toUpperCase();
    if (!raw) {
      body.textContent = 'Loading recent reviews…';
      const recent = await fetchRecentReviews(80);
      renderGroups(aggregateByFaculty(recent), 'No reviews yet. Be the first to submit one.');
      return;
    }
    body.textContent = 'Searching…';
    // Heuristic: course code looks like 2–4 letters + 3 digits (+ optional letter).
    if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(raw)) {
      const { reviews } = await fetchReviewsForCourse(raw);
      renderGroups(aggregateByFaculty(reviews), `No reviews yet for ${raw}.`);
      return;
    }
    // Otherwise treat as faculty initials.
    const initials = normalizeInitials(raw);
    if (initials.length < 2) { body.textContent = 'Enter a course code or faculty initials.'; return; }
    const { reviews } = await fetchReviewsForFaculty(initials);
    const agg = aggregateRatings(reviews);
    if (!agg) {
      body.innerHTML = `<div style="padding:22px 6px;text-align:center;color:${theme.text2};font-size:12px;">No reviews yet for ${escHtml(initials)}.</div>`;
      return;
    }
    const r = agg.ratings;
    const overallVals = ['teaching','marking','behavior'].map(k => r[k]).filter(v => v !== null);
    const overall = overallVals.length ? overallVals.reduce((s,v)=>s+v,0)/overallVals.length : null;
    body.innerHTML = `
      <div style="padding:14px 16px;border:1px solid ${theme.border};border-radius:12px;background:${theme.input};">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:16px;color:${theme.text};letter-spacing:0.5px;">${escHtml(initials)}</span>
          <span style="font-size:11px;color:${theme.text2};">${agg.count} review${agg.count !== 1 ? 's' : ''}</span>
        </div>
        <div style="margin-bottom:8px;">${_starBar(overall)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:4px 14px;font-size:12px;color:${theme.text2};">
          <div>Teaching: <strong style="color:${theme.text};">${r.teaching !== null ? r.teaching.toFixed(1) : '—'}</strong></div>
          <div>Marking: <strong style="color:${theme.text};">${r.marking !== null ? r.marking.toFixed(1) : '—'}</strong></div>
          <div>Behavior: <strong style="color:${theme.text};">${r.behavior !== null ? r.behavior.toFixed(1) : '—'}</strong></div>
          <div>Difficulty: <strong style="color:${theme.text};">${r.difficulty !== null ? r.difficulty.toFixed(1) : '—'}</strong></div>
          <div>Workload: <strong style="color:${theme.text};">${r.workload !== null ? r.workload.toFixed(1) : '—'}</strong></div>
        </div>
        ${reviews.filter(x => x.text).slice(0, 3).map(x => `
          <div style="margin-top:10px;font-size:11px;color:${theme.text2};line-height:1.45;padding-left:8px;border-left:2px solid ${theme.border};">
            ${x.courseCode ? `<strong style="color:${theme.text};">${escHtml(x.courseCode)}</strong> · ` : ''}${escHtml(x.text.slice(0, 260))}${x.text.length > 260 ? '…' : ''}
          </div>`).join('')}
      </div>`;
  };

  go.onclick = runSearch;
  input.onkeydown = e => { if (e.key === 'Enter') runSearch(); };
  runSearch();
}
