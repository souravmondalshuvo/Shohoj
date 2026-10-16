# ADR 0003 — Shohoj Tasks storage moves from Firestore to Cloudflare D1

- **Status:** Accepted
- **Date:** 2026-10-16
- **Supersedes:** point 3 of ADR 0002 ("No PostgreSQL yet. Tasks … are stored as
  server-owned Firestore collections")
- **Amends:** `docs/architecture/decisions/0002-shohoj-tasks-on-the-existing-stack.md`
  (everything else in it stands: same shell, same Worker, same `/api/v1`, Firebase Auth)
- **Issue:** #908

## Context

ADR 0002 put Shohoj Tasks on Firestore, written by the Worker over the REST API,
and named the triggers for revisiting that choice: queries Firestore cannot serve
cheaply, a second client that needs a real server, or Firestore cost becoming
material. It also built the escape hatch in from the start. `worker/academicRepo.js`
is the only module that knows Firestore is behind `/api/v1`, its I/O is injected,
and the entity shapes are flat, table-shaped records.

The records in question are all server-owned: `shohojUsers/{uid}` and its
`semesters`, `enrollments`, `tasks`, `assessments` and `reminders` subcollections,
plus `calendarFeeds/{token}`. `firestore.rules` ends in a deny-all, and
`tests/firestore.rules.test.js` pins these paths shut, so the client never reads
them directly.

### What was measured

On 2026-10-16, from the Chittagong edge (`cf-ray …-CGP`), 20 sequential requests
per endpoint, time after TCP connect:

| | Firestore (`shohoj-papers`) | D1 (throwaway `shohoj-d1-probe`, APAC) |
|---|---|---|
| Worker only, no storage (`/health`) | 96 ms median | 80 ms median |
| One keyed lookup that misses | 219–228 ms median (two runs) | 148 ms median |
| Worst request in the run | 701–963 ms | 163 ms |
| User lookup + 60 tasks joined to enrollments | not measured | 207 ms median, 232 ms max |

The Firestore lookup was a well-formed but non-existent calendar-feed token
(`/feeds/tasks/cft_000….ics`): read-only, rate-limited, touches no user data.
The D1 probe ran the same shape of query against a seeded copy of the schema
(1 user, 5 enrollments, 60 tasks).

Two findings:

1. **Per read, Firestore costs about 125–130 ms over the Worker baseline; D1 about
   70 ms.** A two-query D1 Tasks load with a join came back in roughly the time
   of one Firestore lookup today.
2. **Firestore has a cold-isolate penalty D1 does not.** The first requests on a
   fresh isolate took 400–960 ms because the Worker has to sign a JWT and exchange
   it for a Google OAuth token (`getServiceAccountAccessToken`) before its first
   read. D1 is a binding: no token, no spike.

The probe's limits are recorded rather than hidden: a tiny dataset, reads only
(D1 writes go to the single primary in APAC), a much smaller Worker than
production, and no measured Firestore figure for a full signed-in Tasks request.

### What the measurements do not settle

Latency on its own is not a strong reason to move. A Tasks screen at an estimated
300–450 ms is acceptable. The case rests on the structure of the data as much as
on speed:

- **Integrity lives in code.** "This task's enrollment exists and belongs to this
  user" is checked in the service layer. A foreign key would make it impossible
  to write wrongly.
- **Joins are hand-rolled.** Tasks ⋈ enrollments ⋈ assessments is a list plus
  per-record lookups in JavaScript.
- **The reminder cron is a cross-user scan.** It reads every student's
  `reminders` through a collection-group `runQuery`. In SQL that's
  `SELECT … WHERE scheduled_for <= ?` over one indexed table.
- **Schema evolution has no history.** ADR 0002 accepted per-document
  `schemaVersion` migrated on read in place of Flyway. D1 has versioned migration
  files applied by `wrangler d1 migrations apply`.

## Decision

**The Worker-owned academic data moves from Firestore to Cloudflare D1.** That
covers users, semesters, enrollments, tasks, assessments, reminders and calendar
feeds.

1. **D1, not PostgreSQL.** D1 is a binding on the Worker that already serves
   `/api/v1`: no new vendor, no connection string, no secret, no host to run, and
   it is free at Shohoj's scale (about 5 GB storage, 5M rows read and 100k rows
   written per day on the free plan at the time of writing). The database is
   created with location hint `apac`.
