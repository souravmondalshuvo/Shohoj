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
import {
  renderSemesterBriefing,
  renderSemesterBriefingState,
  sbcLoadingHtml,
  sbcNoRoutineHtml,
  sbcUnavailableHtml,
} from './ui/semesterBriefingCard.js';
import {
  renderUnlockMap,
  renderUnlockMapFor,
  umcLoadingHtml,
  umcNoTranscriptHtml,
  umcUnavailableHtml,
} from './ui/unlockMapCard.js';
import { fetchConnectFeed } from './core/connectFeedClient.js';
import { buildRoomBusyIndex } from './core/freeRooms.js';

// Where the Routine tab persists `{ picks: { COURSE: sectionId|null } }`.
const PENTRY_ROUTINE_KEY = 'shohoj_routine_v1';
const PENTRY_BRIEFING_HOST = 'pfBriefingHost';
const PENTRY_UNLOCK_HOST = 'pfUnlockHost';

// Transcript-derived snapshot, written by the calculator's import flow.
const PENTRY_PROFILE_SNAPSHOT_KEY = 'shohoj_connect_profile_v1';

function _pentry_academicSnapshot() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PENTRY_PROFILE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function _pentry_onProfilePage() {
  return document.body && document.body.dataset && document.body.dataset.page === 'profile';
}

/** Section ids the student actually picked. Unpicked courses persist as null. */
function _pentry_pickedSectionIds() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PENTRY_ROUTINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const picks = (parsed && parsed.picks && typeof parsed.picks === 'object') ? parsed.picks : {};
    return Object.values(picks).filter(v => typeof v === 'number' && Number.isFinite(v));
  } catch {
    return [];
  }
}

/**
 * Fill the briefing slot. Runs after the account hub paints so a slow or dead
 * feed never delays the rest of the page — the slot carries its own loading,
 * empty and unavailable states.
 *
 * The feed read is anonymous and cached (same client, same 10-minute TTL as the
 * Seats and Routine tabs), so opening this page costs at most one extra request.
 */
async function _pentry_loadBriefing() {
  if (!document.getElementById(PENTRY_BRIEFING_HOST)) return;

  const pickedIds = _pentry_pickedSectionIds();
  if (pickedIds.length === 0) {
    renderSemesterBriefingState(PENTRY_BRIEFING_HOST, sbcNoRoutineHtml());
    return;
  }

  renderSemesterBriefingState(PENTRY_BRIEFING_HOST, sbcLoadingHtml());
  try {
    const feed = await fetchConnectFeed();
    const wanted = new Set(pickedIds);
    const picked = feed.sections.filter(s => wanted.has(s.sectionId));
    if (picked.length === 0) {
      // Picks that no longer exist in the feed — a new semester has rolled over.
      renderSemesterBriefingState(PENTRY_BRIEFING_HOST, sbcNoRoutineHtml());
      return;
    }
    // No kind passed: the card opens on whichever exam period is still ahead.
    renderSemesterBriefing(PENTRY_BRIEFING_HOST, picked, buildRoomBusyIndex(feed.sections));
  } catch {
    renderSemesterBriefingState(PENTRY_BRIEFING_HOST, sbcUnavailableHtml());
  }
}

/**
 * Fill the "Next registration" slot (#478).
 *
 * Shares the briefing's feed read: same client, same 10-minute cache, so this
 * zone costs no extra request. Without an imported transcript there is nothing
 * to join against, so it invites the import rather than showing an empty map.
 */
async function _pentry_loadUnlockMap() {
  if (!document.getElementById(PENTRY_UNLOCK_HOST)) return;

  const snapshot = _pentry_academicSnapshot();
  if (!snapshot) {
    renderUnlockMap(PENTRY_UNLOCK_HOST, umcNoTranscriptHtml());
    return;
  }

  renderUnlockMap(PENTRY_UNLOCK_HOST, umcLoadingHtml());
  try {
    const feed = await fetchConnectFeed();
    // Paint through the stateful helper so the program/all-departments switch
    // can repaint from the same feed read.
    renderUnlockMapFor(PENTRY_UNLOCK_HOST, snapshot, feed.sections);
  } catch {
    renderUnlockMap(PENTRY_UNLOCK_HOST, umcUnavailableHtml());
  }
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
  renderProfileTab('profilePageContent', { includeSeatAlerts: false, includeBriefing: true });
  // Fire-and-forget: each zone fills its own slot when the feed lands.
  _pentry_loadBriefing();
  _pentry_loadUnlockMap();
}

document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  _pentry_route();
});
window.addEventListener('shohoj:auth-changed', _pentry_route);
