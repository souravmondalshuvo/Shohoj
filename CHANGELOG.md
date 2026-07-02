# Changelog

All notable changes to Shohoj are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Department & start-semester setup on the React Router shell.** The shell `/calculator` route now has the setup controls the legacy wizard provides: pick your department (all programs, with the total-credits badge), and a start season/year where the season options follow your department's actual calendar (Pharmacy's Spring/Summer, Law's Spring/Fall, …). New semesters are then named along that calendar with correct ordinals — a Law student's semester after Spring 2025 is "Fall 2025 (2nd Semester)", never Summer — and switching to a department that doesn't offer your chosen season clears it, matching the legacy behaviour. Demo mode now pre-selects CSE like the legacy demo. Under the hood the department table stays authored once (typed boundary over the legacy source, like the course catalogue), and the shell's save path now preserves stored fields it doesn't own (planner courses, forward-compat keys) instead of dropping them. Migration-only: the legacy calculator and bundle are unchanged.
- **Toast notifications on the React Router shell.** The shell now renders the notification system's messages as accessible toasts (bottom-center): success/info/warning announce politely to screen readers and auto-dismiss on their per-kind timers, errors are announced assertively and stay until dismissed, and every toast has a labelled dismiss button. First user: loading demo mode now shows the same "Demo mode loaded…" confirmation the legacy calculator gives. Migration-only: the legacy toast (`_shohoj_showToast`) and bundle are unchanged.
- **Demo mode on the React Router shell.** The "Try Demo Mode" button on the shell `/calculator` route now works: one click fills the same two realistic semesters the legacy demo uses (Fall 2024 / Spring 2025, six graded CSE-track courses, start semester Fall 2024) and the whole results pipeline lights up — 3.50 CGPA, Distinction standing, per-semester GPAs, credit totals — with the demo start semester driving proper calendar names for any semesters you add next ("Summer 2025 (3rd Semester)"). If you already have data, an accessible confirm dialog asks before replacing it, matching the legacy guard. Demo data persists like real data. Migration-only: the legacy calculator and bundle are unchanged; the department pre-select and success toast follow with later shell slices.
- **Add-semester controls on the React Router shell.** The shell `/calculator` route now has the footer **+ Add Semester** and **🎯 Running Semester** buttons, so multi-semester CGPA tracking works end to end: new semesters get calendar-aware names (season, year, ordinal — e.g. "Fall 2026 (3rd Semester)") derived from the start semester by a pure, unit-tested naming module, running semesters are named one step past the last completed one with the "(Running)" suffix, and at most one running semester can exist (a second click does nothing, matching the legacy calculator). Without a start semester set (the shell has no department picker yet) names fall back to "Semester N" / "Current Semester". Verified end to end (footer visibility, naming, single-running guard, projected-CGPA headline flip, reload persistence). Migration-only: the legacy calculator and bundle are unchanged.
- **Phase 5D — CGPA results on the React Router shell.** The shell `/calculator` route now shows live results as you enter grades: headline CGPA (current vs projected), the incomplete-grades warning, the CGPA meter with its status message, the academic-standing box (BRACU cutoffs incl. the Summer 2022+ probation policy), and attempted/earned credit totals — all computed by a new pure, unit-tested results model driven through the injected calculator bridge (no window globals). The three existing Vite-island results components (headline, meter, credit totals) now derive from the same model, so the threshold logic that recalc() applies has exactly one typed definition. Covered end to end on the shell (empty state, live updates, reload recompute, incomplete warning, axe). Migration-only: the legacy production calculator and its bundle are unchanged; degree tracker, GPA trend chart and the simulator port in later increments.
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
