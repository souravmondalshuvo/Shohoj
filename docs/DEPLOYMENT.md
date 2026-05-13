# Deployment

How the live site, admin shell, and Cloudflare Worker get built and shipped, and how to run the same flow locally.

## Live targets

| Target | Where | Built from |
|--------|-------|------------|
| Public site | `https://souravmondalshuvo.github.io/Shohoj` | `gh-pages` branch (`index.html`), produced from `main` |
| Admin shell | `https://souravmondalshuvo.github.io/Shohoj/admin/` | `gh-pages` branch (`admin/index.html`) |
| Papers Worker | `shohoj-papers.<account>.workers.dev` | `worker/index.js` deployed via `wrangler` |

## Required GitHub secrets

Every push to `main` runs the CD workflow (`.github/workflows/cd.yml`), which expects the following repository secrets to exist. Missing any of them aborts the deploy with `::error::Missing secret <KEY>`.

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

The Worker deploy workflow (`.github/workflows/deploy-worker.yml`) also needs:

| Secret | Source | Purpose |
|--------|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard | Lets GitHub Actions deploy the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | Selects the Cloudflare account |

## How runtime-config.js is generated

`js/config/runtime-config.js` is the single file that wires the secrets into the running app. It is **gitignored** and regenerated on every build.

```
runtime-config.template.js
        ↓  (cp + sed in CD, generate_runtime_config.js locally)
runtime-config.js
        ↓  loaded by index.html before the bundled JS
window._shohoj_firebase_config, window._shohoj_papers_worker_url, ...
```

In CD this is a `cp` + `sed` loop in `.github/workflows/cd.yml` that replaces every `__KEY__` placeholder with the matching secret. Locally, `npm run config:local` does the same substitution from `.env.local`.

## CD pipeline (push to main)

`.github/workflows/cd.yml` runs sequentially:

1. **Checkout** the repo.
2. **Set up** Node 20, Python 3, Java 17 (Java is needed for the Firebase emulator).
3. **`npm ci`** — install pinned dev dependencies.
4. **`npm test`** — run the 189 unit tests. Failure aborts the deploy.
5. **`npm run test:rules`** — run 41 Firestore rules tests against the emulator. Failure aborts the deploy.
6. **Generate runtime-config.js** from secrets.
7. **`python3 build3.py`** — bundle into `shohoj.html` and `admin.html`.
8. **Stage** `_deploy/` (`shohoj.html` → `index.html`, `admin.html` → `admin/index.html`).
9. **`peaceiris/actions-gh-pages`** publishes `_deploy/` to the `gh-pages` branch.

GitHub Pages serves whatever is on `gh-pages`. There is no manual deploy step.

If tests fail, the live site is never touched.

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
npm test                # 189 unit tests
npm run test:rules      # 41 Firestore rules tests (needs Java 17+ for the emulator)
```

To preview the bundled output:

```bash
python3 build3.py
# Outputs shohoj.html and admin.html — ready to deploy
```

`shohoj.html` and `admin.html` are gitignored — never commit them.

## Deploying the Worker

The Cloudflare Worker that fronts the R2 papers bucket is deployed separately from the GitHub Pages site. The committed workflow deploys it automatically when `worker/**` or `.github/workflows/deploy-worker.yml` changes, after `npm run test:worker` passes.

Manual deploy from the repo root:

```bash
cd worker
npm install
npx wrangler deploy
```

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
