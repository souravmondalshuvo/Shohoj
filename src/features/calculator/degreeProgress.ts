// src/features/calculator/degreeProgress.ts
//
// Pure degree-progress model for the shell dashboard (#315), mirroring
// renderDegreeTracker + estimateSummaryCompletedSemesters in js/ui/tracker.js
// exactly: visibility rules, per-semester earned credits, the summary-block
// semester estimation, the credit pace, remaining-semester and graduation
// estimates, projected nodes (max 4 shown, then "+N more") and the
// graduation-complete state. The clock is injected; presentation (colors,
// node markup) stays in the component.

import { calcSemesterGpa } from '../../core/gpa.ts';
import { GRADES } from '../../core/grades.ts';
import { countSemesters, stripTags } from '../../core/helpers.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import type { DepartmentInfo } from './departments.ts';

const GLOBAL_ORDER: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];
const DEFAULT_PACE = 12;

export interface ProgressInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: string;
  readonly startYear: string;
}

export interface TrackerNode {
  readonly id: number;
  readonly label: string;
  readonly gpa: number | null;
  readonly credits: number;
  readonly courseCount: number;
  readonly running: boolean;
}

export interface DegreeProgress {
  readonly earned: number;
  readonly totalRequired: number;
  readonly progressPct: number;
  readonly creditsRemaining: number;
  readonly totalCompletedCount: number;
  readonly avgCredits: number;
  readonly semsRemaining: number;
  /** "Fall '27" style, or '—' without a start semester. */
  readonly gradEstimate: string;
  readonly summaryNode: { readonly cgpa: number; readonly credits: number } | null;
  readonly semesters: readonly TrackerNode[];
  readonly projectedLabels: readonly string[];
  readonly projectedMore: number;
  /** The trailing 🎓 node; null when neither projected nor complete. */
  readonly graduation: { readonly complete: boolean; readonly estimate: string } | null;
}

/** The most recently finished semester relative to `now` on a dept calendar.
 * Mirrors getLastCompletedSemester (src/core/helpers.ts) with the clock
 * injected instead of ambient. */
function lastCompletedSemesterAt(
  now: Date,
  seasons: readonly string[],
): { season: string; year: number } {
  const month = now.getMonth() + 1;
  const curSeason: SemesterSeason = month <= 4 ? 'Spring' : month <= 8 ? 'Summer' : 'Fall';
  const curYear = now.getFullYear();
  const curGlobalIdx = GLOBAL_ORDER.indexOf(curSeason);

  const offeredBeforeCurrent = seasons.filter(
    (season) => (GLOBAL_ORDER as readonly string[]).indexOf(season) < curGlobalIdx,
  );
  if (offeredBeforeCurrent.length > 0) {
    return { season: offeredBeforeCurrent[offeredBeforeCurrent.length - 1], year: curYear };
  }
  return { season: seasons[seasons.length - 1], year: curYear - 1 };
}

/** How many summary-covered semesters elapsed from the start to the last
 * real-world completed semester, beyond the explicitly-entered ones.
 * Mirrors estimateSummaryCompletedSemesters in tracker.js. Exported for the
 * PDF report (#325), which calls it exactly like the legacy exportPDF —
 * gated on a summary block existing, with completedSemCount 0. */
export function estimateSummarySemesters(
  inputs: ProgressInputs,
  deptSeasons: readonly string[],
  completedSemCount: number,
  now: Date,
): number {
  const startYearNum = parseInt(inputs.startYear, 10);
  if (!inputs.startSeason || !startYearNum) return 0;

  const lastCompleted = lastCompletedSemesterAt(now, deptSeasons);
  const startSeasonIdx = deptSeasons.indexOf(inputs.startSeason);
  const lastCompletedIdx = deptSeasons.indexOf(lastCompleted.season);
  if (startSeasonIdx === -1 || lastCompletedIdx === -1) return 0;

  const startPos = startYearNum * deptSeasons.length + startSeasonIdx;
  const endPos = lastCompleted.year * deptSeasons.length + lastCompletedIdx;
  if (startPos > endPos) return 0;

  const totalCompleted = countSemesters(
    inputs.startSeason,
    startYearNum,
    lastCompleted.season,
    lastCompleted.year,
    deptSeasons,
  );
  return Math.max(0, totalCompleted - completedSemCount);
}

/** Earned credits within one semester, by the tracker's rules: running
 * semesters count every credited named course; completed ones only graded,
 * passing, non-P/I/F(NT) courses. */
function semesterCredits(semester: SemesterEntry): number {
  return semester.courses.reduce((sum, c) => {
    if (!c.name.trim() || !c.credits) return sum;
    if (semester.running) return sum + c.credits;
    if (!c.grade || c.grade === 'P' || c.grade === 'I' || c.grade === 'F(NT)') return sum;
    const gp = GRADES[c.grade as keyof typeof GRADES];
    if (gp === undefined || gp === null || gp <= 0) return sum;
    return sum + c.credits;
  }, 0);
}

