// js/ui/assistantFab.js
//
// Shohoj Assistant (#533) on the legacy page: a floating launcher pill in the
// bottom-right plus a chat drawer. Mounted once on <body>, so it follows the
// student across every calculator tab — the Seats and Routine tabs are where
// "are there seats in MAT216?" actually gets asked, not the hero.
//
// The Worker side already exists and is untouched (#435): POST /api/assistant
// verifies the Firebase token, bakes the uid into its own loaders, and answers
// only from that student's data. This module is transport + DOM.
//
// Gating mirrors the React shell exactly, and the third condition is the #455
// lesson — the drawer once shipped while ANTHROPIC_API_KEY was unset and failed
// on every single turn. The launcher appears only when:
//   - the Worker URL is configured,
//   - the student is signed in (the endpoint requires a token), and
//   - GET /ready affirmatively reports the assistant configured.
// An inconclusive probe keeps the launcher hidden. Signed-out visitors get no
// launcher at all rather than a button that dead-ends in an auth wall.
//
// Everything is built with createElement + textContent and wired with
// addEventListener: model output is never parsed as HTML, and prod CSP drops
// inline on* attributes anyway (script-src-attr).

import {
  clearStoredTranscript,
  examplePromptsForTab,
  fetchAssistantAvailability,
  readStoredTranscript,
  sendAssistantTurn,
  writeStoredTranscript,
} from '../core/assistantClient.js';
import { ASSISTANT_MORPH_CLOSE_MS, morphPanel } from '../core/assistantMorph.js';

// Kept honest as the tools grow: since #579 the Assistant also reads the
// faculty ratings your campus already sees in the Reviews tab, so "only your
// own saved data" would no longer be true. Twin of the note in
// src/features/assistant/AssistantDrawer.tsx — change both.
const DRAWER_NOTE =
  'Answers use your own saved data and Shohoj’s faculty ratings. Chats aren’t saved — they reset when you close this tab.';

let _fab = null;
let _drawer = null;
let _logEl = null;
let _inputEl = null;
let _sendEl = null;
let _transcript = [];
let _pending = false;
let _error = null;
let _availability = 'unknown';
// The readiness probe runs at most once per page load. refreshLauncher() is
// called on every auth change (which flaps repeatedly while Firestore settles),
// so a probe that re-armed itself on a non-ready answer would spin: fail →
// refresh → probe → fail. An inconclusive probe therefore keeps the launcher
// hidden until the next reload rather than retrying in a loop.
let _probed = false;
// Whose chat is in _transcript. Campus machines are shared, so a change of uid
// — including a sign-out — has to drop the previous student's turns rather than
// let them show up in the drawer, or be replayed as the next student's context.
let _owner = null;

// ── Environment ───────────────────────────────────────────────────────────────

function workerUrl() {
  const u = window._shohoj_papers_worker_url;
  return typeof u === 'string' && u.startsWith('http') ? u.replace(/\/$/, '') : null;
}

function currentUid() {
  return (typeof window._shohoj_currentUid === 'function' && window._shohoj_currentUid()) || null;
}

function signedIn() {
  return !!currentUid();
}

function authReady() {
  return typeof window._shohoj_isAuthReady === 'function' ? !!window._shohoj_isAuthReady() : true;
}

function getToken() {
  return typeof window._shohoj_idToken === 'function'
    ? window._shohoj_idToken()
    : Promise.resolve(null);
}

/** Which calculator tab the student is on, for the starter prompts. */
function activeTab() {
  const el = document.querySelector('#calcTabs [data-tab].active');
  if (el?.dataset?.tab) return el.dataset.tab;
  try {
    return sessionStorage.getItem('shohoj_active_tab') || '';
  } catch (_e) {
    return '';
  }
}

function storage() {
  try {
    return sessionStorage;
  } catch (_e) {
    // Storage can be unreachable (private mode, blocked cookies). The helpers
    // are null-safe, so the chat simply won't survive a tab switch.
    return null;
  }
}

function persist() {
  writeStoredTranscript(storage(), _transcript, _owner);
}

// ── Drawer rendering ──────────────────────────────────────────────────────────

function bubble(role, text, extraClass) {
  const div = document.createElement('div');
  div.className =
    'assistant-bubble ' +
    (role === 'user' ? 'assistant-bubble--user' : 'assistant-bubble--reply') +
    (extraClass ? ' ' + extraClass : '');
  div.textContent = text;
  return div;
}

function renderEmptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'assistant-empty';
  const p = document.createElement('p');
  p.textContent = 'Ask about your CGPA goals, prerequisites, seats, or faculty ratings. Try one:';
  wrap.appendChild(p);
  examplePromptsForTab(activeTab()).forEach(prompt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'assistant-example';
    btn.textContent = prompt;
    btn.addEventListener('click', () => ask(prompt));
    wrap.appendChild(btn);
  });
  return wrap;
}

