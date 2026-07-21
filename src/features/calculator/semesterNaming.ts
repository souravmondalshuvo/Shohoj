// src/features/calculator/semesterNaming.ts
//
// Pure semester-naming logic for the add-semester / running-semester actions,
// mirroring addSemester / addRunningSemester / generateNextSemesterName in
// js/ui/render.js. The clock is injected (semesterCalendar.ts precedent) and
// state comes in as plain data, so every branch is unit-testable.
//
// The department calendar is injected per call (deptSeasons — see
// departments.ts), defaulting to the global Spring/Summer/Fall order.
// Shell deviation (documented): the legacy buttons no-op until the setup
// wizard fixes a department + start semester; the shell instead falls back to
// "Semester N" / "Current Semester" names when no start season/year is set.

import { generateSemesterNames, ordinalSup } from '../../core/helpers.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import {
  computeOrdinal,
  getCurrentSemesterForDeptSeasons,
  nextSemester,
  parseSemesterSeasonYear,
  type SeasonYear,
} from './semesterCalendar.ts';

export interface NamingInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: string;
  readonly startYear: string;
}

const DEFAULT_SEASONS: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];

type Seasons = readonly SemesterSeason[];

function startSeasonYear(inputs: NamingInputs): SeasonYear | null {
  const year = parseInt(inputs.startYear, 10);
  if (!inputs.startSeason || !Number.isFinite(year)) return null;
  return { season: inputs.startSeason as SemesterSeason, year };
}

/** "Fall 2026 (3ʳᵈ Semester)" when the ordinal is known, else "Fall 2026". */
function buildSemesterName(target: SeasonYear, start: SeasonYear | null, seasons: Seasons): string {
  const ordinal = computeOrdinal(target, start, seasons);
  return ordinal
    ? `${target.season} ${target.year} (${ordinalSup(ordinal)} Semester)`
    : `${target.season} ${target.year}`;
}

/** The season/year a summary-block continuation targets: one past the last
 * non-summary semester with a parseable name, else the current real-world
 * semester. Mirrors the shared branch of addSemester/addRunningSemester. */
function summaryContinuationTarget(
  semesters: readonly SemesterEntry[],
  now: Date,
  seasons: Seasons,
): SeasonYear {
  const nonSummary = semesters.filter((s) => !s.summary);
  const last = nonSummary[nonSummary.length - 1];
  const parsed = last ? parseSemesterSeasonYear(last.name) : null;
  if (parsed) return nextSemester(parsed.season, parsed.year, seasons);
  return getCurrentSemesterForDeptSeasons(now, seasons);
}

/** Name for the next completed semester (the "+ Add Semester" action). */
export function nextCompletedSemesterName(
  inputs: NamingInputs,
  now: Date,
  deptSeasons: Seasons = DEFAULT_SEASONS,
): string {
  const hasSummary = inputs.semesters.some((s) => s.summary);
  if (hasSummary) {
    return buildSemesterName(
      summaryContinuationTarget(inputs.semesters, now, deptSeasons),
      startSeasonYear(inputs),
      deptSeasons,
    );
  }

  const completedCount = inputs.semesters.filter((s) => !s.running && !s.summary).length;
  const start = startSeasonYear(inputs);
  if (!start) return `Semester ${completedCount + 1}`;
  const names = generateSemesterNames(start.season, start.year, completedCount + 1, deptSeasons);
  return names[completedCount] || `Semester ${completedCount + 1}`;
}

/** Name for a running semester (the "🎯 Running Semester" action), including
 * the legacy " (Running)" suffix. */
export function nextRunningSemesterName(
  inputs: NamingInputs,
  now: Date,
  deptSeasons: Seasons = DEFAULT_SEASONS,
): string {
  const hasSummary = inputs.semesters.some((s) => s.summary);
  let base: string;

  if (hasSummary) {
    base = buildSemesterName(
      summaryContinuationTarget(inputs.semesters, now, deptSeasons),
      startSeasonYear(inputs),
      deptSeasons,
    );
  } else {
    // Mirrors generateNextSemesterName: one step past the last completed
    // semester's parseable name, else "Current Semester". No ordinal suffix.
    const completed = inputs.semesters.filter((s) => !s.running && !s.summary);
    const last = completed[completed.length - 1];
    const parsed = last ? parseSemesterSeasonYear(last.name) : null;
    if (parsed) {
      const next = nextSemester(parsed.season, parsed.year, deptSeasons);
      base = `${next.season} ${next.year}`;
    } else {
      base = 'Current Semester';
    }
  }

  return `${base} (Running)`;
}
