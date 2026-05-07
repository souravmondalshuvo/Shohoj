// ── js/admin-entry.js ─────────────────────────────────────────────────────────
// Entry point for the dedicated /admin/ page. Waits for Firebase auth to
// resolve, then either opens the dashboard (if admin) or shows a sign-in
// prompt / not-authorized message.
//
// This file is bundled into the same JS as the rest of the site, so it
// gates on `document.body.dataset.page === 'admin'` to avoid running on
// the main page. Helpers are prefixed `_aentry_` to avoid name collisions
// with similarly-named helpers in other UI modules (papersTab, feedback).

import { openAdminDashboard } from './ui/adminDashboard.js';

function _aentry_onAdminPage() {
  return document.body && document.body.dataset && document.body.dataset.page === 'admin';
}

function _aentry_isAdmin() {
  return typeof window._shohoj_isAdmin === 'function' && window._shohoj_isAdmin();
}

function _aentry_isAuthReady() {
  return typeof window._shohoj_isAuthReady === 'function' && window._shohoj_isAuthReady();
}

function _aentry_isSignedIn() {
  return typeof window._shohoj_currentUid === 'function' && !!window._shohoj_currentUid();
}

function _aentry_renderSignInPrompt() {
  const host = document.getElementById('adminPageHost');
  if (!host) return;
  host.innerHTML = `
    <div class="admin-gate">
      <div class="admin-gate-card">
        <div class="admin-gate-icon">🛡️</div>
        <h1>Admin Dashboard</h1>
        <p>Sign in with the admin Google account to continue.</p>
        <button class="btn-primary" id="adminGateSignIn">Continue with Google</button>
        <p class="admin-gate-note">
          This page is restricted to authorized moderators only.
          <a href="../">← Back to Shohoj</a>
        </p>
      </div>
    </div>
  `;
  document.getElementById('adminGateSignIn').addEventListener('click', () => {
    if (typeof window._shohoj_signIn === 'function') window._shohoj_signIn();
  });
}

function _aentry_renderForbidden() {
  const host = document.getElementById('adminPageHost');
  if (!host) return;
  host.innerHTML = `
    <div class="admin-gate">
      <div class="admin-gate-card">
        <div class="admin-gate-icon">🚫</div>
        <h1>Not authorized</h1>
        <p>You're signed in, but this account doesn't have admin access.</p>
        <a href="../" class="btn-primary admin-gate-back">← Back to Shohoj</a>
      </div>
    </div>
  `;
}

function _aentry_route() {
  if (!_aentry_onAdminPage()) return;
  if (!_aentry_isAuthReady()) return;
  if (!_aentry_isSignedIn()) {
    _aentry_renderSignInPrompt();
    return;
  }
  if (!_aentry_isAdmin()) {
    _aentry_renderForbidden();
    return;
  }
  openAdminDashboard({ host: 'adminPageHost', dedicated: true });
}

document.addEventListener('DOMContentLoaded', _aentry_route);
window.addEventListener('shohoj:auth-changed', _aentry_route);
