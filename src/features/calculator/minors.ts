// src/features/calculator/minors.ts
//
// Minor programs (#731) — the second thing a BRACU student's academic record
// can be measured against, and the first one the department table cannot
// express.
//
// A major is a number: `DEPARTMENTS[code].totalCredits`, and the degree tracker
// asks only "how many of those 136 have you earned". A minor is a *structure*:
// named requirements, some satisfiable by one of several courses, plus an
// elective pool specified by pattern rather than enumeration. So this is its
// own table and its own engine (minorProgress.ts) rather than another field on
// DepartmentInfo.
//
// Unlike the catalogue and the department table, the data is authored HERE in
// TypeScript rather than in js/core/*.js. Those two live in legacy JS because
// build3.py ships them into the production bundle; minors are a shell-only
// feature, so a legacy copy would be a duplicate with no reader. If the legacy
// bundle ever grows a minor tracker, move the table down to js/core the way
// departments.ts does and adapt it through a .d.ts boundary.
//
// Pure module-level data: built once on import, never mutated, no React/DOM.

import { createLogger } from '../../platform/observability/logger.ts';

const logger = createLogger({ base: { module: 'calculator.minors' } });

/**
 * "Any MAT 3XX or MAT 4XX level course" — the published form of an elective
 * pool, kept declarative rather than as a RegExp so it stays comparable,
 * loggable and testable as data.
 *
 * `levels` are the leading digits of the course number: `[3, 4]` matches MAT301
 * through MAT499 and nothing else.
 */
export interface CoursePattern {
  readonly subject: string;
  readonly levels: readonly number[];
}

/** One numbered line of a minor's core list. */
export interface MinorRequirement {
  readonly id: string;
  /** As printed on the course guide, e.g. "Principles of Mathematics". */
  readonly title: string;
  /**
   * The course codes that satisfy this requirement. More than one means the
   * published requirement offers alternatives ("MAT 223 … or CSE 330") — any
   * ONE of them discharges it, and the first one the student passed is the one
   * reported.
   */
  readonly codes: readonly string[];
  readonly credits: number;
}

/** A human-readable line of the elective menu, for display only. */
export interface MinorElectiveOption {
  readonly label: string;
}

/**
 * The elective half of a minor: a credit target, plus what may count toward it.
 * A course counts if its code is in `codes` or matches one of `patterns` — and
 * is not already spent on a core requirement (see minorProgress.ts).
 */
export interface MinorElectives {
  readonly credits: number;
  readonly codes: readonly string[];
  readonly patterns: readonly CoursePattern[];
  /** The menu as printed, so the UI can show the published wording. */
  readonly options: readonly MinorElectiveOption[];
}

export interface MinorProgram {
  /** Stable selection key, persisted in the academic state. */
  readonly code: string;
  /** Full program label, e.g. "Minor in Mathematics". */
  readonly label: string;
  /** Short label for chips and headings, e.g. "Mathematics". */
  readonly shortLabel: string;
  /** The offering department, as printed on the course guide. */
  readonly department: string;
  readonly totalCredits: number;
  readonly core: readonly MinorRequirement[];
  readonly electives: MinorElectives;
  /**
   * Where these requirements came from, shown in the UI. Minor requirements are
   * hand-transcribed from departmental material rather than pulled from a feed,
   * so a student checking an edge case needs to know what to go and verify
   * against — the same reason the semester archive labels hand-imported
   * captures.
   */
  readonly source: string;
}

