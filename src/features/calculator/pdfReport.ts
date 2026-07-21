// src/features/calculator/pdfReport.ts
//
// Pure model for the CGPA report PDF (#325): everything js/ui/modals.js
// exportPDF computes before drawing, from CalculatorState + an injected
// clock. Totals reuse the retake-aware core (`calculateCgpaTotals`, running
// excluded — the export never counts running semesters), the standing strings
// keep the legacy cutoffs, and the semester count adds the tracker's
// summary-covered estimate exactly like exportPDF (hasSummary-gated,
// completedSemCount 0). Sections mirror the document walk: the summary card,
// then per-semester tables with cleaned names, GP displays (F(NT) → '0.00'),
// grade badges, Retaken/No Transfer/Pass/Fail notes and the per-semester
// footer math. Presentation (RGB values, layout, pagination) lives in the
// drawing layer.

import {
  calculateCgpaTotals,
  gpaCoreCalcSemesterGpa,
  gpaCoreGetRetakenKeys,
} from '../../core/gpa.ts';
import { GRADES } from '../../core/grades.ts';
import { stripTags } from '../../core/helpers.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import type { CalculatorState } from './calculatorState.ts';
import { estimateSummarySemesters } from './degreeProgress.ts';
import { deptSeasonsFor, getDepartment } from './departments.ts';
import { formatCredits } from './results.ts';

/** Colour tier for the big CGPA figure (exportPDF's cgpaCol chain). */
export type CgpaTier = 'green' | 'green-dark' | 'amber' | 'red';
/** Colour tier for semester GPA pills/backgrounds (gpaColor/gpaBg). */
export type GpaTier = 'good' | 'mid' | 'low';

export interface PdfReportRow {
  /** Display name, '---' when empty, truncated at 68 chars with '...'. */
  readonly name: string;
  readonly creditsDisplay: string;
  /** '0.00' for F(NT), the grade point to 2dp, or '--'. */
  readonly gpDisplay: string;
  /** Badge text; '' renders no badge. */
  readonly grade: string;
  readonly note: '' | 'Retaken' | 'No Transfer' | 'Pass' | 'Fail';
  readonly retaken: boolean;
}

export interface PdfSummarySection {
  readonly kind: 'summary';
  readonly cgpaDisplay: string;
  readonly earnedDisplay: string;
  readonly attemptedDisplay: string;
}

export interface PdfSemesterSection {
  readonly kind: 'semester';
  /** stripTags'd, ordinal piped (' | 2nd Semester'), '[Running]' suffixed. */
  readonly name: string;
  readonly gpaDisplay: string | null;
  readonly gpaTier: GpaTier | null;
  readonly rows: readonly PdfReportRow[];
  /** 'Credits Attempted: … · Credits Earned: … · Semester GPA: …'; null when no GPA. */
  readonly footer: string | null;
}

export interface PdfReport {
  readonly deptLabel: string;
  readonly cgpaDisplay: string | null;
  readonly cgpaTier: CgpaTier | null;
  readonly stats: {
    readonly attempted: string;
    readonly earned: string;
    readonly semesters: string;
    readonly standing: string;
    readonly standingTier: GpaTier;
  };
  readonly sections: readonly (PdfSummarySection | PdfSemesterSection)[];
  /** '03 Jul 2026, 7:45 PM' — the legacy footer date format. */
  readonly dateDisplay: string;
  readonly filename: string;
}

function standingLabel(cgpa: number | null): string {
  if (cgpa === null) return '---';
  if (cgpa >= 3.97) return 'Perfect';
  if (cgpa >= 3.65) return 'Higher Distinction';
  if (cgpa >= 3.5) return 'Distinction';
  if (cgpa >= 3.0) return 'Good Standing';
  if (cgpa >= 2.5) return 'Satisfactory';
  if (cgpa >= 2.0) return 'Needs Improvement';
  return 'Probation';
}

function gpaTier(gpa: number | null): GpaTier {
  // Legacy compares possibly-null cgpa directly (null >= 3.0 is false → red).
  if (gpa !== null && gpa >= 3.0) return 'good';
  if (gpa !== null && gpa >= 2.5) return 'mid';
  return 'low';
}

function cgpaTier(cgpa: number): CgpaTier {
  return cgpa >= 3.5 ? 'green' : cgpa >= 3.0 ? 'green-dark' : cgpa >= 2.5 ? 'amber' : 'red';
}

