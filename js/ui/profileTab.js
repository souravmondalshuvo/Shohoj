// js/ui/profileTab.js
// Profile account hub (#196). A signed-in student's data lives in scattered
// places (routine in localStorage, seat watches, reviews); this tab is the
// single home for it: auth gate + account header + seat watchlist & email-alert
// toggle + saved-routine/planner summary + the student's own reviews + sign out.
//
// Hard non-goal (see the issue): never render a BRACU CONNECT credential field.
// This tab only ever shows data the student already gave us or that arrives via
// user-initiated import elsewhere.

import { escHtml, escAttr } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';

// Read identity through the global installed by review-service.js. Kept behind
// typeof guards so the module is import-safe in a bare Node test (no window).
function _profile() {
  return (typeof window !== 'undefined' && typeof window._shohoj_userProfile === 'function')
    ? window._shohoj_userProfile()
    : { signedIn: false, uid: null, email: null, displayName: null, photoURL: null };
}

function _authReady() {
  return (typeof window !== 'undefined' && typeof window._shohoj_isAuthReady === 'function')
    ? !!window._shohoj_isAuthReady()
    : true;
}

// Seat watchlist + email-alert preference, read from the Seats tab's globals.
function _seatAlerts() {
  const watches = (typeof window !== 'undefined' && typeof window._shohoj_getSeatWatches === 'function')
    ? (window._shohoj_getSeatWatches() || [])
    : [];
  const alertsEnabled = (typeof window !== 'undefined' && typeof window._shohoj_seatAlertsEnabled === 'function')
    ? !!window._shohoj_seatAlertsEnabled()
    : true;
  return { watches, alertsEnabled };
}

// Saved routine + semester-plan snapshot — read locally, no network. The
// Routine tab persists { picks: { COURSE: sectionId|null } } under this key
// (see routineTab.js), and the planner exposes its course codes via a global.
// Both are data the student already entered; nothing here touches CONNECT.
const PF_ROUTINE_STORAGE_KEY = 'shohoj_routine_v1';
function _routineSummary() {
  let pickedCourses = [];
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(PF_ROUTINE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const picks = (parsed && parsed.picks && typeof parsed.picks === 'object') ? parsed.picks : {};
      pickedCourses = Object.entries(picks)
        .filter(([, v]) => typeof v === 'number')
        .map(([code]) => String(code).toUpperCase())
        .sort();
    }
  } catch { pickedCourses = []; }

  let plannerCourses = [];
  try {
    if (typeof window !== 'undefined' && typeof window._shohoj_getPlanCourses === 'function') {
      plannerCourses = (window._shohoj_getPlanCourses() || [])
        .map(c => String(c || '').toUpperCase())
        .filter(Boolean);
    }
  } catch { plannerCourses = []; }

  return { pickedCourses, plannerCourses };
}

// Reviews the student has written, read from a privacy-preserving local receipt
// (see firebase.js submitReview). Public review docs deliberately store NO uid —
// authorship is only a non-reversible sha256(uid|initials|course) in the doc id
// — so there is no uid-indexed query that could de-anonymize a review. We keep a
// per-uid local list of what *this* browser submitted instead.
const PF_MY_REVIEWS_KEY = 'shohoj_my_reviews_v1';
function _myReviews() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const uid = (typeof window !== 'undefined' && typeof window._shohoj_currentUid === 'function')
      ? window._shohoj_currentUid()
      : null;
    if (!uid) return [];
    const all = JSON.parse(localStorage.getItem(PF_MY_REVIEWS_KEY) || '{}');
    return Array.isArray(all[uid]) ? all[uid] : [];
  } catch { return []; }
}

// ── Pure view builders (exported for unit tests) ──────────────────────────────

export function profileLoadingHtml() {
  return `
    <div class="pf-empty">
      <div class="pf-empty-icon">⏳</div>
      <div class="pf-empty-title">Checking your sign-in…</div>
      <div class="pf-empty-sub">If you already have an active Shohoj session, your profile will unlock automatically.</div>
    </div>`;
}

export function profileSignedOutHtml() {
  return `
    <div class="pf-empty">
      <div class="pf-empty-icon">🔒</div>
      <div class="pf-empty-title">Sign in to view your profile</div>
      <div class="pf-empty-sub">Your saved routine, seat watchlist, and reviews live here once you sign in with your BRACU G-Suite account.</div>
      <button class="pf-signin-btn" data-action="auth:signin">
        <span class="pf-signin-icon">👤</span>
        Sign in with Google
      </button>
    </div>`;
}

// Seat-drop alerts card: the email on/off switch (acceptance #3) plus the
// watchlist it governs. Pure — takes { watches, alertsEnabled } so it's unit
// testable without the Seats tab.
export function seatAlertsSectionHtml(seatAlerts) {
  const watches = Array.isArray(seatAlerts?.watches) ? seatAlerts.watches : [];
  const on = !!seatAlerts?.alertsEnabled;
  const n = watches.length;

  const list = n === 0
    ? `<div class="pf-watch-empty">You're not watching any sections yet. Add them from the <strong>Seats</strong> tab.</div>`
    : `<ul class="pf-watch-list">${watches.map(w => `
        <li class="pf-watch-item">
          <span class="pf-watch-code">${escHtml(w.courseCode || '')}</span>
          <span class="pf-watch-sec">Section ${escHtml(w.sectionName || '')}</span>
        </li>`).join('')}</ul>`;

  return `
    <section class="pf-card">
      <div class="pf-card-head">
        <h3 class="pf-card-title">🪑 Seat alerts</h3>
        <span class="pf-card-count">${n} watched</span>
      </div>
      <button class="pf-toggle ${on ? 'is-on' : ''}" data-action="profile:toggleAlerts"
              role="switch" aria-checked="${on ? 'true' : 'false'}">
        <span class="pf-toggle-track" aria-hidden="true"><span class="pf-toggle-thumb"></span></span>
        <span class="pf-toggle-text">Email me when a watched seat opens${on ? '' : ' <span class="pf-toggle-off">(paused)</span>'}</span>
      </button>
      ${list}
    </section>`;
}

