# Contributing to Shohoj

Thanks for helping improve Shohoj. This project is a BRACU-focused academic tools platform, so contributions should keep student data, privacy, and reliability in mind.

## Local Setup

1. Clone the repository and install dependencies:

```bash
npm ci
```

2. Run the core validation checks:

```bash
npm run lint
npm run typecheck
npm test
```

`npm run lint` runs ESLint over the source (`js/`, `src/`, `tests/`, `e2e/`,
`scripts/`, `worker/`). The config (`eslint.config.js`) is tuned for
*correctness*, not style — there is no auto-formatter, so the linter never
reformats your code. It **fails on errors** (undeclared globals, unreachable
code, duplicate keys, …) and **prints warnings** (unused variables, empty
blocks) without blocking. Generated and vendored paths — `js/qr-data.js`,
`js/vendor/**`, the built `shohoj.html`/`admin.html`, and `dist/**` — are
excluded.

3. For browser and deploy-path changes, also run:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
python3 build3.py
npm run test:bundle
```

### Adding a test

Drop a `*.test.js` file in `tests/` (or `worker/test/`) and it is picked up
automatically by `npm test` — no need to edit `package.json`. To run a subset
while iterating, filter by name:

```bash
npm run test:one -- routine   # runs every test file whose path contains "routine"
```

Two test files run under their own harness and are excluded from the
auto-runner: `firestore.rules.test.js` (`npm run test:rules`, needs the
Firestore emulator) and `productionBundleSmoke.test.js` (`npm run test:bundle`,
needs a built bundle).

## Workflow

Use an issue-first workflow:

1. Create or pick a GitHub issue.
2. Create a branch for that one issue.
3. Make small, focused changes.
4. Commit one logical change at a time (see Commit Rules).
5. Push when the branch is ready — once per branch is fine.
6. Open a pull request that links the issue.
7. Wait for review and CI before merging.

Branch name examples:

```text
docs/update-readme
fix/mobile-navbar
test/bundle-smoke
refactor/firebase-services
```

## Commit Rules

Stage files explicitly. Do not use `git add .` or `git add -A`.

Each commit should capture one **logical change** — the smallest set of edits that
leaves the branch in a working state. That is often a single file, but it may span
several files when they have to move together (for example a function and its test,
or a rename and the call sites it updates). Keep unrelated changes in separate
commits, and make sure the branch builds and tests pass at each one.

Good pattern for a commit:

```bash
git status
git add path/to/file path/to/related-file
git diff --cached
git commit -m "docs: update setup instructions"
```

You do not need to push after every commit. Push once when the branch is ready:

```bash
git push origin branch-name
```

## Continuous Integration

Every commit must run through CI/CD. Do **not** add CI-skip directives such as
`[skip ci]`, `[ci skip]`, `[no ci]`, or `[skip actions]` to commit messages —
GitHub Actions honors these and would let an untested commit reach `main`.

A `commit-msg` hook in [`.githooks/`](.githooks/) enforces this and rejects any
such message. It is wired up automatically when you run `npm ci` / `npm install`
(via the `prepare` script, which sets `core.hooksPath` to `.githooks`). To enable
it manually:

```bash
git config core.hooksPath .githooks
```

## Pull Requests

Include:

- Summary of what changed
- Related issue, such as `Closes #123`
- Testing performed
- Files changed
- Screenshots for UI or README visual changes

Before opening a PR, check:

- No unrelated files are changed
- No generated bundles are committed unless the issue specifically requires them
- No `.DS_Store`, cache, log, temporary, or build artifacts are included
- No Firebase secrets, service account keys, or private data are exposed
- Existing tests pass for the area touched

## Good Contribution Areas

- Mobile responsiveness fixes
- Transcript import reliability
- Semester planner prerequisite data
- Faculty review and past-paper moderation flows
- E2E coverage for reviews, papers, and admin workflows
- Documentation, screenshots, and release process improvements

For security-sensitive changes, read [docs/SECURITY.md](docs/SECURITY.md) first.
