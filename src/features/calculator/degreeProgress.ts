// src/features/calculator/degreeProgress.ts
//
// Pure degree-progress model for the shell dashboard (#315), mirroring
// renderDegreeTracker + estimateSummaryCompletedSemesters in js/ui/tracker.js
// exactly: visibility rules, per-semester earned credits, the summary-block
// semester estimation, the credit pace, remaining-semester and graduation
// estimates, projected nodes (max 4 shown, then "+N more") and the
// graduation-complete state. The clock is injected; presentation (colors,
// node markup) stays in the component.
//
// #503 adds the honest half of the timeline. `gradEstimate` is still the single
// likely-case date from the flat average, and the projected nodes still follow
// it; alongside it `gradRange` reports the earliest and latest that the
// student's own spread of semester loads supports, and `paceAssumed` marks the
// case where there is not enough history to say anything and DEFAULT_PACE is
// doing the work. See observedPace for the method and why it is not a
// confidence interval.

import { calcSemesterGpa } from '../../core/gpa.ts';
import { countSemesters, stripTags } from '../../core/helpers.ts';
import type { SemesterEntry, SemesterSeason } from '../../core/types.ts';
import { UNIVERSITIES } from '../../core/university.ts';
import type { GradeScale } from '../../core/university.ts';
import type { DepartmentInfo } from './departments.ts';

const GLOBAL_ORDER: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];
const DEFAULT_PACE = 12;

export interface ProgressInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: string;
  readonly startYear: string;
  /** Campus grading scale. Defaults to BRACU's. */
  readonly scale?: GradeScale;
}

export interface TrackerNode {
  readonly id: number;
  readonly label: string;
  readonly gpa: number | null;
  readonly credits: number;
  readonly courseCount: number;
  readonly running: boolean;
}

/** The spread of graduation dates the student's own pace supports (#503). */
export interface GraduationRange {
  /** Fastest observed credit load per semester, after trimming. */
  readonly fastPace: number;
  /** Slowest observed credit load per semester, after trimming. */
  readonly slowPace: number;
  readonly earliestSems: number;
  readonly latestSems: number;
  /** "Fall '27" style. */
  readonly earliest: string;
  readonly latest: string;
}

export interface DegreeProgress {
  readonly earned: number;
  readonly totalRequired: number;
  readonly progressPct: number;
  readonly creditsRemaining: number;
  readonly totalCompletedCount: number;
  readonly avgCredits: number;
  readonly semsRemaining: number;
  /** "Fall '27" style, or '—' without a start semester. The likely case, from
   * `avgCredits` — unchanged, and what the projected nodes follow. */
  readonly gradEstimate: string;
  /** Earliest/latest the observed pace supports, or null when the history is
   * too thin (see `paceAssumed`) or nothing is left to take. */
  readonly gradRange: GraduationRange | null;
  /** True when the pace behind `gradEstimate` is an assumption rather than the
   * student's own history — fewer than two semesters with credits cleared.
   * The component must say so rather than print a confident date. */
  readonly paceAssumed: boolean;
  /** How many completed semesters informed the pace. */
  readonly paceObservations: number;
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

/** Walk `sems` semesters forward from the start on a department calendar and
 * label where you land — "Fall '27", or '—' without a start semester. */
function semesterLabelAfter(
  startSeason: string,
  startYear: number,
  deptSeasons: readonly string[],
  sems: number,
): string {
  if (!startSeason || !startYear) return '—';
  let si = deptSeasons.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = startYear;
  for (let i = 0; i < sems - 1; i++) {
    si++;
    if (si >= deptSeasons.length) {
      si = 0;
      yr++;
    }
  }
  return `${deptSeasons[si]} '${String(yr).slice(2)}`;
}

/**
 * The credible spread of per-semester credit loads, or null when the history is
 * too thin to support one (#503).
 *
 * Method, deliberately simple enough to explain in a sentence: take the credit
 * load of every completed semester, drop the single slowest and single fastest
 * once there are four or more, and use the min and max of what is left. With
 * 4–8 data points a statistical confidence interval would be false rigour; a
 * trimmed observed range is defensible and a student can check it by eye.
 *
 * Zero-credit semesters are excluded from the *rate* — a term where nothing was
 * cleared says nothing about how fast credits get cleared, and a zero would
 * make the slow end divide by zero. They still count toward
 * `totalCompletedCount`, so a burned term is not erased from the timeline.
 *
 * Only real, entered semesters count. A summary block carries credits over an
 * *estimated* semester count (estimateSummarySemesters), and treating an
 * estimate as an observation is exactly the overconfidence this replaces.
 */
export function observedPace(
  completedSems: readonly Pick<TrackerNode, 'credits'>[],
): { readonly fast: number; readonly slow: number } | null {
  const loads = completedSems
    .map((s) => s.credits)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (loads.length < 2) return null;

  const trimmed = loads.length >= 4 ? loads.slice(1, -1) : loads;
  return { fast: trimmed[trimmed.length - 1], slow: trimmed[0] };
}

/** Earned credits within one semester, by the tracker's rules: running
 * semesters count every credited named course; completed ones only graded,
 * passing, non-P/I/F(NT) courses. */
function semesterCredits(
  semester: SemesterEntry,
  scale: GradeScale = UNIVERSITIES.bracu.grades,
): number {
  return semester.courses.reduce((sum, c) => {
    if (!c.name.trim() || !c.credits) return sum;
    if (semester.running) return sum + c.credits;
    if (!c.grade || c.grade === 'P' || c.grade === 'I' || c.grade === 'F(NT)') return sum;
    const gp = Object.prototype.hasOwnProperty.call(scale.points, c.grade)
      ? scale.points[c.grade as keyof typeof scale.points]
      : undefined;
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
  const scale = inputs.scale ?? UNIVERSITIES.bracu.grades;

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
          Object.prototype.hasOwnProperty.call(scale.points, c.grade),
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
      credits: semesterCredits(sem, scale),
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
  const semsAlreadyUsed = totalCompletedCount + (runningSem ? 1 : 0);
  const estimateAfter = (sems: number): string =>
    semesterLabelAfter(inputs.startSeason, startYearNum, deptSeasons, semsAlreadyUsed + sems);
  const gradEstimate = estimateAfter(semsRemaining);

  // ── Graduation range (#503) ───────────────────────────────────────────────
  const paceObservations = completedSems.filter((s) => s.credits > 0).length;
  const pace = observedPace(completedSems);
  const gradRange =
    pace && creditsRemaining > 0
      ? (() => {
          const earliestSems = Math.ceil(creditsRemaining / pace.fast);
          const latestSems = Math.ceil(creditsRemaining / pace.slow);
          return {
            fastPace: pace.fast,
            slowPace: pace.slow,
            earliestSems,
            latestSems,
            earliest: estimateAfter(earliestSems),
            latest: estimateAfter(latestSems),
          };
        })()
      : null;

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
    gradRange,
    paceAssumed: paceObservations < 2,
    paceObservations,
    summaryNode: summaryBlock
      ? { cgpa: summaryBlock.summaryCGPA ?? 0, credits: summaryBlock.summaryCredits ?? 0 }
      : null,
    semesters: semData,
    projectedLabels,
    projectedMore,
    graduation,
  };
}
