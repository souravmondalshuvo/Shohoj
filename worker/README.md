# Shohoj papers Worker

Auth proxy in front of a Cloudflare R2 bucket. Handles BRACU-gated upload,
download, and admin-only delete for the Past Papers & Notes library.

## Why this exists

R2 has no built-in authentication. This Worker verifies a Firebase ID token on
every request, ensures the email is `*@g.bracu.ac.bd` or the token has the
Firebase `admin: true` custom claim, and only then talks to the R2 bucket. The
browser never gets direct access to R2.

## Endpoints

| Method | Path        | Auth          | Purpose                                    |
| ------ | ----------- | ------------- | ------------------------------------------ |
| POST   | `/upload`   | BRACU user    | Stream a file (≤10 MB, PDF/PNG/JPEG/WebP/GIF) into R2 |
| GET    | `/download` | BRACU user    | Stream the file back                       |
| DELETE | `/file`     | Admin claim   | Delete the file from R2                    |

All endpoints expect:

- `Authorization: Bearer <Firebase ID token>` header
- Upload query params: `courseCode`, `filename`, and optional moderation-email context fields
- Download/delete query param: `path`

New uploads are stored under:

```text
papers/{COURSE}/{UPLOADER_UID}/{filename}
```

Download/delete still accept legacy `papers/{COURSE}/{filename}` paths so older
files remain accessible while new Firestore metadata is owner-scoped.

## One-time setup

```bash
cd worker
npm install
npx wrangler login           # opens a browser to authorize Cloudflare
```

In the Cloudflare dashboard:

1. Go to **R2** → **Create bucket** → name it `shohoj-papers`
2. (No need to make it public — the Worker proxies access)

## Deploy

```bash
cd worker
npx wrangler deploy
```

Wrangler will print the deployed URL, something like
`https://shohoj-papers.YOUR-SUBDOMAIN.workers.dev`. Copy it.

In this repo, `.github/workflows/deploy-worker.yml` also deploys the Worker on
pushes that touch `worker/**`, after `npm run test:worker` passes.

## Seat-drop email alerts (cron)

The Worker's `scheduled()` handler powers "email me when a watched seat opens,
even with Shohoj closed". On each tick it fetches the CONNECT feed once, reads
every `seatAlertWatches/{uid}` doc, edge-detects watched sections flipping
full→open against per-user state in `seatAlertState/{uid}`, and emails via
Resend. One feed fetch serves all users.

To enable it:

1. Add the cron trigger to your `wrangler.toml` (see `wrangler.example.toml`):
   ```toml
   [triggers]
   crons = ["*/2 * * * *"]
   ```
2. Redeploy: `npx wrangler deploy`.

It reuses `SERVICE_ACCOUNT_JSON` (Firestore reads/writes) and `RESEND_API_KEY`,
and additionally requires a verified **`EMAIL_FROM`** (see below). Watches are
written by the signed-in client to `seatAlertWatches/{uid}` (see
`firestore.rules`); the Worker's `seatAlertState` collection is closed to all
clients. Tail live runs with `npx wrangler tail`.

### Cron observability

Each run logs a single privacy-safe line — counts only, never UIDs or emails:

```text
seat-alert cron: users=12 watches=9 transitions=2 emailed=2 failed=0
```

If the email channel is not configured it logs a loud operational error instead
and sends nothing:

```text
seat-alert cron: email channel not configured — EMAIL_FROM is not set; skipped (no emails sent)
```

## Email delivery setup (required for alerts)

Both seat-alert and admin-upload emails go through Resend and need a verified
sender. **The Worker never falls back to a default sender.** A missing
`EMAIL_FROM`, or one set to the Resend test sender (`onboarding@resend.dev`,
which only delivers to the Resend account owner), is treated as *not configured*:
the Worker skips the send and logs an operational error rather than silently
dropping mail. So alerts do **not** deliver until the steps below are done.

1. **Verify a domain in Resend.** Resend dashboard → **Domains** → **Add
   Domain** → enter a domain you control (e.g. `shohoj.app`).
2. **Add the DNS records Resend shows you** at your DNS provider:
   - **SPF** — a `TXT` record (`v=spf1 include:...`) authorizing Resend to send.
   - **DKIM** — the `CNAME`/`TXT` record(s) Resend generates for signing.
   - (Optional but recommended) **DMARC** — a `_dmarc` `TXT` record.
   Wait for Resend to show the domain as **Verified** (DNS can take minutes–hours).
