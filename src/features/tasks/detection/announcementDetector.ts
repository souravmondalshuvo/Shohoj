// src/features/tasks/detection/announcementDetector.ts
//
// Finding academic work in a pasted announcement (#735).
//
// The first implementation of TaskDetector, and deliberately a deterministic
// one. The brief requires that Shohoj Tasks keeps working without AI, and the
// way to guarantee that is for the non-AI path to be the one that ships first:
// an AI extractor can be added later as another detector behind the same
// boundary, and if it is unavailable this still works.
//
// THE RULE
//
//   An invented deadline is worse than an absent one.
//
// A student acts on what this produces. A detector that guesses a date lands
// somebody in an exam hall on the wrong day, and they will not double-check
// because the tool told them. So every field is nullable and stays null unless
// the text actually said it — the same choice connectScheduleImport makes about
// class times.
//
// Pure: no clock, no network. `now` arrives in the context.

import type {
  Confidence,
  DetectedTask,
  DetectionContext,
  DetectionResult,
  Evidence,
  TaskDetector,
} from './types.ts';
import { isKnownCourseCode } from '../../calculator/catalog.ts';
import type { TaskType } from '../../../platform/api/tasks.ts';

/**
 * Words that name a kind of work, longest-first so "lab report" beats "lab".
 *
 * Ordering matters more than it looks: matching "lab" first would type a lab
 * REPORT as a LAB — a three-hour session rather than a document — which is the
 * wrong deadline shape entirely.
 */
const TYPE_WORDS: readonly (readonly [RegExp, TaskType])[] = [
  [/\blab\s+report\b/i, 'ASSIGNMENT'],
  [/\bterm\s+paper\b/i, 'PROJECT'],
  [/\bfinal\s+exam(?:ination)?\b/i, 'EXAM'],
  [/\bmid(?:-|\s)?term\b/i, 'EXAM'],
  [/\bexam(?:ination)?\b/i, 'EXAM'],
  [/\bquiz\b/i, 'QUIZ'],
  [/\bassignment\b/i, 'ASSIGNMENT'],
  [/\bproject\b/i, 'PROJECT'],
  [/\bpresentation\b/i, 'PROJECT'],
  [/\blab\b/i, 'LAB'],
  [/\breading\b/i, 'READING'],
  [/\bviva\b/i, 'EXAM'],
];

/** BRACU-style course codes. Matched anywhere, validated against enrolment when we can. */
const COURSE_RE = /\b([A-Z]{2,4})\s?-?\s?(\d{3}[A-Z]?)\b/g;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const MONTH_ALTS = Object.keys(MONTHS).join('|');

