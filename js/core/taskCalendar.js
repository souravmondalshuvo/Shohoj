// Twin of src/features/tasks/taskCalendar.ts — hand-maintained, not generated.
// src/features/tasks/taskCalendar.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// Tasks as calendar events (#729), for the legacy Tasks tab (#767): the day
// list the Calendar view draws, and the .ics a student downloads. A deadline is
// a moment, so an event starts at the due time and runs for the estimate
// (30 minutes when there is none, capped at two hours).
//
// Private names carry a _cal prefix: calendarExport.js (the routine's .ics)
// shares the flattened bundle scope.

const _CAL_DEFAULT_EVENT_MINUTES = 30;
const _CAL_MAX_EVENT_MINUTES = 120;

function _calDurationMinutes(task) {
  const estimate = task.estimatedMinutes;
  if (estimate === null || estimate <= 0) return _CAL_DEFAULT_EVENT_MINUTES;
  return Math.min(estimate, _CAL_MAX_EVENT_MINUTES);
}

/** Dated, non-cancelled tasks as events, titled with their course when known. */
export function toCalendarEvents(tasks, enrollments = []) {
  const courseOf = new Map(enrollments.map((e) => [e.id, e.courseCode]));

  return tasks
    .filter((task) => task.dueAt !== null && task.status !== 'CANCELLED')
    .flatMap((task) => {
      const startMs = Date.parse(task.dueAt);
      if (Number.isNaN(startMs)) return [];
      const endMs = startMs + _calDurationMinutes(task) * 60_000;
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

/** Events by local day ("2026-10-09"), each day in start order. */
export function groupByDay(events) {
  const byDay = new Map();
  for (const event of events) {
    const day = localDayKey(new Date(event.start));
    const bucket = byDay.get(day);
    if (bucket === undefined) byDay.set(day, [event]);
    else bucket.push(event);
  }
  for (const bucket of byDay.values()) bucket.sort((a, b) => a.start.localeCompare(b.start));
  return byDay;
}

export function localDayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _calEscapeText(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function _calStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** An RFC 5545 calendar of the events, optionally with a reminder alarm. */
export function buildTasksICS(events, options = {}) {
  const { calName = 'Shohoj Tasks', alarmMinutes = 0, now = new Date() } = options;
  const dtstamp = _calStamp(now);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shohoj//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${_calEscapeText(calName)}`,
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@tasks.shohoj`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${_calStamp(new Date(event.start))}`,
      `DTEND:${_calStamp(new Date(event.end))}`,
      `SUMMARY:${_calEscapeText(event.title)}`,
      `CATEGORIES:${_calEscapeText(event.type)}`,
    );
    if (event.courseCode !== null) {
      lines.push(`DESCRIPTION:${_calEscapeText(`${event.courseCode} — ${event.type.toLowerCase()}`)}`);
    }
    if (alarmMinutes > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${Math.round(alarmMinutes)}M`,
        `DESCRIPTION:${_calEscapeText(event.title)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function icsFilename(now = new Date()) {
  return `shohoj-tasks-${localDayKey(now)}.ics`;
}
