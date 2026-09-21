// src/features/tasks/taskCalendar.ts
//
// Tasks as calendar events, and as an .ics file (#729).
//
// TWO JOBS, DELIBERATELY SEPARATE
//
// `toCalendarEvents` produces the normalised shape the Tasks brief names —
// title, start, end, type, course, enrollment, metadata. Nothing about it is
// ICS-specific, and that is the point: it is what a Google Calendar or Apple
// Calendar integration would map FROM in Phase 7, so the task model never has
// to learn a provider's vocabulary. `buildTasksICS` is one consumer of it.
//
// WHY THIS DOES NOT REUSE src/core/calendarExport.ts
//
// That module writes the weekly routine: recurring events, floating local
// times, RRULE/BYDAY. Task deadlines are one-off events at absolute instants —
// different enough that sharing the writer would mean a parameterised thing
// doing neither cleanly. Its text-escaping and timestamp helpers are private,
// and it is a hand-maintained twin of js/core/calendarExport.js — exporting
// from it would force a matching edit to the legacy bundle for a shell-only
// feature. What is duplicated here is ~15 lines of RFC 5545 formatting, not
// business logic, and the two writers genuinely differ in substance.

import type { Enrollment } from '../../platform/api/academic.ts';
import type { Task, TaskType } from '../../platform/api/tasks.ts';

/**
 * A task as a calendar event.
 *
 * `start`/`end` are ISO 8601 UTC instants, matching how deadlines are stored.
 * `metadata` is deliberately open: a provider integration will want to carry
 * things back and forth that the core model has no opinion about.
 */
export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly type: TaskType;
  readonly courseCode: string | null;
  readonly enrollmentId: string | null;
  readonly allDay: boolean;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * How long a deadline occupies on a calendar.
 *
 * A deadline is a moment, not a span — but a zero-length event is invisible in
 * most calendar UIs, so it is given a nominal duration. The student's own
 * estimate is used when they gave one, capped, because a 12-hour block for a
 * project due at 5pm would swallow the day it is shown on.
 */
const DEFAULT_EVENT_MINUTES = 30;
const MAX_EVENT_MINUTES = 120;

function durationMinutes(task: Task): number {
  const estimate = task.estimatedMinutes;
  if (estimate === null || estimate <= 0) return DEFAULT_EVENT_MINUTES;
  return Math.min(estimate, MAX_EVENT_MINUTES);
}

/**
 * Normalise tasks into calendar events.
 *
 * Tasks with no deadline are EXCLUDED rather than placed on today. A reading
 * with no due date is not a thing happening today, and putting it there would
 * make a calendar lie about the one thing it exists to show.
 *
 * Cancelled tasks are excluded too. Completed ones are kept: a calendar is
 * partly a record of what happened, and a week that looks empty because the
 * work got done is a misleading week.
 */
export function toCalendarEvents(
  tasks: readonly Task[],
  enrollments: readonly Enrollment[] = [],
): CalendarEvent[] {
  const courseOf = new Map(enrollments.map((e) => [e.id, e.courseCode]));

  return tasks
    .filter((task) => task.dueAt !== null && task.status !== 'CANCELLED')
    .flatMap((task): CalendarEvent[] => {
      const startMs = Date.parse(task.dueAt as string);
      if (Number.isNaN(startMs)) return [];
      const endMs = startMs + durationMinutes(task) * 60_000;
      const courseCode =
        task.enrollmentId === null ? null : (courseOf.get(task.enrollmentId) ?? null);

      return [
        {
          id: task.id,
          title: courseCode === null ? task.title : `${courseCode}: ${task.title}`,
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
          type: task.type,
          courseCode,
          enrollmentId: task.enrollmentId,
          // Everything here has a time of day, because a deadline does.
          allDay: false,
          metadata: {
            status: task.status,
            priority: task.priority,
            estimatedMinutes: task.estimatedMinutes,
            source: task.source,
          },
        },
      ];
    });
}

/** Events grouped by local calendar day (`YYYY-MM-DD`), for a month or week grid. */
export function groupByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = localDayKey(new Date(event.start));
    const bucket = byDay.get(day);
    if (bucket === undefined) byDay.set(day, [event]);
    else bucket.push(event);
  }
  for (const bucket of byDay.values()) bucket.sort((a, b) => a.start.localeCompare(b.start));
  return byDay;
}

/** `YYYY-MM-DD` in the viewer's own zone — a calendar day is a local idea. */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ── ICS ─────────────────────────────────────────────────────────────────────

/** RFC 5545 §3.3.11 text escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `YYYYMMDDTHHMMSSZ` — the UTC form, which is what a deadline is. */
function icsStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export interface TasksIcsOptions {
  /** Calendar display name. */
  readonly calName?: string;
  /** Minutes before each event to fire the calendar's own alarm. 0 disables. */
  readonly alarmMinutes?: number;
  /** Injected clock, so DTSTAMP is deterministic in tests. */
  readonly now?: Date;
}

/**
 * An .ics file of a student's deadlines.
 *
 * UIDs are the task id plus a Shohoj domain suffix, which makes re-importing
 * an updated export UPDATE the existing events rather than duplicate them —
 * the difference between a calendar you can re-sync and one that fills with
 * copies.
 *
 * Note this is an export, not a subscription: a calendar that imported it does
 * not learn about later edits until the student exports again. A subscribable
 * feed is a server endpoint with its own auth story, and belongs with the
 * Phase 7 integration work rather than here.
 */
export function buildTasksICS(
  events: readonly CalendarEvent[],
  options: TasksIcsOptions = {},
): string {
  const { calName = 'Shohoj Tasks', alarmMinutes = 0, now = new Date() } = options;
  const dtstamp = icsStamp(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shohoj//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@tasks.shohoj`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${icsStamp(new Date(event.start))}`,
      `DTEND:${icsStamp(new Date(event.end))}`,
      `SUMMARY:${escapeText(event.title)}`,
      `CATEGORIES:${escapeText(event.type)}`,
    );
    if (event.courseCode !== null) {
      lines.push(`DESCRIPTION:${escapeText(`${event.courseCode} — ${event.type.toLowerCase()}`)}`);
    }
    if (alarmMinutes > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${Math.round(alarmMinutes)}M`,
        `DESCRIPTION:${escapeText(event.title)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // CRLF per RFC 5545, and a trailing one — some parsers need the final break.
  return lines.join('\r\n') + '\r\n';
}

/** A filename a student will recognise in their downloads folder. */
export function icsFilename(now: Date = new Date()): string {
  return `shohoj-tasks-${localDayKey(now)}.ics`;
}
