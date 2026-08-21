// ── SIGN-IN PORTAL / CAMPUS GATE ─────────────────────────────────────────────
//
// The signed-out view of the calculator section.
//
// Signing in is what resolves a student to a campus, and the campus decides the
// grading scale. Until we know who someone is there is no correct version of
// the calculator to render — showing one anyway means applying BRACU's scale to
// whatever transcript gets typed in, which produces a confidently wrong CGPA on
// a number that drives probation, scholarships and graduation.
//
// This is a correctness gate, not a security one. firestore.rules is the
// authorization boundary and hidden UI has never been authorization; nothing
// here is load bearing for access control.
//
// WHAT STAYS PUBLIC: the hero and #features. '/' is the pitch, not the product
// — nothing on it depends on knowing a campus, it is the page people share and
// search engines read, and meeting a stranger with a demand for their
// university account reads like a phishing page. The same split the React
// shell settled on (src/app/routes/RootLayout.tsx, GatedMain), so the two
// builds do not disagree about what a signed-out visitor is allowed to see.
//
// DEMO MODE IS EXEMPT. See unlockForDemo() below.

import { registerAction } from '../core/dispatch.js';
import { escHtml } from '../core/helpers.js';
import {
  UNIVERSITY_DIRECTORY,
  servedByThisBuild,
} from '../core/universityDirectory.js';

// An unlock is per-tab, not persisted to localStorage: someone who tried the
// demo once should still meet the gate on their next real visit, but a reload
// inside a demo session (or the portfolio iframe re-rendering) must not yank the
// calculator away mid-look.
const UNLOCK_SESSION_KEY = 'shohoj_calc_unlocked';

// The key from js/core/state.js. Read directly rather than imported so this
// module stays independent of the calculator's state machine — all it needs to
// know is whether SOMETHING is saved, not what.
const STATE_STORAGE_KEY = 'shohoj_cgpa_v1';

let _authResolved = false;
let _signedIn     = false;
let _unlocked     = false;
let _lockedMarkupRendered = false;

function readUnlockFlag() {
  try { return sessionStorage.getItem(UNLOCK_SESSION_KEY) === '1'; } catch (_e) { return false; }
}

function writeUnlockFlag() {
  try { sessionStorage.setItem(UNLOCK_SESSION_KEY, '1'); } catch (_e) { /* private mode */ }
}

/** Does this browser already hold semesters someone entered?
 *
 * Signed-out use is not an edge case on this build — it is how Shohoj has
 * always worked, and the privacy copy promises it ("your grades stay in this
 * browser until you turn on sync"). Putting a gate in front of data a student
 * already typed would make good on that promise by hiding it from them, so the
 * portal offers those students a way through. It is not a silent bypass: they
 * still land on the portal first, and they still see the case for signing in.
 *
 * A new visitor has nothing saved and gets no such door. */
function hasSavedWork() {
  let raw;
  try { raw = localStorage.getItem(STATE_STORAGE_KEY); } catch (_e) { return false; }
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.semesters) && parsed.semesters.length > 0;
  } catch (_e) {
    return false;
  }
}

function calcWrapperEl() { return document.querySelector('#calculator .calc-wrapper'); }
function portalEl()      { return document.getElementById('signinPortal'); }

/** Is sign-in even possible on this build?
 *
 * The bundle inlines js/config/runtime-config.js, which sets the Firebase
 * config from deploy-time env. A local build3.py run with no secrets leaves the
 * `__PLACEHOLDER__` strings in place — the same predicate firebase-init.js uses
 * to decide whether to call initializeApp. Getting this wrong in the optimistic
 * direction is what produces a Continue-with-Google button that does nothing,
 * which is a worse dead end than an honest "not available on this build". */
function signInAvailable() {
  const cfg = window._shohoj_firebase_config;
  return !!(
    cfg
    && typeof cfg === 'object'
    && cfg.apiKey
    && cfg.projectId
    && !String(cfg.apiKey).startsWith('__')
    && !String(cfg.projectId).startsWith('__')
  );
}

function campusRowHtml(campus) {
  const domains = campus.emailDomains.map(d => `@${escHtml(d)}`).join(' · ');
  // A campus this build cannot sign in is still listed — a student should be
  // able to find out that Shohoj serves them at all — but it is labelled with
  // where to actually go, rather than inviting a sign-in the domain check in
  // js/auth/firebase.js will bounce after the Google popup.
  const handoff = servedByThisBuild(campus.id)
    ? '<span class="signin-portal-campus-tag">Sign in here</span>'
    : `<a class="signin-portal-campus-link" href="app/">Open the multi-campus build →</a>`;
  return `
    <li class="signin-portal-campus${servedByThisBuild(campus.id) ? ' is-served' : ''}">
      <span class="signin-portal-campus-name">${escHtml(campus.shortName)}</span>
      <span class="signin-portal-campus-domain">${domains}</span>
      ${handoff}
    </li>
  `;
}

