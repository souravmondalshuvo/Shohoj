// worker/academic.js
//
// The academic core's domain layer: Semester and Enrollment (#712).
//
// Pure. No I/O, no clock, no Firestore, no Request. Everything here is a
// function from values to values, which is what lets the rules that matter —
// what a valid semester is, when two enrolments are the same enrolment, what a
// client is allowed to change — be tested exhaustively without a network.
//
// The layering is deliberate and worth keeping:
//
//     handler   (worker/index.js)       HTTP: method, auth, status codes
//        │
//        ▼
//     domain    (this file)             rules, validation, identity
//        │
//        ▼
//     repository (worker/academicRepo.js) Firestore paths and REST calls
//
// A rule that lives in the handler is a rule that has to be re-tested through
// HTTP; a rule that lives in the repository is a rule that needs a database to
// check. Both are how validation ends up duplicated and drifting.

import { creditsForCourse, isKnownCourse } from './catalog.generated.js';

export const SEMESTER_STATUSES = Object.freeze(['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
export const ENROLLMENT_STATUSES = Object.freeze(['ENROLLED', 'COMPLETED', 'DROPPED', 'WITHDRAWN']);
export const ENROLLMENT_SOURCES = Object.freeze([
  'MANUAL',
  'CALCULATOR',
  'CONNECT_IMPORT',
  'ROUTINE',
]);

/** Season → BRACU term digit. 20263 is Fall 2026; see src/core/semesterIdentity.ts. */
export const SEASON_TERMS = Object.freeze({ Spring: 1, Summer: 2, Fall: 3 });
export const SEASONS = Object.freeze(Object.keys(SEASON_TERMS));

export const SEMESTER_SCHEMA_VERSION = 1;
export const ENROLLMENT_SCHEMA_VERSION = 1;

/**
 * Bounds on the academic year a semester may name.
 *
 * Not arbitrary politeness: the semester id embeds the year, and a request for
 * year 999999 would mint an id no other code path can parse back. BRACU opened
 * in 2001, and a plan more than a decade out is not a plan.
 */
const MIN_YEAR = 2001;
const MAX_YEAR = 2040;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Feed session ids are `YYYY` + a term digit, e.g. 20263. */
const SESSION_ID_RE = /^\d{5,6}$/;
/** Faculty initials, matching the convention reviews and the routine already use. */
const FACULTY_INITIALS_RE = /^[A-Z]{2,8}$/;
/** A section label as CONNECT publishes it: `13`, `01`, occasionally `A`. */
const SECTION_RE = /^[A-Za-z0-9]{1,6}$/;

// ── Validation helpers ──────────────────────────────────────────────────────

/** A failure a caller can show. `{ field, message }` — never a thrown error. */
function invalid(field, message) {
  return { field, message };
}

function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Validate an optional ISO date (`YYYY-MM-DD`).
 *
 * Shape AND reality: `2026-02-31` matches the regex, and `new Date` would
 * happily roll it into March. A term that starts on a day that does not exist
 * is a term whose dates will be wrong everywhere they are used.
 */
function cleanIsoDate(value) {
  const raw = cleanString(value, 10);
  if (raw === null || !ISO_DATE_RE.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

// ── Semester identity ───────────────────────────────────────────────────────

/**
 * The semester id: `sem_<university>_<year><term>`, e.g. `sem_bracu_20263`.
 *
 * Derived from campus, year and season rather than assigned, for the same
 * reason the Shohoj user id is derived: two devices that both decide "this is
 * Fall 2026" must converge on one semester instead of minting two. A student
 * who adds Fall 2026 on their laptop and again on their phone has one semester,
 * and their tasks do not split across a pair of them.
 *
 * The campus is part of the id because the same year and term at two
 * universities are two different semesters with different term dates.
 */
export function semesterId(university, year, season) {
  const term = SEASON_TERMS[season];
  return `sem_${university}_${year}${term}`;
}

/**
 * Parse a BRACU-style session id (`20263`) into `{ year, season }`, or null.
 *
 * Mirrors src/core/semesterIdentity.ts, which does this for the CONNECT feed.
 * A term digit outside 1-3 is not a term we know how to name, so this returns
 * null rather than guessing — the same choice that module makes.
 */
export function seasonFromSessionId(sessionId) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  const text = String(sessionId);
  if (!SESSION_ID_RE.test(text)) return null;
  const year = Number(text.slice(0, -1));
  const term = Number(text.slice(-1));
  const season = SEASONS.find((name) => SEASON_TERMS[name] === term);
  if (season === undefined || year < MIN_YEAR || year > MAX_YEAR) return null;
  return { year, season };
}

/** `Fall 2026`. The display name, derived so two clients cannot disagree. */
export function semesterName(year, season) {
  return `${season} ${year}`;
}

// ── Semester ────────────────────────────────────────────────────────────────

/**
 * Validate a semester-creation request.
 *
 * Returns `{ error }` or `{ value }` — never throws, and never partially
 * accepts. A caller may supply either an explicit `year` + `season`, or a
 * CONNECT `sessionId` to derive both from; supplying both is fine as long as
 * they agree, and a disagreement is an error rather than a silent preference,
 * because guessing which one the student meant is how a task lands in the wrong
 * term.
 */
export function validateSemesterInput(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }

  const sessionIdRaw = payload.sessionId;
  let sessionId = null;
  let derived = null;
  if (sessionIdRaw !== undefined && sessionIdRaw !== null) {
    if (!Number.isInteger(sessionIdRaw)) {
      return { error: invalid('sessionId', 'Session id must be a whole number.') };
    }
    derived = seasonFromSessionId(sessionIdRaw);
    if (derived === null) {
      return { error: invalid('sessionId', 'Not a semester session id Shohoj recognises.') };
    }
    sessionId = sessionIdRaw;
  }

  const hasExplicit = payload.year !== undefined || payload.season !== undefined;
  let year;
  let season;

  if (hasExplicit) {
    if (!Number.isInteger(payload.year) || payload.year < MIN_YEAR || payload.year > MAX_YEAR) {
      return { error: invalid('year', `Year must be between ${MIN_YEAR} and ${MAX_YEAR}.`) };
    }
    if (!SEASONS.includes(payload.season)) {
      return { error: invalid('season', `Season must be one of ${SEASONS.join(', ')}.`) };
    }
    year = payload.year;
    season = payload.season;
    // Both supplied and disagreeing: refuse rather than pick one.
    if (derived !== null && (derived.year !== year || derived.season !== season)) {
      return {
        error: invalid(
          'sessionId',
          `Session id ${sessionId} is ${derived.season} ${derived.year}, not ${season} ${year}.`,
        ),
      };
    }
  } else if (derived !== null) {
    ({ year, season } = derived);
  } else {
    return { error: invalid('season', 'Provide either year and season, or a sessionId.') };
  }

  const status = payload.status === undefined ? 'PLANNED' : payload.status;
  if (!SEMESTER_STATUSES.includes(status)) {
    return { error: invalid('status', `Status must be one of ${SEMESTER_STATUSES.join(', ')}.`) };
  }

  const startDate = payload.startDate == null ? null : cleanIsoDate(payload.startDate);
  if (payload.startDate != null && startDate === null) {
    return { error: invalid('startDate', 'Start date must be a real date, as YYYY-MM-DD.') };
  }
  const endDate = payload.endDate == null ? null : cleanIsoDate(payload.endDate);
  if (payload.endDate != null && endDate === null) {
    return { error: invalid('endDate', 'End date must be a real date, as YYYY-MM-DD.') };
  }
  if (startDate !== null && endDate !== null && endDate < startDate) {
    return { error: invalid('endDate', 'A semester cannot end before it starts.') };
  }

  return { value: { year, season, sessionId, status, startDate, endDate } };
}

/**
 * Build the stored semester record. Pure — the caller supplies the clock.
 *
 * `name` is derived rather than accepted from the client: a semester called
 * "Fall 2026" whose year field says 2025 would be wrong in exactly the way
 * nobody notices until a deadline sorts oddly.
 */
export function buildSemesterRecord({ university, userId, input, nowIso }) {
  return {
    schemaVersion: SEMESTER_SCHEMA_VERSION,
    id: semesterId(university, input.year, input.season),
    userId,
    university,
    name: semesterName(input.year, input.season),
    year: input.year,
    season: input.season,
    sessionId: input.sessionId,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Fields a client may change on an existing semester. */
const SEMESTER_PATCHABLE = Object.freeze(['status', 'startDate', 'endDate', 'sessionId']);

/**
 * Apply a partial update to a stored semester.
 *
 * Year and season are deliberately not patchable: they are what the id is
 * derived from, so changing them would mean the record no longer lives at its
 * own id. Moving a semester is creating a different one.
 */
export function applySemesterPatch(existing, payload, nowIso) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }
  const unknown = Object.keys(payload).filter((key) => !SEMESTER_PATCHABLE.includes(key));
  if (unknown.length > 0) {
    // Refused rather than ignored. A client that thinks it renamed a semester
    // and got a 200 back has been lied to.
    return {
      error: invalid(unknown[0], `Cannot be changed. Editable: ${SEMESTER_PATCHABLE.join(', ')}.`),
    };
  }

  const next = { ...existing };

  if (payload.status !== undefined) {
    if (!SEMESTER_STATUSES.includes(payload.status)) {
      return { error: invalid('status', `Status must be one of ${SEMESTER_STATUSES.join(', ')}.`) };
    }
    next.status = payload.status;
  }

  if (payload.sessionId !== undefined) {
    if (payload.sessionId === null) {
      next.sessionId = null;
    } else {
      const derived = seasonFromSessionId(payload.sessionId);
      if (derived === null) {
        return { error: invalid('sessionId', 'Not a semester session id Shohoj recognises.') };
      }
      if (derived.year !== existing.year || derived.season !== existing.season) {
        return {
          error: invalid(
            'sessionId',
            `Session id ${payload.sessionId} is ${derived.season} ${derived.year}, not this semester.`,
          ),
        };
      }
      next.sessionId = payload.sessionId;
    }
  }

  for (const field of ['startDate', 'endDate']) {
    if (payload[field] === undefined) continue;
    if (payload[field] === null) {
      next[field] = null;
      continue;
    }
    const date = cleanIsoDate(payload[field]);
    if (date === null) {
      return { error: invalid(field, 'Must be a real date, as YYYY-MM-DD.') };
    }
    next[field] = date;
  }

  if (next.startDate !== null && next.endDate !== null && next.endDate < next.startDate) {
    return { error: invalid('endDate', 'A semester cannot end before it starts.') };
  }

  next.updatedAt = nowIso;
  return { value: next };
}

/**
 * The semesters that must be demoted so `activeId` is the only ACTIVE one.
 *
 * "Which semester am I in" has exactly one answer, and Today/Upcoming depend on
 * it. Rather than enforce that with a transaction the document store cannot
 * give cheaply, the handler computes the demotions here and applies them — so
 * the invariant is a tested pure function, and the worst a race can do is leave
 * a second ACTIVE semester that the next call repairs.
 */
export function semestersToDemote(all, activeId) {
  return all
    .filter((semester) => semester.status === 'ACTIVE' && semester.id !== activeId)
    .map((semester) => semester.id);
}

/** Newest first — the order a student thinks in. */
export function sortSemesters(all) {
  return [...all].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return (SEASON_TERMS[b.season] ?? 0) - (SEASON_TERMS[a.season] ?? 0);
  });
}

