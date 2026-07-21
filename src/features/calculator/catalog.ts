// src/features/calculator/catalog.ts
//
// Phase 5C: the typed BRACU catalogue for the React/shell calculator path.
//
// The catalogue DATA is authored once, in the legacy vanilla-JS module
// (js/core/catalog.js → ALL_COURSES), which the production build3.py bundle
// ships. The legacy/island calculator reads it through window._shohoj_courseCatalog;
// the React Router shell has no legacy app, so it imports the same array here
// through the js/core/catalog.d.ts boundary. There is exactly ONE catalogue —
// this module adapts it into the feature's CourseSuggestion shape, validates it
// once at load, and freezes the result. See docs/architecture/decisions/
// 0001-calculator-catalogue-search-boundary.md for the boundary rationale.
//
// Pure module-level data: built once on import, never mutated, no React/DOM.

import { ALL_COURSES, COURSE_DB, PREREQS } from '../../../js/core/catalog.js';
import { createLogger } from '../../platform/observability/logger.ts';
import type { CourseCatalog, PrerequisiteMap } from '../../core/types.ts';
import type { CourseSuggestion } from './courseSearch.ts';

const logger = createLogger({ base: { module: 'calculator.catalog' } });

/** Coerce one legacy record into a valid CourseSuggestion, or null if malformed. */
function toSuggestion(raw: unknown): CourseSuggestion | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === 'string' ? r.code.trim() : '';
  const name = typeof r.name === 'string' ? r.name : '';
  const credits = typeof r.credits === 'number' && Number.isFinite(r.credits) ? r.credits : NaN;
  if (!code || !name || Number.isNaN(credits)) return null;
  const full = typeof r.full === 'string' && r.full.trim() ? r.full : `${name} (${code})`;
  return { code, name, full, credits };
}

/**
 * Validate + adapt the legacy catalogue once. Defensive: a malformed record is
 * skipped (logged) rather than throwing, so the autocomplete degrades to the
 * valid subset instead of breaking the calculator. Trusted static data, so this
 * runs a single time at module load — never per search keystroke.
 */
function buildCatalog(source: readonly unknown[]): readonly CourseSuggestion[] {
  const out: CourseSuggestion[] = [];
  let skipped = 0;
  for (const raw of source) {
    const entry = toSuggestion(raw);
    if (entry) out.push(entry);
    else skipped += 1;
  }
  if (skipped > 0) {
    logger.warn('calculator.catalog.skipped_malformed_entries', { skipped, total: source.length });
  }
  return Object.freeze(out);
}

/** The frozen, validated BRACU catalogue backing the React/shell autocomplete. */
export const BRACU_COURSE_CATALOG: readonly CourseSuggestion[] = buildCatalog(ALL_COURSES);

/** Uppercased course codes present in the catalogue, for O(1) membership checks. */
const KNOWN_CODES: ReadonlySet<string> = new Set(
  BRACU_COURSE_CATALOG.map((c) => c.code.toUpperCase()),
);

/**
 * Whether a course code is a real catalogue course (case-insensitive). Backs the
 * shell bridge's isKnownCode — drives reviewable-course detection in the rows.
 */
export function isKnownCourseCode(code: string): boolean {
  return KNOWN_CODES.has(
    String(code ?? '')
      .trim()
      .toUpperCase(),
  );
}

/** The by-code course record (COURSE_DB), typed for the planner engine (#327). */
export const BRACU_COURSE_DB: CourseCatalog = COURSE_DB;

/** The prerequisite map (PREREQS), typed for the planner engine (#327). */
export const BRACU_PREREQS: PrerequisiteMap = PREREQS;
