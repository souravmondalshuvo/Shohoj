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
| `ADMIN_EMAIL`         | Optional upload-notification email recipient           |
| `ADMIN_MODERATION_URL` | Optional link included in upload-notification emails  |
| `EMAIL_FROM`          | Optional sender for upload-notification emails         |

Admin authorization is not configured with an env var. It is enforced from the
Firebase ID token's `admin: true` custom claim.

Optional secret:

```bash
wrangler secret put RESEND_API_KEY
```

If `RESEND_API_KEY` or `ADMIN_EMAIL` is missing, uploads still succeed; the
notification email is skipped.

After changing any of these, redeploy with `npx wrangler deploy`.

## Local dev

```bash
npx wrangler dev
```

Runs the Worker on `http://127.0.0.1:8787` with a local R2 stub.
