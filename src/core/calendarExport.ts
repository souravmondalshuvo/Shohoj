/**
 * Calendar export — builds an RFC 5545 iCalendar (`.ics`) string from a
 * student's picked sections so their phone/laptop calendar fires real
 * class/exam reminders without Shohoj being open.
 *
 * - Each class meeting becomes a weekly-recurring VEVENT bounded by the
 *   semester's class start/end dates (when known).
 * - Mid and final exams become one-off VEVENTs.
 * - Every event carries a VALARM (default 30 min before).
 *
 * Times are emitted as "floating" local date-times (no Z, no TZID): BRACU runs
 * on Asia/Dhaka with no DST, so a floating time displays correctly for students
 * in Bangladesh and avoids shipping a VTIMEZONE block. Pure + UI-agnostic.
 */

import type { NormalizedSection, WeekdayName } from './connectFeed';

export interface IcsOptions {
  /** Minutes before each event to fire the alarm. Clamped to >= 0. Default 30. */
  alarmMinutes?: number;
  /** Calendar display name (X-WR-CALNAME). Default "Shohoj Routine". */
  calName?: string;
  /** Injected clock for deterministic DTSTAMP/UID in tests. Default now. */
  now?: Date;
}

const BYDAY: Record<WeekdayName, string> = {
  SUNDAY: 'SU',
  MONDAY: 'MO',
  TUESDAY: 'TU',
  WEDNESDAY: 'WE',
  THURSDAY: 'TH',
  FRIDAY: 'FR',
  SATURDAY: 'SA',
};

const DOW_INDEX: Record<WeekdayName, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Escape a text value per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Minutes-of-day → `HHMMSS`. */
function hhmmss(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}${pad2(m)}00`;
}

/** `YYYY-MM-DD` → `YYYYMMDD`. */
function compactDate(date: string): string {
  return date.replace(/-/g, '');
}

/** Floating local date-time value: `YYYYMMDDTHHMMSS`. */
function floatingDateTime(date: string, min: number): string {
  return `${compactDate(date)}T${hhmmss(min)}`;
}

/** UTC stamp `YYYYMMDDTHHMMSSZ` for DTSTAMP. */
function utcStamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  );
}

/**
 * First `YYYY-MM-DD` on or after `startDate` whose weekday is `weekday`.
 * Pure UTC date math so a local-timezone shift can't roll the day. Exported
 * for tests.
 */
export function firstOnOrAfter(startDate: string, weekday: WeekdayName): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const delta = (DOW_INDEX[weekday] - base.getUTCDay() + 7) % 7;
  const out = new Date(base.getTime() + delta * 86_400_000);
  return `${out.getUTCFullYear()}-${pad2(out.getUTCMonth() + 1)}-${pad2(out.getUTCDate())}`;
}

function valarm(summary: string, alarmMinutes: number): string[] {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER:-PT${alarmMinutes}M`,
    'END:VALARM',
  ];
}

interface EventInput {
  uid: string;
  summary: string;
  location: string;
  description: string;
  startDate: string;
  startMin: number;
  endMin: number;
  /** Weekly recurrence end date `YYYY-MM-DD`, or null for a one-off event. */
  untilDate: string | null;
  byday: string | null;
}

function vevent(ev: EventInput, dtstamp: string, alarmMinutes: number): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${floatingDateTime(ev.startDate, ev.startMin)}`,
    `DTEND:${floatingDateTime(ev.startDate, ev.endMin)}`,
    `SUMMARY:${escapeText(ev.summary)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.untilDate && ev.byday) {
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${ev.byday};UNTIL=${compactDate(ev.untilDate)}T235959`);
  }
  lines.push(...valarm(ev.summary, alarmMinutes));
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build a complete VCALENDAR string for the given sections. Sections are
 * processed in order; for each, class meetings come before mid/final exams.
 * Class events are only emitted when both semester dates are known and an
 * occurrence falls within them.
 */
export function buildRoutineICS(
  sections: readonly NormalizedSection[],
  options: IcsOptions = {},
): string {
  const alarmMinutes = Math.max(0, Math.round(options.alarmMinutes ?? 30));
  const calName = options.calName ?? 'Shohoj Routine';
  const dtstamp = utcStamp(options.now ?? new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shohoj//Routine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];

  for (const s of sections) {
    const tag = `${s.courseCode}${s.sectionName ? ` (Section ${s.sectionName})` : ''}`;
    const faculty = s.facultyInitials ? `Faculty: ${s.facultyInitials}` : '';

    if (s.classStartDate && s.classEndDate) {
      for (const slot of s.classSlots) {
        const startDate = firstOnOrAfter(s.classStartDate, slot.day);
        if (startDate > s.classEndDate) continue; // no occurrence in range
        lines.push(
          ...vevent(
            {
              uid: `shohoj-${s.sectionId}-class-${slot.day}-${slot.startMin}@shohoj.app`,
              summary: `${tag} class`,
              location: s.roomName,
              description: faculty,
              startDate,
              startMin: slot.startMin,
              endMin: slot.endMin,
              untilDate: s.classEndDate,
              byday: BYDAY[slot.day],
            },
            dtstamp,
            alarmMinutes,
          ),
        );
      }
    }

    if (s.midExam) {
      lines.push(
        ...vevent(
          {
            uid: `shohoj-${s.sectionId}-mid@shohoj.app`,
            summary: `${tag} — Mid Exam`,
            location: '',
            description: faculty,
            startDate: s.midExam.date,
            startMin: s.midExam.startMin,
            endMin: s.midExam.endMin,
            untilDate: null,
            byday: null,
          },
          dtstamp,
          alarmMinutes,
        ),
      );
    }

    if (s.finalExam) {
      lines.push(
        ...vevent(
          {
            uid: `shohoj-${s.sectionId}-final@shohoj.app`,
            summary: `${tag} — Final Exam`,
            location: '',
            description: faculty,
            startDate: s.finalExam.date,
            startMin: s.finalExam.startMin,
            endMin: s.finalExam.endMin,
            untilDate: null,
            byday: null,
          },
          dtstamp,
          alarmMinutes,
        ),
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
