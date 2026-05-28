# Changelog

All notable changes to Shohoj are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.1.0-alpha...v0.2.0
[0.1.0-alpha]: https://github.com/souravmondalshuvo/Shohoj/releases/tag/v0.1.0-alpha