// A live indicator, not the word "Thinking…" sitting still. Several seconds of
// static text reads as a frozen panel, which makes the wait feel longer than it
// is (#553). The dots animate; the word stays for screen readers, which cannot
// see a pulse.
function pendingBubble() {
  const div = document.createElement('div');
  div.className = 'assistant-bubble assistant-bubble--reply assistant-bubble--pending';

  const label = document.createElement('span');
  label.className = 'assistant-sr-only';
  label.textContent = 'Thinking…';

  const dots = document.createElement('span');
  dots.className = 'assistant-typing';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('i'));

  div.append(label, dots);
  return div;
}

function renderLog() {
  if (!_logEl) return;
  _logEl.replaceChildren();

  if (_transcript.length === 0 && !_pending) {
    _logEl.appendChild(renderEmptyState());
  } else {
    _transcript.forEach(m => _logEl.appendChild(bubble(m.role, m.content)));
    if (_pending) _logEl.appendChild(pendingBubble());
  }

  if (_error) {
    const err = document.createElement('div');
    err.className = 'assistant-error';
    err.setAttribute('role', 'alert');
    err.textContent = _error;
    _logEl.appendChild(err);
  }

  _logEl.scrollTo({ top: _logEl.scrollHeight });
  if (_sendEl) _sendEl.disabled = _pending || !_inputEl?.value.trim();
  if (_inputEl) _inputEl.disabled = _pending;
}

async function ask(question) {
  const content = String(question || '').trim();
  if (!content || _pending) return;

  _transcript = [..._transcript, { role: 'user', content }];
  if (_inputEl) _inputEl.value = '';
  _error = null;
  _pending = true;
  persist();
  renderLog();

  try {
    // The Worker answers from users/{uid} in Firestore. Push anything still
    // sitting in the local debounce window first, or a student who just typed
    // their grades is told they have no saved semesters. This runs before every
    // turn, not just the first: edits made between questions sit in the same
    // debounce window, and a stale answer to a later question is just as wrong.
    if (typeof window._shohoj_flushCloudSave === 'function') {
      await window._shohoj_flushCloudSave();
    }
    const result = await sendAssistantTurn(_transcript, { workerUrl: workerUrl(), getToken });
    if (result.ok) {
      _transcript = [..._transcript, { role: 'assistant', content: result.reply }];
      persist();
    } else {
      _error = result.error;
    }
  } finally {
    _pending = false;
    renderLog();
    _inputEl?.focus();
  }
}

function buildDrawer() {
  const aside = document.createElement('aside');
  aside.className = 'assistant-drawer';
  aside.id = 'assistantDrawer';
  aside.setAttribute('role', 'dialog');
  aside.setAttribute('aria-label', 'Shohoj Assistant');
  aside.setAttribute('aria-modal', 'false');

  const header = document.createElement('header');
  header.className = 'assistant-drawer-header';
  const title = document.createElement('h2');
  title.className = 'assistant-drawer-title';
  title.textContent = 'Shohoj Assistant';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'assistant-drawer-close';
  close.setAttribute('aria-label', 'Close assistant');
  close.textContent = '✕';
  close.addEventListener('click', () => closeDrawer());
  header.append(title, close);

  const note = document.createElement('p');
  note.className = 'assistant-drawer-note';
  note.textContent = DRAWER_NOTE;

  _logEl = document.createElement('div');
  _logEl.className = 'assistant-log';
  _logEl.setAttribute('aria-live', 'polite');

  const form = document.createElement('form');
  form.className = 'assistant-composer';
  _inputEl = document.createElement('textarea');
  _inputEl.className = 'assistant-input';
  _inputEl.rows = 2;
  _inputEl.maxLength = 4000;
  _inputEl.placeholder = 'Ask about your courses…';
  _inputEl.setAttribute('aria-label', 'Message the assistant');
  _sendEl = document.createElement('button');
  _sendEl.type = 'submit';
  _sendEl.className = 'assistant-send';
  _sendEl.textContent = 'Send';
  _sendEl.disabled = true;
  form.append(_inputEl, _sendEl);

  form.addEventListener('submit', e => {
    e.preventDefault();
    ask(_inputEl.value);
  });
  _inputEl.addEventListener('input', () => {
    _sendEl.disabled = _pending || !_inputEl.value.trim();
  });
  _inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(_inputEl.value);
    }
  });

  aside.append(header, note, _logEl, form);
  return aside;
}

function onKeydown(e) {
  if (e.key === 'Escape' && _drawer) closeDrawer();
}

/** The panel on its way out, still in the DOM only for its exit animation. */
let _exiting = null;
/** The opening morph, kept so a quick close can call it off mid-flight. */
let _openMorph = null;

/** Drop a closing panel immediately — used when it is in the way. */
function dropExiting() {
  _exiting?.remove();
  _exiting = null;
}

