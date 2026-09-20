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

> **Delete `runtime-config.js` again before running the E2E suites.**
>
> ```bash
> rm -f js/config/runtime-config.js
> ```
>
> The suites are written against a raw dev tree: the specs inject their own
> globals with `addInitScript`, and this file loads afterwards and overwrites
> them. `e2e/campus-gate.spec.js` goes further and asserts the *unconfigured*
> state, so no value of this file can satisfy the suite. CI does the same `rm -f`
> before its E2E step.
>
> It is gitignored, so `git status` will not remind you it is there. A stale copy
> scatters failures across `routine-archive`, `assistant-fab` and `campus-gate`
> without naming the cause — an unfilled template is the worst case, because its
> `__PLACEHOLDER__` strings clobber the specs' values rather than merely being
> wrong. See [`CLAUDE.md`](../CLAUDE.md) for the measured breakdown.

### Working on the API (`/api/v1`)

Shohoj Tasks and everything else under `/api/v1` is served by the same Worker.
It needs **no new environment variables**: the frontend reaches it at
`PAPERS_WORKER_URL`, and the Worker reads Firestore with the
`SERVICE_ACCOUNT_JSON` secret it already uses for `/reviews`.

Most API work needs no Worker running at all. The suites drive the real handler
in-process:

```bash
npm run test:worker                  # the Worker's own tests
node tests/apiIntegration.test.js    # the real API client against the real handler
```

That integration test wires `src/platform/api` to `worker/index.js` with a
locally-signed token and fakes only Google's OAuth exchange and Firestore REST —
no network, no emulator, no credentials. It is the fastest way to see a change to
the contract end to end, and the first thing to run after touching either side.

To exercise it from a browser instead:

```bash
cd worker && npx wrangler dev        # serves the Worker on http://localhost:8787
```

Then point `PAPERS_WORKER_URL` in `.env.local` at `http://localhost:8787`, re-run
`npm run config:local`, and start the shell with `npm run dev:shell`. Two things
that will otherwise waste an afternoon:

- **Add the shell's origin to `ALLOWED_ORIGINS`** in `worker/wrangler.toml`.
  `http://localhost:5173` is already listed; the shell dev server runs on
  **5174**. Without it every authenticated call answers `403 Forbidden origin`,
  which looks like an auth failure and is not one.
- **`wrangler dev` needs `SERVICE_ACCOUNT_JSON`** (`.dev.vars`, gitignored) or
  `/api/v1/me` answers `503` — correctly, but confusingly if you were not
  expecting it.

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
