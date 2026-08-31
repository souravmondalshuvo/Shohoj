// Turn a pasted CONNECT "Class and Exam Schedule" into a routine.
//
// The public feed is a catalog of every section on offer; it carries no student
// identity, so no amount of archiving tells us which sections are *yours*
// (#633). Your enrolment lives behind your CONNECT login, and a credential
// field is something this project has ruled out. What is left is the page
// itself: you can already see it, so you can already copy it.
//
// The output is deliberately the *raw feed shape*, not our normalized one. That
// way `parseFeed` consumes it exactly as it consumes the CDN, and the grid,
// clash detection, calendar export and exam briefing all work on an imported
// routine without knowing it was imported.
//
// Pasted text is untrusted and shapeless: browsers serialize an HTML table
// differently, cells go missing, whitespace collapses. Everything here is
// tolerant by construction and reports what it could not place rather than
// guessing — an invented class time is worse than an absent one.

export interface ImportedClassSlot {
  day: string;
  startTime: string;
  endTime: string;
}

export interface ImportedSectionSchedule {
  classSchedules: ImportedClassSlot[];
  classStartDate: null;
  classEndDate: null;
  midExamDate?: string;
  midExamStartTime?: string;
  midExamEndTime?: string;
  finalExamDate?: string;
  finalExamStartTime?: string;
  finalExamEndTime?: string;
}

export interface RawImportedSection {
  sectionId: number;
  courseCode: string;
  courseName: string;
  sectionName: string;
  faculties: string;
  roomName: string;
  semesterSessionId: null;
  sectionSchedule: ImportedSectionSchedule;
}

export interface ImportedSchedule {
  /** Raw-feed-shaped sections, ready for `parseFeed`. */
  sections: RawImportedSection[];
  /** Plain notes about anything not fully understood. */
  warnings: string[];
}

const DAY_NAMES = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/**
 * `CSE251L -09B -TBA-FT10-02L` → code, section, faculty, room.
 *
 * The room is last and greedy because it contains hyphens of its own
 * (`12A-08C`, `FT10-02L`); the faculty slot being letters-only is what keeps
 * the two apart.
 */
const CELL_RE = /^([A-Z]{2,5}\d{3}[A-Z]?)\s*-\s*([A-Za-z0-9]+)\s*-\s*([A-Za-z]+)\s*-\s*(\S.*)$/;

const CODE_RE = /^[A-Z]{2,5}\d{3}[A-Z]?$/;

