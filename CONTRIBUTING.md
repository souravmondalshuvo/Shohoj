# Contributing to Shohoj

Thanks for helping improve Shohoj. This project is a BRACU-focused academic tools platform, so contributions should keep student data, privacy, and reliability in mind.

## Local Setup

1. Clone the repository and install dependencies:

```bash
npm ci
```

2. Run the core validation checks:

```bash
npm run typecheck
npm test
```

3. For browser and deploy-path changes, also run:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
python3 build3.py
npm run test:bundle
```

## Workflow

Use an issue-first workflow:

1. Create or pick a GitHub issue.
2. Create a branch for that one issue.
3. Make small, focused changes.
4. Commit one changed file at a time.
5. Push after every commit.
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

Good pattern:

```bash
git status
git add path/to/one-file
git diff --cached
git commit -m "docs: update setup instructions"
git push origin branch-name
```

Each commit should contain one file and a clear message. If a task needs multiple files, split them into separate commits and keep the final branch working.

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
