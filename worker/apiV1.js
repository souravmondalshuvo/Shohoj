// worker/apiV1.js
//
// The `/api/v1` namespace — Shohoj's versioned application API, introduced with
// Shohoj Tasks (#710).
//
// Everything before this grew as one-off endpoints: /upload, /download, /file,
// /reviews, /api/assistant. Each verifies a token, does its one job, and returns
// a shape of its own. That was fine for five endpoints owned by one feature; it
// is not fine for a task manager whose surface is a dozen endpoints across four
// entities, with a documented contract a different backend is expected to serve
// later (see docs/architecture/decisions/0002-*.md).
//
// So this module owns three things the older endpoints do not have:
//
//   1. THE INTERNAL SHOHOJ USER. A Firebase UID identifies an *account*; Shohoj
//      needs a *user record* with a campus, a display name and a stable id of
//      its own that is not the Firebase UID. Tasks, enrolments and semesters
//      reference that id, so moving off Firebase Auth — or moving Tasks onto a
//      relational store with a `users` table — does not mean rewriting every
//      row that points at a person.
//
//   2. A CONSISTENT ERROR ENVELOPE. `{ error: { code, message } }`, with codes
//      from a closed set, so a client can branch on `code` instead of matching
//      prose. The older endpoints keep their existing shapes — changing them
//      would break the legacy site that is still the production deploy.
//
//   3. PURE, INJECTABLE LOGIC. Everything decidable without I/O is a pure
//      function here; the one function that touches Firestore takes its reads
//      and writes as injected dependencies. The Worker wires the real ones in
//      index.js, the tests wire fakes, and none of it needs a network.
//
// This module deliberately does NOT import from ./index.js. index.js imports it,
// and a cycle between them would be resolved differently by the Workers runtime
// and by node's test loader — which is exactly the class of bug that only shows
// up in production.

import { campusOfEmail } from './campus.generated.js';

/**
 * Server-owned Firestore collection holding the internal user record.
 *
 * Separate from `users/{uid}`, which is the client-written academic-state blob
 * (`{ data: <JSON string>, updatedAt }`, capped at 500 KB by firestore.rules).
 * Two reasons not to reuse it: that document's rule is
 * `keys().hasOnly(['data','updatedAt'])`, so adding fields would mean weakening
 * a rule that protects real academic data; and this record must be
 * server-written only, while that one is client-written by design.
 *
 * Nothing needs to be added to firestore.rules for this: the rules end in a
 * deny-all `match /{document=**}`, so an unlisted collection is already closed
 * to every client. The Worker reaches it with a service account, which bypasses
 * rules — the same path /reviews already uses.
 */
export const SHOHOJ_USERS_COLLECTION = 'shohojUsers';

/**
 * Version stamped on every stored user record.
 *
 * Firestore has no Flyway. A document that knows its own schema version can be
 * migrated on read when the shape changes, which is the same strategy
 * src/services/storage/migrate.ts already uses for the local academic blob.
 * Writing it from the first record is what makes that possible later; adding it
 * afterwards leaves an unversioned generation that has to be guessed at.
 */
export const USER_RECORD_SCHEMA_VERSION = 1;

/** Error codes the /api/v1 envelope can carry. Closed set — clients branch on these. */
export const API_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  INVALID_REQUEST: 'invalid_request',
  RATE_LIMITED: 'rate_limited',
  // This caller specifically has used today's free AI allowance — distinct
  // from RATE_LIMITED (which means "wait a minute") so a client can tell "try
  // again shortly" from "try again tomorrow" by code alone, without matching
  // prose.
  QUOTA_EXCEEDED: 'quota_exceeded',
  // A dependency Shohoj does not control is not answering — a model provider,
  // or a spend ceiling reached. Distinct from INTERNAL on purpose: the client
  // degrades gracefully on this one (keep what the offline path produced) and
  // reports a failure on the other.
  UNAVAILABLE: 'unavailable',
  INTERNAL: 'internal',
});