2. **The repository is the seam, and it has to be widened first.** Today
   `createAcademicRepo` is not the only code that touches these records:
   - `/api/v1/me` reads and writes the `shohojUsers/{uid}` record directly in
     `worker/apiV1.js`;
   - the calendar feed (`worker/calendarFeed.js`, `worker/calendarFeedHandlers.js`)
     resolves owners and rotates tokens through raw `getDoc`, `getDocSnapshot` and
     the atomic `commitWrites`;
   - `runReminderCron` in `worker/index.js` runs a Firestore collection-group
     `runQuery` and parses Firestore document paths.

   Before any D1 code is written, each of these moves behind a storage interface
   (user record, feed tokens, a cross-user "due reminders" query) with the
   Firestore implementation as its only backend. Once nothing outside that
   interface touches academic Firestore paths, a D1 implementation is selected by
   one configuration switch. Handlers, DTOs and the `/api/v1` contract do not
   change, and the frontend does not learn anything moved.
3. **One test suite, two backends.** The repository, handler, calendar-feed and
   reminder-cron tests in `worker/test/` run against both the Firestore and the D1
   implementation until the Firestore one is removed.
4. **Migrations are versioned files** under `worker/migrations/`, applied in CI
   before the Worker deploys.
5. **Backfill under a write freeze, verified by content.** The copy is only
   consistent if nothing changes while it runs, so the switch happens inside a
   short maintenance window: mutating `/api/v1` requests return `503` with
   `Retry-After`, and the reminder cron pauses. Reads stay up. Inside the window:
   1. Copy Firestore → D1.
   2. Verify. Per-user counts are only the first check. Every record is compared
      by id, and by a hash of its canonical form (same field set, normalised
      timestamps, enum values, owner ids). Foreign keys are checked too: every
      task's enrollment exists and has the same owner. The switch happens only if
      every id and every hash match.
   3. Switch the configuration to D1, then lift the freeze.
6. **Rollback is the same procedure in reverse.** After the switch, Firestore's
   academic collections stop receiving writes and go stale with the first edit,
   so pointing back at them would silently drop students' changes. Dual writes
   were considered and rejected: a write that lands in one store and fails in the
   other is exactly the divergence they are meant to prevent. Rolling back means
   freezing writes again, copying D1 → Firestore with the same copy-and-verify
   tool, and only then switching back. The Firestore collections are kept for one
   release as the target of that reverse copy, and are deleted in a separate,
   later change.
7. **Firebase stays where it is good.** Firebase Auth remains the identity
   provider. The `users/{uid}` blob that the client syncs directly, with its
   offline cache, stays on Firestore.

## Consequences

### What this buys

- About 70–80 ms less per read, and no 500–960 ms cold-isolate spikes on Tasks
  requests.
- Referential integrity, joins and indexed cross-user queries in the database
  instead of in JavaScript.
- A migration history for the schema.
- One fewer Google round-trip and OAuth token on the Tasks path.

### What this costs

- **Two databases.** Firestore remains for the client-synced blob, reviews,
  papers, Lost & Found and study groups. Each of those is read by the client
  directly, so moving any of them first needs Worker endpoints, and each gets its
  own decision.
- **No row-level security and no client access.** Every read goes through the
  Worker. For Tasks that is already true. For anything moved later it's a
  requirement, not a side effect.
- **SQLite, not Postgres.** Fewer types, simpler full-text search, a 10 GB ceiling
  per database. None of these bind Tasks today.
- **Writes are single-region.** D1 writes go to the APAC primary, so writes are
  not expected to get faster and may be slightly slower than reads. Re-measure
  after the switch.
- **A migration with real data.** The backfill touches every student's academic
  records once and has to be verified record by record, not assumed.
- **A short write outage.** Students can read Tasks but not change them while the
  copy runs, and again if a rollback is ever needed.
- **Refactoring before migrating.** The user record, calendar feed and reminder
  cron have to move behind the storage interface on Firestore first. That work
  ships on its own, with no behaviour change, before D1 is introduced.

### Re-measurement

Issue #908 requires a signed-in Tasks list request to be timed before and after
the switch. If D1 does not beat Firestore on that measurement, the switch is
re-evaluated before the Firestore collections are deleted.

## Alternatives considered

**Stay on Firestore.** Viable. It works, and it is inside the free tier. Rejected
because the integrity, join and cron-scan costs are structural and keep growing
with every Tasks feature. The cold-isolate penalty could be reduced separately by
caching the OAuth token across isolates, but that fixes only latency.

**PostgreSQL (Neon via Hyperdrive, or Supabase).** A richer database, and the
direction ADR 0002 left open. Rejected for now: it adds a vendor and a network
hop, Neon's free tier is small and sleeps when idle, and Supabase pauses idle
free projects and brings its own auth and realtime, which overlap with Firebase.
The repository seam that makes D1 possible would make Postgres possible later too.

**Move everything off Firestore at once.** Rejected. The client-synced blob depends
on Firestore's SDK and offline cache, and the other collections are read directly
by the client. Moving them is a larger change with a different risk profile from
moving data the Worker already owns.