function courseRow(course: SemesterEntry['courses'][number], retaken: boolean): PdfReportRow {
  const rawName = course.name || '---';
  const name = rawName.length > 68 ? `${rawName.slice(0, 65)}...` : rawName;

  const gp = GRADES[course.grade as keyof typeof GRADES];
  const gpDisplay =
    course.grade === 'F(NT)' ? '0.00' : gp !== undefined && gp !== null ? gp.toFixed(2) : '--';

  const note = retaken
    ? 'Retaken'
    : course.grade === 'F(NT)'
      ? 'No Transfer'
      : course.grade === 'P'
        ? 'Pass'
        : course.grade === 'F'
          ? 'Fail'
          : '';

  return {
    name,
    creditsDisplay:
      course.credits !== undefined && course.credits !== null ? String(course.credits) : '--',
    gpDisplay,
    grade: course.grade || '',
    note,
    retaken,
  };
}

function semesterFooter(semester: SemesterEntry, gpa: number): string {
  const attempted = semester.courses.reduce((sum, c) => {
    if (!c.name.trim() || !c.credits) return sum;
    if (c.grade === 'P' || c.grade === 'I') return sum;
    return sum + c.credits;
  }, 0);
  const failed = semester.courses.reduce((sum, c) => {
    if (!c.name.trim() || !c.credits) return sum;
    const gp = GRADES[c.grade as keyof typeof GRADES];
    if (gp === undefined || gp === null) return sum;
    return gp === 0 ? sum + c.credits : sum;
  }, 0);
  const earned = attempted - failed;
  return `Credits Attempted: ${formatCredits(attempted)}   ·   Credits Earned: ${formatCredits(earned)}   ·   Semester GPA: ${gpa.toFixed(2)}`;
}

/** Build the full report exportPDF draws, from state + an injected clock. */
export function buildPdfReport(state: CalculatorState, now: Date): PdfReport {
  const totals = calculateCgpaTotals(state.semesters, {
    includeRunning: false,
    includeSummary: true,
    startSeason: state.startSeason as SemesterSeason | '',
    startYear: state.startYear,
  });
  const retakenKeys = gpaCoreGetRetakenKeys(state.semesters, {
    startSeason: state.startSeason as SemesterSeason | '',
    startYear: state.startYear,
  });

  const summaryBlock = state.semesters.find((sem) => sem.summary);
  const deptSeasons = deptSeasonsFor(state.currentDept);
  const semCount =
    state.semesters.filter((s) => !s.running && !s.summary).length +
    (summaryBlock
      ? estimateSummarySemesters(
          {
            semesters: state.semesters,
            startSeason: state.startSeason,
            startYear: state.startYear,
          },
          deptSeasons,
          0,
          now,
        )
      : 0);

  const sections = state.semesters.map((sem): PdfSummarySection | PdfSemesterSection => {
    if (sem.summary) {
      return {
        kind: 'summary',
        cgpaDisplay: (sem.summaryCGPA ?? 0).toFixed(2),
        earnedDisplay: formatCredits(sem.summaryCredits ?? 0),
        attemptedDisplay: formatCredits(sem.summaryAttempted || sem.summaryCredits || 0),
      };
    }
    const gpa = gpaCoreCalcSemesterGpa(sem);
    const name =
      stripTags(sem.name ?? '').replace(/\s*\((\d+(?:st|nd|rd|th)) Semester\)/i, ' | $1 Semester') +
      (sem.running ? ' [Running]' : '');
    return {
      kind: 'semester',
      name,
      gpaDisplay: gpa !== null ? gpa.toFixed(2) : null,
      gpaTier: gpa !== null ? gpaTier(gpa) : null,
      rows: sem.courses
        .map((course, index) => ({ course, index }))
        .filter(({ course }) => course.name.trim() || course.grade)
        .map(({ course, index }) => courseRow(course, retakenKeys.has(`${sem.id}-${index}`))),
      footer: gpa !== null ? semesterFooter(sem, gpa) : null,
    };
  });

  const dept = getDepartment(state.currentDept);
  const dateStr =
    now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' +
    now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return {
    deptLabel: dept ? dept.label : 'BRAC University',
    cgpaDisplay: totals.cgpa !== null ? totals.cgpa.toFixed(2) : null,
    cgpaTier: totals.cgpa !== null ? cgpaTier(totals.cgpa) : null,
    stats: {
      attempted: formatCredits(totals.attemptedCredits),
      earned: formatCredits(totals.earnedCredits),
      semesters: String(semCount),
      standing: standingLabel(totals.cgpa),
      standingTier: gpaTier(totals.cgpa),
    },
    sections,
    dateDisplay: dateStr,
    filename: 'BRACU_CGPA_Report_Shohoj.pdf',
  };
}
