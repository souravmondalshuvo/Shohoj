// js/core/departments.d.ts
//
// Typed boundary for the legacy department data (js/core/departments.js),
// following the catalogue precedent (js/core/catalog.d.ts): the department
// DATA stays authored in vanilla JS — it ships in the production build3.py
// bundle and is the single source of truth — and the Vite/React shell imports
// the same object through this declaration, so there is exactly ONE department
// table, not a hand-maintained duplicate. Only the shapes the typed layer
// consumes are declared (see src/features/calculator/departments.ts). This
// file is a declaration only; it is intentionally outside the tsconfig
// `include` and is pulled in as an import dependency.

/** One preset semester template (name + starter courses). */
export interface LegacyDepartmentPreset {
  readonly name: string;
  readonly courses: readonly {
    readonly name: string;
    readonly credits: number;
    readonly grade: string;
  }[];
}

/** One department as authored in departments.js. */
export interface LegacyDepartment {
  readonly label: string;
  readonly totalCredits: number;
  /** The department's semester calendar, e.g. ['Spring','Summer','Fall']. */
  readonly seasons: readonly string[];
  readonly presets: readonly LegacyDepartmentPreset[];
}

/** Department table keyed by code (CSE, EEE, PHR, LAW, …). */
export const DEPARTMENTS: Readonly<Record<string, LegacyDepartment>>;
