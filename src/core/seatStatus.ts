/**
 * Seat-status lookup — pure helpers that turn the normalized section list into
 * "is there a seat in COURSE X" answers. The live CONNECT feed gives every
 * section a `capacity` / `consumedSeat`; this layers search, seat math, sorting,
 * and a per-course summary on top so the Seats tab stays a thin renderer.
 *
 * UI-agnostic on purpose: plain data in, plain data out. Seat status thresholds
 * mirror the Routine Builder's inline seat badge so the two tabs agree.
 */

import type { NormalizedSection, SectionIndex } from './connectFeed';

/** A section at >85% capacity is "tight"; full sections are "full". */
export const TIGHT_THRESHOLD = 0.85;

export type SeatStatus = 'full' | 'tight' | 'open';

export interface SeatInfo {
  capacity: number;
  taken: number;
  /** Seats remaining, floored at 0. */
  left: number;
  /** Fraction taken in [0, 1]; 0 when capacity is unknown (0). */
  pct: number;
  status: SeatStatus;
}

/** Per-section seat math, derived purely from capacity/consumedSeat/isFull. */
export function seatInfo(section: NormalizedSection): SeatInfo {
  const capacity = Number.isFinite(section.capacity) ? section.capacity : 0;
  const taken = Number.isFinite(section.consumedSeat) ? section.consumedSeat : 0;
  const left = Math.max(0, capacity - taken);
  const pct = capacity > 0 ? taken / capacity : 0;
  const status: SeatStatus = section.isFull ? 'full' : pct > TIGHT_THRESHOLD ? 'tight' : 'open';
  return { capacity, taken, left, pct, status };
}

export type SeatSortMode = 'section' | 'seats';

/** "01" < "2" < "12" — numeric when both parse, else case-insensitive string. */
function compareSectionName(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * A new, sorted copy of `sections`. `'section'` orders by section name;
 * `'seats'` puts the most open seats first (full sections last), breaking ties
 * by section name. Never mutates the input.
 */
export function sortSections(
  sections: readonly NormalizedSection[],
  mode: SeatSortMode = 'section',
): NormalizedSection[] {
  const copy = sections.slice();
  if (mode === 'seats') {
    copy.sort((a, b) => {
      const la = seatInfo(a).left;
      const lb = seatInfo(b).left;
      if (la !== lb) return lb - la;
      return compareSectionName(a.sectionName, b.sectionName);
    });
  } else {
    copy.sort((a, b) => compareSectionName(a.sectionName, b.sectionName));
  }
  return copy;
}

export interface CourseSeatSummary {
  totalSections: number;
  /** Sections that still have at least one seat (i.e. not full). */
  openSections: number;
  /** Total seats remaining across all sections. */
  seatsLeft: number;
}

export function courseSeatSummary(sections: readonly NormalizedSection[]): CourseSeatSummary {
  let openSections = 0;
  let seatsLeft = 0;
  for (const s of sections) {
    const info = seatInfo(s);
    if (info.left > 0) openSections += 1;
    seatsLeft += info.left;
  }
  return { totalSections: sections.length, openSections, seatsLeft };
}

export interface CourseSeatGroup {
  courseCode: string;
  courseName: string;
  sections: NormalizedSection[];
  summary: CourseSeatSummary;
}

export interface SearchOptions {
  /** Drop sections (and then empty groups) that have no seats left. */
  availableOnly?: boolean;
  sort?: SeatSortMode;
  /** Cap on the number of course groups returned. */
  limit?: number;
}

/**
 * Match-rank a course against a normalized query: exact code (0), code prefix
 * (1), code substring (2), name substring (3), or no match (-1). Lower is more
 * relevant.
 */
function matchRank(courseCode: string, courseName: string, query: string): number {
  if (courseCode === query) return 0;
  if (courseCode.startsWith(query)) return 1;
  if (courseCode.includes(query)) return 2;
  if (courseName.toUpperCase().includes(query)) return 3;
  return -1;
}

/**
 * Group every course matching `query` with its sections, ordered by match
 * relevance then course code. An empty/whitespace query returns []. Sections
 * within a group are sorted by `opts.sort` (default `'section'`); with
 * `availableOnly`, full sections — and any course left with no sections — are
 * dropped.
 */
export function searchCourseSections(
  index: SectionIndex,
  query: string,
  opts: SearchOptions = {},
): CourseSeatGroup[] {
  const q = (query || '').trim().toUpperCase();
  if (q === '') return [];

  const sort = opts.sort ?? 'section';
  const ranked: Array<{ rank: number; group: CourseSeatGroup }> = [];

  for (const [courseCode, rawSections] of index) {
    const courseName = rawSections.length > 0 ? rawSections[0].courseName : '';
    const rank = matchRank(courseCode, courseName, q);
    if (rank < 0) continue;

    const kept = opts.availableOnly
      ? rawSections.filter((s) => seatInfo(s).left > 0)
      : rawSections.slice();
    if (kept.length === 0) continue;

    const sections = sortSections(kept, sort);
    ranked.push({
      rank,
      group: {
        courseCode,
        courseName,
        sections,
        summary: courseSeatSummary(sections),
      },
    });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.group.courseCode.localeCompare(b.group.courseCode));

  const groups = ranked.map((r) => r.group);
  return typeof opts.limit === 'number' ? groups.slice(0, opts.limit) : groups;
}
