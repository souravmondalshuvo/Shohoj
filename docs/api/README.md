# Shohoj API — conventions and reference

> The contract between the Shohoj frontend and its backend. Written
> stack-neutrally on purpose: the Cloudflare Worker serves it today, and
> [ADR 0002](../architecture/decisions/0002-shohoj-tasks-on-the-existing-stack.md)
> keeps the option of a Spring Boot service serving the same contract later. If
> a rule here only makes sense because of Workers or Firestore, it is a bug in
> the rule.

## Base URL

```
<API_ORIGIN>/api/v1
```

`API_ORIGIN` is the Cloudflare Worker's origin, supplied to the frontend as the
`PAPERS_WORKER_URL` build secret and read through the validated runtime config
as `papersWorkerUrl`.

> **Naming debt.** That variable predates the API — it was named when the Worker
> only served past papers. It is now the origin of the whole Shohoj API.
> Renaming it means touching a GitHub secret, the runtime-config template,
> `wrangler.toml` and the CI deploy job together; it is not worth doing on its
> own, and is listed in the migration notes for whenever one of those is being
> changed anyway.

Everything under `/api/v1` is new surface. The endpoints that predate it —
`/upload`, `/download`, `/file`, `/reviews`, `/api/assistant`, `/api/semesters`,
`/health`, `/ready` — keep their existing paths and response shapes. **They are
not to be reshaped**: the legacy `js/` site is still the production deploy and
reads them as they are.

## Versioning

The version is in the path. `/api/v1` will not change shape incompatibly; a
breaking change means `/api/v2` served alongside it until the last client is
gone.

What counts as non-breaking, and so may ship inside `v1`:

- adding an endpoint;
- adding a field to a response (clients ignore unknown fields — this is tested);
- adding an **optional** request field;
- widening an accepted value where the client already had to handle unknowns
  (a new campus id, say).

Everything else is a new version.

## Authentication

```
Authorization: Bearer <Firebase ID token>
```

The frontend obtains the token from the Firebase client SDK; the backend
verifies it — signature against Google's JWKS, plus issuer and audience — and
derives the caller's identity from the verified claims.

Three rules, in force for every endpoint:

1. **Identity is never taken from the request.** No user id, email or campus in
   a body or a query string is trusted. A client that could name its own user
   could read another student's data.
2. **A request needing auth without a token fails on the client**, before the
   network. It can only come back 401, and doing it locally keeps a signed-out
   student off the wire.
3. **Hidden UI is not authorization.** Every ownership check is server-side.

For the per-student collections, ownership is *structural* rather than a check
each handler remembers: the repository is bound to the verified uid before any
handler runs, and the records live under that uid's path. "Read another
student's semester" is not a call that can be written. It also means "not yours"
and "not there" are the same read, which is why both answer `404`.

## Request and response shapes

- JSON in, JSON out. `Content-Type: application/json` on any request with a body.
- Responses are **DTOs**, never storage documents. A field the contract does not
  promise is a field a future backend does not have to reproduce — so the
  Firebase UID and the stored `schemaVersion` are deliberately withheld.
- A single resource is returned **inside an envelope** (`{ "user": … }`), not at
  the top level, so a response can grow a sibling without every client having to
  be taught that the shape moved.
- Collections return `{ "items": [...], "nextCursor": <string|null> }`.
- Timestamps are **ISO 8601 in UTC** (`2026-09-20T10:00:00.000Z`). Local time is
  a rendering concern; the wire and the store are UTC. This matters more than it
  looks for Tasks: a deadline is a moment, and a student who travels must not see
  it move.
- Enum-valued fields are `SCREAMING_SNAKE_CASE` strings (`TODO`, `IN_PROGRESS`).
  Clients must tolerate a value they do not recognise rather than crash.

## Errors

Every `/api/v1` failure answers with the same envelope:

```json
{ "error": { "code": "not_found", "message": "That task no longer exists." } }
```

- `code` comes from a closed set, so clients branch on it instead of matching
  prose. Unrecognised codes degrade to a generic failure.
- `message` is **contractually safe to display to a student**. No stack traces,
  no internal paths, no tokens, no database errors. This is why the frontend
  promotes it straight to `userMessage` rather than substituting a generic line
  — an API that cannot promise this must send a code and let the client write
  the prose.

| `code` | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No token, an invalid or expired one, or an account Shohoj does not serve |
| `forbidden` | 403 | Authenticated, but not permitted — including another student's resource |
| `not_found` | 404 | No such resource, **or** one the caller may not know exists |
| `invalid_request` | 400 | Malformed body, failed validation |
| `rate_limited` | 429 | Too many requests for this account |
| `internal` | 500 / 502 / 503 | Server-side failure. 503 specifically means "retry shortly" |