function openDrawer() {
  if (_drawer) return;
  // Reopening mid-exit would stack two panels in the same corner.
  dropExiting();
  _transcript = readStoredTranscript(storage(), _owner);
  _error = null;
  // Measured while the pill is still on screen — a display:none launcher has an
  // empty rect, and this rect is the whole starting shape of the morph.
  const pill = _fab ? _fab.getBoundingClientRect() : null;
  _drawer = buildDrawer();
  _drawer.classList.add('assistant-drawer--morphing');
  document.body.appendChild(_drawer);
  document.addEventListener('keydown', onKeydown);
  renderLog();

  const node = _drawer;
  const morph = morphPanel(node, pill, 'open');
  _openMorph = morph;
  if (!morph) {
    // No morph to run (reduced motion, or no Web Animations API): the panel
    // simply appears, as it did before the move existed.
    node.classList.remove('assistant-drawer--morphing');
    if (_fab) _fab.style.display = 'none';
  } else {
    // The pill rides above the panel and fades on its own schedule (CSS), so
    // the handover is visible rather than a cut. It only leaves the layout once
    // the shape has finished travelling.
    _fab?.classList.add('assistant-fab--morphing');
    const settle = () => {
      node.classList.remove('assistant-drawer--morphing');
      morph.cancel();
      if (_fab) {
        _fab.classList.remove('assistant-fab--morphing');
        // Guard the case where the student closed again mid-morph: the pill is
        // back on duty by then and must not be hidden out from under them.
        if (_drawer === node) _fab.style.display = 'none';
      }
    };
    morph.finished.then(settle, () => {});
  }
  _inputEl?.focus();
}

function closeDrawer() {
  if (!_drawer) return;
  const node = _drawer;
  document.removeEventListener('keydown', onKeydown);
  // Detach the state refs up front: from here on the panel is scenery, and a
  // turn that resolves during the animation must not render into it.
  _drawer = null;
  _logEl = null;
  _inputEl = null;
  _sendEl = null;
  // A close landing mid-open: drop the opening shape so the two morphs don't
  // fight over the same clip.
  _openMorph?.cancel();
  _openMorph = null;
  node.classList.remove('assistant-drawer--morphing');

  // The pill has to be back in the layout before it can be measured, and it is
  // the target the panel shrinks into, so it comes back first either way.
  if (_fab) _fab.style.display = '';
  const pill = _fab ? _fab.getBoundingClientRect() : null;

  dropExiting();
  const morph = morphPanel(node, pill, 'close');
  if (!morph) {
    node.remove();
    _fab?.focus();
    return;
  }

  _exiting = node;
  node.classList.add('assistant-drawer--closing');
  _fab?.classList.add('assistant-fab--returning');
  const finish = () => {
    if (_exiting !== node) return;
    _exiting = null;
    node.remove();
    _fab?.classList.remove('assistant-fab--returning');
  };
  // finished settles on its own; the timer is the safety net for the cases
  // where it never does (a backgrounded tab pauses the animation), so a dead
  // panel can't be left sitting on the page.
  morph.finished.then(finish, finish);
  setTimeout(finish, ASSISTANT_MORPH_CLOSE_MS + 400);
  _fab?.focus();
}

// ── Launcher gate ─────────────────────────────────────────────────────────────

function mountFab() {
  if (_fab) return;
  _fab = document.createElement('button');
  _fab.type = 'button';
  _fab.className = 'assistant-fab';
  _fab.id = 'assistantFab';
  _fab.setAttribute('aria-label', 'Open Shohoj Assistant');
  const spark = document.createElement('span');
  spark.setAttribute('aria-hidden', 'true');
  spark.textContent = '✦';
  _fab.append(spark, document.createTextNode(' Assistant'));
  _fab.addEventListener('click', () => openDrawer());
  document.body.appendChild(_fab);
}

function unmountFab() {
  closeDrawer();
  _fab?.remove();
  _fab = null;
}

function probe() {
  if (_probed) return;
  const base = workerUrl();
  if (!base) return;
  _probed = true;
  fetchAssistantAvailability({ workerUrl: base }).then(next => {
    _availability = next;
    // Only a 'ready' answer has anything to show. Re-entering refreshLauncher()
    // on any other result would just call probe() again — see _probed above.
    if (next === 'ready') refreshLauncher();
  });
}

/** Re-evaluate the three gate conditions and mount/unmount accordingly. */
export function refreshLauncher() {
  const uid = currentUid();
  if (uid !== _owner) {
    const previous = _owner;
    _owner = uid;
    _transcript = [];
    _error = null;
    // A sign-out, or a different student on a shared machine: drop the stored
    // record as well, so nothing of theirs is left in the tab. Going from "not
    // known yet" to a uid is just auth resolving after boot — the stored record
    // is uid-stamped and only reads back for its owner, so it can be adopted.
    if (previous !== null || uid === null) clearStoredTranscript(storage());
  }
  if (!workerUrl() || !authReady() || !signedIn()) {
    unmountFab();
    return;
  }
  if (_availability !== 'ready') {
    probe();
    unmountFab();
    return;
  }
  mountFab();
}

export function initAssistantFab() {
  refreshLauncher();
  // Auth resolves after boot and can flap while Firestore settles, so the
  // launcher follows the auth state rather than the first frame's answer.
  window.addEventListener('shohoj:auth-changed', () => refreshLauncher());
}
