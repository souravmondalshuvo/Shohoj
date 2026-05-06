# Shohoj papers Worker

Auth proxy in front of a Cloudflare R2 bucket. Handles BRACU-gated upload,
download, and admin-only delete for the Past Papers & Notes library.

## Why this exists

R2 has no built-in authentication. This Worker verifies a Firebase ID token on
every request, ensures the email is `*@g.bracu.ac.bd`, and only then talks to
the R2 bucket. The browser never gets direct access to R2.

## Endpoints

| Method | Path        | Auth          | Purpose                                    |
| ------ | ----------- | ------------- | ------------------------------------------ |
| POST   | `/upload`   | BRACU user    | Stream a file (≤10 MB, PDF or image) into R2 |
| GET    | `/download` | BRACU user    | Stream the file back                       |
| DELETE | `/file`     | Admin UID     | Delete the file from R2                    |

All endpoints expect:

- `Authorization: Bearer <Firebase ID token>` header
- Request body / query params validated against the `papers/{COURSE}/{file}` path shape

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

## Wire it into the app

Open `index.html` and set:

```html
<script>
  window._shohoj_papers_worker_url = 'https://shohoj-papers.YOUR-SUBDOMAIN.workers.dev';
</script>
```

(Already added as a placeholder near the top of `<head>`.)

## Env vars

Edit `wrangler.toml` if these change:

| Var                   | What it does                                           |
| --------------------- | ------------------------------------------------------ |
| `FIREBASE_PROJECT_ID` | Firebase project ID — used to validate token audience  |
| `ADMIN_UID`           | UID allowed to call `DELETE /file`                     |
| `ALLOWED_ORIGINS`     | Comma-separated CORS origins (live site + localhost)   |

After changing any of these, redeploy with `npx wrangler deploy`.

## Local dev

```bash
npx wrangler dev
```

Runs the Worker on `http://127.0.0.1:8787` with a local R2 stub.