/** Build the standard error body. `message` is user-safe: never a stack, never a token. */
export function apiError(code, message) {
  return { error: { code, message } };
}

// ── Internal user id ────────────────────────────────────────────────────────

/**
 * The internal Shohoj user id for a Firebase UID: `usr_` + 32 hex characters.
 *
 * Derived rather than randomly assigned, which is a deliberate trade:
 *
 *   * It is stable without a lookup. Resolving a request's user needs no
 *     "find the record whose firebaseUid is X" query, and therefore no index
 *     and no second round trip, because the document is keyed by the UID.
 *   * It is idempotent. Two concurrent first-time requests from the same new
 *     account compute the same id and converge on the same record, instead of
 *     racing to mint two.
 *   * It is opaque downstream. A task document carries `usr_…`, not a Firebase
 *     UID, so the identity provider is not smeared across every collection.
 *
 * The cost is that the id cannot be rotated independently of the UID. That is
 * acceptable: nothing about a user survives losing their Firebase account
 * anyway, and a future relational `users` table can carry both columns.
 *
 * The `shohoj:user:v1:` prefix is domain separation. The same UID is hashed
 * elsewhere for a different purpose (deterministic review ids hash
 * `uid|initials|courseCode`), and an unprefixed hash of a bare UID would be the
 * same number in two systems that mean different things by it.
 *
 * 128 bits of a SHA-256 is far past collision risk for a per-campus user base,
 * and keeps the id short enough to read in a log line.
 */
export async function shohojUserId(firebaseUid, sha256Hex) {
  const digest = await sha256Hex(`shohoj:user:v1:${firebaseUid}`);
  return `usr_${digest.slice(0, 32)}`;
}

// ── Identity from verified claims ───────────────────────────────────────────

/** Trim a claim to a bounded string, or null. Never returns an empty string. */
function boundedString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
}

/**
 * A display name from the verified token, falling back to the local part of the
 * email.
 *
 * Google tokens usually carry `name`, but not always — a Workspace account with
 * the profile scope withheld arrives with an email and nothing else. Falling
 * back to the local part means the UI never has to render "null", and never has
 * to invent a placeholder of its own.
 *
 * Capped at 100 characters because it is displayed. The cap is here rather than
 * at the render site so the stored record is already bounded: a name is read
 * far more often than it is written.
 */
export function displayNameFromClaims(claims) {
  const name = boundedString(claims?.name, 100);
  if (name !== null) return name;
  const email = boundedString(claims?.email, 320);
  if (email === null) return null;
  const local = email.split('@')[0];
  return boundedString(local, 100);
}

/**
 * The identity fields a user record takes from a verified token.
 *
 * Every value here comes from claims the Worker has already verified against
 * Google's JWKS. Nothing is read from the request body — a client that could
 * name its own email or campus could read another campus's data through a
 * backend that believed it.
 */
export function identityFromClaims(claims) {
  return {
    email: boundedString(claims?.email, 320),
    displayName: displayNameFromClaims(claims),
    university: campusOfEmail(claims?.email) || null,
  };
}

// ── Record shaping ──────────────────────────────────────────────────────────

/**
 * Decide what the stored record should look like, given who is calling and what
 * is already stored. Pure: no clock, no network.
 *
 * Returns `{ record, changed, created }`.
 *
 * `changed` is the point of this function. `/api/v1/me` is called on every shell
 * boot, and blindly patching on each one would mean a Firestore write per page
 * load per student — billed, rate-limited, and pointless, since the identity
 * fields change roughly never. The write happens only when a field actually
 * differs, so the steady state is one read.
 *
 * `studentId` is preserved rather than rewritten. It does not come from the
 * token — it comes from the student's own transcript import — so a sign-in must
 * never clear it.
 */
