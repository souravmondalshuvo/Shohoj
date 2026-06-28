# Target Architecture

> Date: 2026-06-28. The end-state Shohoj is migrating **toward**, incrementally.
> This supersedes the aspirational sections of `docs/REACT_VITE_MIGRATION.md` and
> aligns with `docs/FULL_REACT_TYPESCRIPT_MIGRATION.md` (kept as the long-form plan).

## Stack

- **Strict TypeScript** + **React** + **Vite**.
- **React Router Framework Mode** on React/Vite — SPA-compatible first, server
  loaders/actions added only per-route where they earn it.
- **Cloudflare Workers** runtime + hosting (replaces GitHub Pages **after** verified
  Vite parity), **R2** for files, Queues/Scheduled/Workflows for async jobs where justified.
- **Firebase Auth** retained; **Firestore retained behind typed repository interfaces**.
- **Zod** (or equivalent) for runtime validation of all external data.

Explicitly **not** adopting (without a future ADR proving need): microservices, PostgreSQL,
Next.js, Angular, Vue, SvelteKit, Redux, GraphQL, Kubernetes, a second backend.

## Shape — feature-based modular monolith, vertical slices

One product, one primary deployment, strict boundaries between capabilities. Modules:
identity, calculator, transcript, planner, degree-progress, routine, seats, free-rooms,
reviews, difficulty-map, papers, study-groups, feedback, profile, notifications,
administration.

```
src/
  app/        entries · routing · providers · middleware · errors
  features/<feature>/  domain · application · infrastructure · components · routes · schemas · tests
  platform/   auth · firebase · storage · files · notifications · configuration · observability
  shared/     ui · validation · types · errors · utilities · testing
```

## Dependency direction (clean/hexagonal)

```
        UI (React)
          ↓
   Application use cases  (commands / queries)
          ↓
        Domain  (pure TS: CGPA, retake policy, prereqs, conflicts, free-rooms…)
          ↓
   Ports / interfaces  ← Infrastructure adapters (Firestore, R2, Worker, browser)
```

The **domain layer imports none of**: React, Firebase, Cloudflare APIs, `window`,
`document`, `localStorage`, UI helpers. External data is `unknown` until a schema validates
it — no `data as T` without prior runtime validation.

## Repository ports (examples)

`ReviewRepository`, `PaperRepository`, `StudyGroupRepository`,
`UserAcademicStateRepository`, `SeatWatchRepository`, `FeedbackRepository`, `FileStorage`,
`NotificationGateway`. Firestore/R2 implementations live in feature `infrastructure/`.
Safe realtime reads may keep using the Firestore browser SDK **where Firestore rules are the
real authorization boundary**; the server re-verifies authorization for every privileged op.

## Backend-for-Frontend (Worker)

Sensitive commands (submit/delete review, upload/delete/approve paper, report content,
join/leave protected groups, admin actions, configure alerts, account deletion,
cross-collection updates, exports) follow: verify Firebase token → validate schema → check
domain authorization → rate-limit → execute → audit (when apt) → publish event (when apt) →
return typed user-safe result. Hidden UI is never authorization.

## CQRS-lite + events

Queries (`GetRecentPapers`, `GetReviewsByCourse`, `GetSeatStatus`, `GetAcademicProfile`…),
Commands (`SubmitReview`, `UploadPaper`, `JoinStudyGroup`, `CreateSeatWatch`,
`DeleteUserData`…), Domain events as completed facts (`PaperUploaded`, `PaperApproved`,
`ReviewReported`, `SeatBecameAvailable`, `TranscriptImported`,
`UserDataDeletionRequested`…). Queues/scheduled/workflows for slow/retryable async only
(seat-alert email, aggregation, thumbnails, moderation, export, account deletion,
cleanup) — never where a synchronous local op suffices.

## Routing & rendering

Routes: `/`, `/calculator`, `/transcript`, `/planner`, `/degree-progress`, `/routine`,
`/rooms`, `/seats`, `/reviews`, `/papers`, `/groups`, `/feedback`, `/profile`, `/admin`.
Route-based code splitting. URL search params for shareable state
(`/reviews?course=CSE220&faculty=ABC`, `/papers?course=CSE111&type=midterm`,
`/rooms?day=Sunday&time=14:00`).

- **Static/prerendered**: landing, privacy, docs, public info.
- **Client-heavy SPA**: calculator, transcript, planner, routine, profile, admin.
- **Server-rendered only where measurable**: public share/directory/metadata pages.
  No blanket SSR.

## State ownership

URL (filters/sort/pagination/selection/shareable) · Remote (Firestore/loader/subscriptions)
· Feature/domain (calculator semesters, planner draft, routine selection, transcript import)
· Local UI (modals, transient inputs, dropdowns, focus). **Global stays small**:
authenticated identity, theme, notifications, runtime capabilities, university context. No
single giant store.

## Cross-cutting

Production-grade security (strict CSP preserved, no unsafe `innerHTML`, upload allowlists,
URL validation, no open redirects, server-side admin checks, rate limits), accessibility
(keyboard, focus, labels, focus-trapped modals, reduced-motion, contrast, axe on critical
routes), provider-agnostic observability (request/correlation IDs, structured logs,
user-safe error codes, queue/Worker/upload/auth metrics, frontend error reporting),
performance budgets (route splitting; lazy PDF.js/charts/QR/admin/large datasets; single
Firebase bundle).

## Multi-university scalability

Domain logic is BRACU-agnostic where possible; `university context` is part of the small
global state so the same modular monolith can serve additional universities via
configuration + per-tenant data scoping, without forking into microservices.