3. **Set the secrets / vars:**
   ```bash
   cd worker
   wrangler secret put RESEND_API_KEY        # Resend API key (secret)
   ```
   Then set `EMAIL_FROM` to a sender on the verified domain. Either uncomment and
   edit it in `wrangler.toml` (it is not secret):
   ```toml
   EMAIL_FROM = "Shohoj Alerts <alerts@your-verified-domain.example>"
   ```
   or set it as a secret if you prefer (`wrangler secret put EMAIL_FROM`).
4. **Redeploy:** `npx wrangler deploy`.

### Test the email path

- **Unit:** `npm run test:worker` exercises the sender-config guard and the full
  cron fan-out (drop → email, first-run seeding, disabled user, multi-user
  partial delivery, Resend failure, missing config) with mocked Resend/Firestore.
- **End-to-end (manual, after deploy):** sign in on the live site, add a *full*
  section to your Seat Status watchlist and enable email alerts, then either wait
  for that section to open or use a Resend test send from the dashboard to your
  own address to confirm SPF/DKIM pass (no spam-folder placement). Tail the
  Worker (`npx wrangler tail`) and confirm `emailed=1 failed=0` for the run.

### Production-delivery verification checklist

- [ ] Resend domain shows **Verified** (SPF + DKIM green).
- [ ] `EMAIL_FROM` uses that domain (not `onboarding@resend.dev`).
- [ ] `wrangler tail` shows `seat-alert cron: ... emailed=N failed=0`, not the
      "not configured" line.
- [ ] A real test recipient received the mail in the inbox (not spam).

## Wire it into the app

For local development, set `PAPERS_WORKER_URL` in `.env.local` and run
`npm run config:local`. The generated `js/config/runtime-config.js` sets:

```html
<script>
  window._shohoj_papers_worker_url = 'https://shohoj-papers.YOUR-SUBDOMAIN.workers.dev';
</script>
```

In production, the same value is injected from the `PAPERS_WORKER_URL` GitHub
Actions secret during the CD build.

## Env vars

Edit `wrangler.toml` if these change:

| Var                   | What it does                                           |
| --------------------- | ------------------------------------------------------ |
| `FIREBASE_PROJECT_ID` | Firebase project ID — used to validate token audience  |
| `ALLOWED_ORIGINS`     | Comma-separated CORS origins (live site + localhost)   |
| `ADMIN_EMAIL`         | Upload-notification email recipient (admin)            |
| `ADMIN_MODERATION_URL` | Optional link included in upload-notification emails  |
| `EMAIL_FROM`          | **Verified-domain** sender for seat-alert + upload emails (see "Email delivery setup"). Required for any email to send; never falls back to a default. |

Admin authorization is not configured with an env var. It is enforced from the
Firebase ID token's `admin: true` custom claim.

Secrets:

```bash
wrangler secret put RESEND_API_KEY
```

## Assistant model providers

`POST /api/assistant` runs a tool loop over the student's own data. Two
providers can serve it, each gated by its own secret:

```bash
wrangler secret put ANTHROPIC_API_KEY   # Claude — answers by default
wrangler secret put OPENAI_API_KEY      # OpenAI — catches Claude's failures
```

| Secrets set | Behaviour |
| ----------- | --------- |
| Neither | `/api/assistant` returns 503, `GET /ready` reports `assistant: false`, and both front-ends hide their launcher rather than offer a button that cannot answer |
| `ANTHROPIC_API_KEY` only | Claude serves every turn; a failure is a failure |
| `OPENAI_API_KEY` only | OpenAI serves every turn |
| Both | Claude answers; on a 5xx, 429, timeout, network error, bad key, or a reply truncated before any text, the **same turn** is retried on OpenAI |

Fallback is whole-turn, never mid-tool-loop — the two APIs express tool calling
differently, and translating a half-finished tool conversation between them
under failure conditions is not worth the bugs. It fires only on infrastructure
failure: a model that answers, refuses, or declines is a real result, and a
throwing tool executor is our own bug that would fail identically on the other
provider.

Each fallback logs `assistant_provider_fallback` with the provider and reason
(no transcript, no uid). If that event is frequent, the primary provider is
unhealthy even though students are still getting answers.

`GET /ready` reports `assistant` (any provider configured) and
`assistantFallback` (both configured). It is unauthenticated, so it reports
booleans only and never names a vendor.

If the email channel is not fully configured (`RESEND_API_KEY` missing, or
`EMAIL_FROM` missing / set to the Resend test sender), uploads and the cron
still run — but the emails are skipped and an operational error is logged. Email
delivery never silently uses a default sender.

After changing any of these, redeploy with `npx wrangler deploy`.

## Local dev

```bash
npx wrangler dev
```

Runs the Worker on `http://127.0.0.1:8787` with a local R2 stub.
