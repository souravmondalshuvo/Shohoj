# Rollback

What to do when a release is bad. A release is "bad" when the post-deploy smoke
test (`scripts/smoke-production.mjs`) fails, or when a problem is reported on the
live site after a deploy.

> **First: identify the last known-good commit.** Every deploy publishes
> `version.json` at the site root (`/Shohoj/version.json`) with the exact
> `commit`. The `gh-pages` branch history and the GitHub Actions run list also
> show which commit produced each deploy. Pick the most recent commit whose
> deploy was healthy — that is your rollback target.

Each area rolls back independently. Frontend, Worker, and Firestore rules are
separate systems; a bad frontend release does **not** require touching the
Worker or rules.

---

## 1. GitHub Pages (frontend)

The frontend is whatever is on the `gh-pages` branch. Two options:

### Option A — re-deploy a known-good commit (preferred)
1. In GitHub → Actions → **CI / CD**, open the last successful run for the
   known-good commit.
2. Re-run it, **or** push a revert of the bad commit(s) to `main` so a fresh,
   fully-validated deploy of good code goes out. Re-running is faster; reverting
   keeps `main` honest. Prefer a revert if the bad code is still on `main`.
3. Confirm `version.json` on the live site reports the good commit and the smoke
   test passes.

### Option B — restore the archived deploy package
Every frontend deploy uploads the exact published folder as an artifact named
`pages-deploy-<sha>` (30-day retention). To restore without rebuilding:
1. Download the `pages-deploy-<good-sha>` artifact from that run.
2. Publish its contents to the `gh-pages` branch (e.g. via a manual
   `peaceiris/actions-gh-pages` run or a direct branch push by an admin).

> Do **not** hand-edit `gh-pages`. Always restore a whole validated package so
> `version.json` and assets stay consistent.

### Option C — the React shell cutover (#460), currently REVERTED

The site root serves the vanilla `build3.py` site, and the React shell is
opt-in at `/Shohoj/app/`. The cutover that made the shell the root has now been
put in and taken out twice — #460 shipped it, #465 reverted it, it was redone,
and it is reverted again because the shell's route interiors were still under
development while users were landing on them.

There is no `/Shohoj/legacy/` tree in this state: legacy IS the root. Any
bookmark to `/Shohoj/legacy/…` from the cutover period will 404.

**To cut over to the shell again**, both halves must move together — reverting
only one produces a broken site:

1. `.github/workflows/ci.yml` — the deploy layout: which build lands on
   `_deploy/index.html`, and the `SHELL_BASE` the shell is built with
   (`/Shohoj/app/` when opt-in, `/Shohoj/` at root).
2. `404.html` — the SPA fallback base. It currently redirects
   `/Shohoj/app/<route>` and deliberately leaves every other missing path as a
   plain 404 so legacy URLs are not hijacked. The root-cutover version instead
   falls the WHOLE site through to the shell and strips a leading `app/`. Ship
   that one while the shell is at `/app/` and every shell deep link is
   redirected away from the shell into legacy.

Before cutting over again, confirm parity covers more than the landing page —
`e2e-visual` asserts nav/hero/features on `/` only, which is how mismatched
route interiors reached production last time.

> `/Shohoj/admin/` is unaffected by the cutover either way: it is the same
> standalone `admin.html` before and after.

---

## 2. Cloudflare Worker

Cloudflare keeps prior Worker versions.

- **Dashboard:** Workers & Pages → `shohoj-papers` → **Deployments** → pick a
  previous deployment → **Rollback**.
- **CLI:** `cd worker && npx wrangler deployments list`, then
  `npx wrangler rollback [--version-id <id>]`.

Re-deploying the known-good commit through CI (push a Worker revert to `main`)
also works and is auditable. After rollback, `GET /health` should return `ok`.

---

## 3. Firestore rules & indexes

Rules and indexes are versioned in git (`firestore.rules`,
`firestore.indexes.json`) and deployed by the `deploy-firestore` job.

To roll back:
1. Revert the rules/index change on `main` (git revert). The path-filtered
   `deploy-firestore` job redeploys the previous rules — **after** the rules
   tests pass, so you cannot ship rules that fail their own suite.
2. Or, in an emergency, an admin can deploy a known-good revision locally:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes --project shohoj
   ```
   from a checkout of the good commit (needs the service-account auth from
   [GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md)).

Firebase Console → Firestore → Rules also shows the **rules version history** and
can restore a prior ruleset directly.

---

## 4. Firestore **data** (user data)

This is different and must be treated with care.

> **Rules/indexes rollback never touches user data. A bad *rules* deploy does
> not require a data restore.** Only restore data if data was actually
> corrupted or deleted.

Rolling back code does **not** roll back user data, and there is **no automated,
one-click data restore**. Data restoration is a deliberate, manual operation —
see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). Never restore a data backup
directly over production; restore into a staging project, verify, then decide.

---

## After any rollback

- Confirm `version.json` and `GET /health` reflect the restored state.
- Re-run the smoke check against production:
  ```bash
  BASE_URL=https://souravmondalshuvo.github.io/Shohoj/ node scripts/smoke-production.mjs
  ```
  (omit `EXPECTED_SHA` to just assert reachability of the current live build).
- Open an issue capturing what broke and why, and add a follow-up test so the
  same class of break is caught in CI next time.
