# Environments

Shohoj runs in three environments. **Tests and CI never point at production
Firebase or production R2.** This document describes the separation and the
values each environment needs. It contains **no real values** — those live in
`.env.local` (gitignored) locally and in GitHub secrets in CI.

| Environment | Frontend | Firebase project | Worker | R2 bucket | Purpose |
|---|---|---|---|---|---|
| **Local** | `python3 -m http.server` / `vite` | your own dev project | `wrangler dev` or none | your own / none | day-to-day development |
| **Staging** *(optional, not yet provisioned)* | a preview Pages site or branch | a **separate** `shohoj-staging` project | a `staging` Worker env | `shohoj-papers-staging` | pre-production verification |
| **Production** | `souravmondalshuvo.github.io/Shohoj` | `shohoj` | `shohoj-papers` | `shohoj-papers` | live site |

## Configuration surface

The same set of values is supplied per environment. Local reads them from
`.env.local` via `npm run config:local`; production reads them from GitHub
secrets in the deploy job (see [GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md)).

| Concern | Key | Notes |
|---|---|---|
| Firebase project | `FIREBASE_PROJECT_ID` | **must differ** between staging and production |
| Firebase web API key | `FIREBASE_API_KEY` | public client config |
| Firebase Auth domain | `FIREBASE_AUTH_DOMAIN` | per project |
| Firestore | (part of the project) | separate database per project |
| App Check | `RECAPTCHA_V3_SITE_KEY` | register a key per project |
| Worker URL | `PAPERS_WORKER_URL` | staging → staging Worker |
| Cloudflare Worker env | `wrangler.toml` `[env.staging]` | keep prod/staging vars distinct |
| R2 bucket | `wrangler.toml` bucket binding | separate bucket per env |
| Email sender | `EMAIL_FROM` (Worker var) | leave unset until a domain is verified |
| Analytics | `GA_MEASUREMENT_ID` | a separate GA4 property per env is ideal |

## Local setup

```bash
cp .env.example .env.local     # fill in YOUR dev Firebase project's values
npm run config:local           # generates js/config/runtime-config.js (gitignored)
python3 -m http.server 8000
```

Add `localhost` (and `127.0.0.1`) as authorized domains in your dev Firebase
project → Authentication → Settings.

## Staging (not yet provisioned)

Staging is documented here so it can be added **safely** later. The rule that
makes it safe:

> A staging deploy must point at a **separate** Firebase project and R2 bucket.
> A "staging" site wired to production Firestore is not staging — it is a second
> door into production and must not be created.

When staging infrastructure and secrets exist, a `deploy-staging` job (or a
separate workflow, disabled until its secrets are present) can build the same
artifact against the staging config. Until then, no staging workflow is wired
up, so nothing can accidentally publish to a half-configured staging target.

The Cloudflare Worker supports environments via `wrangler.toml`
(`[env.staging]`), so a staging Worker is `wrangler deploy --env staging` once
its bucket + secrets exist.

## Production

Production values are GitHub secrets, ideally scoped to the `production`
environment. The deploy job fails loudly if a required secret is missing. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the full pipeline and
[GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md) for the secret list.