A resource belonging to another student answers `404`, not `403`. `403` confirms
that the thing exists, which is an information leak on a per-student resource.

## Endpoints

### `GET /api/v1/me`

The signed-in student's Shohoj user record, **created on first call**. Everything
else in Tasks depends on it: a task belongs to a Shohoj user id, and this is
where that id comes from.

**Auth:** required.

**Response** — `201` on the call that creates the record, `200` afterwards. The
status is the only signal that a student is new, which the dashboard uses to
choose between an empty state and an onboarding prompt.

```json
{
  "user": {
    "id": "usr_0123456789abcdef0123456789abcdef",
    "email": "student@g.bracu.ac.bd",
    "displayName": "Student Name",
    "university": "bracu",
    "studentId": null,
    "createdAt": "2026-09-20T10:00:00.000Z",
    "updatedAt": "2026-09-20T10:00:00.000Z"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `usr_` + 32 lowercase hex. The owner key on every Shohoj record. Stable for the life of the account. |
| `email` | `string \| null` | From the verified token. |
| `displayName` | `string \| null` | The token's `name`, else the email's local part. Capped at 100 characters. |
| `university` | `string \| null` | Resolved server-side **from the verified email domain**, never supplied. `null` is valid — an admin on no registered campus. |
| `studentId` | `string \| null` | From the student's own transcript import. Never from the token, and never cleared by a sign-in. |
| `createdAt` / `updatedAt` | `string` | ISO 8601 UTC. |

**Errors:** `401 unauthenticated` · `503 internal` (the backend's own credential
is unavailable — retryable) · `502 internal` (the record could not be read or
written).

Not rate-limited: it is called once per shell boot and performs a single keyed
read in the steady state, while the rate limiters are sized for write abuse. A
student who reloads too often should not lose the app.

### Semesters

A semester's id is **derived** — `sem_<campus>_<year><term>`, e.g.
`sem_bracu_20263` for Fall 2026 — not assigned. Two devices that both decide
"this is Fall 2026" therefore converge on one semester instead of minting two,
and a student's tasks do not split across a pair of them. The campus is part of
the id because the same term at two universities has different dates and is a
different semester.

At most **one semester is `ACTIVE`** at a time. Promoting one demotes the
previous one to `COMPLETED`.

| | |
|---|---|
| `GET /api/v1/semesters` | `{ "items": [...] }`, newest first |
| `POST /api/v1/semesters` | Create **or update** — see below |
| `GET /api/v1/semesters/{id}` | One semester |
| `PATCH /api/v1/semesters/{id}` | `status`, `sessionId`, `startDate`, `endDate` |
| `DELETE /api/v1/semesters/{id}` | **Cascades** — see below |

`POST` takes either `year` + `season`, or a CONNECT `sessionId` to derive both
from. Supplying both is fine when they agree; when they disagree it is a `400`
rather than a preference, because guessing which the caller meant is how a task
lands in the wrong term.

Because the id is derived, **`POST` is idempotent**: a second create for the
same term is the same semester. It answers `200` instead of `201` and updates,
rather than `409`. A client retrying a dropped request needs this.

`year` and `season` are **not patchable** — they are what the id is derived
from, so changing them would leave the record somewhere other than its own id.
Moving a semester is creating a different one. An unknown patch field is
**refused**, not ignored: a client that thinks it renamed a semester and got a
`200` back has been lied to.

`DELETE` removes the semester **and every enrolment in it**, and says how many:

```json
{ "deleted": { "id": "sem_bracu_20263", "removedEnrollments": 4, "removedTasks": 31 } }
```

The cascade is not optional and there is no flag to skip it, and it runs all the
way down: semester → enrolments → tasks. An enrolment whose semester is gone
appears in no view that lists by semester, and a task whose enrolment is gone
appears in no course-filtered view, so neither could ever be found or removed
again. Both counts come back so the client can say what went.

```json
{
  "semester": {
    "id": "sem_bracu_20263",
    "name": "Fall 2026",
    "year": 2026,
    "season": "Fall",
    "sessionId": 20263,
    "status": "ACTIVE",
    "startDate": "2026-10-03",
    "endDate": null,
    "createdAt": "2026-09-20T10:00:00.000Z",
    "updatedAt": "2026-09-20T10:00:00.000Z"
  }
}
```

`status` is `PLANNED` · `ACTIVE` · `COMPLETED` · `ARCHIVED`; `season` is
`Spring` · `Summer` · `Fall`.

### Enrolments

The student's place in one course in one semester — `CSE220` is a course,
*`CSE220`, Fall 2026, Section 13* is an enrolment. Tasks attach to these, never
to a bare course string, so the same course across two semesters does not
collide and a retake has somewhere to live.

The id is derived from student + semester + course, which makes it the
uniqueness constraint a document store will not give: **one course, one
semester, one enrolment**. A retake falls out for free — different semester,
different id.

| | |
|---|---|
| `GET /api/v1/enrollments` | `?semesterId=` to filter; sorted by course code |
| `POST /api/v1/enrollments` | Create **or update** — idempotent, as above |
| `GET /api/v1/enrollments/{id}` | One enrolment |
| `PATCH /api/v1/enrollments/{id}` | `section`, `facultyInitials`, `status` |
| `DELETE /api/v1/enrollments/{id}` | Cascades to the course's tasks; returns `removedTasks` |

```json
{
  "enrollment": {
    "id": "enr_0123456789abcdef0123456789abcdef",
    "semesterId": "sem_bracu_20263",
    "courseCode": "CSE220",
    "credits": 3,
    "section": "13",
    "facultyInitials": "SHO",
    "status": "ENROLLED",
    "source": "MANUAL",
    "createdAt": "2026-09-20T10:00:00.000Z",
    "updatedAt": "2026-09-20T10:00:00.000Z"
  }
}
```

`status` is `ENROLLED` · `COMPLETED` · `DROPPED` · `WITHDRAWN`. `source` is
`MANUAL` · `CALCULATOR` · `CONNECT_IMPORT` · `ROUTINE` — where the enrolment came
from, so a derived one can later be told from one the student typed.

Two fields the client cannot set:

- **`courseCode` is validated for existence**, not shape. `ZZZ999` matches the
  pattern and is still refused — the catalogue is server-controlled, the same
  gate `/upload` and `/reviews` already apply.
- **`credits` come from the server's catalogue**, never the request, and are
  copied at enrolment time. They feed workload now and grade impact later, so a
  client that could name them could name its own academic arithmetic; copying
  rather than looking up on read means a catalogue revision cannot retroactively
  change what a finished semester was worth.

`courseCode`, `semesterId` and `credits` are not patchable. The first two define
the id; the last is the server's. Changing a course means dropping this
enrolment and creating another, which is also what actually happened.

### Tasks

One model for every kind. A quiz and an assignment differ in `type` and in
whether they eventually carry an assessment — not in their storage, their
queries, their sort order or their Today view.

Task ids are **assigned, not derived** — the one place Tasks diverges from
Semester and Enrollment. Deriving an id from content would make two identical
tasks the same task, and a student who genuinely has two readings due Friday
must be able to create both. **`POST /api/v1/tasks` is therefore not
idempotent**, unlike the two endpoints above.

| | |
|---|---|
| `GET /api/v1/tasks` | `?enrollmentId=` · `?status=` |
| `POST /api/v1/tasks` | Create. Always a new task |
| `GET /api/v1/tasks/{id}` | |
| `PATCH /api/v1/tasks/{id}` | |
| `DELETE /api/v1/tasks/{id}` | |
| `PUT /api/v1/tasks/{id}/completion` | `{ "completed": true \| false }` |
| `GET /api/v1/tasks/today` | `?tz=` **required** |
| `GET /api/v1/tasks/upcoming` | `?tz=` **required**, `?days=` (default 7, max 90) |

```json
{
  "task": {
    "id": "tsk_0123456789abcdef0123456789abcdef",
    "enrollmentId": "enr_0123456789abcdef0123456789abcdef",
    "title": "CSE220 Assignment 2",
    "description": null,
    "type": "ASSIGNMENT",
    "status": "TODO",
    "priority": "HIGH",
    "priorityScore": null,
    "dueAt": "2026-10-09T17:59:00.000Z",
    "startAt": null,
    "estimatedMinutes": 180,
    "source": "MANUAL",
    "sourceReference": null,
    "createdAt": "2026-09-20T10:00:00.000Z",
    "updatedAt": "2026-09-20T10:00:00.000Z",
    "completedAt": null
  }
}
```

`type` is `ASSIGNMENT` · `QUIZ` · `EXAM` · `PROJECT` · `LAB` · `READING` ·
`PERSONAL` · `OTHER`. `status` is `TODO` · `IN_PROGRESS` · `COMPLETED` ·
`CANCELLED`. `priority` is `LOW` · `MEDIUM` · `HIGH` · `CRITICAL`, set by the
student; `priorityScore` is reserved for the automatic engine in Phase 5 and is
null until then.

`enrollmentId` is nullable — a `PERSONAL` task belongs to no course. When it is
set, the enrolment must be one of the caller's, checked on **create and on
patch**: moving a task to another course is an edit like any other, and an
unchecked one could point it at an id the client guessed, producing a task no
course-filtered view can reach.

`dueAt` is nullable: a reading with no deadline is still a task. When present it
must be a full ISO 8601 instant **with an offset** — `2026-10-09T23:59:00+06:00`
or `...Z`. A bare local time like `2026-10-09T23:59` is refused, because it does
not name a moment and guessing a zone for it is how a deadline moves when a
student travels.

`completedAt` is maintained by the server in **both** directions: completing
stamps it, reopening clears it. It is stored rather than inferred from `status`
because "when did I finish this" is a question a status field cannot answer.
Reopening returns a task to `TODO` rather than to whatever it was before —
restoring `IN_PROGRESS` would be guessing at a state the student left behind.

#### The automatic priority score

Every task response carries `priorityScore` (0–100) and `priorityFactors`,
computed server-side **on read**. A stored score would be wrong the moment it
was written — urgency changes every hour — and keeping one current would mean a
job rewriting every task in the database hourly for a number that is arithmetic.

```json
"priorityScore": 71.7,
"priorityFactors": [
  { "name": "urgency",    "value": 0.857, "weight": 0.45, "points": 38.57 },
  { "name": "weight",     "value": 0.4,   "weight": 0.25, "points": 10 },
  { "name": "workload",   "value": 0.875, "weight": 0.15, "points": 13.13 },
  { "name": "importance", "value": 0.667, "weight": 0.15, "points": 10 }
]
```

The breakdown is part of the contract, not a debug field: **a ranking a student
cannot interrogate is a ranking they will not trust.** Each factor carries its
normalised value, the weight applied and the points contributed; the four sum to
the score.

Four properties the engine guarantees, each with a test in
`worker/test/priority.test.js`:

| | |
|---|---|
| **Deterministic** | `now` is a parameter, not a clock read |
| **No magic numbers** | every threshold is justified where it is defined |
| **Configurable** | weights are an argument; a set not summing to 1 throws rather than silently rescaling |
| **Manual priority survives** | `priority` is an *input* to the score and is never overwritten |

`priorityScore` **does not change the response ordering**, which stays by due
date. A client sorts by it or ignores it; reordering every existing response
would change what current callers see without asking.

A task with no assessment still scores — on urgency, workload and the student's
own priority. An undated task scores **zero** urgency rather than "low", or it
would quietly outrank everything past the 14-day horizon.

#### `GET /api/v1/assessments`

Every assessment the student has, in one call — `{ "items": [...] }`, sorted by
task id. The per-task endpoint answers "what is this one worth"; this answers
"what does this course look like", which a grade panel needs and which would
otherwise cost one request per task for data held in a single collection.

#### `GET` · `PUT` · `DELETE /api/v1/tasks/{id}/assessment`

What a task is worth. A sub-resource because that is what it is: one slot per
task, keyed by task id, with no identity of its own. `PUT` rather than `POST`
for the same reason, and it **replaces rather than merges** — writing twice
leaves one assessment, and an omitted field is cleared.

```json
{
  "assessment": {
    "taskId": "tsk_0123456789abcdef0123456789abcdef",
    "totalMarks": 40,
    "earnedMarks": null,
    "weightPercent": 40,
    "syllabus": "Chapters 4-6",
    "location": null,
    "notes": null,
    "createdAt": "2026-09-20T10:00:00.000Z",
    "updatedAt": "2026-09-20T10:00:00.000Z"
  }
}
```

> **`earnedMarks: null` means NOT MARKED YET. It does not mean zero.**
>
> This is the single most important field in the Tasks API. A course whose final
> has not been marked must not read as a final *scored* 0 — that is the
> difference between "we do not know yet" and "you failed it", and every grade
> projection built on an assessment depends on it. `0` is a real score and is
> kept as `0`.

`earnedMarks` above `totalMarks` is refused. Bonus marks exist, but so do typos,
and a component scoring over its own total breaks every percentage derived from
it; raise the total if the bonus is real.

Deleting a task deletes its assessment, and dropping a course takes its tasks
**and** their assessments — the same orphan rule as everywhere else.

#### Completion has its own endpoint

`PUT .../completion` rather than a `PATCH` with a status, because ticking a box
is the most common write in the product and deserves to be one call with no body
to assemble and nothing else it could accidentally change. It insists on an
explicit boolean, so a malformed request cannot silently reopen finished work.
`PATCH` still works for anyone who prefers it, and routes through the same logic.

#### Today and Upcoming require a timezone

Both take `?tz=` as an IANA zone (`Asia/Dhaka`) and **refuse without it**. This
is the one place the API asks the client for something it could have defaulted,
and the default would have been wrong:

> Bangladesh is UTC+6. A student's entire evening — 6pm to midnight — is already
> the next day in UTC. A Today view computed in UTC is wrong every evening, for
> every student, which is exactly when they would be checking it.

The browser knows its zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`);
the server does not, and a campus-wide default would be wrong for anybody on
exchange. An unrecognised zone is a `400` rather than a silent fallback.

