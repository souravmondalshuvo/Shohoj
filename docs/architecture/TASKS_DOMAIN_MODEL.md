# Shohoj Tasks — domain model

> The specification Phases 2 and 3 are built against. Entities, storage layout,
> and how Tasks reuses the academic data Shohoj already has instead of copying
> it. Decided in [ADR 0002](decisions/0002-shohoj-tasks-on-the-existing-stack.md);
> served over the contract in [`docs/api/`](../api/README.md).
>
> **Status:** Semester, Enrollment, Course, **Task** and **Assessment** are
> implemented (#712, #715, #717, #721), with Tasks reachable at `/tasks` and on
> the dashboard (#719). TaskReminder remains the specification Phase 6 is built
> against.
> Where this document and the code disagree, the code wins and this is a bug —
> `docs/api/README.md` is the live contract.

## The problem this model solves

Shohoj Tasks must be able to say *"the CSE220 assignment for the section I am
actually in, this semester"*. Today nothing in the repo can express that.

A course is a bare string in `CourseEntry.name` (`src/core/types.ts`), inside a
`SemesterEntry` whose `id` is a local counter, inside one JSON string in
`users/{uid}.data`. The semester's *name* is derived at render time from the live
CONNECT feed — which carries exactly one semester and forgets the running one the
moment advising opens for the next. Section and faculty exist only in the routine
builder's picks, keyed by course code, with no link to the calculator's courses.

So the model below introduces the missing middle: a **Semester** that keeps its
identity, and an **Enrollment** that is the student's place in one course in one
semester. Tasks hang off enrolments.

## Entities

```
   ShohojUser ──┬── Semester ──┐
                │              │
                └── Enrollment ┘── Course (canonical, shared)
                       │
                       └── Task ──┬── Assessment   (0..1)
                                  └── TaskReminder (0..n)
```

### Course — canonical, shared, not per-student

The BRACU catalogue already exists as `src/core/catalog.ts` (adapting
`js/core/catalog.js`), generated into the Worker as `catalog.generated.js` and
validated on write. **Tasks does not get its own copy and does not create
courses.** A course code on a task is checked against that catalogue exactly as
`/upload` and `/reviews` already check theirs.

| field | type | notes |
|---|---|---|
| `code` | `string` | `CSE220`. Primary key within a university. |
| `name` | `string` | `Data Structures` |
| `credits` | `number` | |
| `university` | `string` | Catalogues differ per campus. |

### Semester — the identity that survives the feed

| field | type | notes |
|---|---|---|
| `id` | `string` | `sem_<university>_<year><term>`, e.g. `sem_bracu_20263`. Deterministic. |
| `userId` | `string` | Owner. |
| `sessionId` | `number \| null` | The CONNECT session id when there is one. |
| `name` | `string` | `Fall 2026` |
| `year` | `number` · `season` | `Spring` \| `Summer` \| `Fall` |
| `startDate` / `endDate` | `string \| null` | ISO date. From the feed, or the archive, or the student. |
| `status` | enum | `PLANNED` · `ACTIVE` · `COMPLETED` · `ARCHIVED` |

The id is **derived from year and term, not assigned**, for the same reason the
Shohoj user id is: two devices that both decide "this is Fall 2026" must converge
on one semester rather than mint two. `semesterIdentity.ts` already parses BRACU
session ids (`20263` → Fall 2026) and is the source for this.

`ACTIVE` is the student's answer, not the feed's. The feed publishes what is open
for *advising*, which during registration week is the semester that has not
started yet — the bug `semesterIdentity.ts` was written to name (#633). A task
due "this semester" must mean the one the student is sitting in.

### Enrollment — a student in a course in a semester

The entity the whole model turns on. `CSE220` is a Course; *`CSE220`, Fall 2026,
Section 13, taught by SHO* is an Enrollment. Without the distinction, the same
course across two semesters collides, and retakes — which Shohoj's CGPA logic
already handles carefully — have nowhere to live.

| field | type | notes |
|---|---|---|
| `id` | `string` | `enr_` + 32 hex, derived from `userId + semesterId + courseCode`. |
| `userId` · `semesterId` · `courseCode` | `string` | |
| `section` | `string \| null` | `13`. Null when the student has not said. |
| `facultyInitials` | `string \| null` | Matches the reviews/routine convention. |
| `credits` | `number` | Copied from the catalogue **at enrolment time**, deliberately: a course whose credit value changes must not silently rewrite a completed semester's CGPA. |
| `status` | enum | `ENROLLED` · `COMPLETED` · `DROPPED` · `WITHDRAWN` |
| `source` | enum | `MANUAL` · `CALCULATOR` · `CONNECT_IMPORT` · `ROUTINE` — where it came from, so a derived enrolment can be reconciled later without clobbering one the student typed. |

### Task

One model for every kind, not a separate system per kind. A quiz and an
assignment differ in `type` and in whether they carry an Assessment — not in
their storage, their queries, or their Today view.

| field | type | notes |
|---|---|---|
| `id` | `string` | `tsk_` + 32 hex. Assigned, not derived — two identical tasks are two tasks. |
| `userId` | `string` | Owner. **Always from the verified token.** |
| `enrollmentId` | `string \| null` | Null for `PERSONAL` tasks. |
| `title` | `string` | 1–200 chars. |
| `description` | `string \| null` | ≤ 4000 chars. |
| `type` | enum | `ASSIGNMENT` `QUIZ` `EXAM` `PROJECT` `LAB` `READING` `PERSONAL` `OTHER` |
| `status` | enum | `TODO` `IN_PROGRESS` `COMPLETED` `CANCELLED` |
| `priority` | enum | `LOW` `MEDIUM` `HIGH` `CRITICAL` — the student's own call. |
| `priorityScore` | `number \| null` | Computed (Phase 5). Never overwrites `priority`. |
| `dueAt` | `string \| null` | ISO 8601 **UTC**. Null is valid: a reading with no deadline is still a task. |
| `startAt` | `string \| null` | For work with a window rather than a moment. |
| `estimatedMinutes` | `number \| null` | Feeds the future study planner. |
| `source` | enum | `MANUAL` `GMAIL` `CALENDAR` `AI_SUGGESTION` |
| `sourceReference` | `string \| null` | Opaque handle for the originating item. |
| `createdAt` · `updatedAt` · `completedAt` | `string \| null` | |

`completedAt` is stored rather than inferred from `status`, because "when did I
finish this" is a question the analytics in Phase 5 will ask and a status field
cannot answer.

`source` is on the Task from the start even though Gmail and AI are Phase 7. A
task that cannot say where it came from is a task a student cannot audit, and
retrofitting the field means every existing row reads as `MANUAL` whether it was
or not.

### Assessment — optional, 0..1 per task

Not every task is graded, so these fields are **not** on the Task. Forcing
`totalMarks` and `weightPercent` onto a reading would mean either nullable
clutter on every row or a lie.

| field | type | notes |
|---|---|---|
| `taskId` | `string` | Primary key — one assessment per task. |
| `totalMarks` | `number` | |
| `earnedMarks` | `number \| null` | Null means *not graded yet*, which is not zero. |
| `weightPercent` | `number` | Share of the final course mark. |
| `syllabus` · `location` · `notes` | `string \| null` | |

This is the hook for grade impact. Shohoj already models running-course marks —
`CourseMarkComponent` in `src/core/types.ts`, and the mark→letter cutoffs on each
`UniversityProfile` — so "what do I need on the final for an A-" is a function
that already exists. Phase 5 connects an Assessment to it. **Nothing here
computes a grade; the model only has to avoid blocking it.**

### TaskReminder — separate, 0..n per task

Kept out of the Task so that adding "three hours before" later is a row, not a
migration.

| field | type | notes |
|---|---|---|
| `id` · `taskId` · `userId` | `string` | |
| `scheduledFor` | `string` | ISO 8601 UTC. |
| `channel` | enum | `WEB` · `EMAIL` · `PUSH` |
| `status` | enum | `PENDING` · `SENT` · `FAILED` · `CANCELLED` |
| `sentAt` | `string \| null` | |

Delivery reuses the Worker cron and Resend sender that already deliver seat-drop
alerts. That machinery advances state **only on a confirmed send**, and reminders
must inherit that: a reminder marked `SENT` after a failed delivery is a missed
deadline the student was told about.

## Not duplicating academic data

The rule from the brief — *do not duplicate academic data between Shohoj modules*
— is enforced by an **adapter**, not by moving the calculator's data.

```
  users/{uid}.data          (unchanged: the calculator's own state)
        │
        │  read-only projection
        ▼
  enrollmentsFromAcademicState()      ← pure, testable, no writes
        │
        ▼
  suggested enrolments  ──→ student confirms ──→ Enrollment records
```

The calculator keeps owning grades, credits and CGPA. Tasks derives *candidate*
enrolments from what is already there — each semester's course codes, the routine
builder's section picks, the faculty initials the student recorded — and asks
before creating anything. `source` on the Enrollment records which came from
where.

**Why confirmation rather than automatic creation.** The calculator's semesters
include planned and hypothetical ones; its course list changes as a student
experiments with a CGPA simulation. Silently materialising enrolments from that
would attach tasks to semesters the student was only trying out. It is the same
`Detect → Suggest → Confirm → Create` rule the brief sets for Gmail, applied to
Shohoj's own data — and for the same reason.

Nothing in this direction writes back to `users/{uid}.data`. The calculator's
sync engine — pre-migration backup, corrupt-state recovery, conflict resolution
by fingerprint — is the most safety-critical code in the repo, and Tasks does not
touch it.

## Storage layout (Firestore, today)

```
shohojUsers/{firebaseUid}                     ← the user record (shipped)
  semesters/{semesterId}
  enrollments/{enrollmentId}
  tasks/{taskId}
    assessment/current                        ← 0..1, fixed document id
  reminders/{reminderId}
```

**Subcollections under the user**, for three reasons: a student's data is
co-located so "delete my account" is one subtree; no `userId` index is needed on
every query; and a query that forgot to filter by owner cannot compile, because
the owner is in the path.

**Why the path key is the Firebase uid** when the model references `usr_…`
everywhere: the path is an internal storage detail behind the API, and keying it
by the uid is what makes request-time resolution a single keyed read with no
lookup query. The *data* references the Shohoj id — `userId` is a stored field on
every record — and the data is what migrates. A future `tasks` table imports the
field, not the path.

**Client access is closed.** `firestore.rules` ends in a deny-all
`match /{document=**}`, so these collections are already unreadable and
unwritable from any client. Every read and write goes through `/api/v1`, where
ownership is checked against the verified token. That is stricter than the
existing collections and is the intended end state for them too.

### Indexes

Declared in `firestore.indexes.json` as the queries land, not before:

| query | index |
|---|---|
| Today / Upcoming | `status ASC, dueAt ASC` |
| One course's tasks | `enrollmentId ASC, dueAt ASC` |
| Overdue | `status ASC, dueAt ASC` (same index, bounded above by now) |
| Reminder sweep (cron, collection group) | `status ASC, scheduledFor ASC` |

The reminder sweep is the only collection-group query — the cron runs across all
students by definition, which is exactly the case the owner-in-the-path layout
does not serve. It is server-side only and never reachable from a client.

## What Phase 2 settled

The spec above left three things to implementation. They are now decided, and
Task inherits all three:

**Creates are idempotent, not 409.** Both ids are derived, so a repeated create
is the same record. `POST` answers `201` the first time and `200` after,
updating rather than refusing — which is what a client retrying a dropped
request needs. Task ids will NOT be derived (two identical tasks are two tasks),
so this is the one place Task diverges: a repeated task create is a new task.

**Deletes cascade, and say what they took.** A semester takes its enrolments
with it, and the response carries the count. Tasks must do the same when an
enrolment goes — an orphaned task is invisible in every course-filtered view.

**Ownership is structural, not checked.** The repository is bound to the
verified uid and the records live under that uid's path, so a handler cannot
name another owner. Tasks reuse the same repository construction, and therefore
inherit the property rather than re-implementing it.

One thing the spec got wrong and the code corrects: it listed a `GET
/api/v1/courses`. Shohoj already ships the full catalogue in the frontend
bundle, so that endpoint would be a slower path to data the client already has.
The server keeps codes and credits only — enough to validate what it is told.

## What Phase 3a settled

**Task ids are assigned, not derived** — as predicted above, and it is the only
place the three entities differ. `POST /api/v1/tasks` is therefore not
idempotent, unlike semesters and enrolments.

**The cascade runs the full depth**: semester → enrolments → tasks, with both
counts reported. A task orphaned by a deleted enrolment is invisible in every
course-filtered view, so it could never be found again.

**Today and Upcoming take the timezone from the client**, and refuse without it.
The spec said "rendered in the viewer's local zone" and left the mechanism open;
the mechanism is now an explicit `?tz=` rather than a server-side guess, because
the server genuinely does not know and a campus default is wrong for anybody
abroad. See `docs/api/README.md` for why a UTC default is wrong every evening
rather than occasionally.

**Assessment and TaskReminder are still unbuilt, and Task does not block them.**
`priorityScore` is on the record and null; the assessment relation is a separate
document keyed by task id, as specced; reminders are their own records. Nothing
in what shipped needs changing to add either.

## What Phase 4 settled

**There is no `GET /api/v1/dashboard`, and there should not be one yet.** The
original plan named it. It would save no round trips — `/tasks/today` already
returns overdue and due-today together — and it would be a third representation
of the same tasks, which is exactly the duplication the phase exists to prevent.
Every rule it would encode already has one definition. The trigger to revisit:
aggregation Firestore cannot serve cheaply, or a client that cannot make two
calls.

**The dashboard adds selection and ordering, and nothing else.**
`src/features/tasks/taskDigest.ts` is the entire surface area of "Tasks on the
dashboard": which tasks, in what order, capped for a card. Labels, deadline
tones and status meaning are imported from the same modules `/tasks` uses. If
that file grows a rule of its own, the dashboard has started duplicating the
feature.

**Silence is a feature.** The card renders nothing when there is nothing to say
— including on error and on an offline build. A dashboard is shared space, and
a student who does not use Tasks should see no trace of it. That is a
deliberate asymmetry with `/tasks`, which explains its empty states because
there the student asked.

## What Phase 5 settled

**The breakdown is the feature, not the score.** `/tasks` shows *why* a task
ranks where it does, in sentences, and never shows the raw number — 71.7 means
nothing on its own and comparing two scores digit by digit implies a precision
the model does not have. Scores become bands.

**Sorting by priority is opt-in.** The engine orders nothing by default, server
side or client side. Reordering the list every existing student sees, without
asking, is not an improvement.

**Grade impact reuses the calculator's engine.** `computeCourseMarks` answers
the arithmetic; `gradeImpact.ts` bridges to it and `gradeImpactView.ts` decides
the phrasing. There are now two modules between an assessment and a sentence on
screen, and neither of them does grade maths.

**Tone is a constraint, not a polish pass.** The wording describes the task,
never the student, and any line that projects forward states its own
assumption. Both have tests.

## Schema evolution without Flyway

Every stored document carries `schemaVersion`. A read that finds an older version
migrates it in memory and writes it back only when something else was going to be
written anyway. This is the pattern `src/services/storage/migrate.ts` already
uses for the local academic blob, including its most important property: **a
document that cannot be understood is never overwritten.**

## Timezones

Stored and transported in **UTC**, rendered in the viewer's local zone.

This is not boilerplate for Tasks. A deadline is a moment, and the two ways to
get it wrong are both real: storing a local wall-clock time makes a deadline move
when a student travels, and computing "today" in UTC puts a Dhaka student's
11pm task on tomorrow's list. `semesterIdentity.todayISODate()` already reads the
local calendar day for exactly this reason, and Today/Upcoming must use it.

## Phase order

| Phase | Delivers |
|---|---|
| 1 ✅ | `/api/v1`, the Shohoj user record, the typed API client |
| 2 ✅ | Semester + Enrollment: CRUD, ownership, the calculator adapter |
| 3a ✅ | Task CRUD, Today, Upcoming, course filtering — the API |
| 3b ✅ | The `/tasks` route and screens |
| 4 ✅ | Dashboard integration — surfaced through the Tasks service, not reimplemented |
| 5a ✅ | Priority scoring, Assessment, grade-impact foundations — the engine |
| 5b ✅ | Surfacing them: why-this-ranks-here, marks entry, grade impact on screen |
| 6 | Calendar + reminders, over the existing cron and sender |
| 7 | Gmail, Google Calendar, AI — behind an integration boundary, `Detect → Suggest → Confirm → Create` |
