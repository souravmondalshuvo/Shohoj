# GitHub security & deployment settings (admin setup)

These are **repository-level settings that live in the GitHub UI, not in code.**
Nothing in this repo can enable them for you. This checklist is for a repository
administrator. Where a setting is required for a workflow in this repo to
actually work, that is called out.

> Status honesty: this document describes how to enable each setting. It does
> **not** assert any of them are currently enabled — verify in the GitHub UI.

## 1. Private vulnerability reporting

Settings → **Code security** → *Private vulnerability reporting* → **Enable**.

Lets people report security issues privately through GitHub instead of a public
issue. Pairs with [SECURITY.md](SECURITY.md), which points reporters here.

## 2. Secret scanning + push protection

Settings → **Code security**:
- **Secret scanning** → Enable (alerts on committed credentials).
- **Push protection** → Enable (blocks a push that contains a detected secret).

Free for public repositories. Push protection is the cheapest defense against a
leaked Firebase service-account key or Cloudflare token.

## 3. Dependabot security alerts

Settings → **Code security**:
- **Dependabot alerts** → Enable.
- **Dependabot security updates** → Enable (auto-PRs for vulnerable deps).

Version-update PRs are configured separately in
[`.github/dependabot.yml`](../.github/dependabot.yml) (monthly, grouped).

## 4. Dependency graph (required for dependency review)

Settings → **Code security** → **Dependency graph** → Enable.

The [`dependency-review.yml`](../.github/workflows/dependency-review.yml) workflow
needs this. On public repos it is on by default.

## 5. Code scanning (CodeQL)

CodeQL runs via **default setup** (Settings → Code security → *Code scanning* →
*Set up* → **Default**), which this repo already uses — it covers
JavaScript/TypeScript, Python, and Actions. Review findings under Security → Code
scanning.

> Do **not** also add an advanced `codeql.yml` workflow: GitHub rejects an
> advanced config's SARIF upload while default setup is enabled ("CodeQL analyses
> from advanced configurations cannot be processed when the default setup is
> enabled"). Pick one. We keep default setup for its broader language coverage.
> On private repos, CodeQL requires GitHub Advanced Security.

## 6. Branch protection / ruleset for `main`

Settings → **Rules** → **Rulesets** (or Branches → Branch protection). For `main`:
- **Require a pull request before merging.**
- **Require status checks to pass** — select these jobs from the CI/CD workflow:
  `Lint`, `Typecheck`, `Validate data`, `Unit + Firestore rules tests`,
  `Worker tests`, `Build + E2E + bundle guards`, `Review dependency changes`.
- **Require branches to be up to date before merging.**
- **Do not allow bypassing** (except the automation account if one is needed).
- Keep **Rebase-and-merge** enabled and **Squash disabled** (repo convention:
  every commit counts).

This is what actually makes CI a hard gate: without required checks, a red run
can still be merged.

## 7. `production` environment protection

Settings → **Environments** → **New environment** → name it exactly
**`production`**.

The deploy jobs (`deploy-frontend`, `deploy-worker`, `deploy-firestore` in
[`ci.yml`](../.github/workflows/ci.yml)) declare `environment: production`. Add:
- **Required reviewers** (optional) — a manual approval gate before production
  deploys.
- **Deployment branches** → *Selected branches* → `main` only.
- Store deploy secrets (below) **scoped to this environment** so PR/validation
  jobs can never read them.

## 8. Secrets

Repository or (preferred) `production`-environment secrets:

### Frontend (required — deploy fails loudly if missing)
`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`,
`GA_MEASUREMENT_ID`, `PAPERS_WORKER_URL`, `RECAPTCHA_V3_SITE_KEY`.

### Frontend (optional — feature self-disables if blank)
`GOOGLE_OAUTH_CLIENT_ID`.

### Worker (required for `deploy-worker`)
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Worker runtime secret (Assistant — set via Wrangler, NOT a GitHub secret)
`ANTHROPIC_API_KEY` powers `POST /api/assistant`. It is a **Cloudflare Worker
secret**, set directly on the Worker — it never enters the repo, CI, or GitHub
secrets. Until it is set, the Worker returns 503 for assistant turns and the
in-app launcher stays hidden (`GET /ready` reports `assistant: false`). To set
it (owner-only):

```
cd worker
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when prompted
```

Verify with `npx wrangler secret list` (shows the **name** only) and by
confirming `GET <worker>/ready` reports `capabilities.assistant: true`. Once
set, flip the `deploy-worker` smoke step to enforce it by setting the repo
variable `REQUIRE_ASSISTANT=1` (Settings → Secrets and variables → Actions →
Variables), so a future deploy can never silently ship the Assistant
unconfigured again. Tracks issue #455.

### Firestore rules/index deploy (required when rules/indexes change — job now FAILS CLOSED)
`FIREBASE_SERVICE_ACCOUNT` — the JSON of a service account with the
*Firebase Rules Admin* + *Cloud Datastore Index Admin* roles (or *Firebase
Admin*). Create it in **Firebase Console → Project settings → Service accounts →
Generate new private key**, then paste the whole JSON as the secret value. Never
commit this file. See [ROLLBACK.md](ROLLBACK.md) for the rules-rollback path.

> **Behaviour change:** `deploy-firestore` previously skipped with a warning
> when this secret was absent, leaving a green pipeline over stale production
> rules. It now **errors** if the rules/indexes changed on `main` but the secret
> is missing — a required security-rules deploy can no longer silently no-op.
> The job still only runs when `firestore.rules`/`firestore.indexes.json`
> actually changed, so an unrelated push is unaffected.

### App Check enforcement (Firebase console — not in this repo)
The client initializes App Check, but **enforcement** is a Firebase console
setting. Until it is switched from monitor to enforce and verified, un-attested
traffic with a valid ID token is still served. Firebase Console →
**App Check** → per-product (Firestore) → set to **Enforce** once monitor-mode
metrics look clean. This cannot be asserted from the repo; treat it as pending
until verified in the console. See [SECURITY.md](SECURITY.md).

> Prefer short-lived Workload Identity Federation over a long-lived key if/when
> you set up a GCP↔GitHub OIDC trust; this repo does not assume it exists.

All secret values are already public client config **except** the Cloudflare
token and the Firebase service account, which are true secrets — scope those to
the `production` environment.
