// worker/taskTime.js
//
// Time, timezones, and the enums Tasks is built from (#715).
//
// Split out from tasks.js because this is the part most likely to be wrong, and
// it deserves to be read on its own.
//
// THE RULE: instants are stored and transported in UTC; "today" is a question
// about a student's local calendar.
//
// Both halves matter, and getting either backwards is a real bug rather than a
// style preference:
//
//   * Storing a local wall-clock time makes a deadline MOVE when a student
//     travels. 11pm Friday in Dhaka is not 11pm Friday in Toronto, and a
//     deadline is a moment, not a clock reading.
//   * Computing "today" in UTC puts a Dhaka student's 11pm task on TOMORROW's
//     list. Bangladesh is UTC+6, so their entire evening — 6pm to midnight —
//     is already the next UTC day. A Today view that is wrong every evening is
//     a Today view nobody trusts.
//
// So the storage is absolute and the windowing is zoned, and the zone comes
// from the client rather than being guessed here: the browser knows it, the
// server does not, and a campus-wide default would be wrong for every student
// studying abroad or on exchange.

/** Task kinds. One model; this is the field that distinguishes them. */
export const TASK_TYPES = Object.freeze([
  'ASSIGNMENT',
  'QUIZ',
  'EXAM',
  'PROJECT',
  'LAB',
  'READING',
  'PERSONAL',
  'OTHER',
]);

export const TASK_STATUSES = Object.freeze(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export const TASK_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * Where a task came from.
 *
 * PASTE is a task the student confirmed out of text they pasted (#735). It is
 * deliberately not MANUAL: both were approved by the student, but only one had
 * its date read by a parser, and that is exactly the distinction they need when
 * a deadline turns out to be wrong.
 *
 * GMAIL, CALENDAR and AI_SUGGESTION are the rest of Phase 7 and nothing
 * produces them yet. They ship now anyway: a task that cannot say where it came
 * from is a task a student cannot audit, and adding the field later would leave
 * every existing row reading MANUAL whether it was or not.
 */
export const TASK_SOURCES = Object.freeze([
  'MANUAL',
  'PASTE',
  'GMAIL',
  'CALENDAR',
  'AI_SUGGESTION',
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * True when `timeZone` is an IANA zone this runtime knows.
 *
 * Checked rather than trusted because the alternative is silently answering
 * with the wrong day. An unknown zone makes Intl throw, which is the only
 * reliable way to ask — there is no enumeration to test against.
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar parts of `instant` as they read in `timeZone`.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, and `hourCycle: 'h23'` because
 * `hour12: false` yields hour 24 rather than 0 at midnight in some
 * implementations — a difference that would put every midnight on the wrong day.
 */
function partsInZone(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

/**
 * The zone's offset from UTC at `instant`, in milliseconds.
 *
 * Derived by reading the wall clock in that zone and treating it as if it were
 * UTC; the difference from the real instant is the offset. There is no API that
 * simply returns this, and every approach reduces to this trick.
 */
function offsetMsAt(instant, timeZone) {
  const p = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Millisecond precision is not available from formatToParts, so compare on
  // whole seconds to avoid a sub-second error becoming a whole-offset error.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instants bounding the local calendar day containing `nowMs`.
 *
 * Returns `{ startUtc, endUtc }` as epoch milliseconds, half-open: a task due
 * exactly at `endUtc` belongs to tomorrow.
 *
 * Two passes, and the second is not redundant. Local midnight has to be
 * converted to UTC using the offset *at midnight*, but the only offset
 * available to start with is the one at the current moment. Where those differ
 * — a DST transition between midnight and now — the first pass lands an hour
 * out and the second corrects it.
 *
 * The residual limit, stated rather than hidden: inside a DST spring-forward
 * gap, local midnight does not exist, and this resolves to the instant the
 * clock jumps to. No campus Shohoj serves observes DST (Bangladesh does not),
 * so this is correctness for students abroad, and an hour's skew on two days a
 * year rather than a wrong day.
 */
export function dayWindowUtc(nowMs, timeZone) {
  const now = new Date(nowMs);
  const p = partsInZone(now, timeZone);
  const midnightAsIfUtc = Date.UTC(p.year, p.month - 1, p.day);

  let startUtc = midnightAsIfUtc - offsetMsAt(now, timeZone);
  startUtc = midnightAsIfUtc - offsetMsAt(new Date(startUtc), timeZone);

  // The next local midnight, found the same way, so a day that is 23 or 25
  // hours long is still exactly one day.
  const nextDay = new Date(startUtc + MS_PER_DAY + MS_PER_DAY / 2);
  const q = partsInZone(nextDay, timeZone);
  const nextMidnightAsIfUtc = Date.UTC(q.year, q.month - 1, q.day);
  let endUtc = nextMidnightAsIfUtc - offsetMsAt(nextDay, timeZone);
  endUtc = nextMidnightAsIfUtc - offsetMsAt(new Date(endUtc), timeZone);

  return { startUtc, endUtc };
}

/** The local calendar date (`YYYY-MM-DD`) at `nowMs`, for display and grouping. */
export function localDateIn(nowMs, timeZone) {
  const p = partsInZone(new Date(nowMs), timeZone);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}