// Saved-routine + semester-plan card. Pure — takes { pickedCourses, plannerCourses }.
export function routineSummarySectionHtml(summary) {
  const picked = Array.isArray(summary?.pickedCourses) ? summary.pickedCourses : [];
  const planned = Array.isArray(summary?.plannerCourses) ? summary.plannerCourses : [];
  const nR = picked.length;
  const nP = planned.length;

  const routineBody = nR === 0
    ? `<div class="pf-watch-empty">No saved routine yet. Pick sections on the <strong>Routine</strong> tab.</div>`
    : `<div class="pf-chips">${picked.map(c => `<span class="pf-chip">${escHtml(c)}</span>`).join('')}</div>`;

  const plannerBody = nP === 0
    ? `<div class="pf-watch-empty">No courses planned. Add them on the <strong>Planner</strong> tab.</div>`
    : `<div class="pf-chips">${planned.map(c => `<span class="pf-chip pf-chip-plan">${escHtml(c)}</span>`).join('')}</div>`;

  return `
    <section class="pf-card">
      <div class="pf-card-head">
        <h3 class="pf-card-title">🗓️ Routine</h3>
        <span class="pf-card-count">${nR} course${nR === 1 ? '' : 's'}</span>
      </div>
      ${routineBody}
      <div class="pf-subhead">Semester plan <span class="pf-card-count">${nP} course${nP === 1 ? '' : 's'}</span></div>
      ${plannerBody}
    </section>`;
}

// "Your reviews" card. Pure — takes an array of { facultyInitials, courseCode, semester }.
export function reviewsSectionHtml(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  const n = list.length;

  const body = n === 0
    ? `<div class="pf-watch-empty">You haven't written any reviews yet. Rate a faculty from the <strong>Reviews</strong> tab.</div>`
    : `<ul class="pf-watch-list">${list.map(r => `
        <li class="pf-watch-item">
          <span class="pf-watch-code">${escHtml(r.facultyInitials || '')}</span>
          <span class="pf-watch-sec">${escHtml(r.courseCode || '')}${r.semester ? ` · ${escHtml(r.semester)}` : ''}</span>
        </li>`).join('')}</ul>`;

  return `
    <section class="pf-card">
      <div class="pf-card-head">
        <h3 class="pf-card-title">✍️ Your reviews</h3>
        <span class="pf-card-count">${n} written</span>
      </div>
      ${body}
      ${n > 0 ? `<div class="pf-note">Reviews are pseudonymous and can't be edited after posting. This list is kept privately in this browser.</div>` : ''}
    </section>`;
}

export function profileSignedInHtml(profile, seatAlerts, routine, reviews) {
  const p = profile || {};
  const name = p.displayName ? String(p.displayName) : 'BRACU student';
  const email = p.email ? String(p.email) : '';
  const initial = (name.trim()[0] || '?').toUpperCase();
  const avatar = p.photoURL
    ? `<img class="pf-avatar-img" src="${escAttr(p.photoURL)}" alt="" referrerpolicy="no-referrer" width="56" height="56">`
    : `<div class="pf-avatar-fallback" aria-hidden="true">${escHtml(initial)}</div>`;

  return `
    <div class="pf-hub">
      <div class="pf-header">
        <div class="pf-avatar">${avatar}</div>
        <div class="pf-identity">
          <div class="pf-name">${escHtml(name)}</div>
          ${email ? `<div class="pf-email">${escHtml(email)}</div>` : ''}
        </div>
        <button class="pf-signout-btn" data-action="profile:signout">Sign out</button>
      </div>
      <div class="pf-sections">
        ${seatAlertsSectionHtml(seatAlerts)}
        ${routineSummarySectionHtml(routine)}
        ${reviewsSectionHtml(reviews)}
      </div>
    </div>`;
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

export function renderProfileTab() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('profileContent');
  if (!root) return;

  if (!_authReady()) {
    // Static markup, no interpolation.
    // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    root.innerHTML = profileLoadingHtml();
    return;
  }

  const profile = _profile();
  // Every interpolation in these builders goes through escHtml/escAttr.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  root.innerHTML = profile.signedIn
    ? profileSignedInHtml(profile, _seatAlerts(), _routineSummary(), _myReviews())
    : profileSignedOutHtml();
}

// Sign out via the auth layer; it tears down the session and dispatches
// shohoj:auth-changed, which repaints this tab back to the signed-out prompt.
registerAction('profile:signout', () => {
  if (typeof window !== 'undefined' && typeof window._shohoj_signOut === 'function') {
    window._shohoj_signOut();
  }
});

// Flip the email-alert preference via the Seats tab (which persists it and
// re-syncs Firestore), then repaint so the switch reflects the new state.
registerAction('profile:toggleAlerts', () => {
  if (typeof window !== 'undefined'
      && typeof window._shohoj_setSeatAlertsEnabled === 'function'
      && typeof window._shohoj_seatAlertsEnabled === 'function') {
    window._shohoj_setSeatAlertsEnabled(!window._shohoj_seatAlertsEnabled());
  }
  renderProfileTab();
});

// Auth can resolve or flip after the tab first paints (slow Firebase init, or
// the student signs in/out from the header pill). Repaint so the gate is always
// honest. Cheap enough to run regardless of which tab is active.
if (typeof window !== 'undefined') {
  window.addEventListener('shohoj:auth-changed', renderProfileTab);
}