**Today** is two lists, because they mean different things:

```json
{ "overdue": [ ... ], "dueToday": [ ... ] }
```

`overdue` is **open** work whose deadline has passed — it stays there until it is
dealt with, because a missed deadline that scrolls off the screen gets missed
twice. `dueToday` **keeps completed** tasks: a Today list that empties itself as
work is finished takes away the only evidence the day went well. Cancelled tasks
appear in neither.

**Upcoming** starts *tomorrow* — today has its own view, and a task in both would
be double-counted by anything that adds them — and excludes finished work, since
something already done is not ahead of anybody.

```json
{ "days": 7, "items": [ ... ] }
```

#### Ordering

Soonest first, then by priority. **Undated tasks sort last**, not first: a null
due date is not "due now", and sorting nulls to the top would bury the exam that
is actually tomorrow under every undated reading.

### There is no `GET /api/v1/courses`

Shohoj already ships the full BRACU catalogue in the frontend bundle
(`src/core/catalog.ts`), so an endpoint serving course names and credits would
be a slower path to data the client already holds, and would need a second copy
of the names in the Worker. The server keeps codes and credits only — enough to
validate what it is told and to stamp a credit value it can vouch for.

If a campus ever arrives whose catalogue is too large to ship, that is the point
to add the endpoint, and it is additive.

