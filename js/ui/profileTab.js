// js/ui/profileTab.js
// Profile account hub (#196). A signed-in student's data lives in scattered
// places (routine in localStorage, seat watches, reviews); this tab is the
// single home for it. This is the SKELETON: auth gate + account header + sign
// out. Routine summary, seat watchlist + alert toggle, and reviews land in
// follow-up commits.
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

export function profileSignedInHtml(profile, seatAlerts) {
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
        <div class="pf-section-stub">
          <span class="pf-section-stub-icon">🗓️</span>
          <span>Your routine summary and reviews will appear here.</span>
        </div>
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
    ? profileSignedInHtml(profile, _seatAlerts())
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
