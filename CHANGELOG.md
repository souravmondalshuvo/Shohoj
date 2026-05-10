# Changelog

All notable changes to Shohoj are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Drop `'unsafe-inline'` from `script-src` in the built `shohoj.html` and
  `admin.html`. `build3.py` now computes SHA-256 hashes of every inlined
  `<script>` block and injects them into the CSP meta tag. `style-src`
  still allows `'unsafe-inline'` because templates rely on inline
  `style="…"` attributes; tightening that requires `'unsafe-hashes'` and
  per-attribute hashing, which is queued separately.

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

[Unreleased]: https://github.com/souravmondalshuvo/Shohoj/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/souravmondalshuvo/Shohoj/releases/tag/v0.1.0-alpha
