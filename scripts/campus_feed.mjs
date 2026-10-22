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
//
// A section whose days meet at different times or in different rooms (DIU)
// carries per-day `meetings`; each becomes a class slot that names its own
// room, and the section's room is every room it uses. Where codes repeat
// across programs (DIU's), a section's course is looked up in its own
// program's list, never another's.

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
 *
 * A program-scoped section hashes its program too, since only the program
 * makes it unique; a campus-wide one hashes exactly what it always has.
 */
export function feedSectionId(term, course, section, program = null) {
  const text = program ? `${term}|${program}|${course}|${section}` : `${term}|${course}|${section}`;
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

function dayName(record, letter, written) {
  const day = DAY_NAMES[letter];
  if (!day) {
    throw new Error(
      `${record.course} section ${record.section}: unknown day letter '${letter}' in '${written}'`,
    );
  }
  return day;
}

function classSchedules(record) {
  if (record.meetings) {
    return record.meetings.map((m) => ({
      day: dayName(record, m.day, m.day),
      startTime: m.start,
      endTime: m.end,
      ...(m.room ? { roomName: m.room } : {}),
    }));
  }
  if (!record.days || !record.start || !record.end) return [];
  return [...record.days].map((letter) => ({
    day: dayName(record, letter, record.days),
    startTime: record.start,
    endTime: record.end,
  }));
}

/** The section's room, or each room its meetings use, in the order they first appear. */
function sectionRoom(record) {
  if (!record.meetings) return record.room ?? '';
  return [...new Set(record.meetings.map((m) => m.room).filter(Boolean))].join(' · ');
}

const courseKey = (program, code) => `${program ?? ''}|${code}`;

/** The ISO date one day before another. */
function dayBefore(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The final exam window from a term calendar: its first day and its last. */
function finalsWindow(calendar) {
  const finals = (calendar?.records ?? []).filter((r) => r.kind === 'finals');
  if (finals.length === 0) return { examStartDate: null, examEndDate: null };
  // NSU writes the window as two rows (BEGINS, ENDS); DIU as one with an endDate.
  return {
    examStartDate: finals.map((r) => r.date).sort()[0],
    examEndDate: finals.map((r) => r.endDate ?? r.date).sort()[finals.length - 1],
  };
}

/** First and last day of classes from a term calendar, or null for either. */
export function classDates(calendar) {
  const records = calendar?.records ?? [];
  const begins = records.filter((r) => r.kind === 'classes-begin').map((r) => r.date);
  const lasts = records.filter((r) => r.kind === 'last-class').map((r) => r.date);
  const { examStartDate } = finalsWindow(calendar);
  let classEndDate = null;
  // The latest "last day of classes": NSU ends each day pattern (ST, RA, MW)
  // on its own date, and a routine that mixes them runs until the last one.
  if (lasts.length > 0) classEndDate = lasts.sort()[lasts.length - 1];
  // DIU's calendar names no last day of classes, only when finals begin. No
  // class is held once they have, so the day before is the latest classes can
  // run: an upper bound, not a published date. Without one the semester reads
  // as undated and a calendar export drops every class.
  else if (examStartDate !== null) classEndDate = dayBefore(examStartDate);
  return {
    classStartDate: begins.length > 0 ? begins.sort()[0] : null,
    classEndDate,
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
    ...finalsWindow(calendar),
  };
}

/**
 * Build the feed for one term of one campus.
 *
 * @param {object} snapshot  the term's sections file: { term, records, … }
 * @param {object} calendar  the term's calendar file, or null
 * @param {Array}  courses   the campus's course records: [{ code, title, credits }],
 *                           or its programs' ([{ program, code, title, credits }])
 *                           when its sections are program-scoped
 * @returns {{ sections: object[], meta: object }}
 */
export function buildCampusFeed(snapshot, calendar, courses) {
  const term = String(snapshot.term);
  const semesterSessionId = feedSessionId(term);
  const byCode = new Map(courses.map((c) => [courseKey(c.program, c.code), c]));
  const { classStartDate, classEndDate } = classDates(calendar);

  const seen = new Map();
  const sections = snapshot.records.map((record) => {
    const sectionId = feedSectionId(term, record.course, record.section, record.program);
    const label = `${record.program ? `${record.program} ` : ''}${record.course} section ${record.section}`;
    const clash = seen.get(sectionId);
    if (clash) {
      throw new Error(`section id collision: ${label} and ${clash} both hash to ${sectionId}`);
    }
    seen.set(sectionId, label);

    const course = byCode.get(courseKey(record.program, record.course));
    return {
      sectionId,
      courseCode: record.course,
      courseName: course?.title ?? '',
      courseCredit: Number.isFinite(course?.credits) ? course.credits : 0,
      sectionName: String(record.section),
      capacity: 0,
      consumedSeat: 0,
      faculties: record.faculty ?? '',
      roomName: sectionRoom(record),
      semesterSessionId,
      sectionSchedule: {
        classSchedules: classSchedules(record),
        classStartDate,
        classEndDate,
      },
    };
  });

  const programs = [...new Set(snapshot.records.map((r) => r.program).filter(Boolean))].sort();
  return {
    sections,
    meta: {
      term,
      semesterSessionId,
      source: snapshot.source,
      // Which programs' sections are here, when the snapshot holds only some
      // (DIU's, a department routine at a time); null for a campus-wide list.
      programs: programs.length > 0 ? programs : null,
      sectionCount: sections.length,
      courseCount: new Set(sections.map((s) => s.courseCode)).size,
      untimedCount: sections.filter((s) => s.sectionSchedule.classSchedules.length === 0).length,
      classStartDate,
      classEndDate,
      ...termCalendar(calendar),
    },
  };
}
