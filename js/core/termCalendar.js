// ── TERM CALENDAR ────────────────────────────────────────────────────────────
//
// Whether a weekly timetable describes a given date.
//
// A section snapshot is a weekly pattern: "MW 09:40" every week between the
// first and the last day of classes. The academic calendar it belongs to takes
// days out of that pattern, and those are the days this module knows about:
//
//   • a holiday or a "No Classes" day inside the term
//   • a weekday whose classes have already ended — NSU ends each day pattern
//     (ST, RA, MW) on its own date, so the term's last week is partial
//   • a pattern's last meeting held on a weekday it does not normally meet
//     (NSU's last MW class of Fall 2026 is a Sunday), which no weekly
//     timetable can place
//
// The dates are generated from data/campuses/<id>/calendar/ into
// js/core/campusFeeds.generated.js (scripts/campus_feed.mjs). Everything here
// is pure: ISO dates (YYYY-MM-DD) in, which compare correctly as strings.
// Weekdays are the feed's names ('SUNDAY' … 'SATURDAY').

const TERM_WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/** The weekday an ISO date falls on, as the feed names it. */
export function termWeekdayOf(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return TERM_WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Where a date stands against a term.
 *
 *   before   the term has not started
 *   classes  the weekly timetable describes this date
 *   off      inside the term, but the timetable does not describe this date:
 *            `event` names the holiday, or `ended` the day pattern that is over
 *   after    the last class has been held; `examsUntil` is set while the final
 *            exams are still to finish
 *
 * `makeup` lists the weekdays of a pattern holding its last meeting on this
 * date, when the date is not one of them.
 */
export function termDayStatus(dateISO, term) {
  const base = { date: dateISO, event: null, ended: null, makeup: null, examsUntil: null };
  if (dateISO < term.classStartDate) return { ...base, phase: 'before' };
  if (dateISO > term.classEndDate) {
    const exams = term.examEndDate && dateISO <= term.examEndDate ? term.examEndDate : null;
    return { ...base, phase: 'after', examsUntil: exams };
  }

  const off = (term.noClassDays ?? []).find((day) => day.date === dateISO);
  if (off) return { ...base, phase: 'off', event: off.event };

  const weekday = termWeekdayOf(dateISO);
  const patterns = term.lastClassDays ?? [];
  const moved = patterns.find((p) => p.date === dateISO && !p.days.includes(weekday));
  const makeup = moved ? moved.days : null;
  const ended = patterns.find((p) => p.days.includes(weekday) && dateISO > p.date);
  if (ended) return { ...base, phase: 'off', ended, makeup };
  return { ...base, phase: 'classes', makeup };
}

/** The last date a class on this weekday is held: its pattern's, or the term's. */
export function termLastClassDate(term, weekday) {
  const pattern = (term.lastClassDays ?? []).find((p) => p.days.includes(weekday));
  return pattern && pattern.date < term.classEndDate ? pattern.date : term.classEndDate;
}

/** The no-class dates inside the term that fall on this weekday, in order. */
export function termNoClassDates(term, weekday) {
  return (term.noClassDays ?? [])
    .map((day) => day.date)
    .filter((date) => termWeekdayOf(date) === weekday);
}

const titleCase = (day) => day.charAt(0) + day.slice(1).toLowerCase();

function dayList(days) {
  const names = days.map(titleCase);
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Final exams run from 22 Dec 2026 to 28 Dec 2026.", or '' when none are named. */
export function termExamNote(term, formatDate = (date) => date) {
  if (!term.examStartDate || !term.examEndDate) return '';
  return `Final exams run from ${formatDate(term.examStartDate)} to ${formatDate(term.examEndDate)}.`;
}

/**
 * One or two sentences saying why the timetable does not describe a date, or
 * '' when it does. `formatDate` turns an ISO date into the caller's wording.
 */
export function termDayNote(status, term, formatDate = (date) => date) {
  switch (status.phase) {
    case 'before':
      return `Term ${term.term} classes start on ${formatDate(term.classStartDate)}.`;
    case 'after': {
      const ended = `Term ${term.term} classes ended on ${formatDate(term.classEndDate)}.`;
      return status.examsUntil ? `${ended} ${termExamNote(term, formatDate)}` : ended;
    }
    case 'off': {
      if (status.event !== null) {
        // "No Classes" is the calendar's whole entry for some days.
        return /^no classes$/i.test(status.event.trim())
          ? 'The academic calendar has no classes today.'
          : `No classes today: ${status.event}.`;
      }
      const over = `${dayList(status.ended.days)} classes ended on ${formatDate(status.ended.date)}.`;
      return status.makeup
        ? `${over} ${dayList(status.makeup)} classes hold their last meeting today, which a weekly timetable cannot place.`
        : over;
    }
    default:
      return '';
  }
}
