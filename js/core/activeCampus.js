// ── ACTIVE CAMPUS (legacy bundle) ────────────────────────────────────────────
//
// Which campus's rules the calculator is running on right now: the grading
// scale, the retake policy, repeat eligibility, credit-load limits and the
// mark → letter tiers. The legacy twin of the shell's useUniversity()
// (src/app/providers/AuthProvider.tsx).
//
// The signed-in student's verified email decides it, exactly as in the shell.
// Everyone else is on BRACU: a signed-out visitor, a demo session (demo data is
// BRACU-shaped, see signinPortal.js) and pre-tenancy saved work, which is
// BRACU's by definition — the app served nobody else.
//
// WHY AN EVENT AND NOT AN IMPORT. In the deployed page firebase.js is its own
// <script type="module"> and this file is inlined into the main bundle
// (build3.py), so the two do not share module state. The auth side already
// publishes identity through window._shohoj_userProfile and the
// shohoj:auth-changed event; this reads those, and announces its own change as
// shohoj:campus-changed so the calculator repaints on the new scale.

import { DEFAULT_UNIVERSITY_ID, UNIVERSITIES, universityForEmail } from './university.js';

let _activeCampusId = DEFAULT_UNIVERSITY_ID;
let _activeCampusListening = false;

/** The campus profile every grade calculation should use. Never null. */
export function getActiveCampus() {
  return UNIVERSITIES[_activeCampusId];
}

/** Shorthand for the active campus's grading scale. */
export function activeGradeScale() {
  return getActiveCampus().grades;
}

/**
 * Grade point for a letter on the active campus: `undefined` when the campus
 * does not award the letter (an A+ at NSU), `null` when it does but it carries
 * no point (P/I/W). The same contract as indexing the old BRACU GRADES table,
 * which every call site this replaces was written against.
 */
export function activeGradePoint(letter) {
  const points = activeGradeScale().points;
  return Object.prototype.hasOwnProperty.call(points, letter) ? points[letter] : undefined;
}

/**
 * Resolve the campus from an email and switch to it. Returns whether anything
 * changed. An address no campus claims falls back to BRACU rather than to null:
 * the auth guard is what turns such accounts away, and this module's one job is
 * never to leave the calculator without a scale.
 */
export function setActiveCampusForEmail(email) {
  const next = universityForEmail(email)?.id ?? DEFAULT_UNIVERSITY_ID;
  if (next === _activeCampusId) return false;
  _activeCampusId = next;
  try {
    window.dispatchEvent(new CustomEvent('shohoj:campus-changed', {
      detail: { campus: next },
    }));
  } catch (_e) { /* no window (node tests) */ }
  return true;
}

function syncActiveCampusFromAuth() {
  const profile = window._shohoj_userProfile?.();
  setActiveCampusForEmail(profile?.signedIn ? profile.email : null);
}

/**
 * Follow the auth state. Idempotent — both the main and the profile bundle call
 * it at boot.
 *
 * Seeds from the current state first: firebase.js loads as an earlier module
 * script and may already have announced a warm session by the time this runs.
 */
export function initActiveCampus() {
  if (_activeCampusListening) return;
  _activeCampusListening = true;
  syncActiveCampusFromAuth();
  window.addEventListener('shohoj:auth-changed', syncActiveCampusFromAuth);
}
