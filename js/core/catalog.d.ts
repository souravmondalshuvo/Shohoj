// js/core/catalog.d.ts
//
// Typed boundary for the legacy course catalogue (js/core/catalog.js). The bulk
// BRACU catalogue DATA stays authored in vanilla JS — it ships in the production
// build3.py bundle and is the single source of truth. The Vite/React shell, which
// never loads the legacy bundle, imports the same array through this declaration
// so there is exactly ONE catalogue, not a hand-maintained duplicate. Only the
// shapes the typed layer consumes are declared here (see
// src/features/calculator/catalog.ts and docs/architecture/decisions/
// 0001-calculator-catalogue-search-boundary.md). This file is a declaration only;
// it is intentionally outside the tsconfig `include` and is pulled in as an
// import dependency.

/** One catalogue course as built by catalog.js (`{ code, name, credits, full }`). */
export interface LegacyCourse {
  readonly code: string;
  readonly name: string;
  readonly credits: number;
  /** Display name, e.g. "Programming Language I (CSE110)". */
  readonly full: string;
}

/** Every catalogue course, sorted by code (catalog.js `Object.values(...).sort`). */
export const ALL_COURSES: readonly LegacyCourse[];