/** `8:00 AM - 9:20 AM`, and the `4:30 PM -6:30 PM` spacing the exam table uses. */
const RANGE_RE =
  /(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?/;

/** `SATURDAY (2026-07-25)` */
const EXAM_DATE_RE = /\((\d{4}-\d{2}-\d{2})\)/;

function to24h(hour: number, minute: number, meridiem: string): string {
  let h = hour % 12;
  if (meridiem.toUpperCase() === 'P') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function parseRange(text: string): { start: string; end: string } | null {
  const m = RANGE_RE.exec(text);
  if (!m) return null;
  const start = to24h(Number(m[1]), Number(m[2]), m[3]);
  const end = to24h(Number(m[4]), Number(m[5]), m[6]);
  return end > start ? { start, end } : null;
}

/**
 * A stable, negative id for an imported section.
 *
 * Negative on purpose: feed ids are positive, so an imported pick can never
 * collide with a real one and a stray id in storage is recognisable on sight.
 * Stable so re-importing the same schedule updates the picks rather than
 * duplicating them.
 */
export function importedSectionId(courseCode: string, sectionName: string): number {
  const key = `${courseCode}|${sectionName}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 2_000_000_000;
  }
  return -(hash + 1);
}

/** Split a pasted row into cells. Tabs first; runs of spaces or pipes after. */
function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  return line.split(/ {2,}|\s*\|\s*/).map((c) => c.trim());
}

/** Which day each column holds, from a header row. Null when it is not one. */
function readDayHeader(cells: string[]): (string | null)[] | null {
  const days = cells.map((cell) => {
    const upper = cell.trim().toUpperCase();
    return DAY_NAMES.includes(upper) ? upper : null;
  });
  return days.filter((d) => d !== null).length >= 2 ? days : null;
}

function applyExam(
  section: RawImportedSection,
  kind: 'mid' | 'final',
  date: string,
  range: { start: string; end: string },
): void {
  if (kind === 'final') {
    section.sectionSchedule.finalExamDate = date;
    section.sectionSchedule.finalExamStartTime = range.start;
    section.sectionSchedule.finalExamEndTime = range.end;
  } else {
    section.sectionSchedule.midExamDate = date;
    section.sectionSchedule.midExamStartTime = range.start;
    section.sectionSchedule.midExamEndTime = range.end;
  }
}

/**
 * Read a pasted Class and Exam Schedule.
 *
 * Class rows are read positionally: a header row fixes which column is which
 * day, and every later row whose first cell is a time range contributes one
 * slot per populated cell. Exam rows are matched by course code, because the
 * exam table names the course without its section.
 */
export function parseConnectSchedule(text: string): ImportedSchedule {
  const warnings: string[] = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return { sections: [], warnings: ['Nothing was pasted.'] };
  }

  let dayColumns: (string | null)[] | null = null;
  const sections = new Map<string, RawImportedSection>();
  const unplaced: string[] = [];

  const upsert = (
    courseCode: string,
    sectionName: string,
    faculties: string,
    roomName: string,
  ): RawImportedSection => {
    const key = `${courseCode}|${sectionName}`;
    let section = sections.get(key);
    if (!section) {
      section = {
        sectionId: importedSectionId(courseCode, sectionName),
        courseCode,
        courseName: '',
        sectionName,
        faculties,
        roomName,
        semesterSessionId: null,
        sectionSchedule: { classSchedules: [], classStartDate: null, classEndDate: null },
      };
      sections.set(key, section);
    }
    if (!section.faculties && faculties) section.faculties = faculties;
    if (!section.roomName && roomName) section.roomName = roomName;
    return section;
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const cells = splitCells(line);

    const header = readDayHeader(cells);
    if (header !== null) {
      dayColumns = header;
      continue;
    }

    // ── Exam row: carries a bracketed date, so it can never be a class row.
    const examDate = EXAM_DATE_RE.exec(line);
    if (examDate !== null) {
      const range = parseRange(line);
      const kind: 'mid' | 'final' | null = /\bFINAL\b/i.test(line)
        ? 'final'
        : /\bMID\b/i.test(line)
          ? 'mid'
          : null;
      const code = cells.map((c) => c.trim().toUpperCase()).find((c) => CODE_RE.test(c));
      if (range !== null && kind !== null && code !== undefined) {
        // The exam table names the course, not the section, so it lands on
        // whichever section of that course the class table already gave us.
        const target = [...sections.values()].find((s) => s.courseCode === code);
        if (target) applyExam(target, kind, examDate[1], range);
        else {
          warnings.push(
            `${kind === 'final' ? 'Final' : 'Mid'} exam for ${code} has no matching class row — skipped.`,
          );
        }
      }
      continue;
    }

    // ── Class row.
    const range = parseRange(cells[0] ?? '');
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i].trim();
      if (cell === '') continue;
      const match = CELL_RE.exec(cell.toUpperCase());
      if (match === null) continue;

      const section = upsert(match[1], match[2], match[3], match[4].trim());
      const day = dayColumns !== null ? (dayColumns[i] ?? null) : null;
      if (day === null || range === null) {
        // We know the section but not when it meets. Recorded, never invented:
        // a guessed slot puts a class on the grid at a time that is wrong.
        unplaced.push(`${match[1]} ${match[2]}`);
        continue;
      }
      const seen = section.sectionSchedule.classSchedules.some(
        (s) => s.day === day && s.startTime === range.start,
      );
      if (!seen) {
        section.sectionSchedule.classSchedules.push({
          day,
          startTime: range.start,
          endTime: range.end,
        });
      }
    }
  }

  const out = [...sections.values()];
  if (out.length === 0) {
    warnings.push(
      'No class rows were recognised. Copy the whole Class Schedule table, including the row of day names.',
    );
    return { sections: out, warnings };
  }

  const timeless = out.filter((s) => s.sectionSchedule.classSchedules.length === 0);
  if (timeless.length > 0) {
    warnings.push(
      `Found ${timeless.length} course${timeless.length === 1 ? '' : 's'} but not when they meet (${timeless
        .map((s) => s.courseCode)
        .join(', ')}) — the row of day names may be missing from the paste.`,
    );
  } else if (unplaced.length > 0) {
    warnings.push(
      `Some entries could not be placed on a day: ${[...new Set(unplaced)].join(', ')}.`,
    );
  }

  return { sections: out, warnings };
}

/**
 * Picks for an imported schedule: `{ courseCode: sectionId }`.
 *
 * The same shape the builder stores, so an imported routine is an ordinary
 * routine from that point on — editable, shareable, exportable.
 */
export function picksFromImport(schedule: ImportedSchedule): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const section of schedule.sections) picks[section.courseCode] = section.sectionId;
  return picks;
}
