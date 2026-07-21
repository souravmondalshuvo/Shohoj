// src/core/catalog.ts
//
// Typed port of the course-code classification logic from js/core/catalog.js.
// The bulk catalog/prerequisite/department DATA stays in the vanilla JS modules
// and is passed into the typed core as parameters (CourseCatalog /
// PrerequisiteMap), per docs/REACT_VITE_MIGRATION.md — only the reusable logic
// and its small lookup tables move here. Behavior parity with the JS version is
// guarded by tests/typedCoreParity.test.js.

import type { DepartmentCode } from './types';

export interface DeptMeta {
  label: string;
  school: string;
  displayCode?: string;
}

// Maps a course-code prefix (the letters before the first digit) to the
// department tile that owns it.
export const PREFIX_DEPT_MAP: Readonly<Record<string, DepartmentCode>> = {
  // ── School of Data and Sciences (SDS) ─────────────────────────────────────
  CSE: 'CSE', // Dept of CSE
  EEE: 'EEE', // Dept of EEE
  ECE: 'ECE', // Dept of ECE
  MAT: 'MPS',
  PHY: 'MPS',
  STA: 'MPS',
  ENV: 'MPS', // Dept of Math &
  MIC: 'MPS',
  BCH: 'MPS',
  BTE: 'MPS',
  BIO: 'MPS', //   Physical Sciences
  APE: 'MPS',
  CHE: 'MPS',
  GEO: 'MPS', //   (MPS) — GEO sits here at BRACU
  // ── BRAC Business School (BBS) ────────────────────────────────────────────
  ACT: 'BBA',
  BUS: 'BBA',
  FIN: 'BBA',
  MGT: 'BBA',
  MKT: 'BBA',
  MIS: 'BBA',
  MSC: 'BBA',
  // ── English & Humanities (ENH) — folded under ENG tile ────────────────────
  ENG: 'ENG',
  HST: 'ENG',
  // ── Economics & Social Sciences (ESS) — folded under ECO tile ─────────────
  ECO: 'ECO',
  SOC: 'ECO',
  // ── Anthropology ──────────────────────────────────────────────────────────
  ANT: 'ANT',
  // ── Other schools ─────────────────────────────────────────────────────────
  ARC: 'ARC',
  CEE: 'ARC',
  MEE: 'ARC',
  PHI: 'ARC', // School of Architecture
  PHB: 'PHR',
  PHR: 'PHR', // School of Pharmacy
  LAW: 'LLB', // School of Law (LLB)
  // ── General Education Department (GenEd) ──────────────────────────────────
  BNG: 'GENED',
  EMB: 'GENED',
  CST: 'GENED',
  FRN: 'GENED',
  DEV: 'GENED',
  POL: 'GENED',
  PSY: 'GENED',
  HUM: 'GENED',
  CHN: 'GENED',
  JPN: 'GENED',
  SPN: 'GENED',
};

// Human-readable labels and school affiliation for each department code.
export const DEPT_META: Readonly<Record<DepartmentCode, DeptMeta>> = {
  CSE: { label: 'Computer Science & Engineering', school: 'SDS' },
  EEE: { label: 'Electrical & Electronic Engineering', school: 'SDS' },
  ECE: { label: 'Electronic & Communication Engineering', school: 'SDS' },
  MPS: { label: 'Mathematics & Physical Sciences', school: 'SDS' },
  BBA: { label: 'Business', school: 'BBS' },
  ENG: { label: 'English & Humanities', school: 'ENH' },
  ECO: { label: 'Economics & Social Sciences', school: 'ESS' },
  ANT: { label: 'Anthropology', school: 'ESS' },
  ARC: { label: 'Architecture', school: 'SAD' },
  PHR: { label: 'Pharmacy', school: 'Pharmacy' },
  LLB: { label: 'Bachelor of Laws', school: 'Law' },
  GENED: { label: 'General Education', displayCode: 'GenEd', school: 'GENED' },
};

// Returns the prefix portion of a course code (letters before the first digit).
export function getCoursePrefix(code: unknown): string {
  const m = String(code).match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

// Returns the owning department code for a course, or null if unknown.
export function getCourseDept(code: unknown): DepartmentCode | null {
  const upper = String(code).toUpperCase();
  if (upper === 'CST333') return 'BBA';
  return PREFIX_DEPT_MAP[getCoursePrefix(upper)] ?? null;
}
