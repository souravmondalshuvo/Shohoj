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

## Implementation notes

**Backend** — `worker/apiV1.js` holds the logic (pure, with its I/O injected);
`worker/index.js` wires it to a route. Tests: `worker/test/apiV1.test.js`.

**Frontend** — `src/platform/api/apiClient.ts` is the only place Shohoj talks to
its own API. It owns the base URL, the token, response validation and the
mapping from HTTP status onto the typed error hierarchy. Features call typed
modules beside it (`shohojUser.ts`), never `fetch`. Tests:
`tests/apiClient.test.js`, and `tests/apiIntegration.test.js` which drives the
real client against the real Worker handler with no network.

**Caching and retries are not the client's job.** They belong to whatever
server-state layer sits above it. A transport that also caches is a transport
nobody can reason about.
