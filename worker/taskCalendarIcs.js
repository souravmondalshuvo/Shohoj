// worker/taskCalendarIcs.js — the feed's calendar writer (#744).
//
// WHY THIS EXISTS TWICE
//
// src/features/tasks/taskCalendar.ts already turns tasks into events and events
// into an .ics file — for the DOWNLOAD, in the browser. This is the same
// calendar, built on the server, for the SUBSCRIPTION. The Worker is a separate
// npm package for a different runtime, and the shell must not pull its module
// graph into the browser bundle (nor the reverse), which is the boundary this
// repo has consistently refused to cross for ~50 lines of formatting.
//
// What makes that safe rather than merely tolerated is that the two are pinned
// to AGREE, by a test that runs both over one fixture and compares the bytes
// (tests/calendarFeedParity.test.js). A student who downloaded the file once
// and subscribed later must not end up looking at two different calendars, and
// "we were careful" is not a mechanism.
//
// If you change anything here, that test tells you what it broke on the other
// side. Change both, or change neither.

/** Nominal length of a deadline on a calendar. A zero-length event is invisible. */
const DEFAULT_EVENT_MINUTES = 30;
const MAX_EVENT_MINUTES = 120;

function durationMinutes(task) {
  const estimate = task.estimatedMinutes;
  if (estimate === null || estimate === undefined || estimate <= 0) return DEFAULT_EVENT_MINUTES;
  return Math.min(estimate, MAX_EVENT_MINUTES);
}

/**
 * Tasks as calendar events.
 *
 * Undated work is EXCLUDED rather than placed on today — a task with no due
 * date is not a thing happening now. Cancelled work is excluded too; completed
 * work is kept, because a week that looks empty because the work got done is a
 * misleading week.
 */
export function toCalendarEvents(tasks, enrollments = []) {
  const courseOf = new Map(enrollments.map((e) => [e.id, e.courseCode]));

  return tasks
    .filter((task) => task.dueAt !== null && task.dueAt !== undefined && task.status !== 'CANCELLED')
    .flatMap((task) => {
      const startMs = Date.parse(task.dueAt);
      if (Number.isNaN(startMs)) return [];
      const endMs = startMs + durationMinutes(task) * 60_000;
      const courseCode =
        task.enrollmentId === null || task.enrollmentId === undefined
          ? null
          : (courseOf.get(task.enrollmentId) ?? null);

      return [
        {
          id: task.id,
          title: courseCode === null ? task.title : `${courseCode}: ${task.title}`,
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
          type: task.type,
          courseCode,
          enrollmentId: task.enrollmentId ?? null,
          allDay: false,
        },
      ];
    });
}

/** RFC 5545 §3.3.11 text escaping. */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `YYYYMMDDTHHMMSSZ` — the UTC form, which is what a deadline is. */
function icsStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * An .ics document for a student's deadlines.
 *
 * UIDs are the task id plus a Shohoj domain suffix, so re-fetching an updated
 * feed UPDATES the existing events rather than duplicating them. That is what
 * makes this a subscription rather than a repeated import — and it is the same
 * UID the download uses, so subscribing after downloading merges instead of
 * doubling.
 */
export function buildTasksICS(events, options = {}) {
  const { calName = 'Shohoj Tasks', alarmMinutes = 0, now = new Date() } = options;
  const dtstamp = icsStamp(now);

  const lines = [
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
