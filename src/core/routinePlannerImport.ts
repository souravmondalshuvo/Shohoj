/**
 * Routine ↔ Semester Planner bridge.
 *
 * Resolves the course codes a student has added to their Planner against the
 * live CONNECT feed, so the Routine Builder can pre-fill its picker with the
 * courses they already intend to take — skipping the ones not offered this
 * semester and the ones already in the routine.
 *
 * Pure: the runtime (`routineTab.js`) reads plan codes from
 * `window._shohoj_getPlanCourses()` and applies the result.
 */

import type { SectionIndex } from './connectFeed';

export interface PlanImportResult {
  /** Codes offered this semester and not already picked — safe to add. */
  importable: string[];
  /** Codes in the plan but with no sections in the live feed this semester. */
  notOffered: string[];
  /** Codes already present in the routine — skipped as no-ops. */
  alreadyPicked: string[];
}

function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

/**
 * @param planCourses raw course codes from the Planner (may be messy/duplicated)
 * @param index       course→sections map from the live feed
 * @param alreadyPickedCodes course codes already in the routine
 */
export function resolvePlanImport(
  planCourses: readonly unknown[],
  index: SectionIndex,
  alreadyPickedCodes: readonly string[] = [],
): PlanImportResult {
  const picked = new Set(alreadyPickedCodes.map(normalizeCode).filter(Boolean));
  const seen = new Set<string>();

  const importable: string[] = [];
  const notOffered: string[] = [];
  const alreadyPicked: string[] = [];

  for (const raw of planCourses ?? []) {
    const code = normalizeCode(raw);
    if (!code) continue;
    if (seen.has(code)) continue; // de-dupe the plan list
    seen.add(code);

    if (picked.has(code)) {
      alreadyPicked.push(code);
      continue;
    }
    if (index.has(code)) {
      importable.push(code);
    } else {
      notOffered.push(code);
    }
  }

  importable.sort();
  notOffered.sort();
  alreadyPicked.sort();
  return { importable, notOffered, alreadyPicked };
}

export function summarizePlanImport(result: PlanImportResult): string {
  const parts: string[] = [];
  if (result.importable.length > 0) {
    parts.push(
      `Added ${result.importable.length} course${result.importable.length === 1 ? '' : 's'}`,
    );
  }
  if (result.alreadyPicked.length > 0) {
    parts.push(`${result.alreadyPicked.length} already in routine`);
  }
  if (result.notOffered.length > 0) {
    parts.push(
      `${result.notOffered.length} not offered this semester (${result.notOffered.join(', ')})`,
    );
  }
  if (parts.length === 0) return 'Nothing to import from your plan.';
  return parts.join(' · ');
}