/** "25 September" / "25 Sep 2026" / "25th of September" */
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALTS})\\.?(?:\\s+(\\d{4}))?\\b`,
  'i',
);
/** "September 25" / "Sep 25, 2026" */
const MONTH_DAY = new RegExp(
  `\\b(${MONTH_ALTS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'i',
);
/** "25/09/2026" or "25-09-26" — day first, which is how Bangladesh writes it. */
const NUMERIC_DATE = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;
/** "at 9:30 pm" / "9 am" / "14:00" */
const TIME_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
/** "chapters 4-6", "ch 4 to 6", "topics 1-3" */
const SYLLABUS_RE = /\b((?:chapters?|ch|topics?|units?|lectures?)\.?\s*\d+\s*(?:[-–—]|to)\s*\d+)/i;
/** A single chapter: "chapter 7" */
const SYLLABUS_ONE_RE = /\b((?:chapters?|ch|topics?|units?|lectures?)\.?\s*\d+)/i;

function evidence(text: string, index: number): Evidence {
  return { text: text.trim(), index };
}

/**
 * Resolve a bare day and month against `now`.
 *
 * A date with no year is the common case in an announcement, and the naive
 * reading — "this year" — puts a January exam mentioned in December into the
 * past. So: this year, unless that is more than a month behind, in which case
 * next year. A deadline in the recent past is plausible (a student pasting an
 * old email); one six months back is not.
 */
function resolveYear(month: number, day: number, now: Date): number {
  const thisYear = now.getFullYear();
  const candidate = new Date(thisYear, month, day);
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return candidate < monthAgo ? thisYear + 1 : thisYear;
}

interface FoundDate {
  readonly iso: string;
  readonly evidence: Evidence;
  /** True when the text gave a time of day; false when the hour was assumed. */
  readonly hadTime: boolean;
}

function findDate(text: string, now: Date): FoundDate | null {
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  let source: { text: string; index: number } | null = null;

  const dayMonth = DAY_MONTH.exec(text);
  const monthDay = MONTH_DAY.exec(text);
  const numeric = NUMERIC_DATE.exec(text);

  if (dayMonth) {
    day = Number(dayMonth[1]);
    month = MONTHS[(dayMonth[2] ?? '').toLowerCase()] ?? null;
    year = dayMonth[3] ? Number(dayMonth[3]) : null;
    source = { text: dayMonth[0], index: dayMonth.index };
  } else if (monthDay) {
    month = MONTHS[(monthDay[1] ?? '').toLowerCase()] ?? null;
    day = Number(monthDay[2]);
    year = monthDay[3] ? Number(monthDay[3]) : null;
    source = { text: monthDay[0], index: monthDay.index };
  } else if (numeric) {
    // Day-first. Bangladesh writes 25/09; reading it month-first would make
    // most dates invalid and silently mangle the ones that are not.
    day = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
    const raw = numeric[3];
    year = raw === undefined ? null : Number(raw.length === 2 ? `20${raw}` : raw);
    source = { text: numeric[0], index: numeric.index };
  }

  if (day === null || month === null || source === null) return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const resolvedYear = year ?? resolveYear(month, day, now);

  // Reject a date that does not exist — 31 September rolls into October, and a
  // deadline on a day that is not real is worse than none.
  const probe = new Date(resolvedYear, month, day);
  if (probe.getMonth() !== month || probe.getDate() !== day) return null;

  // After the date text, not from its start — otherwise the day number
  // itself ("25 September") is read as the time.
  const time = findTime(text, source.index + source.text.length);
  const due = new Date(resolvedYear, month, day, time?.hour ?? 23, time?.minute ?? 59, 0, 0);

  return {
    iso: due.toISOString(),
    evidence: evidence(source.text, source.index),
    hadTime: time !== null,
  };
}

/** A time of day, searched near the date so "Quiz 3" is not read as 3 o'clock. */
function findTime(text: string, dateIndex: number): { hour: number; minute: number } | null {
  const window = text.slice(dateIndex, dateIndex + 60);
  const match = TIME_RE.exec(window);
  if (!match) return null;

  const meridiem = match[3]?.toLowerCase();
  const rawHour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;

  // Without am/pm, only a colon or a 24-hour value is a time. A bare number is
  // far more likely to be a quiz number, a chapter or a room.
  if (meridiem === undefined && match[2] === undefined && rawHour <= 12) return null;
  if (rawHour > 23 || minute > 59) return null;

  let hour = rawHour;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function findCourse(
  text: string,
  known: readonly string[],
): { code: string; evidence: Evidence } | null {
  const upper = text.toUpperCase();
  const seen: { code: string; index: number }[] = [];
  COURSE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COURSE_RE.exec(upper)) !== null) {
    seen.push({ code: `${match[1]}${match[2]}`, index: match.index });
  }
  if (seen.length === 0) return null;

  // A code the student is actually enrolled in beats one that merely looks like
  // a code — "ROOM 301" and "CSE220" match the same shape.
  const enrolled = seen.find((c) => known.includes(c.code));
  const real = seen.find((c) => isKnownCourseCode(c.code));
  const chosen = enrolled ?? real;
  if (chosen === undefined) return null;
  return { code: chosen.code, evidence: evidence(chosen.code, chosen.index) };
}

