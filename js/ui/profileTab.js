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
import { gpaCoreCalcSemesterGpa } from '../core/gpa-core.js';

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

// "Last synced" timestamp — firebase.js stamps localStorage on every successful
// cloud write/read (see LAST_SYNC_KEY). Read locally, no network. Returns a unix
// ms timestamp or null when the device has never synced.
const PF_LAST_SYNC_KEY = 'shohoj_last_sync';
function _lastSync() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PF_LAST_SYNC_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch { return null; }
}

// Transcript-derived academic profile (SID, name, program, CGPA, semester
// history), written by the import flow (see modals.js persistAcademicProfile).
// Read locally — never from CONNECT, never from credentials. Absent until the
// student imports their own grade sheet, in which case the card shows a CTA.
const PF_PROFILE_SNAPSHOT_KEY = 'shohoj_connect_profile_v1';
function _academicProfile() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PF_PROFILE_SNAPSHOT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return (p && typeof p === 'object') ? p : null;
  } catch { return null; }
}

// ── Pure view builders (exported for unit tests) ──────────────────────────────

// Relative "last synced" label. Pure — takes the timestamp and a clock so the
// unit test is deterministic. Null/invalid → an em-dash placeholder.
export function pfFormatLastSync(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || ts <= 0) return 'Not synced yet';
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 0)      return 'Synced just now';
  if (diff < 60)     return 'Synced just now';
  if (diff < 3600)   return `Synced ${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `Synced ${Math.floor(diff / 3600)}h ago`;
  return `Synced ${Math.floor(diff / 86400)}d ago`;
}

// Defensive strip of a trailing student-level token (UNDERGRADUATE / GRADUATE /
// POSTGRADUATE) that older imports swallowed into the stored name. The parser
// now stops before it (see detectStudentIdentity), but snapshots saved before
// that fix still carry it — so clean at render time too, so existing profiles
// read correctly without forcing a re-import. Pure; exported for unit tests.
export function pfCleanName(name) {
  return String(name || '')
    .replace(/\s+(?:UNDER\s*GRAD(?:UATE)?|POST\s*GRADUATE|GRADUATE)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Danger-zone card: lets the student delete their cloud copy. Pure and static —
// no interpolation, no inputs, no CONNECT surface. The destructive action is
// gated behind a confirm step in the profile:deleteCloud handler below; this
// builder only paints the button + warning copy. The student's local data on
// this device is deliberately left untouched (mirrors deleteCloudDataSilent).
export function dangerZoneSectionHtml() {
  return `
    <section class="pf-card pf-danger">
      <div class="pf-card-head">
        <h3 class="pf-card-title">⚠️ Danger zone</h3>
      </div>
      <div class="pf-danger-body">
        Delete the copy of your Shohoj data stored in the cloud. Your saved data on
        <strong>this device</strong> stays untouched. This can't be undone.
      </div>
      <button class="pf-danger-btn" data-action="profile:deleteCloud">Delete cloud data</button>
    </section>`;
}

/**
 * Semester history as a GPA series (#532). The stored snapshot carries each
 * semester's courses with their grades and credits, so the GPA is derivable —
 * and derived through the calculator's own rule set rather than a second
 * implementation, so F(NT) stays attempted and P/I stay out of the average.
 *
 * A semester with nothing graded (a running term, or one that is all pass/fail)
 * yields `gpa: null`. That is a real state, not a zero: charting it as 0.00
 * would draw a crash that never happened.
 *
 * Pure; exported for unit tests.
 */
/**
 * Whether two names are the same person as far as this card is concerned.
 * Case and spacing differ freely between a Google profile and a grade sheet
 * ("SOURAV MONDAL" vs "Sourav  Mondal"); neither difference is worth a row.
 * Pure; exported for unit tests.
 */
export function pfSameName(a, b) {
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const left = norm(a);
  return left !== '' && left === norm(b);
}

export function pfSemesterGpaSeries(semesters) {
  const list = Array.isArray(semesters) ? semesters : [];
  return list.map(s => {
    const courses = Array.isArray(s.courses) ? s.courses : [];
    const gpa = courses.length > 0 ? gpaCoreCalcSemesterGpa({ courses }) : null;
    return {
      name: String(s.name || ''),
      courseCount: courses.length,
      gpa: (typeof gpa === 'number' && Number.isFinite(gpa)) ? gpa : null,
    };
  });
}

/**
 * Change in GPA from the previous graded semester to the latest one. Null with
 * fewer than two graded semesters — there is no trend in a single point, and a
 * chip that invented one would be the same sin as the CGPA chip it replaces.
 *
 * Pure; exported for unit tests.
 */
export function pfGpaTrend(series) {
  const graded = (Array.isArray(series) ? series : []).filter(s => s.gpa !== null);
  if (graded.length < 2) return null;
  const latest = graded[graded.length - 1];
  const previous = graded[graded.length - 2];
  return {
    delta: latest.gpa - previous.gpa,
    from: previous.name,
    to: latest.name,
  };
}

// Academic-profile card: the student's transcript-derived identity (SID,
// program) plus CGPA, credits earned and the semester GPA history. Pure — takes
// the snapshot object (or null). Empty/partial snapshots fall back to the CTA.
// No <input>, no CONNECT credential surface — this only reflects an already-
// imported grade sheet that lives in this browser.
export function academicProfileSectionHtml(profile, accountName = '') {
  const p = (profile && typeof profile === 'object') ? profile : null;
  const hasData = !!p && (p.sid || p.name || (Array.isArray(p.semesters) && p.semesters.length));

  if (!hasData) {
    return `
      <section class="pf-card">
        <div class="pf-card-head">
          <h3 class="pf-card-title">🎓 Academic profile</h3>
        </div>
        <div class="pf-watch-empty">
          Import your BRACU grade sheet to see your student ID, program, CGPA and
          semester history here. It's parsed on your device — nothing is uploaded.
        </div>
        <a class="pf-signin-btn" href="../#calculator">
          <span class="pf-signin-icon">📄</span>
          Import your transcript
        </a>
      </section>`;
  }

  const cgpaNum = (typeof p.cgpa === 'number' && Number.isFinite(p.cgpa)) ? p.cgpa : null;
  const cgpa = cgpaNum !== null ? cgpaNum.toFixed(2) : '—';
  const credits = Number.isFinite(p.earnedCredits) ? p.earnedCredits : 0;
  const semesters = Array.isArray(p.semesters) ? p.semesters : [];

  // CGPA gauge geometry + standing band on the 4.0 scale (drives the ring fill
  // and colour). Clamped so a stray out-of-range value can't overflow the ring.
  const pct = cgpaNum !== null ? Math.max(0, Math.min(100, (cgpaNum / 4) * 100)) : 0;
  const band = cgpaNum === null ? 'na'
    : cgpaNum >= 3.5 ? 'high'
    : cgpaNum >= 3.0 ? 'good'
    : cgpaNum >= 2.5 ? 'mid'
    : 'low';

  // The account header already renders the student's name at heading size, so
  // the row only earns its place when the transcript disagrees with it — an
  // official name that differs from the Google one is worth showing, the same
  // name twice is not.
  const transcriptName = pfCleanName(p.name);
  const rows = [];
  if (p.sid) rows.push(['Student ID', p.sid]);
  if (transcriptName && !pfSameName(transcriptName, accountName)) {
    rows.push(['Name on transcript', transcriptName]);
  }
  if (p.program) rows.push(['Program', p.program]);
  const detailRows = rows.map(([k, v]) =>
    `<div class="pf-detail-row"><span class="pf-detail-key">${escHtml(k)}</span><span class="pf-detail-val">${escHtml(String(v))}</span></div>`
  ).join('');

  // Semester GPA on the 4.0 scale drives the bar, so the history answers "am I
  // climbing or sliding?" — the course count it used to plot was near-constant
  // across a normal degree and told the student nothing.
  const series = pfSemesterGpaSeries(semesters);
  const semList = series.length === 0 ? '' : `
      <div class="pf-subhead">Semester GPA</div>
      <ul class="pf-timeline">${series.map(s => {
        const known = s.gpa !== null;
        const w = known ? Math.round((s.gpa / 4) * 100) : 0;
        const tone = !known ? 'na'
          : s.gpa >= 3.5 ? 'high'
          : s.gpa >= 3.0 ? 'good'
          : s.gpa >= 2.5 ? 'mid'
          : 'low';
        return `
        <li class="pf-tl-item">
          <span class="pf-tl-dot pf-tl-dot--${tone}" aria-hidden="true"></span>
          <span class="pf-tl-name">${escHtml(s.name)}</span>
          <span class="pf-tl-bar" aria-hidden="true"><span class="pf-tl-fill pf-tl-fill--${tone}" style="--pf-w:${w}"></span></span>
          <span class="pf-tl-count">${known ? escHtml(s.gpa.toFixed(2)) : '<span class="pf-tl-na">no grades yet</span>'}</span>
        </li>`;
      }).join('')}</ul>`;

  // The head chip carries what the gauge can't: which way the last term moved.
  const trend = pfGpaTrend(series);
  const trendChip = trend === null ? '' : (() => {
    const rounded = Math.abs(trend.delta).toFixed(2);
    if (Number.parseFloat(rounded) === 0) {
      return `<span class="pf-card-count pf-trend pf-trend--flat" title="${escAttr(`${trend.from} → ${trend.to}`)}">level last term</span>`;
    }
    const up = trend.delta > 0;
    return `<span class="pf-card-count pf-trend pf-trend--${up ? 'up' : 'down'}"
                  title="${escAttr(`${trend.from} → ${trend.to}`)}">${up ? '▲' : '▼'} ${escHtml(rounded)} last term</span>`;
  })();

  return `
    <section class="pf-card pf-acard">
      <div class="pf-card-head">
        <h3 class="pf-card-title">🎓 Academic profile</h3>
        ${trendChip}
      </div>
      <div class="pf-acard-top">
        <div class="pf-gauge pf-gauge--${band}" style="--pf-pct:${pct.toFixed(1)}">
          <div class="pf-gauge-core">
            <span class="pf-gauge-num">${escHtml(cgpa)}</span>
            <span class="pf-gauge-cap">/ 4.00</span>
          </div>
        </div>
        <div class="pf-minis">
          <div class="pf-mini">
            <span class="pf-mini-num">${escHtml(String(credits))}</span>
            <span class="pf-mini-label">Credits earned</span>
          </div>
          <div class="pf-mini">
            <span class="pf-mini-num">${escHtml(String(semesters.length))}</span>
            <span class="pf-mini-label">Semester${semesters.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>
      <div class="pf-details">${detailRows}</div>
      ${semList}
      <div class="pf-note">From your imported transcript — stored only in this browser.</div>
    </section>`;
}

// opts.includeSeatAlerts (default true) lets the dedicated Profile page drop the
// seat-alerts card: that card needs the Seats tab's live runtime globals, which
// aren't loaded standalone — the Seats tab still owns the watchlist + toggle.
//
// opts.includeBriefing (default false) emits two empty slots above the cards —
// the "This semester" block (#476) and the "Next registration" unlock map
// (#478) — filled asynchronously by whoever holds the section feed:
// profile-entry.js on the standalone page. Kept as slots rather than parameters
// so a slow or dead feed never delays the account hub.
export function profileSignedInHtml(profile, seatAlerts, routine, reviews, lastSync, academic, opts = {}) {
  const includeSeatAlerts = opts.includeSeatAlerts !== false;
  const includeBriefing = opts.includeBriefing === true;
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
          <div class="pf-synced" title="When your cloud data last synced to this device">${escHtml(pfFormatLastSync(lastSync))}</div>
        </div>
        <button class="pf-signout-btn" data-action="profile:signout">Sign out</button>
      </div>
      ${includeBriefing ? '<div id="pfBriefingHost" class="pf-briefing"></div>' : ''}
      ${includeBriefing ? '<div id="pfUnlockHost" class="pf-briefing"></div>' : ''}
      <div class="pf-sections">
        ${academicProfileSectionHtml(academic, p.displayName || '')}
        ${includeSeatAlerts ? seatAlertsSectionHtml(seatAlerts) : ''}
        ${routineSummarySectionHtml(routine)}
        ${reviewsSectionHtml(reviews)}
        ${dangerZoneSectionHtml()}
      </div>
    </div>`;
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

export function renderProfileTab(hostId = 'profileContent', opts = {}) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById(hostId);
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
    ? profileSignedInHtml(profile, _seatAlerts(), _routineSummary(), _myReviews(), _lastSync(), _academicProfile(), opts)
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

// Delete the student's cloud copy, gated behind an explicit confirm. The destructive
// call only fires once the student confirms; dismissing does nothing. We surface a
// generic toast either way — never the underlying Firestore/SDK error — and repaint
// so the "last synced" line reflects the cleared state.
registerAction('profile:deleteCloud', async () => {
  if (typeof window === 'undefined') return;

  const confirmFn = (typeof window._shohoj_confirmModal === 'function')
    ? window._shohoj_confirmModal
    : ({ body }) => Promise.resolve((typeof window.confirm === 'function') ? window.confirm(body) : false);

  const confirmed = await confirmFn({
    icon:          '🗑️',
    title:         'Delete cloud data?',
    body:          "This permanently deletes your Shohoj data from the cloud. Your data on this device stays untouched. This can't be undone.",
    confirmLabel:  'Delete cloud data',
    confirmDanger: true,
  });
  if (!confirmed) return; // nothing fires without confirmation

  let ok = false;
  try {
    if (typeof window._shohoj_deleteCloudData === 'function') {
      ok = await window._shohoj_deleteCloudData();
    }
  } catch {
    ok = false; // swallow backend detail; the toast below stays generic
  }

  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast(
      ok ? 'Cloud data deleted.' : '⚠ Couldn’t delete cloud data — please try again.',
      !ok,
    );
  }
  renderProfileTab();
});

// Auth can resolve or flip after the tab first paints (slow Firebase init, or
// the student signs in/out from the header pill). Repaint so the gate is always
// honest. Cheap enough to run regardless of which tab is active.
if (typeof window !== 'undefined') {
  // Call with no args so the default host id is used — the listener receives an
  // Event object that must not be mistaken for a host id. The dedicated Profile
  // page (profile-entry.js) wires its own repaint into #profilePageHost.
  window.addEventListener('shohoj:auth-changed', () => renderProfileTab());
}