// ── Enrollment ──────────────────────────────────────────────────────────────

/**
 * The enrolment id, derived from the student, the semester and the course.
 *
 * This is what makes "enrol CSE220 in Fall 2026" idempotent: the same three
 * facts always produce the same id, so a double-tapped button writes the same
 * document twice rather than creating two enrolments the student then has to
 * clean up. It is also the uniqueness constraint a document store will not give
 * — one course, one semester, one enrolment, structurally.
 *
 * A retake is therefore a different enrolment, because it is in a different
 * semester. That is the correct behaviour and it falls out of the key rather
 * than needing a rule.
 */
export async function enrollmentId(userId, semesterIdValue, courseCode, sha256Hex) {
  const digest = await sha256Hex(`shohoj:enrollment:v1:${userId}|${semesterIdValue}|${courseCode}`);
  return `enr_${digest.slice(0, 32)}`;
}

/**
 * Validate an enrolment-creation request.
 *
 * `courseCode` is checked for EXISTENCE, not shape. The catalogue is
 * server-controlled, so a client cannot enrol in a course it invented — the
 * same gate /upload and /reviews already apply.
 */
export function validateEnrollmentInput(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }

  const semesterIdValue = cleanString(payload.semesterId, 64);
  if (semesterIdValue === null) {
    return { error: invalid('semesterId', 'Which semester is this course in?') };
  }

  const courseCodeRaw = cleanString(payload.courseCode, 12);
  const courseCode = courseCodeRaw === null ? null : courseCodeRaw.toUpperCase();
  if (courseCode === null || !isKnownCourse(courseCode)) {
    return { error: invalid('courseCode', 'Not a course in the Shohoj catalogue.') };
  }

  let section = null;
  if (payload.section != null) {
    section = cleanString(payload.section, 6);
    if (section === null || !SECTION_RE.test(section)) {
      return { error: invalid('section', 'Section should be a short code like 13.') };
    }
  }

  let facultyInitials = null;
  if (payload.facultyInitials != null) {
    const raw = cleanString(payload.facultyInitials, 8);
    facultyInitials = raw === null ? null : raw.toUpperCase();
    if (facultyInitials === null || !FACULTY_INITIALS_RE.test(facultyInitials)) {
      return { error: invalid('facultyInitials', 'Faculty initials should be 2-8 letters.') };
    }
  }

  const status = payload.status === undefined ? 'ENROLLED' : payload.status;
  if (!ENROLLMENT_STATUSES.includes(status)) {
    return {
      error: invalid('status', `Status must be one of ${ENROLLMENT_STATUSES.join(', ')}.`),
    };
  }

  const source = payload.source === undefined ? 'MANUAL' : payload.source;
  if (!ENROLLMENT_SOURCES.includes(source)) {
    return { error: invalid('source', `Source must be one of ${ENROLLMENT_SOURCES.join(', ')}.`) };
  }

  return {
    value: { semesterId: semesterIdValue, courseCode, section, facultyInitials, status, source },
  };
}

