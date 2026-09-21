// src/features/tasks/TaskCalendarView.tsx
//
// Deadlines laid out by day (#729).
//
// An agenda grouped by date, not a month grid. That is a deliberate choice
// rather than a shortcut: a month grid gives every day equal space, and a
// student's deadlines are not evenly spread — three in one week and none for a
// fortnight is the normal shape. A grid spends most of its pixels on empty
// squares and still truncates the day that matters.
//
// A month grid is a reasonable thing to want later; the normalised events in
// taskCalendar.ts are what either view reads, so adding one does not touch the
// model.

import type { CalendarEvent } from './taskCalendar.ts';
import { groupByDay, localDayKey } from './taskCalendar.ts';

export interface TaskCalendarViewProps {
  readonly events: readonly CalendarEvent[];
  readonly onExport: () => void;
  readonly now?: Date;
}

/** "Today" / "Tomorrow" / "Thursday 9 October" — a heading a student reads at a glance. */
function dayHeading(dayKey: string, now: Date): string {
  const today = localDayKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (dayKey === today) return 'Today';
  if (dayKey === localDayKey(tomorrowDate)) return 'Tomorrow';

  // Parsed as local midnight, not UTC: `new Date('2026-10-09')` is UTC and
  // would render as the 8th for anyone west of Greenwich.
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function TaskCalendarView({ events, onExport, now = new Date() }: TaskCalendarViewProps) {
  const byDay = groupByDay(events);
  const days = [...byDay.keys()].sort();

  return (
    <section className="tasks-calendar" data-testid="tasks-calendar">
      <header className="tasks-calendar-head">
        <p className="shell-muted tasks-calendar-note">
          {events.length === 0
            ? 'Nothing with a deadline yet.'
            : `${events.length} deadline${events.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          className="tasks-export"
          data-testid="tasks-export"
          onClick={onExport}
          disabled={events.length === 0}
        >
          Add to your calendar
        </button>
      </header>

      {days.map((day) => (
        <section key={day} className="tasks-calendar-day">
          <h3 className="tasks-calendar-date">{dayHeading(day, now)}</h3>
          <ul className="tasks-calendar-list">
            {(byDay.get(day) ?? []).map((event) => (
              <li key={event.id} className="tasks-calendar-item" data-testid="tasks-calendar-item">
                <span className="tasks-calendar-time">{timeOf(event.start)}</span>
                <span className="tasks-calendar-title">{event.title}</span>
                <span className="tasks-type">{event.type.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
