// scripts/campus_feed.mjs
//
// Maps a campus's section snapshot (data/campuses/<id>/sections/<term>.json)
// to the section feed the legacy Routine tab reads.
//
// The Routine tab was built on BRACU's live CONNECT feed and everything
// downstream of it — the parser (js/core/connectFeed.js), the grid, clash
// detection, the exports — takes that feed's raw shape. An archived semester
// and a pasted schedule both reach the tab by being put INTO that shape, so
// nothing below the fetch knows where a routine came from. This does the same
// for a campus whose sections come from the campus database instead.
//
// Pure: records in, feed out. scripts/generate_campus_feed.mjs does the I/O.
//
// WHAT A SNAPSHOT CANNOT SAY, and what is emitted for it:
//   seats     capacity and consumedSeat are 0. NSU publishes no section size,
//             and the `seatsAvailable` it did show was true on the day of the
//             scrape only. A stale seat count reads as a live one, so none is
//             carried at all.
//   exams     no mid or final schedule is published per section.
//   TBA time  a section with no published time has no class slots. It is still
//             listed — a student can be enrolled in one — it just draws
//             nothing on the grid.

/** RDS day letters. R is Thursday and A is Saturday, as NSU writes them. */
const DAY_NAMES = {
  S: 'SUNDAY',
  M: 'MONDAY',
  T: 'TUESDAY',
  W: 'WEDNESDAY',
  R: 'THURSDAY',
  F: 'FRIDAY',
  A: 'SATURDAY',
};

/**
 * A stable numeric id for a section: the same term, course and section number
 * always give the same id, so a student's saved picks survive the feed being
 * regenerated. FNV-1a over the three, kept to 31 bits so it stays a positive
 * integer wherever it is stored. The generator refuses a feed in which two
 * sections collide.
 */
export function feedSectionId(term, course, section) {
  const text = `${term}|${course}|${section}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * The session id the tab names a semester from: a four-digit year and a term
 * digit (1 Spring, 2 Summer, 3 Fall — js/core/semesterIdentity.js). NSU's term
 * codes are the last two digits of the year and the same term digit, so
 * '263' is 20263, Fall 2026.
 */
export function feedSessionId(term) {
  const match = /^(\d{2})([123])$/.exec(String(term));
  if (!match) throw new Error(`cannot derive a session id from term '${term}'`);
  return Number(`20${match[1]}${match[2]}`);
}

function classSchedules(record) {
  if (!record.days || !record.start || !record.end) return [];
  return [...record.days].map((letter) => {
    const day = DAY_NAMES[letter];
    if (!day) {
      throw new Error(
        `${record.course} section ${record.section}: unknown day letter '${letter}' in '${record.days}'`,
      );
    }
    return { day, startTime: record.start, endTime: record.end };
  });
}

/** First and last day of classes from a term calendar, or null for either. */
export function classDates(calendar) {
  const records = calendar?.records ?? [];
  const begins = records.filter((r) => r.kind === 'classes-begin').map((r) => r.date);
  const lasts = records.filter((r) => r.kind === 'last-class').map((r) => r.date);
  return {
    // The latest "last day of classes": NSU ends each day pattern (ST, RA, MW)
    // on its own date, and a routine that mixes them runs until the last one.
    classStartDate: begins.length > 0 ? begins.sort()[0] : null,
    classEndDate: lasts.length > 0 ? lasts.sort()[lasts.length - 1] : null,
  };
}

/** Kinds of calendar row on which nothing is taught. */
const NO_CLASS_KINDS = new Set(['holiday', 'no-classes']);

/**
 * What a term calendar says about the days between its first and last class,
 * beyond those two dates. A weekly timetable is wrong on every one of them:
 *
 *   noClassDays    holidays and "No Classes" days inside the term
 *   lastClassDays  the last class day of each day pattern, where the campus
 *                  ends them separately (NSU: ST, RA and MW). After its date
 *                  a pattern's weekdays have no classes left, though the term
 *                  is still running for the others.
 *   exams          the final exam window, which begins after the last class
 *
 * Day codes become the feed's day names, so nothing downstream needs the
 * campus's letters.
 */
export function termCalendar(calendar) {
  const records = calendar?.records ?? [];
  const { classStartDate, classEndDate } = classDates(calendar);
  const inTerm = (date) =>
    classStartDate !== null &&
    classEndDate !== null &&
    date >= classStartDate &&
    date <= classEndDate;
  const finals = records
    .filter((r) => r.kind === 'finals')
    .map((r) => r.date)
    .sort();
  return {
    noClassDays: records
      .filter((r) => NO_CLASS_KINDS.has(r.kind) && inTerm(r.date))
      .map((r) => ({ date: r.date, event: r.event }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    lastClassDays: records
      .filter((r) => r.kind === 'last-class' && r.days)
      .map((r) => ({
        date: r.date,
        days: [...r.days].map((letter) => {
          const day = DAY_NAMES[letter];
          if (!day) throw new Error(`calendar ${r.date}: unknown day letter '${letter}'`);
          return day;
        }),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    examStartDate: finals.length > 0 ? finals[0] : null,
    examEndDate: finals.length > 0 ? finals[finals.length - 1] : null,
  };
}

/**
 * Build the feed for one term of one campus.
 *
 * @param {object} snapshot  the term's sections file: { term, records, … }
 * @param {object} calendar  the term's calendar file, or null
 * @param {Array}  courses   the campus's course records: [{ code, title, credits }]
 * @returns {{ sections: object[], meta: object }}
 */
export function buildCampusFeed(snapshot, calendar, courses) {
  const term = String(snapshot.term);
  const semesterSessionId = feedSessionId(term);
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const { classStartDate, classEndDate } = classDates(calendar);

  const seen = new Map();
  const sections = snapshot.records.map((record) => {
    const sectionId = feedSectionId(term, record.course, record.section);
    const clash = seen.get(sectionId);
    if (clash) {
      throw new Error(
        `section id collision: ${record.course} section ${record.section} and ${clash} both hash to ${sectionId}`,
      );
    }
    seen.set(sectionId, `${record.course} section ${record.section}`);

    const course = byCode.get(record.course);
    return {
      sectionId,
      courseCode: record.course,
      courseName: course?.title ?? '',
      courseCredit: Number.isFinite(course?.credits) ? course.credits : 0,
      sectionName: String(record.section),
      capacity: 0,
      consumedSeat: 0,
      faculties: record.faculty ?? '',
      roomName: record.room ?? '',
      semesterSessionId,
      sectionSchedule: {
        classSchedules: classSchedules(record),
        classStartDate,
        classEndDate,
      },
    };
  });

  return {
    sections,
    meta: {
      term,
      semesterSessionId,
      source: snapshot.source,
      sectionCount: sections.length,
      courseCount: new Set(sections.map((s) => s.courseCode)).size,
      untimedCount: sections.filter((s) => s.sectionSchedule.classSchedules.length === 0).length,
      classStartDate,
      classEndDate,
      ...termCalendar(calendar),
    },
  };
}
