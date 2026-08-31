// Which semester is on screen, and is it the one actually running?
//
// The CONNECT feed carries exactly one semester and never says which. It is an
// *advising* feed: it publishes whatever is open for registration and drops the
// outgoing semester the moment the next one opens. On 2026-08-31 it held only
// session 20263 (Fall 2026, classes from 2026-10-03) while Summer 2026 was
// still in progress — so the Routine grid was drawing a "now" line over a
// timetable that would not begin for another month, with nothing on screen
// naming the semester (#633).
//
// Everything here is pure and clock-free. `todayISO` is passed in rather than
// read, because a function that reads the clock cannot be pinned by a test and
// would drift between this file and its js/ twin.

import type { NormalizedSection } from './connectFeed';

/**
 * BRACU session ids are `YYYY` followed by a term digit: 20261 = Spring 2026,
 * 20262 = Summer, 20263 = Fall. Three terms a year, so 4+ is not a term we know
 * how to name and we say so rather than guessing.
 */
export const SEMESTER_TERM_NAMES: Readonly<Record<number, string>> = Object.freeze({
  1: 'Spring',
  2: 'Summer',
  3: 'Fall',
});

/**
 * Where the displayed semester sits relative to today.
 *
 * `unknown` is a real answer, not a failure: a feed without usable term dates
 * cannot be placed on a calendar, and callers must not treat that as "running".
 */
export type SemesterStatus = 'upcoming' | 'running' | 'ended' | 'unknown';

export interface SemesterIdentity {
  sessionId: number | null;
  /** e.g. `'Fall 2026'`, or null when the session id is missing or unparseable. */
  name: string | null;
  classStartDate: string | null;
  classEndDate: string | null;
  status: SemesterStatus;
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Today as `YYYY-MM-DD` in the viewer's own timezone.
 *
 * The only clock-reading function in the module, kept separate so the rest
 * stays pure. Local parts on purpose: a student in Dhaka asking whether their
 * semester has started means their calendar day, not UTC's.
 */
export function todayISODate(date: Date = new Date()): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `'2026-10-03'` → `'3 Oct 2026'`. Returns null for anything else. */
export function formatSemesterDate(iso: string | null | undefined): string | null {
  const match = ISO_DATE.exec(typeof iso === 'string' ? iso.trim() : '');
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTH_ABBR[month - 1]} ${match[1]}`;
}

/** `20263` → `'Fall 2026'`. Null when the id is not a term we can name. */
export function semesterNameFromSessionId(sessionId: unknown): string | null {
  if (typeof sessionId !== 'number' || !Number.isInteger(sessionId)) return null;
  if (sessionId < 20000 || sessionId > 99999) return null;
  const term = SEMESTER_TERM_NAMES[sessionId % 10];
  if (!term) return null;
  return `${term} ${Math.floor(sessionId / 10)}`;
}

/**
 * The most common value, ties broken by sort order so the result is stable.
 *
 * Term dates get the modal treatment rather than min/max because the feed has
 * genuine outliers — 43 of 2086 Fall sections start a fortnight before the rest
 * — and one late-added section must not redefine when the semester begins.
 */
function modalValue<T extends string | number>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Place `todayISO` against the term dates. Both ISO, so string order is date order. */
function classify(
  todayISO: string,
  startDate: string | null,
  endDate: string | null,
): SemesterStatus {
  if (!ISO_DATE.test(todayISO)) return 'unknown';
  if (startDate === null || endDate === null) return 'unknown';
  if (todayISO < startDate) return 'upcoming';
  if (todayISO > endDate) return 'ended';
  return 'running';
}

/**
 * Identify the semester a parsed feed describes.
 *
 * Takes normalized sections (the output of `parseFeed`), not the raw payload.
 */
export function describeSemester(
  sections: readonly NormalizedSection[],
  todayISO: string,
): SemesterIdentity {
  const list = Array.isArray(sections) ? sections : [];
  const sessionId = modalValue(
    list.map((s) => s.semesterSessionId).filter((v): v is number => typeof v === 'number'),
  );
  const classStartDate = modalValue(
    list.map((s) => s.classStartDate).filter((v): v is string => typeof v === 'string'),
  );
  const classEndDate = modalValue(
    list.map((s) => s.classEndDate).filter((v): v is string => typeof v === 'string'),
  );

  return {
    sessionId,
    name: semesterNameFromSessionId(sessionId),
    classStartDate,
    classEndDate,
    status: classify(todayISO, classStartDate, classEndDate),
  };
}

/**
 * True only when today falls inside the displayed semester's term.
 *
 * The gate for anything that asserts something about *now*: the routine grid's
 * "now" line, today-highlighting, and Free Rooms occupancy. `unknown` is false
 * — an unplaceable semester is not a licence to claim the timetable is live.
 */
export function semesterIsRunning(identity: SemesterIdentity | null | undefined): boolean {
  return identity?.status === 'running';
}

/**
 * Why the semester on screen may not be the one the student is sitting in.
 *
 * Lives here rather than in each tab's markup because Routine, Seats and Free
 * Rooms all read the same feed and all owe the same explanation, and a caveat
 * that drifts between three copies is a caveat nobody trusts.
 */
export function semesterCaveat(identity: SemesterIdentity | null | undefined): string {
  switch (identity?.status) {
    case 'upcoming':
      return 'CONNECT publishes the semester open for advising, so this timetable has not started yet.';
    case 'ended':
      return 'This semester is over. CONNECT has not published the next one yet.';
    case 'running':
      return 'This is the semester currently in progress.';
    default:
      return 'CONNECT did not say which semester this timetable belongs to.';
  }
}

/** One line naming the semester and saying where it sits relative to today. */
export function semesterHeadline(identity: SemesterIdentity | null | undefined): string {
  if (!identity) return 'Semester unknown';
  const name =
    identity.name ??
    (identity.sessionId !== null ? `Session ${identity.sessionId}` : 'Semester unknown');
  const start = formatSemesterDate(identity.classStartDate);
  const end = formatSemesterDate(identity.classEndDate);

  switch (identity.status) {
    case 'upcoming':
      return start ? `${name} · classes start ${start}` : `${name} · not started yet`;
    case 'running':
      return end ? `${name} · classes to ${end}` : `${name} · in progress`;
    case 'ended':
      return end ? `${name} · classes ended ${end}` : `${name} · ended`;
    default:
      return name;
  }
}