/**
 * Build the stored enrolment record.
 *
 * Credits come from the server's catalogue, never from the request. They feed
 * workload and eventually grade impact, and a client that could name them could
 * name its own academic arithmetic. They are COPIED rather than looked up on
 * read so that a catalogue revision does not retroactively change what a
 * finished semester was worth.
 */
export function buildEnrollmentRecord({ id, userId, input, nowIso }) {
  return {
    schemaVersion: ENROLLMENT_SCHEMA_VERSION,
    id,
    userId,
    semesterId: input.semesterId,
    courseCode: input.courseCode,
    credits: creditsForCourse(input.courseCode),
    section: input.section,
    facultyInitials: input.facultyInitials,
    status: input.status,
    source: input.source,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Fields a client may change on an existing enrolment. */
const ENROLLMENT_PATCHABLE = Object.freeze(['section', 'facultyInitials', 'status']);

/**
 * Apply a partial update to a stored enrolment.
 *
 * Course, semester and credits are not patchable. The first two are what the id
 * is derived from; credits are a server-owned fact. Changing a course means
 * dropping this enrolment and creating another, which is also what actually
 * happened.
 */
export function applyEnrollmentPatch(existing, payload, nowIso) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }
  const unknown = Object.keys(payload).filter((key) => !ENROLLMENT_PATCHABLE.includes(key));
  if (unknown.length > 0) {
    return {
      error: invalid(
        unknown[0],
        `Cannot be changed. Editable: ${ENROLLMENT_PATCHABLE.join(', ')}.`,
      ),
    };
  }

  const next = { ...existing };

  if (payload.status !== undefined) {
    if (!ENROLLMENT_STATUSES.includes(payload.status)) {
      return {
        error: invalid('status', `Status must be one of ${ENROLLMENT_STATUSES.join(', ')}.`),
      };
    }
    next.status = payload.status;
  }

  if (payload.section !== undefined) {
    if (payload.section === null) {
      next.section = null;
    } else {
      const section = cleanString(payload.section, 6);
      if (section === null || !SECTION_RE.test(section)) {
        return { error: invalid('section', 'Section should be a short code like 13.') };
      }
      next.section = section;
    }
  }

  if (payload.facultyInitials !== undefined) {
    if (payload.facultyInitials === null) {
      next.facultyInitials = null;
    } else {
      const raw = cleanString(payload.facultyInitials, 8);
      const initials = raw === null ? null : raw.toUpperCase();
      if (initials === null || !FACULTY_INITIALS_RE.test(initials)) {
        return { error: invalid('facultyInitials', 'Faculty initials should be 2-8 letters.') };
      }
      next.facultyInitials = initials;
    }
  }

  next.updatedAt = nowIso;
  return { value: next };
}

// ── DTOs ────────────────────────────────────────────────────────────────────
//
// What crosses the wire. `schemaVersion` is withheld from both: it is how this
// backend versions its documents, and a field the contract does not promise is
// one a future implementation does not have to reproduce.

export function semesterDto(record) {
  return {
    id: record.id,
    name: record.name,
    year: record.year,
    season: record.season,
    sessionId: record.sessionId ?? null,
    status: record.status,
    startDate: record.startDate ?? null,
    endDate: record.endDate ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function enrollmentDto(record) {
  return {
    id: record.id,
    semesterId: record.semesterId,
    courseCode: record.courseCode,
    credits: record.credits ?? null,
    section: record.section ?? null,
    facultyInitials: record.facultyInitials ?? null,
    status: record.status,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
