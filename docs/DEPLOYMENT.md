# Deployment

How the live site, admin shell, and Cloudflare Worker get built and shipped, and how to run the same flow locally.

## Live targets

| Target | Where | Built from |
|--------|-------|------------|
| Public site | `https://souravmondalshuvo.github.io/Shohoj` | `gh-pages` branch (`index.html`), produced from `main` |
| Admin shell | `https://souravmondalshuvo.github.io/Shohoj/admin/` | `gh-pages` branch (`admin/index.html`) |
| Papers Worker | `shohoj-papers.<account>.workers.dev` | `worker/index.js` deployed via `wrangler` |

## Required GitHub secrets

Every push to `main` runs the single **CI / CD** pipeline (`.github/workflows/ci.yml`). The `deploy-frontend` job expects the following repository secrets (ideally scoped to the `production` environment — see [GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md)). Missing any required one aborts the deploy with `::error::Missing required secret <KEY>`.

| Secret | Source | Purpose |
|--------|--------|---------|
| `FIREBASE_API_KEY` | Firebase Console → Project settings → Web app | Public web config — Firebase SDK initializer |
| `FIREBASE_AUTH_DOMAIN` | Firebase Console | Auth popup origin |
| `FIREBASE_PROJECT_ID` | Firebase Console | Firestore + Auth project |
| `FIREBASE_STORAGE_BUCKET` | Firebase Console | (unused today, kept for future use) |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Console | Required by SDK init |
| `FIREBASE_APP_ID` | Firebase Console | Required by SDK init |
| `GA_MEASUREMENT_ID` | GA4 property (`G-XXXXXXXX`) | Page-view analytics |
| `PAPERS_WORKER_URL` | Cloudflare Worker URL | Frontend → Worker proxy |
| `RECAPTCHA_V3_SITE_KEY` | Firebase Console → App Check → reCAPTCHA v3 | App Check site key |

These are all "public" config values — they end up in the bundled JS that ships to every browser. They are kept out of the committed source so the repo does not advertise the production project's identifiers, not because the values themselves are sensitive.

The `deploy-worker` job also needs:

| Secret | Source | Purpose |
|--------|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard | Lets GitHub Actions deploy the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | Selects the Cloudflare account |

The optional `deploy-firestore` job (rules + indexes) needs:

| Secret | Source | Purpose |
|--------|--------|---------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Service accounts → Generate new private key (JSON) | Authenticates `firebase deploy --only firestore:rules,firestore:indexes`. **If unset, the job skips safely** — it never crashes the pipeline. |

`GOOGLE_OAUTH_CLIENT_ID` is an **optional** frontend secret: when unset, the app feature-detects and disables the related feature (and fork PRs stay green).

## How runtime-config.js is generated

`js/config/runtime-config.js` is the single file that wires the secrets into the running app. It is **gitignored** and regenerated on every build.

```
runtime-config.template.js
        ↓  (cp + sed in CD, generate_runtime_config.js locally)
runtime-config.js
        ↓  loaded by index.html before the bundled JS
window._shohoj_firebase_config, window._shohoj_papers_worker_url, ...
```

In the `deploy-frontend` job this is a `cp` + `sed` loop that replaces every `__KEY__` placeholder with the matching secret. Locally, `npm run config:local` does the same substitution from `.env.local`.

## CI / CD pipeline (one workflow)

There is a **single authoritative pipeline**, `.github/workflows/ci.yml`. Validation and deployment live in the same workflow so a deploy can only run after the complete required suite passes **on the same commit** — there is no separate CD workflow that could ship an untested SHA.

**Validation jobs** run on every pull request and every push (Node 24, Python 3, Java 21 for the Firebase emulator): `Lint`, `Typecheck`, `Validate data`, `Unit + Firestore rules tests`, `Worker tests`, and `Build + E2E + bundle guards` (collision check, `build3.py`, base/pages/shell E2E, bundle + CSP smoke, Vite/shell builds).

**Deploy jobs** declare `needs:` on **all** validation jobs, run **only on push to `main`**, check out `${{ github.sha }}` (the exact validated commit), and use the `production` GitHub environment:

- **`deploy-frontend`** — generate `runtime-config.js` from secrets (fails on a missing required secret), `python3 build3.py`, `npm run build:pages`, production `test:bundle` + `test:csp`, stage `_deploy/`, write **`version.json`** build metadata, upload the deploy folder as a **`pages-deploy-<sha>` artifact** (30-day retention, for rollback), publish to `gh-pages`, then run the **post-deploy smoke test** (`scripts/smoke-production.mjs`).
- **`deploy-worker`** — path-sensitive (only when `worker/**` changed); `wrangler deploy`.
- **`deploy-firestore`** — path-sensitive (only when `firestore.rules` / `firestore.indexes.json` / `firebase.json` changed); `firebase deploy --only firestore:rules,firestore:indexes`; **never deploys data**; **skips safely** if `FIREBASE_SERVICE_ACCOUNT` is unset.