## Implementation notes

**Backend** — layered, deliberately:

| Layer | Module | Knows about |
|---|---|---|
| Handler | `worker/academicHandlers.js` | Returns plain `{ status, body }` — no `Request`, no `Response` |
| Domain | `worker/academic.js` | Rules, validation, identity. Pure |
| Repository | `worker/academicRepo.js` | Firestore paths. I/O injected |
| Wiring | `worker/index.js` | Method, path, auth, CORS, correlation id |

Tasks follow the same layering — `worker/taskTime.js` (timezones and enums,
pure), `worker/tasks.js` (rules, pure), `worker/taskHandlers.js`. Tests:
`worker/test/taskTime.test.js`, `worker/test/tasks.test.js`,
`worker/test/taskApi.test.js`.

One wiring detail worth knowing before editing the route table: `/tasks/today`
and `/tasks/upcoming` must be matched **before** `/tasks/{id}`, or the id pattern
swallows both and the two most-used endpoints in the product answer 404. A test
fails if they are ever reordered.

A rule in the handler has to be re-tested through HTTP; a rule in the repository
needs a database to check. Both are how validation ends up duplicated and
drifting. `worker/apiV1.js` holds what the namespace shares — the error envelope
and user resolution. Tests: `worker/test/apiV1.test.js`,
`worker/test/academic.test.js`, `worker/test/academicApi.test.js`.

**Frontend** — `src/platform/api/apiClient.ts` is the only place Shohoj talks to
its own API. The screens that consume it live at `src/features/tasks/` and
`src/app/routes/TasksRoute.tsx`; the timezone `/tasks/today` requires is
attached once, in `src/platform/api/tasks.ts`, rather than at each call site. It owns the base URL, the token, response validation and the
mapping from HTTP status onto the typed error hierarchy. Features call typed
modules beside it (`shohojUser.ts`, `academic.ts`, `tasks.ts`), never `fetch`. Tests: `tests/apiClient.test.js`,
`tests/academicApi.test.js`, and `tests/apiIntegration.test.js` /
`tests/academicIntegration.test.js`, which drive the real client against the
real Worker handlers with no network.

**Caching and retries are not the client's job.** They belong to whatever
server-state layer sits above it. A transport that also caches is a transport
nobody can reason about.
