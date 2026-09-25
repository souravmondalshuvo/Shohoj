/**
 * Ordering and filtering for a course's section list.
 *
 * Lifted out of js/ui/routineTab.js (#682) so the shell's Routine route can
 * offer the same sort and filters rather than growing a second, drifting
 * implementation of them. Pure / I/O-free: no store, no DOM.
 *
 * The rating accessor is a parameter rather than an import so this module
 * stays independent of how ratings are loaded — the legacy tab reads its
 * fetched map, and a caller with no ratings yet passes nothing.
 */

import type { NormalizedSection } from './connectFeed';

export type SectionSortMode = 'section' | 'faculty' | 'seats' | 'time';

export interface SectionFilters {
  /** Hide sections starting before 9:00 AM. */
  noEarly?: boolean;
  /** Hide sections ending after 5:00 PM. */
  noEvening?: boolean;
  /** Canonical day names to avoid entirely, e.g. ['FRIDAY']. */
  avoidDays?: readonly string[];
}

/** Rating for a section on a 0–5 scale; below 0 means "no opinion". */
export type RatingValue = (section: NormalizedSection) => number;

/** "No early" hides anything starting before 9:00 AM. */
export const FILTER_EARLY_MIN = 9 * 60;
/** "No evening" hides anything ending after 5:00 PM. */
export const FILTER_EVENING_MIN = 17 * 60;

/** The sort modes the UI offers, in the order it offers them. */
export const SECTION_SORT_MODES: ReadonlyArray<readonly [SectionSortMode, string]> = [
  ['section', 'Section #'],
  ['faculty', 'Faculty ★'],
  ['seats', 'Seats'],
  ['time', 'Earliest'],
];

export function seatsLeft(section: NormalizedSection): number {
  return Math.max(0, (section.capacity || 0) - (section.consumedSeat || 0));
}

/** Start of the section's first class of the week; MAX_SAFE_INTEGER when it has none. */
export function earliestStart(section: NormalizedSection): number {
  const slots = section.classSlots ?? [];
  if (slots.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...slots.map((s) => s.startMin));
}

/** Section number for ordering; unnumbered sections sort last. */
export function sectionNumber(name: string | null | undefined): number {
  const n = parseInt(String(name ?? ''), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Does this section survive the student's filters?
 *
 * A section with no class slots passes everything — the filters are claims
 * about when it meets, and there is nothing to judge.
 */
export function sectionPassesFilters(
  section: NormalizedSection,
  filters: SectionFilters = {},
): boolean {
  const avoidDays = filters.avoidDays ?? [];
  if (!filters.noEarly && !filters.noEvening && avoidDays.length === 0) return true;
  for (const slot of section.classSlots ?? []) {
    if (filters.noEarly && slot.startMin < FILTER_EARLY_MIN) return false;
    if (filters.noEvening && slot.endMin > FILTER_EVENING_MIN) return false;
    if (avoidDays.includes(slot.day)) return false;
  }
  return true;
}

/**
 * Sort a course's sections by the active mode.
 *
 * Two rules outrank the mode: a full section can't be taken, so it sinks to
 * the bottom whatever the sort; and section number is the universal tie-break,
 * so the order never looks arbitrary. Returns a new array.
 */
export function sortRoutineSections(
  sections: readonly NormalizedSection[],
  mode: SectionSortMode = 'section',
  ratingValue: RatingValue = () => -1,
): NormalizedSection[] {
  const decorated = sections.map((s) => ({
    s,
    full: !!s.isFull,
    num: sectionNumber(s.sectionName),
  }));

  type Row = (typeof decorated)[number];
  let primary: (a: Row, b: Row) => number;
  if (mode === 'faculty') primary = (a, b) => ratingValue(b.s) - ratingValue(a.s);
  else if (mode === 'seats') primary = (a, b) => seatsLeft(b.s) - seatsLeft(a.s);
  else if (mode === 'time') primary = (a, b) => earliestStart(a.s) - earliestStart(b.s);
  else primary = (a, b) => a.num - b.num;

  decorated.sort((a, b) => {
    if (a.full !== b.full) return a.full ? 1 : -1;
    const p = primary(a, b);
    if (p !== 0) return p;
    return a.num - b.num;
  });
  return decorated.map((d) => d.s);
}