export function shapeUserRecord({ id, firebaseUid, identity, existing, nowIso }) {
  const created = existing === null;

  if (created) {
    return {
      created: true,
      changed: true,
      record: {
        schemaVersion: USER_RECORD_SCHEMA_VERSION,
        id,
        firebaseUid,
        email: identity.email,
        displayName: identity.displayName,
        university: identity.university,
        studentId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };
  }

  // A stored record predating a field reads as undefined; normalise to null so
  // the comparison below does not see undefined !== null and write every time.
  const current = {
    email: existing.email ?? null,
    displayName: existing.displayName ?? null,
    university: existing.university ?? null,
  };

  const drifted =
    current.email !== identity.email ||
    current.displayName !== identity.displayName ||
    current.university !== identity.university ||
    existing.schemaVersion !== USER_RECORD_SCHEMA_VERSION;

  if (!drifted) {
    return { created: false, changed: false, record: normaliseStored(existing, id, firebaseUid) };
  }

  return {
    created: false,
    changed: true,
    record: {
      ...normaliseStored(existing, id, firebaseUid),
      schemaVersion: USER_RECORD_SCHEMA_VERSION,
      email: identity.email,
      displayName: identity.displayName,
      university: identity.university,
      updatedAt: nowIso,
    },
  };
}

/**
 * Fill in anything a stored record is missing.
 *
 * `id` and `firebaseUid` are recomputed rather than trusted: both are derived
 * from the verified token, and a stored value that disagreed would mean the
 * document had been tampered with. Taking the derived value makes that
 * unexploitable instead of merely unlikely.
 */
function normaliseStored(existing, id, firebaseUid) {
  return {
    schemaVersion: existing.schemaVersion ?? USER_RECORD_SCHEMA_VERSION,
    id,
    firebaseUid,
    email: existing.email ?? null,
    displayName: existing.displayName ?? null,
    university: existing.university ?? null,
    studentId: existing.studentId ?? null,
    createdAt: existing.createdAt ?? null,
    updatedAt: existing.updatedAt ?? null,
  };
}

/**
 * The record as the API returns it.
 *
 * `firebaseUid` and `schemaVersion` are deliberately withheld. The client
 * already knows its own UID from the Firebase SDK and has no use for it from
 * here, and the storage schema version is an implementation detail of whichever
 * backend is serving — a field the contract does not promise is a field a
 * future PostgreSQL implementation does not have to reproduce.
 */
export function userDto(record) {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    university: record.university,
    studentId: record.studentId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve (bootstrapping on first sight) the internal Shohoj user for a set of
 * verified claims, and return the DTO.
 *
 * `deps` is the entire I/O surface:
 *   getDoc(path)        → stored fields, or null when the document is absent
 *   patchDoc(path, obj) → merge-write those fields
 *   sha256Hex(input)    → 64-char lowercase hex
 *   now()               → Date, injectable so tests can pin it
 *
 * Bootstrap is a plain read-then-write rather than a transaction. Two
 * simultaneous first requests from one new account can both see nothing and
 * both write — but they write the *same* document id with the *same* derived
 * values, so the loser's write is byte-identical apart from a millisecond of
 * `createdAt`. A transaction would buy nothing that matters here, and Firestore
 * REST transactions would add two round trips to the hottest endpoint in the API.
 */
export async function resolveShohojUser(deps, claims) {
  const firebaseUid = boundedString(claims?.sub ?? claims?.user_id, 128);
  if (firebaseUid === null) {
    throw new Error('Verified token carries no subject');
  }

  const id = await shohojUserId(firebaseUid, deps.sha256Hex);
  const path = `${SHOHOJ_USERS_COLLECTION}/${firebaseUid}`;

  const existing = await deps.getDoc(path);
  const nowIso = deps.now().toISOString();
  const { record, changed, created } = shapeUserRecord({
    id,
    firebaseUid,
    identity: identityFromClaims(claims),
    existing,
    nowIso,
  });

  if (changed) await deps.patchDoc(path, record);

  return { user: userDto(record), created };
}
