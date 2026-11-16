// ── js/ui/questTab.js ─────────────────────────────────────────────────────────
// Quest tab: Shohoj Quest (#981), the CSE110 game, played on this page.
//
// The game is the React + Phaser screen the shell's /app/quest route shows
// (src/features/quest). This file is the legacy page's half, in the manner of
// the Campus Map tab (campusMapTab.js): fetch the game's module the first time
// the tab is opened, mount it for the signed-in student, take it down again
// when they leave or sign out, and say so plainly when it cannot be fetched.
//
// The module is built by Vite (vite.pages.config.js → quest/embed.js) and is
// not part of this bundle: it carries React, and loads Phaser, CodeMirror and
// the Java engine after it, none of which anything else here needs.
//
// The game covers the whole window, as it does on the shell. "← Shohoj" in its
// top bar closes it and puts the student back on the tab they came from.
//
// What this page gives the game: who is signed in, the one Firestore operation
// its cloud save needs (window._shohoj_questProgressTransact, in
// js/auth/firebase.js), and where the Java engine's page is. That page is on
// the Worker's origin, never this one (worker/questSandbox.js says why), and
// this page's CSP lets it be framed (frame-src) and nothing more.
//
// Progress is self-study data: grading runs in the student's browser.

import { registerAction } from '../core/dispatch.js';

// Where the built module is, relative to the page. The deployed site has the
// first. The second is the same module's source, which only a Vite dev server
// can serve — a static server answers it with a type no browser will run as a
// module, and the tab reports the game as unavailable.
const QT_EMBED_URLS = ['quest/embed.js', 'quest/embed.tsx'];

let _qtModule = null;    // Promise<module>, kept so a second visit is instant
let _qtMounted = null;   // { uid, unmount }
let _qtRequest = 0;      // the latest render; an older one must not mount
let _qtReturnTab = 'calculator';

function _qtEmbedUrls() {
  // E2E seam: the suites serve a raw tree, where the build's output sits under
  // dist-pages/ and not beside the page.
  const override = typeof window !== 'undefined' ? window.__shohojQuestEmbedUrl : null;
  return typeof override === 'string' && override ? [override] : QT_EMBED_URLS;
}

// Failed downloads so far. A browser remembers a module address that failed
// and will not fetch it again, so each new try asks for a fresh address.
let _qtFailures = 0;

async function _qtImportEmbed() {
  let lastError = null;
  for (const url of _qtEmbedUrls()) {
    try {
      // Resolved against the page, not this file: in the bundle there is no
      // file, and un-bundled this one sits two directories down.
      const address = new URL(url, document.baseURI);
      if (_qtFailures > 0) address.searchParams.set('attempt', String(_qtFailures));
      const mod = await import(/* @vite-ignore */ address.href);
      if (mod && typeof mod.mountQuest === 'function') return mod;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Shohoj Quest module not found.');
}

function _qtLoadEmbed() {
  if (!_qtModule) {
    // A failed fetch is not remembered, so "Try again" really does.
    _qtModule = _qtImportEmbed().catch(err => { _qtModule = null; _qtFailures++; throw err; });
  }
  return _qtModule;
}

function _qtUid() {
  try {
    const uid = typeof window._shohoj_currentUid === 'function' ? window._shohoj_currentUid() : null;
    return typeof uid === 'string' && uid ? uid : null;
  } catch {
    return null;
  }
}

/**
 * The Java engine's page: the Worker's /quest-sandbox/. `null` when this build
 * has no Worker, or when the Worker is on this page's own origin — a sandbox
 * there would isolate nothing, so the game is told there is none and says
 * that code cannot be run here.
 */
function _qtSandboxUrl() {
  const override = window.__shohojQuestSandboxUrl;
  if (typeof override === 'string' && override) return override;
  const worker = window._shohoj_papers_worker_url;
  if (typeof worker !== 'string' || !worker.startsWith('http')) return null;
  try {
    const url = new URL('quest-sandbox/', `${worker.replace(/\/+$/, '')}/`);
    return url.origin === window.location.origin ? null : url.href;
  } catch {
    return null;
  }
}

// Looked up on every save rather than once: js/auth/firebase.js is a separate
// script and may arrive after the game opens. Without it the save stays on the
// device, and the game tries the cloud again on its next save.
function _qtTransact(uid, decide) {
  const bridge = window._shohoj_questProgressTransact;
  if (typeof bridge !== 'function') return Promise.reject(new Error('Cloud save unavailable.'));
  return bridge(uid, decide);
}

function _qtIsActive() {
  return !!document.getElementById('tabQuest')?.classList.contains('active');
}

function _qtNoteHTML(text) {
  return `
    <div class="quest-tab">
      <div class="routine-loading-note" role="status">${text}</div>
    </div>`;
}

function _qtErrorHTML() {
  return `
    <div class="quest-tab">
      <div class="routine-error" data-testid="quest-unavailable">
        <h3>Couldn’t open Shohoj Quest</h3>
        <p>The game is downloaded when you open this tab, and that download failed. Check your connection and try again.</p>
        <button class="btn-primary" data-action="quest:retry">Try again</button>
      </div>
    </div>`;
}

/** Take the game down, if it is up. Unsaved code is written to the device first. */
export function closeQuestTab() {
  _qtRequest++;
  if (!_qtMounted) return;
  const { unmount } = _qtMounted;
  _qtMounted = null;
  try { unmount(); } catch { /* already gone */ }
}

function _qtLeave() {
  closeQuestTab();
  const back = _qtReturnTab && _qtReturnTab !== 'quest' ? _qtReturnTab : 'calculator';
  if (typeof window.switchCalcTab === 'function') window.switchCalcTab(back);
}

/**
 * Open the game. `fromTab` is the tab the student was on, which "← Shohoj"
 * returns them to; it is absent when the page opened straight on the game.
 */
export function renderQuestTab(fromTab) {
  if (fromTab && fromTab !== 'quest') _qtReturnTab = fromTab;
  const content = document.getElementById('questContent');
  if (!content) return;
  const uid = _qtUid();

  // Already showing this student's game: leave it alone.
  if (_qtMounted && _qtMounted.uid === uid) return;
  closeQuestTab();

  if (!uid) {
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    content.innerHTML = _qtNoteHTML('Sign in to play Shohoj Quest.');
    return;
  }

  const request = ++_qtRequest;
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  content.innerHTML = _qtNoteHTML('Opening Shohoj Quest…');

  _qtLoadEmbed().then(mod => {
    if (request !== _qtRequest || !_qtIsActive() || _qtUid() !== uid) return;
    const host = document.createElement('div');
    host.className = 'quest-tab';
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    content.innerHTML = _qtNoteHTML('Shohoj Quest is open.');
    content.append(host);
    const unmount = mod.mountQuest(host, {
      uid,
      javaSandboxUrl: _qtSandboxUrl(),
      transact: _qtTransact,
      onLeave: _qtLeave,
    });
    _qtMounted = { uid, unmount };
  }).catch(() => {
    if (request !== _qtRequest) return;
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    content.innerHTML = _qtErrorHTML();
  });
}

registerAction('quest:retry', () => renderQuestTab());

// A sign-out takes the game down at once, so nothing more is saved for a
// student who has gone; a sign-in (or another account) on the open tab
// opens the game for whoever is signed in now.
window.addEventListener('shohoj:auth-changed', () => {
  if (_qtMounted && _qtMounted.uid !== _qtUid()) closeQuestTab();
  if (_qtIsActive()) renderQuestTab();
});
