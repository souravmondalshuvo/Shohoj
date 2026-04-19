// ── js/ui/reviews.js ──────────────────────────────────────────────────────────
// Faculty review submission modal + inline widgets.
// Follows the same vanilla-HTML modal pattern used by firebase.js (confirm,
// migration, sign-in modals): build an overlay DOM node, append to body,
// wire buttons, remove on close.

import { submitReview, RATING_KEYS } from '../core/reviews.js';
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
          Your identity is never shown with the review.
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
