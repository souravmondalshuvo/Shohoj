// src/features/calculator/semesterNaming.ts
//
// Pure semester-naming logic for the add-semester / running-semester actions,
// mirroring addSemester / addRunningSemester / generateNextSemesterName in
// js/ui/render.js. The clock is injected (semesterCalendar.ts precedent) and
// state comes in as plain data, so every branch is unit-testable.
//
// Shell deviation (documented): the legacy buttons no-op until the setup
// wizard fixes a department + start semester. The shell has no department
// picker yet, so the calendar defaults to the global Spring/Summer/Fall order
// and, with no start season/year, names fall back to "Semester N" /
// "Current Semester" instead of blocking the add.

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

function startSeasonYear(inputs: NamingInputs): SeasonYear | null {
  const year = parseInt(inputs.startYear, 10);
  if (!inputs.startSeason || !Number.isFinite(year)) return null;
  return { season: inputs.startSeason as SemesterSeason, year };
}

/** "Fall 2026 (3ʳᵈ Semester)" when the ordinal is known, else "Fall 2026". */
function buildSemesterName(target: SeasonYear, start: SeasonYear | null): string {
  const ordinal = computeOrdinal(target, start, DEFAULT_SEASONS);
  return ordinal
    ? `${target.season} ${target.year} (${ordinalSup(ordinal)} Semester)`
    : `${target.season} ${target.year}`;
}

/** The season/year a summary-block continuation targets: one past the last
 * non-summary semester with a parseable name, else the current real-world
 * semester. Mirrors the shared branch of addSemester/addRunningSemester. */
function summaryContinuationTarget(semesters: readonly SemesterEntry[], now: Date): SeasonYear {
  const nonSummary = semesters.filter(s => !s.summary);
  const last = nonSummary[nonSummary.length - 1];
  const parsed = last ? parseSemesterSeasonYear(last.name) : null;
  if (parsed) return nextSemester(parsed.season, parsed.year, DEFAULT_SEASONS);
  return getCurrentSemesterForDeptSeasons(now, DEFAULT_SEASONS);
}

/** Name for the next completed semester (the "+ Add Semester" action). */
export function nextCompletedSemesterName(inputs: NamingInputs, now: Date): string {
  const hasSummary = inputs.semesters.some(s => s.summary);
  if (hasSummary) {
    return buildSemesterName(summaryContinuationTarget(inputs.semesters, now), startSeasonYear(inputs));
  }

  const completedCount = inputs.semesters.filter(s => !s.running && !s.summary).length;
  const start = startSeasonYear(inputs);
  if (!start) return `Semester ${completedCount + 1}`;
  const names = generateSemesterNames(start.season, start.year, completedCount + 1, DEFAULT_SEASONS);
  return names[completedCount] || `Semester ${completedCount + 1}`;
}

/** Name for a running semester (the "🎯 Running Semester" action), including
 * the legacy " (Running)" suffix. */
export function nextRunningSemesterName(inputs: NamingInputs, now: Date): string {
  const hasSummary = inputs.semesters.some(s => s.summary);
  let base: string;

  if (hasSummary) {
    base = buildSemesterName(summaryContinuationTarget(inputs.semesters, now), startSeasonYear(inputs));
  } else {
    // Mirrors generateNextSemesterName: one step past the last completed
    // semester's parseable name, else "Current Semester". No ordinal suffix.
    const completed = inputs.semesters.filter(s => !s.running && !s.summary);
    const last = completed[completed.length - 1];
    const parsed = last ? parseSemesterSeasonYear(last.name) : null;
    if (parsed) {
      const next = nextSemester(parsed.season, parsed.year, DEFAULT_SEASONS);
      base = `${next.season} ${next.year}`;
    } else {
      base = 'Current Semester';
    }
  }

  return `${base} (Running)`;
}
