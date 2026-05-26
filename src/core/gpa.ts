import { GRADES } from './grades';
import type { GradeLetter } from './grades';
import type { CgpaTotals, CourseEntry, SemesterEntry, SemesterSeason } from './types';

const GPA_SEASON_ORDER = ['Spring', 'Summer', 'Fall'] as const;

export interface RetakePolicyOptions {
  bestGrade?: boolean;
  startSeason?: SemesterSeason | '';
  startYear?: number | string | '';
}

export interface CgpaOptions extends RetakePolicyOptions {
  includeRunning?: boolean;
  includeSummary?: boolean;
}

export type ImprovementStrategy = 'retake' | 'repeat' | null;

export interface SemesterCreditWarning {
  type: 'error' | 'warn';
  msg: string;
}

function isGradeLetter(grade: string): grade is GradeLetter {
  return Object.prototype.hasOwnProperty.call(GRADES, grade);
}

function gradePointFor(grade: string): number | null | undefined {
  return isGradeLetter(grade) ? GRADES[grade] : undefined;
}

export function calcSemesterGpa(semester: Pick<SemesterEntry, 'courses'>): number | null {
  let points = 0;
  let credits = 0;

  for (const course of semester.courses) {
    const gp = gradePointFor(course.grade);
    if (gp === undefined || !course.credits) continue;
    if (course.grade === 'P' || course.grade === 'I') continue;
    if (course.grade === 'F(NT)') {
      credits += course.credits;
      continue;
    }
    if (gp === null) continue;
    points += gp * course.credits;
    credits += course.credits;
  }

  return credits > 0 ? points / credits : null;
}

export function usesBestGradePolicy(options: RetakePolicyOptions = {}): boolean {
  const season = options.startSeason || 'Fall';
  const year = typeof options.startYear === 'number'
    ? options.startYear
    : Number.parseInt(options.startYear || '2024', 10);

  if (!season || Number.isNaN(year)) return false;

  const seasonIndex = GPA_SEASON_ORDER.indexOf(season as SemesterSeason);
  if (year < 2024) return true;
  if (year === 2024 && seasonIndex === 0) return true;
  if (year === 2024 && seasonIndex === 1) return true;
  if (year === 2024 && seasonIndex === 2) return false;
  return false;
}

export function getCourseCode(courseName: string): string | null {
  const match = courseName.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
  return match ? match[1] : null;
}

export function getCourseIdentity(courseName: string): string {
  const code = getCourseCode(courseName);
  if (code) return code;
  return courseName.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase();
}

export function getRetakenKeys(
  semesters: readonly SemesterEntry[],
  options: RetakePolicyOptions = {},
): Set<string> {
  const bestGrade = typeof options.bestGrade === 'boolean'
    ? options.bestGrade
    : usesBestGradePolicy(options);

  const attempts: {
    semId: number;
    index: number;
    key: string;
    groupKey: string;
    gradePoint: number;
  }[] = [];

  for (const semester of semesters) {
    if (semester.running || semester.summary) continue;
    semester.courses.forEach((course: CourseEntry, index: number) => {
      if (!course.name.trim()) return;
      const gp = course.grade && course.grade !== 'F(NT)'
        ? gradePointFor(course.grade) ?? -1
        : -1;
      attempts.push({
        semId: semester.id,
        index,
        key: `${semester.id}-${index}`,
        groupKey: getCourseIdentity(course.name),
        gradePoint: gp,
      });
    });
  }

  const groups = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const group = groups.get(attempt.groupKey) ?? [];
    group.push(attempt);
    groups.set(attempt.groupKey, group);
  }

  const retakenKeys = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    if (bestGrade) {
      const best = group.reduce((a, b) => (a.gradePoint >= b.gradePoint ? a : b));
      for (const attempt of group) {
        if (attempt.key !== best.key) retakenKeys.add(attempt.key);
      }
      continue;
    }

    for (const attempt of group.slice(0, -1)) {
      retakenKeys.add(attempt.key);
    }
  }

  return retakenKeys;
}

