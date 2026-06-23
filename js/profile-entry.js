// ── js/profile-entry.js ───────────────────────────────────────────────────────
// Entry point for the dedicated /profile/ page. Paints a page shell (back link +
// title) once, then lets renderProfileTab fill the inner host with the account
// hub — the auth gate (loading / signed-out prompt / signed-in hub) is handled
// inside profileTab.js itself, so this entry just routes and repaints.
//
// Bundled into the same JS as the rest of the site, so it gates on
// `document.body.dataset.page === 'profile'` to stay inert on other pages.
// Helpers are prefixed `_pentry_` to avoid collisions with other UI modules.
//
// The seat-alerts card is intentionally omitted here (includeSeatAlerts:false):
// it needs the Seats tab's live runtime globals, which aren't loaded standalone.
// The inner host id is `profilePageContent` (not `profileContent`) so the
// module-level repaint listener inside profileTab.js stays a no-op on this page.

import { renderProfileTab } from './ui/profileTab.js';
import { initCursor } from './animations/cursor.js';

function _pentry_onProfilePage() {
  return document.body && document.body.dataset && document.body.dataset.page === 'profile';
}

function _pentry_mountShell() {
  const host = document.getElementById('profilePageHost');
  if (!host || host.dataset.mounted === '1') return;
  host.dataset.mounted = '1';
  // Static markup, no interpolation.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  host.innerHTML = `
    <div class="pf-page">
      <header class="pf-page-bar">
        <a class="pf-back" href="../">← Back to Shohoj</a>
        <span class="pf-page-title">Your profile</span>
      </header>
      <main id="profilePageContent" class="pf-page-body"></main>
    </div>`;
}

function _pentry_route() {
  if (!_pentry_onProfilePage()) return;
  _pentry_mountShell();
  renderProfileTab('profilePageContent', { includeSeatAlerts: false });
}

document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  _pentry_route();
});
window.addEventListener('shohoj:auth-changed', _pentry_route);
