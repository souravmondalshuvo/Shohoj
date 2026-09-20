# ADR 0002 — Shohoj Tasks is built on the existing shell + Worker

- **Status:** Accepted
- **Date:** 2026-09-20
- **Supersedes:** nothing
- **Amends:** `docs/architecture/TARGET_ARCHITECTURE.md` (adds the `/api/v1` namespace
  and the server-owned user record; does not change the stack it names)
- **Issue:** #710

## Context

Shohoj Tasks is the academic task-management layer: assignments, quizzes, exams,
projects, labs, readings and personal work, with Today/Upcoming views, deadlines,
priority, workload, assessment weight and eventual grade impact. It is a first-class
Shohoj module, not a separate product — it must reuse the same account, courses,
semesters and enrolments as the calculator, planner and degree tracker.

A full target stack was proposed for it: **Next.js + React + TanStack Query on the
frontend, Java 21 + Spring Boot + Spring Data JPA + PostgreSQL + Flyway on the
backend**, with Firebase Auth kept as the shared identity provider.

That proposal was evaluated against what the repository actually contains, verified
by inspection rather than from the existing documentation:

| Capability the proposal would add | What already exists |
|---|---|
| React + TypeScript frontend | `src/` — React 19, TypeScript in `strict` mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature`; 21 lazy routes on React Router 8 |
| Runtime validation (Zod) | `src/shared/validation/schema.ts` — Zod 4 behind a typed `Result` boundary, already the rule for all external data |
| Backend that verifies Firebase ID tokens | `worker/index.js` — `jwtVerify` against Google's JWKS, checking issuer and audience, plus a campus-email allowlist. In production. |
| Server-side privileged writes | The Worker holds a service account and writes Firestore over REST, bypassing rules, for deterministic review IDs |
| Rate limiting per identity | Cloudflare rate-limit bindings keyed on Firebase UID |
| Scheduled jobs | Worker cron — seat-drop alert emails, CONNECT feed archival |
| Migrations / schema discipline | `firestore.rules` (25 KB, 83 rule tests in CI) + generated regions checked for drift |

The production frontend is still the vanilla `js/` site, bundled by `build3.py` into
a single `shohoj.html` and deployed to **GitHub Pages — a static host**. The React
shell ships beside it at `/app/` as an opt-in beta, at roughly 90% visual parity
behind a blocking CI gate, with a per-route punch list still open. **The shell
cutover has already been attempted and reverted twice.**

## Decision

**Shohoj Tasks is built as a feature slice of the existing React/Vite shell, served
by a versioned `/api/v1` namespace on the existing Cloudflare Worker, over Firestore.**

Concretely:

1. **No Next.js.** Tasks lives at `src/features/tasks/` with routes under
   `src/app/routes/`, exactly like every other migrated feature.
2. **No second backend.** `/api/v1/*` is added to `worker/index.js`, reusing the
   Firebase token verification, CORS allowlist, rate limiting and service account
   that are already deployed and tested.
3. **No PostgreSQL yet.** Tasks, enrolments and semesters are stored as
   server-owned Firestore collections, written only through the API.
4. **Firebase Auth stays the identity provider**, as the proposal also requires.
5. **The API contract is designed to outlive the storage engine.** Endpoints are
   REST, versioned, DTO-shaped and validated at both ends. Nothing in the frontend
   knows that Firestore is behind them.

## Consequences

### What this buys

- **Nothing that works today is put at risk.** `js/`, `build3.py`, `index.html`,
  the deploy pipeline, the calculator's stored state and its sync engine are all
  untouched by Tasks.
- **A working end-to-end Phase 1 in days rather than weeks** — the auth half of it
  is already running in production.
- **No new hosting bill.** A JVM host plus managed PostgreSQL is roughly $15–25/month
  against a stack currently inside free tiers. Shohoj is run by one student.
- **No third frontend.** Adding Next.js before the shell cutover lands would mean
  three implementations of the calculator, at a moment when two have already proven
  hard enough to keep in parity.
- **CI stays the shape it is.** No JDK, no Postgres service container, no Testcontainers
  bolted onto a pipeline that already runs ~30 minutes.

### What this costs

- **Firestore is not relational.** Enrolment → task integrity is enforced in the
  service layer, not by a foreign key. Cross-entity queries that a `JOIN` would make
  trivial need denormalised fields and composite indexes, declared in
  `firestore.indexes.json`.
- **No Flyway.** Schema evolution is versioned per document (`schemaVersion`) and
  migrated on read, the same pattern `src/services/storage/migrate.ts` already uses
  for the local academic blob.
- **The Worker grows.** `worker/index.js` is already 1,916 lines. Tasks handlers go
  in their own modules (`worker/apiV1.js` and successors), wired from `index.js`,
  following the split that `assistant.js` and `semesterArchive.js` established.
- **Java/Spring experience is not gained here.** If that is a goal in itself, the
  migration path below exists precisely so it can be taken later without rework.

### Migration path to Spring Boot + PostgreSQL, if it is later wanted

This decision is deliberately reversible. The things that make a backend swap
expensive are avoided from the start:

- The frontend talks to **one typed API client** (`src/platform/api/`), never to
  Firestore, for anything Tasks-related. Repointing it is a base-URL change.
- Endpoints are **`/api/v1/...` REST with DTOs** — the same contract Spring Boot's
  controllers would expose. `docs/api/` is the specification, written stack-neutrally.
- The **internal Shohoj user record** exists from day one with its own opaque `id`,
  distinct from the Firebase UID. Tasks reference `userId`, so a future `users` table
  with a `firebase_uid` unique column is a straight import, and no task row has to be
  rewritten.
- Entity shapes (`Task`, `Assessment`, `Enrollment`, `Semester`, `TaskReminder`) are
  defined as **flat, typed records with enum-valued fields** — deliberately
  table-shaped rather than exploiting document nesting.

The trigger to revisit: Tasks needing queries Firestore cannot serve cheaply
(aggregate reporting, multi-field range filters), a second client that needs a real
server, or Firestore cost becoming material. Any of those justifies a new ADR, not
a rewrite.

## Alternatives considered

**Full target stack now (Next.js + Spring Boot + PostgreSQL).** Rejected for this
phase on cost and risk, not on merit: it is a better backend for a product with a
team and a budget, and the migration path above keeps it open.

**Spring Boot backend, keep the Vite shell.** The strongest alternative — it avoids
the third-frontend problem entirely and still delivers a JVM backend. Rejected for
now only because it splits academic data across Firestore and PostgreSQL while the
calculator still owns the semester/course data, which is the exact duplication the
Tasks brief forbids. It becomes the natural next step once the API contract below
is the only way Tasks data is reached.

**Tasks in the legacy `js/` app.** Rejected. It would be written against
`build3.py`'s flat scope and `innerHTML` templates, then rewritten at cutover.
