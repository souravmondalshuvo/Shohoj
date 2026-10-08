// ── js/ui/campusMapTab.js ─────────────────────────────────────────────────────
// Campus Map tab. The map itself is the React + three.js component the
// standalone /campus/ page shows (src/app/routes/CampusRoute.tsx, and
// CampusRouteNsu.tsx for North South University); this file is the legacy
// page's half: fetch that module the first time the tab is opened, mount it
// for the active campus, and say so plainly when it cannot be fetched.
//
// The module is built by Vite (vite.pages.config.js → campus/embed.js) and is
// not part of this bundle: it carries React and three.js, which nothing else
// here needs, and a student who never opens the tab never downloads them. Its
// markup lands inside #tabCampus, so the look is css/style.css's.

import { getActiveCampus } from '../core/activeCampus.js';
import { registerAction } from '../core/dispatch.js';

// Where the built module is, relative to the page. The deployed site has the
// first. The second is the same module's source, which only a Vite dev server
// (`npm run dev`) can serve — a static server answers it with a type no
// browser will run as a module, and the tab reports the map as unavailable.
const CM_EMBED_URLS = ['campus/embed.js', 'campus/embed.tsx'];

let _cmModule = null;   // Promise<module>, kept so a second visit is instant
let _cmMounted = null;  // { campusId, host, unmount }
let _cmRequest = 0;     // the latest render; an older one must not paint

function _cmEmbedUrls() {
  // E2E seam: the suites serve a raw tree, where the build's output sits under
  // dist-pages/ and not beside the page.
  const override = typeof window !== 'undefined' ? window.__shohojCampusEmbedUrl : null;
  return typeof override === 'string' && override ? [override] : CM_EMBED_URLS;
}

async function _cmImportEmbed() {
  let lastError = null;
  for (const url of _cmEmbedUrls()) {
    try {
      // Resolved against the page, not this file: in the bundle there is no
      // file, and un-bundled this one sits two directories down.
      const mod = await import(/* @vite-ignore */ new URL(url, document.baseURI).href);
      if (mod && typeof mod.mountCampusMap === 'function') return mod;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Campus Map module not found.');
}

function _cmLoadEmbed() {
  if (!_cmModule) {
    // A failed fetch is not remembered, so "Try again" really does.
    _cmModule = _cmImportEmbed().catch(err => { _cmModule = null; throw err; });
  }
  return _cmModule;
}

// A link may open the map on a room: #calculator/campus?room=09G-31T.
function _cmDeepLink() {
  const hash = window.location.hash || '';
  const at = hash.indexOf('?');
  return hash.startsWith('#calculator/campus') && at !== -1 ? hash.slice(at) : '';
}

function _cmUnmount() {
  if (!_cmMounted) return;
  try { _cmMounted.unmount(); } catch { /* already gone */ }
  _cmMounted = null;
}

function _cmLoadingHTML() {
  return `
    <div class="campus-map-tab">
      <div class="routine-skeleton" aria-hidden="true">
        <div class="rsk rsk-header"></div>
        <div class="rsk rsk-picker"></div>
        <div class="rsk rsk-block campus-map-skeleton"></div>
      </div>
      <div class="routine-loading-note" role="status">Loading the campus map…</div>
    </div>`;
}

function _cmErrorHTML() {
  return `
    <div class="campus-map-tab">
      <div class="routine-error" data-testid="campus-map-unavailable">
        <h3>Couldn’t load the Campus Map</h3>
        <p>The map is downloaded when you open this tab, and that download failed. Check your connection and try again.</p>
        <button class="btn-primary" data-action="campusmap:retry">Try again</button>
      </div>
    </div>`;
}

export function renderCampusMapTab() {
  const content = document.getElementById('campusMapContent');
  if (!content) return;
  const campusId = getActiveCampus().id;

  // Already showing this campus: leave it alone. Re-mounting would throw away
  // the floor and room the student had open, and reload a multi-megabyte model.
  if (_cmMounted && _cmMounted.campusId === campusId && content.contains(_cmMounted.host)) return;

  _cmUnmount();
  const request = ++_cmRequest;
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  content.innerHTML = _cmLoadingHTML();

  _cmLoadEmbed().then(mod => {
    if (request !== _cmRequest) return;
    const host = document.createElement('div');
    host.className = 'campus-map-tab';
    content.replaceChildren(host);
    const unmount = mod.mountCampusMap(host, { campus: campusId, search: _cmDeepLink() });
    _cmMounted = { campusId, host, unmount };
  }).catch(() => {
    if (request !== _cmRequest) return;
    // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
    content.innerHTML = _cmErrorHTML();
  });
}

registerAction('campusmap:retry', () => renderCampusMapTab());
