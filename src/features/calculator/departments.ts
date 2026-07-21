// src/features/calculator/departments.ts
//
// Typed department table for the React/shell calculator path (#313).
//
// Like the catalogue (catalog.ts), the department DATA is authored once in the
// legacy vanilla-JS module (js/core/departments.js → DEPARTMENTS), which the
// production build3.py bundle ships. The shell imports the same object through
// the js/core/departments.d.ts boundary — one table, no hand-maintained
// duplicate — validates it once at load, and freezes the adapted view. Presets
// are intentionally not adapted yet (they belong to the preset-semester flow,
// a later slice).
//
// Pure module-level data: built once on import, never mutated, no React/DOM.

import { DEPARTMENTS } from '../../../js/core/departments.js';
import type { SemesterSeason } from '../../core/types.ts';
import { createLogger } from '../../platform/observability/logger.ts';

const logger = createLogger({ base: { module: 'calculator.departments' } });

export interface DepartmentInfo {
  /** Department code, e.g. "CSE". */
  readonly code: string;
  /** Full program label, e.g. "B.Sc. in Computer Science and Engineering (CSE)". */
  readonly label: string;
  readonly totalCredits: number;
  /** The department's semester calendar (validated season names, in order). */
  readonly seasons: readonly SemesterSeason[];
}

/** The global default calendar, used when no (valid) department is selected. */
export const DEFAULT_DEPT_SEASONS: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];

const VALID_SEASONS: ReadonlySet<string> = new Set(DEFAULT_DEPT_SEASONS);

function toDepartment(code: string, raw: unknown): DepartmentInfo | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  const totalCredits =
    typeof r.totalCredits === 'number' && Number.isFinite(r.totalCredits) ? r.totalCredits : NaN;
  const seasons = Array.isArray(r.seasons)
    ? r.seasons.filter((s): s is SemesterSeason => typeof s === 'string' && VALID_SEASONS.has(s))
    : [];
  if (!code || !label || Number.isNaN(totalCredits) || seasons.length === 0) return null;
  return { code, label, totalCredits, seasons: Object.freeze(seasons) };
}

function buildDepartments(source: Readonly<Record<string, unknown>>): readonly DepartmentInfo[] {
  const out: DepartmentInfo[] = [];
  let skipped = 0;
  for (const [code, raw] of Object.entries(source)) {
    const dept = toDepartment(code, raw);
    if (dept) out.push(dept);
    else skipped += 1;
  }
  if (skipped > 0) {
    logger.warn('calculator.departments.skipped_malformed_entries', {
      skipped,
      total: Object.keys(source).length,
    });
  }
  return Object.freeze(out);
}

/** The frozen, validated department list, in the authored (legacy) order. */
export const DEPARTMENT_LIST: readonly DepartmentInfo[] = buildDepartments(DEPARTMENTS);

const BY_CODE: ReadonlyMap<string, DepartmentInfo> = new Map(
  DEPARTMENT_LIST.map((d) => [d.code, d]),
);

/** Department for a code, or null for unknown/empty codes. */
export function getDepartment(code: string): DepartmentInfo | null {
  return (
    BY_CODE.get(
      String(code ?? '')
        .trim()
        .toUpperCase(),
    ) ?? null
  );
}

/** The semester calendar for a department code, defaulting to the global one. */
export function deptSeasonsFor(code: string): readonly SemesterSeason[] {
  return getDepartment(code)?.seasons ?? DEFAULT_DEPT_SEASONS;
}