const MATHEMATICS: MinorProgram = {
  code: 'MATH',
  label: 'Minor in Mathematics',
  shortLabel: 'Mathematics',
  department: 'Department of Mathematics and Physical Sciences',
  totalCredits: 27,
  core: [
    { id: 'mat111', title: 'Principles of Mathematics', codes: ['MAT111'], credits: 3 },
    { id: 'mat123', title: 'Calculus I', codes: ['MAT123'], credits: 3 },
    { id: 'mat221', title: 'Real Analysis I', codes: ['MAT221'], credits: 3 },
    { id: 'mat222', title: 'Differential Equations I', codes: ['MAT222'], credits: 3 },
    // The one published alternative: "MAT 223: Numerical Analysis I or CSE 330".
    { id: 'mat223', title: 'Numerical Analysis I', codes: ['MAT223', 'CSE330'], credits: 3 },
    { id: 'mat311', title: 'Abstract Algebra', codes: ['MAT311'], credits: 3 },
    { id: 'mat316', title: 'Operations Research I', codes: ['MAT316'], credits: 3 },
  ],
  electives: {
    credits: 6,
    // CSE490 is listed as a bare code alongside CSE490C because the guide names
    // the *topic* ("Special Topics (Quantum Computing)") while the catalogue
    // letters the offerings — a transcript may carry either spelling, and only
    // the quantum-computing topic is listed, so the other CSE490x letters are
    // deliberately absent rather than swept in by a CSE490 prefix match.
    codes: ['STA301', 'CSE402', 'CSE490', 'CSE490C'],
    patterns: [{ subject: 'MAT', levels: [3, 4] }],
    options: [
      { label: 'Any MAT 3XX or MAT 4XX level course listed on the website' },
      { label: 'STA 301: Modern Probability Theory & Stochastic Processes' },
      { label: 'CSE 402: Optimization' },
      { label: 'CSE 490: Special Topics (Quantum Computing)' },
    ],
  },
  source: 'Course Guide for Math Minor Students — Department of Mathematics and Physical Sciences',
};

/**
 * Validate one authored program. Defensive in the same spirit as the catalogue
 * and department adapters: a malformed entry is dropped with a warning so the
 * section degrades to the valid subset rather than taking the route down. These
 * are authored constants, so a rejection is a bug in this file, and the log is
 * how it gets noticed.
 */
function validate(program: MinorProgram): MinorProgram | null {
  if (!program.code || !program.label || program.totalCredits <= 0) return null;
  if (program.core.length === 0) return null;
  if (program.core.some((r) => r.codes.length === 0 || r.credits <= 0)) return null;
  const coreCredits = program.core.reduce((sum, r) => sum + r.credits, 0);
  // The published total is the contract the progress bar is drawn against; a
  // core+elective sum that disagrees with it would show a student a bar that
  // can never fill (or fills early), so the entry is rejected instead.
  if (coreCredits + program.electives.credits !== program.totalCredits) return null;
  return Object.freeze({
    ...program,
    core: Object.freeze(program.core.map((r) => Object.freeze({ ...r }))),
    electives: Object.freeze({ ...program.electives }),
  });
}

function buildPrograms(authored: readonly MinorProgram[]): readonly MinorProgram[] {
  const out: MinorProgram[] = [];
  let skipped = 0;
  for (const program of authored) {
    const valid = validate(program);
    if (valid) out.push(valid);
    else skipped += 1;
  }
  if (skipped > 0) {
    logger.warn('calculator.minors.skipped_malformed_entries', {
      skipped,
      total: authored.length,
    });
  }
  return Object.freeze(out);
}

/** The frozen, validated minor table, in authored order. */
export const MINOR_PROGRAMS: readonly MinorProgram[] = buildPrograms([MATHEMATICS]);

const BY_CODE: ReadonlyMap<string, MinorProgram> = new Map(MINOR_PROGRAMS.map((m) => [m.code, m]));

/** Program for a code, or null for unknown/empty codes. */
export function getMinorProgram(code: string): MinorProgram | null {
  return (
    BY_CODE.get(
      String(code ?? '')
        .trim()
        .toUpperCase(),
    ) ?? null
  );
}

/** Whether a course code falls inside an elective pattern, e.g. MAT 3XX/4XX. */
export function matchesPattern(code: string, pattern: CoursePattern): boolean {
  const parsed = /^([A-Z]{2,4})(\d)\d{2}[A-Z]?$/.exec(
    String(code ?? '')
      .trim()
      .toUpperCase(),
  );
  if (!parsed) return false;
  const [, subject, level] = parsed;
  if (subject !== pattern.subject.toUpperCase()) return false;
  return pattern.levels.includes(Number(level));
}

/** Whether a course code may count toward a minor's elective credits. */
export function isElectiveCode(code: string, electives: MinorElectives): boolean {
  const upper = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!upper) return false;
  if (electives.codes.includes(upper)) return true;
  return electives.patterns.some((p) => matchesPattern(upper, p));
}
