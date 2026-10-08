// Types for js/core/termCalendar.js — whether a weekly timetable describes a
// given date. Hand-written twin of the module, same convention as
// campusFeeds.generated.d.ts.

/** The part of a snapshot's metadata the calendar questions are asked of. */
export interface TermCalendar {
  term: string;
  classStartDate: string;
  classEndDate: string;
  noClassDays?: { date: string; event: string }[];
  lastClassDays?: { date: string; days: string[] }[];
  examStartDate?: string | null;
  examEndDate?: string | null;
}

export type TermDayPhase = 'before' | 'classes' | 'off' | 'after';

export interface TermDayStatus {
  date: string;
  phase: TermDayPhase;
  /** The calendar's wording for a holiday or no-class day. */
  event: string | null;
  /** The day pattern whose classes are over, and when they ended. */
  ended: { date: string; days: string[] } | null;
  /** Weekdays of a pattern holding its last meeting on this date instead. */
  makeup: string[] | null;
  /** After the last class: the day final exams end, while they still run. */
  examsUntil: string | null;
}

export function termWeekdayOf(dateISO: string): string;
export function termDayStatus(dateISO: string, term: TermCalendar): TermDayStatus;
export function termLastClassDate(term: TermCalendar, weekday: string): string;
export function termNoClassDates(term: TermCalendar, weekday: string): string[];
export function termExamNote(term: TermCalendar, formatDate?: (date: string) => string): string;
export function termDayNote(
  status: TermDayStatus,
  term: TermCalendar,
  formatDate?: (date: string) => string,
): string;