Least-privilege permissions per job, per-target deploy concurrency (only the newest release wins), and job timeouts are all set. If **any** validation job fails, no deploy job runs — the live site is never touched. Fork PRs never reach the deploy jobs and never receive deployment secrets.

### version.json (build traceability)

Every frontend deploy publishes `version.json` at the site root (`/Shohoj/version.json`) with safe metadata only — app version, commit SHA, git ref, build time, deploy target, and CI run id (no secrets, no user data). Use it to confirm which commit is live.

### Post-deploy smoke test

After publishing, `scripts/smoke-production.mjs` polls `version.json` until it reports the just-deployed SHA (GitHub Pages propagation), then checks every critical route (`/`, `/admin/`, `/profile/`, `/campus/`, `/bus/`, `/lost-found/`), the Shohoj/CSP HTML markers, and a hashed static asset. **A smoke failure fails the deploy job** — see [ROLLBACK.md](ROLLBACK.md) for what to do next.

## Running locally

```bash
git clone https://github.com/souravmondalshuvo/Shohoj.git
cd Shohoj
npm ci

# Generate runtime config from .env.local
cp .env.example .env.local
# fill in your Firebase values, then:
npm run config:local

# Serve
python3 -m http.server 8000
# Visit http://localhost:8000
```

For local cloud sync to work, add `localhost` (and `127.0.0.1` if you use it) as an authorized domain in Firebase Console → Authentication → Settings.

To run the same test suite CI runs:

```bash
npm test                # unit tests plus Firestore rules tests
npm run test:rules      # rules-only check (needs Java 21+ for the emulator)
```

To preview the bundled output:

```bash
python3 build3.py
# Outputs shohoj.html and admin.html — ready to deploy
```

`shohoj.html` and `admin.html` are gitignored — never commit them.

## Deploying the Worker

The Cloudflare Worker that fronts the R2 papers bucket is deployed by the `deploy-worker` job in the CI / CD pipeline. It runs **only after the full validation suite passes on `main`**, and only when `worker/**` (or the pipeline file) changed — an unrelated frontend change does not redeploy the Worker.

Manual deploy from the repo root:

```bash
cd worker
npm install
npx wrangler deploy
```

## Deploying Firestore rules & indexes

`firestore.rules` and `firestore.indexes.json` are deployed by the optional `deploy-firestore` job — path-sensitive (only when those files or `firebase.json` change), gated on the full suite (including the rules tests), and only from `main`. It runs `firebase deploy --only firestore:rules,firestore:indexes` and **never deploys data**. If `FIREBASE_SERVICE_ACCOUNT` is not configured, the job **skips safely** with a warning rather than failing. See [GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md) for the service-account secret and [ROLLBACK.md](ROLLBACK.md) for the rules-rollback path.

## Rollback

Frontend, Worker, and Firestore rules roll back independently — see [ROLLBACK.md](ROLLBACK.md). `version.json` and the `pages-deploy-<sha>` artifacts identify and restore known-good releases; user-data restore is a separate, deliberate operation covered in [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

Bindings are configured in `worker/wrangler.toml` (committed) — see `worker/wrangler.example.toml` for a fork-friendly template. The Worker authenticates Firebase ID tokens; admin actions (delete) are gated on the `admin: true` custom claim, so there is no Worker-side admin allow-list to maintain.

## Granting / revoking admin

Admin status is a Firebase custom claim, set out-of-band:

```bash
# Generate a service-account key in Firebase Console → Project settings →
# Service accounts → Generate new private key. Save it at the repo root as
# shohoj-service-account.json (gitignored).

npm run set:admin -- <uid>             # grant admin
npm run set:admin -- <uid> --revoke    # remove admin
```

The user must sign out and sign back in (or wait up to an hour) for the new claim to appear in their ID token. After that, both Firestore rules and the Worker will recognise them as admin.

## Rotating Firebase config / reCAPTCHA key

Firebase web config rotation is rare — the config persists for the life of the project. If you need to rotate:

1. Generate a new value in Firebase Console (or generate a new app for `FIREBASE_APP_ID`).
2. Update the matching repo secret.
3. Push any commit to `main` (or re-run the CD workflow) to roll out a new bundle.

reCAPTCHA v3 site-key rotation:

1. Firebase Console → App Check → reCAPTCHA v3 → register a new site key.
2. Update `RECAPTCHA_V3_SITE_KEY` repo secret.
3. Re-deploy. App Check will start using the new key on the next bundle load.

There are no Firebase API-key rotations to plan for — the API key is public and access is enforced by Firestore rules and App Check.
