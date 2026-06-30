# Changelog

All notable changes to Shohoj are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 5C — typed course catalogue + accessible autocomplete (React Router shell).** The shell `/calculator` route now reads the real BRACU course catalogue (the same data the shipping app uses, imported once through a typed boundary — not duplicated) and offers a production-quality course-name autocomplete: deterministic ranked suggestions (code/title, case- and whitespace-insensitive), full keyboard navigation, mouse selection, Escape-to-close, and a WAI-ARIA combobox/listbox so it works with screen readers. Selecting a course fills the canonical course identity and official credits; changing course clears grade data that no longer applies, while re-picking the same course keeps valid grades. Free-text (uncatalogued) courses stay fully usable. Search and course-selection logic are pure and unit-tested; the flow is covered end to end (search/select/reload/keyboard/axe). Migration-only: the legacy production calculator, its bundle, and the React-island path are unchanged. See `docs/architecture/decisions/0001-calculator-catalogue-search-boundary.md`.

## [0.5.0] — 2026-06-19

### Added
- Seat-drop **email alerts** that reach you even with Shohoj closed: when signed in, your Seat Status watchlist syncs to Firestore, and a new cron-triggered Worker handler polls the live feed centrally (one fetch for all users), edge-detects watched sections going full→open, and emails you via Resend. Reuses the Worker's existing service-account wiring; per-user state lives in a client-closed `seatAlertState` collection. Delivery requires a Resend-verified `EMAIL_FROM` sender (SPF + DKIM; see `worker/README.md`) — until that is set the cron still runs but safely skips sends and logs an operational error.
- Routine Builder auto-suggest now prefers **compact days**: a new `gapWeight` factor penalizes idle time between consecutive same-day classes, so packed schedules rank above gappy ones. A "Compact days" toggle (on by default) drives it and re-ranks live, and each suggestion card shows the combination's total gap time (or "compact" when gap-free).
- Seat-drop alerts on the Seat Status tab: watch a full section and Shohoj polls the live CONNECT feed in the background (while open), then fires a browser notification and an in-app toast the moment a seat opens. Watchlist persists across reloads; transition detection lives in the unit-tested `src/core/seatWatch.ts` core.
- Faculty reviews for two new Pharmacy faculty (KMP, MKS) and several CSE hardware faculty (TSE plus extended profiles for AQT, NFS, RAO, TAV), covering PHB201, PHB105, and the CSE251 hardware courses.
- **Routine Builder** tab: assemble a clash-free weekly schedule from the live CONNECT section feed, with overlap-split grid, inline faculty ratings, time-of-day / day-off filters, `.ics` calendar export with class + exam reminders, and QR / link sharing of a routine.
- **Free Rooms** finder: an all-rooms status board (free / in class / in lab + room type) computed from the scheduled timetable, with a per-room full-week availability modal.
- **Profile** account hub (#196): an auth-gated tab that brings a signed-in student's scattered data into one home — account header, seat watchlist with an independent email-alert on/off toggle, saved-routine + semester-plan snapshot, and the student's own reviews. Signed-out users get a sign-in prompt. No BRACU CONNECT credential field exists anywhere; the "your reviews" list uses a privacy-preserving local receipt so no UID-indexed query can de-anonymize a review.

### Changed
- `CONTRIBUTING.md` now documents logical-change commits as the default workflow, with strict one-file-per-commit reserved for explicit requests.
- A `commit-msg` git hook rejects `[skip ci]` and equivalent directives so CI can never be silently bypassed.

### Removed
- Dropped the dead `validReviewPayload` helper from `firestore.rules`.

### Fixed
- Seat-alert (and admin-upload) emails no longer silently fall back to the Resend test sender (`onboarding@resend.dev`), which only delivers to the Resend account owner — so real students received nothing while the cron still logged success. The Worker now treats a missing or test `EMAIL_FROM` as *not configured*, skips sends, and logs a loud operational error instead. **Action required before alerts deliver:** set `EMAIL_FROM` to a Resend-verified sender (see `worker/README.md`).
- A temporary Resend failure no longer advances a user's seat-alert transition state, so a failed full→open email is retried on the next cron tick instead of being lost forever.
- Cron logging is now privacy-safe and richer (`users / watches / transitions / emailed / failed` counts; no UIDs or emails).

### Security
- The client busts out of frames on load to prevent clickjacking.
- Disabled PDF.js `eval`-based code paths to close CVE-2024-4367.
- Cleared the moderate `ws` advisory in `worker/` via dependency upgrade.
- Firestore rules now reject anonymous feedback documents that carry a `uid`, keeping anonymous submissions truly unattributable.

## [0.4.0] — 2026-05-29

### Changed
- CGPA calculator, semester planner, and BRACU transcript parser cores are now ported to TypeScript under `src/core/`, with the live JS runtime served from auto-generated bridges in `js/core/` and `js/import/`. Behavior is gated by `tests/typedCoreParity.test.js`, which transpiles the typed core at test time and asserts identical output to the JS modules — extending the v0.3.0 typed grade-logic mirror to the full academic-logic surface.
- Main CGPA recalculation now consumes the shared GPA totals helper instead of duplicating the per-semester aggregation loop, keeping the calculator and recalc paths in lockstep.

### Fixed
- Restored grade point values are sanitized and the grade point input is HTML-escaped on render, preventing malformed or hostile values from breaking the calculator UI.
- Worker uploads generate unique storage paths so concurrent uploads to the same course/filename no longer overwrite each other in R2.

## [0.3.0] — 2026-05-25

### Added
- Recruiter demo mode entry points and sample academic data for public review without BRACU login.
- Playwright E2E coverage for app load, demo mode, CGPA updates, theme persistence, planner access, mobile overflow, and export/import controls.
- TypeScript foundation with strict no-emit checks and a typed grade-logic mirror for the future migration path.
- v0.3 release notes for the Recruiter Demo Release.

### Changed
- README and case-study documentation now foreground the recruiter demo path, solo role, architecture, security, and deployment story.
- Mobile calculator, modal, tab, and papers controls are more resilient on narrow screens.
- Firebase auth responsibilities are split into smaller auth, sync, review, paper, admin, and init modules while keeping the deploy bundle self-contained.
- CI/CD now runs Playwright E2E tests in addition to unit, worker, Firestore rules, and bundle smoke tests.

### Fixed
- PDF export now guards against a missing `jspdf` global instead of throwing before the user sees a useful failure state.

## [0.2.0] — 2026-05-15

### Security
- Drop `'unsafe-inline'` from `script-src` in the built `shohoj.html` and
  `admin.html`. `build3.py` now computes SHA-256 hashes of every inlined
  `<script>` block and injects them into the CSP meta tag. `style-src`
  still allows `'unsafe-inline'` because templates rely on inline
  `style="…"` attributes; tightening that requires `'unsafe-hashes'` and
  per-attribute hashing, which is queued separately. The built bundle
  has ~340 unique `style="…"` values, most generated at runtime via
  template literals (e.g. `style="background:${_theme().input};…"`), so
  static per-attribute hashing cannot cover them — closing this gap
  requires first refactoring dynamic theming to CSS variables / class
  toggles, tracked separately.

### Added
- Worker test suite at `worker/test/worker.test.js` covering the path
  validators, CORS allow-list behavior, route dispatch (404 / OPTIONS),
  upload validation gates (course code, filename, content length, MIME)
  and the auth-error → 401 branch on every authenticated route.
  Wired into `npm test` and exposed as `npm run test:worker`. Worker
  helpers `isValidCourseCode`, `isValidStoragePath`, `safeFilename`,
  `corsHeaders`, and `AuthError` are now named exports.
- `CHANGELOG.md` (this file).

## [0.1.0-alpha] — 2026-04

Initial tagged snapshot. Refer to git history for the changes that
landed before the changelog existed.

[Unreleased]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.1.0-alpha...v0.2.0
[0.1.0-alpha]: https://github.com/souravmondalshuvo/Shohoj/releases/tag/v0.1.0-alpha
