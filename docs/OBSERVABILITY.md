# Observability

Shohoj has a **logging foundation**, not a monitoring product. This document is
honest about that line: it describes what exists today and what real monitoring
would add later. No paid vendor is wired in.

## What exists today

### Structured logger (frontend / shell)
`src/platform/observability/logger.ts` is a provider-agnostic structured logger:
- Typed `LogRecord` (level, message, ISO time, structured `fields`).
- `child(fields)` binds correlation context (e.g. a request id) without
  mutating the parent.
- `fieldsFromError()` extracts a machine `errorCode` (for `ShohojError`s),
  `errorName`, and technical `errorMessage` — and deliberately does **not**
  promote user-facing copy into logs.
- A swappable sink (default: `consoleSink`, one JSON line per record) so logs
  can later be routed to any backend without touching call sites.

### Global frontend error capture (shell)
`src/platform/observability/globalErrorHandlers.ts` installs `error` and
`unhandledrejection` handlers that route uncaught exceptions and rejected
promises through the logger. Wired into the shell entry
(`src/app/entries/shell.tsx`). It logs only the safe error fields above.

### Worker logs
`worker/index.js`:
- `GET /health` — unauthenticated, side-effect-free liveness probe returning
  `{ status: "ok", service, time }`.
- A per-request **correlation id**, echoed as the `X-Request-Id` response header
  and included in a structured (JSON) error log line keyed by `path`, `method`,
  and an `errorCode` (`unauthorized` / `server_error`).
- Scheduled jobs (seat-alert + lost-found crons) log **success** (with counts),
  **skipped-configuration** (loud operational error when the email channel is
  not configured — no emails sent), and **failure** (caught, logged, state not
  advanced so the work is retried next tick).

### Build/deploy metadata
Every production deploy publishes `version.json` (app version, commit SHA, ref,
build time, target, CI run id) — see [DEPLOYMENT.md](DEPLOYMENT.md). This makes
"which build is live?" answerable without guessing.

## Redaction rule (must hold everywhere)

Never log: passwords, tokens, Firebase ID tokens, API keys, email contents,
transcript contents, review text, or any other user-identifying/sensitive data.
Log error **codes**, **names**, **counts**, **paths**, and **correlation ids** —
not payloads. `fieldsFromError()` is the safe default; prefer it over logging raw
objects.

## Useful metrics to add later (not yet collected)

These describe a future monitoring setup. They are **not** implemented today —
listing them is a roadmap, not a claim.

- Worker 4xx and 5xx rate (by route)
- Worker request latency (p50/p95)
- Upload failure rate
- Review submission failure rate
- Seat-alert cron: run success/failure, transitions detected, emails sent/failed
- Email delivery failures (Resend non-2xx)
- Authentication failures / App Check rejection rate
- Frontend exception rate (from the global handler, once a sink ships them)
- Production uptime (from `GET /health` + the smoke check)

## How to get there without a paid vendor

1. **Ship logs off the Worker:** `wrangler tail` for live debugging; a Logpush
   job (to R2 or a free-tier sink) for retention. Cloudflare's built-in
   analytics already give request/error/latency charts.
2. **Frontend errors:** point the logger's sink at a lightweight collector
   endpoint (could be a Worker route) instead of only `console`. Keep the
   redaction rule.
3. **Uptime:** a free external uptime monitor hitting `GET /health` and the
   Pages URL; the post-deploy smoke test already provides deploy-time coverage.

Adopt an actual provider only via an ADR (see `docs/architecture/decisions/`),
and never add a paid vendor without explicit approval.
