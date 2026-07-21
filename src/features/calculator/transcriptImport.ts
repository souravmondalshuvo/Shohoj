// src/features/calculator/transcriptImport.ts
//
// Pure transcript-import model for the shell /calculator route (#323): the
// orchestration half of js/ui/modals.js importTranscriptPDF + applyImport,
// with the environment injected. Given the flattened PDF text it runs the
// typed line parser with the legacy blob-fallback rule, cleans courses up
// against the catalogue (injected lookup, catalogue-boundary precedent),
// detects the student identity, and summarises the result for the confirm
// dialog. `importedCalculatorState` is applyImport's state mapping: sequential
// ids, detected-dept label → department code, start season/year from the first
// semester name (season only when the department's calendar offers it — the
// legacy DOM assignment silently no-ops otherwise).
//
// Deferred (documented): applyImport's identity → Profile snapshot write
// (persistAcademicProfile) — the profile feature is unmigrated. Identity is
// still detected and returned so the confirm flow matches.

import {
  detectStudentIdentity,
  parseBlobFallback,
  parseTranscriptText,
} from '../../core/transcript.ts';
import type {
  StudentIdentity,
  TranscriptParseResult,
  TranscriptSemester,
} from '../../core/types.ts';
import type { CalculatorState } from './calculatorState.ts';
import { DEPARTMENT_LIST, deptSeasonsFor } from './departments.ts';

/** Catalogue lookup: canonical display name + official credits for a code. */
export type CourseLookup = (code: string) => { full: string; credits: number } | null;

export interface TranscriptImportSummary {
  readonly semesterCount: number;
  readonly courseCount: number;
  /** Per-semester graded counts, aligned with `semesters` (the dialog table). */
  readonly gradedPerSemester: readonly number[];
}

export interface ParsedTranscript {
  readonly semesters: readonly TranscriptSemester[];
  readonly detectedDept: string | null;
  readonly identity: StudentIdentity;
  readonly summary: TranscriptImportSummary;
}

const CODE_SUFFIX_RE = /\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/;
const CODE_PREFIX_RE = /^([A-Z]{2,4}\d{3}[A-Z]?)\b/;

function totalCourses(result: TranscriptParseResult): number {
  return result.semesters.reduce((sum, semester) => sum + semester.courses.length, 0);
}

/** The legacy "graded" display rule for the confirm dialog. */
function gradedCount(semester: TranscriptSemester): number {
  return semester.courses.filter(
    (c) => c.grade && c.grade !== 'P' && c.grade !== 'I' && c.credits > 0,
  ).length;
}

/**
 * Parse flattened transcript text the way importTranscriptPDF does: the line
 * parser first, the blob fallback when the line parser found semesters but
 * under 2 courses per semester on average AND the blob pass finds more, then
 * catalogue cleanup (canonical name + credit fill; the F(NT) 3-credit default
 * for 100+ level codes the catalogue does not know).
 */
export function parseTranscriptForImport(
  fullText: string,
  lookupCourse: CourseLookup,
): ParsedTranscript {
  let parsed = parseTranscriptText(fullText);

  const lineTotal = totalCourses(parsed);
  const semesterCount = parsed.semesters.length;
  if (semesterCount > 0 && lineTotal < semesterCount * 2) {
    const blobParsed = parseBlobFallback(fullText);
    if (blobParsed.semesters.length > 0 && totalCourses(blobParsed) > lineTotal) {
      parsed = blobParsed;
    }
  }

  for (const semester of parsed.semesters) {
    for (const course of semester.courses) {
      const codeMatch = course.name.match(CODE_SUFFIX_RE) || course.name.match(CODE_PREFIX_RE);
      const code = codeMatch ? codeMatch[1] : null;
      if (!code) continue;

      const catalogued = lookupCourse(code);
      if (catalogued) {
        course.name = catalogued.full;
        if (!course.credits && catalogued.credits) course.credits = catalogued.credits;
      } else if (course.grade === 'F(NT)' && !course.credits) {
        const level = Number.parseInt(code.replace(/^[A-Z]+/, ''), 10);
        if (level >= 100) course.credits = 3;
      }
    }
  }

  return {
    semesters: parsed.semesters,
    detectedDept: parsed.detectedDept,
    identity: detectStudentIdentity(fullText),
    summary: {
      semesterCount: parsed.semesters.length,
      courseCount: totalCourses(parsed),
      gradedPerSemester: parsed.semesters.map(gradedCount),
    },
  };
}

/**
 * applyImport's state mapping: the parsed transcript replaces the calculator
 * state. Sequential ids, course-field defaults, the detected department label
 * resolved to its code, and start season/year from the first semester name
 * (the season only when the resolved department's calendar offers it).
 */
export function importedCalculatorState(parsed: ParsedTranscript): CalculatorState {
  const currentDept =
    (parsed.detectedDept &&
      DEPARTMENT_LIST.find((dept) => dept.label === parsed.detectedDept)?.code) ||
    '';

  const semesters = parsed.semesters.map((semester, index) => ({
    id: index + 1,
    name: semester.name,
    running: false,
    courses: semester.courses.map((course) => ({
      name: course.name || '',
      credits: course.credits || 0,
      grade: course.grade || '',
      gradePoint: course.gradePoint !== undefined ? course.gradePoint : '',
    })),
  }));

  // Legacy applyImport reads season/year as the first two words of the first
  // semester's name and assigns them independently: the season only when the
  // (dept-scoped) dropdown offers it, the year whenever it is four digits.
  let startSeason = '';
  let startYear = '';
  if (semesters[0]) {
    const [season = '', year = ''] = semesters[0].name.split(' ');
    const seasons = deptSeasonsFor(currentDept) as readonly string[];
    if (seasons.includes(season)) startSeason = season;
    if (/^\d{4}$/.test(year)) startYear = year;
  }

  // Legacy applyImport calls resetPlanner(): an import invalidates the plan
  // (planned courses may now be completed), so it always comes back empty.
  return { semesters, startSeason, startYear, currentDept, planCourses: [] };
}