export function calculateCgpaTotals(
  semesters: readonly SemesterEntry[],
  options: CgpaOptions = {},
): CgpaTotals {
  const includeRunning = options.includeRunning ?? true;
  const includeSummary = options.includeSummary ?? true;
  const retakenKeys = getRetakenKeys(semesters, options);

  let points = 0;
  let attemptedCredits = 0;
  let earnedCredits = 0;
  let cgpaCredits = 0;

  if (includeSummary) {
    const summaryBlock = semesters.find(semester => semester.summary);
    if (summaryBlock?.summaryCGPA !== undefined && summaryBlock.summaryCredits !== undefined) {
      points += summaryBlock.summaryCGPA * summaryBlock.summaryCredits;
      cgpaCredits += summaryBlock.summaryCredits;
      attemptedCredits += summaryBlock.summaryAttempted ?? summaryBlock.summaryCredits;
      earnedCredits += summaryBlock.summaryCredits;
    }
  }

  for (const semester of semesters) {
    if (semester.summary) continue;
    if (semester.running && !includeRunning) continue;

    semester.courses.forEach((course, index) => {
      const gp = gradePointFor(course.grade);
      if (gp === undefined || !course.credits) return;
      if (course.grade === 'P' || course.grade === 'I') return;

      const isRetaken = retakenKeys.has(`${semester.id}-${index}`);
      if (!semester.running) attemptedCredits += course.credits;

      if (!isRetaken && gp !== null) {
        points += gp * course.credits;
        cgpaCredits += course.credits;
      }

      if (typeof gp === 'number' && gp > 0 && !semester.running && !isRetaken) {
        earnedCredits += course.credits;
      }
    });
  }

  return {
    points,
    attemptedCredits,
    earnedCredits,
    cgpaCredits,
    cgpa: cgpaCredits > 0 ? points / cgpaCredits : null,
  };
}

export function getSemesterCreditWarning(
  semester: Pick<SemesterEntry, 'courses'>,
): SemesterCreditWarning | null {
  const total = semester.courses.reduce((sum, course) => {
    if (!course.name.trim() || !course.credits) return sum;
    if (course.grade === 'P' || course.grade === 'F(NT)') return sum;
    return sum + course.credits;
  }, 0);

  if (total === 0) return null;
  if (total < 9) return { type: 'error', msg: `\u26a0 ${total} credits \u2014 below 9-credit minimum` };
  if (total > 15) return { type: 'error', msg: `\u26d4 ${total} credits \u2014 exceeds 15-credit maximum` };
  if (total > 12) return { type: 'warn', msg: `\u26a0 ${total} credits \u2014 requires chairman's permission` };
  return null;
}

export function isRepeatEligible(grade: string): boolean {
  if (grade === 'F' || grade === 'F(NT)') return false;
  if (grade === 'P' || grade === 'I' || !grade) return false;

  const gp = gradePointFor(grade);
  if (gp === undefined || gp === null) return false;
  return gp < 3.0;
}

export function getImprovementStrategy(grade: string): ImprovementStrategy {
  if (grade === 'F' || grade === 'F(NT)') return 'retake';
  if (isRepeatEligible(grade)) return 'repeat';
  return null;
}

export function normalizeGradePoint(raw: string, mode: 'input' | 'blur'): string {
  const trimmed = raw.trim();
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;
  if (trimmed.includes('.')) return trimmed;
  if (/^[0-4]\d$/.test(trimmed)) return `${trimmed[0]}.${trimmed[1]}`;
  if (mode === 'blur' && /^[0-4]$/.test(trimmed)) return `${trimmed}.0`;
  return trimmed;
}

export function clampGradePoint(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return value;
  if (n > 4.0) return '4.0';
  if (n < 0) return '0.0';
  return value;
}

export const gpaCoreCalcSemesterGpa = calcSemesterGpa;
export const gpaCoreUsesBestGradePolicy = usesBestGradePolicy;
export const gpaCoreGetRetakenKeys = getRetakenKeys;
export const gpaCoreGetSemesterCreditWarning = getSemesterCreditWarning;
export const gpaCoreIsRepeatEligible = isRepeatEligible;
export const gpaCoreGetImprovementStrategy = getImprovementStrategy;
export const gpaCoreNormalizeGradePoint = normalizeGradePoint;
export const gpaCoreClampGradePoint = clampGradePoint;