export function computeDegreeProgress(
  inputs: ProgressInputs,
  dept: DepartmentInfo | null,
  earned: number,
  now: Date,
): DegreeProgress | null {
  const totalRequired = dept ? dept.totalCredits : 0;
  const deptSeasons: readonly string[] = dept ? dept.seasons : GLOBAL_ORDER;

  const summaryBlock = inputs.semesters.find((s) => s.summary);
  const gradedSemesters = inputs.semesters.filter(
    (sem) =>
      !sem.running &&
      !sem.summary &&
      sem.courses.some(
        (c) =>
          c.name.trim() &&
          c.grade &&
          c.grade !== 'W' &&
          GRADES[c.grade as keyof typeof GRADES] !== undefined,
      ),
  );
  if ((!gradedSemesters.length && !summaryBlock) || !totalRequired) return null;

  const semData: TrackerNode[] = [];
  for (const sem of inputs.semesters) {
    if (sem.summary) continue;
    if (!sem.courses.some((c) => c.name.trim())) continue;
    semData.push({
      id: sem.id,
      label: sem.name ? stripTags(sem.name).replace(/\s*\(.*\)$/, '') : 'Semester',
      gpa: calcSemesterGpa(sem),
      credits: semesterCredits(sem),
      courseCount: sem.courses.filter((c) => c.name.trim()).length,
      running: !!sem.running,
    });
  }
  if (!semData.length && !summaryBlock) return null;

  const completedSems = semData.filter((s) => !s.running);
  const runningSem = semData.find((s) => s.running);
  const creditsRemaining = Math.max(0, totalRequired - earned);

  const estimatedSummarySems = summaryBlock
    ? estimateSummarySemesters(inputs, deptSeasons, completedSems.length, now)
    : 0;
  const totalCompletedCount = completedSems.length + estimatedSummarySems;

  const totalCompletedCredits =
    completedSems.reduce((s, d) => s + d.credits, 0) +
    (summaryBlock ? (summaryBlock.summaryCredits ?? 0) : 0);
  const avgCredits =
    totalCompletedCount > 0 ? totalCompletedCredits / totalCompletedCount : DEFAULT_PACE;
  const semsRemaining = avgCredits > 0 ? Math.ceil(creditsRemaining / avgCredits) : 0;

  const startYearNum = parseInt(inputs.startYear, 10);
  let gradEstimate = '—';
  if (inputs.startSeason && startYearNum) {
    const totalSemsNeeded = totalCompletedCount + (runningSem ? 1 : 0) + semsRemaining;
    let si = deptSeasons.indexOf(inputs.startSeason);
    if (si === -1) si = 0;
    let yr = startYearNum;
    for (let i = 0; i < totalSemsNeeded - 1; i++) {
      si++;
      if (si >= deptSeasons.length) {
        si = 0;
        yr++;
      }
    }
    gradEstimate = `${deptSeasons[si]} '${String(yr).slice(2)}`;
  }

  // ── Projected nodes (tracker.js parity, incl. its fallbacks) ───────────────
  const projectedLabels: string[] = [];
  let projectedMore = 0;
  let graduation: DegreeProgress['graduation'] = null;

  if (semsRemaining > 0) {
    const maxShow = Math.min(semsRemaining, 4);
    projectedMore = semsRemaining - maxShow;

    const lastLabel =
      semData.length > 0 ? semData[semData.length - 1].label : summaryBlock ? 'Past Semesters' : '';
    let nextSi = -1;
    let nextYr = 0;
    const seasonMatch = lastLabel.match(/(Spring|Summer|Fall)\s*'?(\d{2,4})/);
    if (seasonMatch) {
      nextYr =
        seasonMatch[2].length === 2
          ? 2000 + parseInt(seasonMatch[2], 10)
          : parseInt(seasonMatch[2], 10);
      const matchedIdx = deptSeasons.indexOf(seasonMatch[1]);
      if (matchedIdx === -1) {
        nextSi = 0;
        nextYr++;
      } else {
        nextSi = matchedIdx + 1;
        if (nextSi >= deptSeasons.length) {
          nextSi = 0;
          nextYr++;
        }
      }
    } else if (summaryBlock && inputs.startSeason && startYearNum) {
      // No real semesters yet — project from the current real-world semester.
      // (Tracker quirk kept as-is: no year wrap when the season advances.)
      const month = now.getMonth() + 1;
      let season: SemesterSeason = month <= 4 ? 'Spring' : month <= 8 ? 'Summer' : 'Fall';
      if (!deptSeasons.includes(season)) {
        const curIdx = GLOBAL_ORDER.indexOf(season);
        for (let offset = 1; offset <= 3; offset++) {
          const candidate = GLOBAL_ORDER[(curIdx + offset) % 3];
          if (deptSeasons.includes(candidate)) {
            season = candidate;
            break;
          }
        }
      }
      nextSi = deptSeasons.indexOf(season);
      nextYr = now.getFullYear();
    }

    for (let j = 0; j < maxShow; j++) {
      if (nextSi >= 0) {
        projectedLabels.push(`${deptSeasons[nextSi]} '${String(nextYr).slice(2)}`);
        nextSi++;
        if (nextSi >= deptSeasons.length) {
          nextSi = 0;
          nextYr++;
        }
      } else {
        projectedLabels.push(`Semester ${totalCompletedCount + (runningSem ? 1 : 0) + j + 1}`);
      }
    }
    graduation = { complete: false, estimate: gradEstimate };
  } else if (creditsRemaining <= 0) {
    graduation = { complete: true, estimate: gradEstimate };
  }

  return {
    earned,
    totalRequired,
    progressPct: Math.min((earned / totalRequired) * 100, 100),
    creditsRemaining,
    totalCompletedCount,
    avgCredits,
    semsRemaining,
    gradEstimate,
    summaryNode: summaryBlock
      ? { cgpa: summaryBlock.summaryCGPA ?? 0, credits: summaryBlock.summaryCredits ?? 0 }
      : null,
    semesters: semData,
    projectedLabels,
    projectedMore,
    graduation,
  };
}