function portalHtml() {
  const available = signInAvailable();
  const cta = available
    ? `<button type="button" class="btn-primary magnetic signin-portal-btn"
               data-action="auth:signin" data-testid="signin-portal-button">
         Continue with Google
       </button>`
    : `<p class="signin-portal-note" role="status">
         Sign-in isn&rsquo;t available on this build.
       </p>`;

  return `
    <div class="signin-portal-inner">
      <h3 class="signin-portal-title">Sign in to open the calculator</h3>
      <p class="signin-portal-lede">
        Shohoj works from your university&rsquo;s own grading rules. Signing in with your
        student email is how it knows which ones to apply.
      </p>
      ${cta}
      <div class="signin-portal-campuses">
        <p class="signin-portal-campus-label">Supported universities</p>
        <ul class="signin-portal-campus-list">
          ${UNIVERSITY_DIRECTORY.map(campusRowHtml).join('')}
        </ul>
      </div>
      <p class="signin-portal-note">
        Signing in identifies your university and unlocks reviews, study groups and alerts.
        Your grades stay in this browser until you turn on sync.
      </p>
      <p class="signin-portal-note signin-portal-note--demo">
        Just looking?
        <button type="button" class="signin-portal-demo-link" data-action="portal:demo">
          Try demo mode
        </button>
        — sample data, no account needed.
      </p>
      ${hasSavedWork() ? `
      <p class="signin-portal-note signin-portal-note--resume">
        Already using Shohoj without an account?
        <button type="button" class="signin-portal-demo-link" data-action="portal:resume"
                data-testid="signin-portal-resume">
          Open my saved semesters
        </button>
      </p>` : ''}
    </div>
  `;
}

/**
 * Paint the current state.
 *
 * Three states, and the third is the one that matters:
 *   signed in / demo → tool, no portal
 *   signed out       → portal, no tool
 *   auth unresolved  → NEITHER
 *
 * Rendering the portal while auth is still resolving flashes a sign-in page at
 * someone who is already signed in, which reads as having been logged out. A
 * beat of empty space is the lesser evil, and it is bounded: initAuth() calls
 * notifyAuthStateReady() on every path including the no-Firebase one, so this
 * state always ends.
 */
export function renderSignInPortal() {
  const wrapper = calcWrapperEl();
  const portal  = portalEl();
  if (!wrapper || !portal) return;

  const unlocked = _signedIn || _unlocked;

  if (!_authResolved && !_unlocked) {
    wrapper.hidden = true;
    portal.hidden  = true;
    return;
  }

  wrapper.hidden = !unlocked;
  portal.hidden  = unlocked;

  if (!unlocked) {
    // Build the markup once per lock, not once per event. shohoj:auth-changed
    // fires repeatedly while Firestore settles (see the note in papersTab.js),
    // and re-assigning innerHTML on each one would blow away focus from under
    // anyone tabbing through the portal's buttons.
    if (!_lockedMarkupRendered) {
      // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
      portal.innerHTML = portalHtml();
      _lockedMarkupRendered = true;
    }
  } else {
    portal.replaceChildren();
    _lockedMarkupRendered = false;
  }
}

/**
 * Open the calculator for a demo session.
 *
 * Demo data is synthetic, so the reason for the gate does not apply to it:
 * there is no real transcript to score on the wrong campus's scale. Keeping it
 * behind sign-in would cost the two things the signed-out page is for — the
 * hero's "Try Demo Mode" CTA, and the portfolio site's live preview iframe,
 * which loads this page with ?demo=1 and has no one to sign in.
 *
 * The demo runs on BRACU's scale, same as the rest of this build.
 */
export function unlockForDemo() {
  _unlocked = true;
  writeUnlockFlag();
  renderSignInPortal();
}

/**
 * Open the calculator for a returning signed-out student.
 *
 * Same mechanism as the demo unlock, different reason, and the reason is worth
 * keeping separate: this one exists because their data is already here. See
 * hasSavedWork() — the button that calls this is only rendered when there is
 * something to go back to.
 */
export function unlockForSavedWork() {
  _unlocked = true;
  writeUnlockFlag();
  renderSignInPortal();
}

/** Is the tool currently open? main.js checks before running demo data in. */
export function isCalculatorUnlocked() {
  return _signedIn || _unlocked;
}

// If auth never resolves, show the portal rather than an empty section.
//
// The unresolved state hides BOTH the tool and the portal, which is right for
// the fraction of a second auth normally takes and very wrong if it never
// arrives — a CDN hiccup on the Firebase SDK would otherwise leave a permanent
// blank gap where the calculator should be. The portal is the safe thing to
// fall back to: it still offers sign-in, and it explains itself.
const AUTH_RESOLVE_TIMEOUT_MS = 4000;

export function initSignInPortal() {
  _unlocked = readUnlockFlag();

  // Seed from the current state before subscribing. firebase.js is an earlier
  // module script, so on a warm session it may have already fired
  // shohoj:auth-changed by the time this runs — a listener alone would then
  // wait for an event that has been and gone, and a signed-in student would sit
  // looking at the portal. These two bridges are installed by firebase.js
  // (js/auth/review-service.js); both are absent if it failed to load, which
  // the timeout below covers.
  if (window._shohoj_isAuthReady?.()) {
    _authResolved = true;
    _signedIn = !!window._shohoj_userProfile?.().signedIn;
  } else {
    setTimeout(() => {
      if (_authResolved) return;
      _authResolved = true;
      renderSignInPortal();
    }, AUTH_RESOLVE_TIMEOUT_MS);
  }

  // The portal's own "try demo mode" link. The hero button is wired in main.js,
  // which owns startDemoMode(); this registers the same action so the link
  // inside the rendered markup needs no inline handler (the bundle's CSP drops
  // unsafe-inline, so an inline onclick here would be silently dead in prod).
  registerAction('portal:demo', () => window._shohoj_startDemo?.());
  registerAction('portal:resume', () => {
    unlockForSavedWork();
    // The tool was hidden while the saved state rendered into it, so repaint at
    // its real height and put the student where their data is.
    window._shohoj_renderAndRecalc?.();
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  window.addEventListener('shohoj:auth-changed', e => {
    _authResolved = true;
    _signedIn = !!e.detail?.signedIn;
    renderSignInPortal();
  });

  renderSignInPortal();
}