/**
 * A title for the work, taken from the text rather than invented.
 *
 * Prefers a numbered item — "Quiz 3", "Assignment 2" — because that is what a
 * student calls it. Falls back to the type word alone, capitalised. It never
 * uses a whole sentence: a task called "Quiz 3 will be held on 25 September and
 * covers chapters 4-6" is unreadable in a list.
 */
function buildTitle(text: string, type: TaskType, typeMatch: string): string {
  // The trailing lookahead keeps a date's day number out of the title:
  // "Final exam 25/12/2026" is a final exam, not "Final Exam 25".
  const numbered = new RegExp(
    `\\b${escapeRegex(typeMatch)}\\s*(?:no\\.?\\s*)?(\\d{1,2})\\b` +
      `(?![/-]\\d|\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH_ALTS}))`,
    'i',
  ).exec(text);
  const base = typeMatch
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  if (numbered) return `${base} ${numbered[1]}`;
  return base === '' ? type.charAt(0) + type.slice(1).toLowerCase() : base;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Confidence, from how much the text actually pinned down.
 *
 * A date is the thing that makes a detection useful, so it dominates: without
 * one this is at best a note that something exists.
 */
function rateConfidence(hasDate: boolean, hasCourse: boolean, hadTime: boolean): Confidence {
  if (hasDate && hasCourse && hadTime) return 'high';
  if (hasDate && (hasCourse || hadTime)) return 'high';
  if (hasDate) return 'medium';
  return 'low';
}

/**
 * Split a paste into candidate announcements.
 *
 * Blank-line-separated blocks first, since that is how emails and notices are
 * written; a block with several sentences is then split on sentence ends so
 * "Quiz 3 is on the 25th. Assignment 2 is due the 30th." yields two.
 */
function candidates(input: string): string[] {
  return input
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/** Detect academic work in one candidate line, or null when there is none. */
function detectOne(line: string, context: DetectionContext): DetectedTask | null {
  const typeHit = TYPE_WORDS.find(([pattern]) => pattern.test(line));
  // No word naming a kind of work: this is prose, not an announcement. Refusing
  // here is what stops a paste of someone's whole inbox becoming forty tasks.
  if (typeHit === undefined) return null;

  const [pattern, type] = typeHit;
  const matched = pattern.exec(line);
  const typeWord = matched?.[0] ?? '';

  const date = findDate(line, context.now);
  const course = findCourse(line, context.knownCourseCodes ?? []);
  const syllabusMatch = SYLLABUS_RE.exec(line) ?? SYLLABUS_ONE_RE.exec(line);

  const ev: Record<string, Evidence> = {};
  if (typeWord !== '') ev['type'] = evidence(typeWord, matched?.index ?? 0);
  if (date !== null) ev['dueAt'] = date.evidence;
  if (course !== null) ev['courseCode'] = course.evidence;
  if (syllabusMatch?.[1] !== undefined) {
    ev['syllabus'] = evidence(syllabusMatch[1], syllabusMatch.index);
  }

  return {
    title: buildTitle(line, type, typeWord),
    type,
    dueAt: date?.iso ?? null,
    courseCode: course?.code ?? null,
    syllabus: syllabusMatch?.[1]?.trim() ?? null,
    confidence: rateConfidence(date !== null, course !== null, date?.hadTime ?? false),
    evidence: ev,
  };
}

/** The pasted-announcement detector. */
export const announcementDetector: TaskDetector = {
  source: 'PASTE',
  detect(input: string, context: DetectionContext): DetectionResult {
    const lines = candidates(input);
    const detected: DetectedTask[] = [];
    const unrecognised: string[] = [];

    for (const line of lines) {
      const found = detectOne(line, context);
      if (found === null) unrecognised.push(line);
      else detected.push(found);
    }

    return { source: 'PASTE', detected, unrecognised };
  },
};

/** Convenience for callers that just want the detections. */
export function detectFromText(input: string, context: DetectionContext): DetectionResult {
  return announcementDetector.detect(input, context) as DetectionResult;
}
