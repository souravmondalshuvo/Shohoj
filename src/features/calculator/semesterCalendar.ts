// src/features/calculator/semesterCalendar.ts
//
// Phase 5B foundation: the pure season/year/ordinal derivation logic currently
// embedded in js/ui/render.js, extracted as typed functions with no dependency
// on the global `state` object, the DOM, or `Date.now()` ambient reads (the
// clock is passed in). The legacy module stays live and untouched; these typed
// equivalents are unit-tested for parity and will back the React calculator
// islands as they replace render.js incrementally. See
// docs/FULL_REACT_TYPESCRIPT_MIGRATION.md §5B.

import type { SemesterSeason } from '../../core/types';

export interface SeasonYear {
  readonly season: SemesterSeason;
  readonly year: number;
}

/** Global season order used when a department's calendar omits a season. */
const GLOBAL_SEASON_ORDER: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];

/** Parse a "Spring 2024 (…)" style name into its season + year, or null. */
export function parseSemesterSeasonYear(name: string | null | undefined): SeasonYear | null {
  const match = String(name ?? '').match(/(Spring|Summer|Fall)\s+(\d{4})/);
  const [, season, year] = match ?? [];
  if (season === undefined || year === undefined) return null;
  return { season: season as SemesterSeason, year: parseInt(year, 10) };
}

/**
 * The real-world "current" semester for a department calendar. Months 1–4 map
 * to Spring, 5–8 to Summer, else Fall; if that season is not in the dept's
 * calendar, advance to the nearest offered one (wrapping into the next year).
 * Mirrors getCurrentSemesterForDeptSeasons in render.js exactly.
 */
export function getCurrentSemesterForDeptSeasons(
  now: Date,
  deptSeasons: readonly SemesterSeason[],
): SeasonYear {
  const month = now.getMonth() + 1;
  let currentSeason: SemesterSeason;
  if (month <= 4) currentSeason = 'Spring';
  else if (month <= 8) currentSeason = 'Summer';
  else currentSeason = 'Fall';
  const currentYear = now.getFullYear();

  let season: SemesterSeason = currentSeason;
  let year = currentYear;
  if (!deptSeasons.includes(season)) {
    const curIdx = GLOBAL_SEASON_ORDER.indexOf(season);
    for (let offset = 1; offset <= 3; offset++) {
      const candidate = GLOBAL_SEASON_ORDER[(curIdx + offset) % 3];
      if (candidate !== undefined && deptSeasons.includes(candidate)) {
        season = candidate;
        if (GLOBAL_SEASON_ORDER.indexOf(candidate) <= curIdx) year = currentYear + 1;
        break;
      }
    }
  }

  return { season, year };
}

/** Advance one step in the department calendar, wrapping the year. */
export function nextSemester(
  season: SemesterSeason,
  year: number,
  deptSeasons: readonly SemesterSeason[],
): SeasonYear {
  const first = deptSeasons[0];
  // A department with no calendar has nothing to advance along, so nothing does.
  if (first === undefined) return { season, year };

  const idx = deptSeasons.indexOf(season);
  const next = deptSeasons[idx + 1];
  // Not on the calendar, or at its end: wrap to its first season, next year.
  // "There is no next season" is one question, asked once.
  if (idx === -1 || next === undefined) return { season: first, year: year + 1 };
  return { season: next, year };
}

/**
 * 1-based ordinal of a season/year counting from the start semester along the
 * department calendar, or null if start is unknown. Caps at 50 like the legacy
 * loop. Mirrors _computeOrdinal in render.js (minus the global-state reads).
 */
export function computeOrdinal(
  target: SeasonYear,
  start: SeasonYear | null,
  deptSeasons: readonly SemesterSeason[],
): number | null {
  if (!start) return null;

  let si = deptSeasons.indexOf(start.season);
  if (si === -1) si = 0;
  let yr = start.year;
  let ordinal = 1;
  while (!(deptSeasons[si] === target.season && yr === target.year)) {
    si++;
    if (si >= deptSeasons.length) {
      si = 0;
      yr++;
    }
    ordinal++;
    if (ordinal > 50) break;
  }
  return ordinal;
}

/**
 * Number of semesters between the start and the given "current" semester along
 * the department calendar (exclusive of current). Caps at 50.
 * Mirrors _estimatedSummarySemCount in render.js.
 */
export function estimatedSemesterCount(
  start: SeasonYear | null,
  current: SeasonYear,
  deptSeasons: readonly SemesterSeason[],
): number {
  if (!start) return 0;

  let si = deptSeasons.indexOf(start.season);
  if (si === -1) si = 0;
  let yr = start.year;
  let count = 0;
  while (!(deptSeasons[si] === current.season && yr === current.year)) {
    count++;
    si++;
    if (si >= deptSeasons.length) {
      si = 0;
      yr++;
    }
    if (count > 50) break;
  }
  return count;
}

/**
 * Is the named semester strictly in the future relative to `now`? Uses the
 * fixed global season order. Mirrors _isFutureSem in render.js.
 */
export function isFutureSemester(name: string | null | undefined, now: Date): boolean {
  const parsed = parseSemesterSeasonYear(name);
  if (!parsed) return false;
  const order: Record<SemesterSeason, number> = { Spring: 0, Summer: 1, Fall: 2 };

  const month = now.getMonth() + 1;
  let curSeason: SemesterSeason;
  if (month <= 4) curSeason = 'Spring';
  else if (month <= 8) curSeason = 'Summer';
  else curSeason = 'Fall';

  const semVal = parsed.year * 3 + order[parsed.season];
  const curVal = now.getFullYear() * 3 + order[curSeason];
  return semVal > curVal;
}
