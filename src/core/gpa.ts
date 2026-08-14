import type { GradeLetter } from './grades.ts';
import type { CgpaTotals, CourseEntry, SemesterEntry, SemesterSeason } from './types.ts';
import { UNIVERSITIES } from './university.ts';
import type {
  GradeScale,
  RepeatEligibility,
  RetakePolicy,
  UniversityProfile,
} from './university.ts';

const GPA_SEASON_ORDER = ['Spring', 'Summer', 'Fall'] as const;

// Every campus-specific rule below defaults to BRACU's. The live app and the
// legacy js/core twin both call these with no profile, and
// tests/typedCoreParity.test.js compares the two — so the zero-argument
// behaviour of this module must stay exactly what it was before tenancy.
const DEFAULT = UNIVERSITIES.bracu;

export interface RetakePolicyOptions {
  bestGrade?: boolean;
  startSeason?: SemesterSeason | '';
  startYear?: number | string | '';
  /** Campus grading scale. Defaults to BRACU's. */
  scale?: GradeScale;
  /** Campus retake rule. Defaults to BRACU's start-term-gated policy. */
  retake?: RetakePolicy;
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

function isGradeLetter(grade: string, scale: GradeScale): grade is GradeLetter {
  return Object.prototype.hasOwnProperty.call(scale.points, grade);
}

function gradePointFor(grade: string, scale: GradeScale = DEFAULT.grades): number | null | undefined {
  return isGradeLetter(grade, scale) ? scale.points[grade] : undefined;
}

// The 'P' / 'I' / 'F(NT)' branches below are BRACU letters and are left exactly
// as they were: they are inert on a campus that does not award them, and
// parity with js/core matters more here than tidying a redundant check.
function gpaCoreCalcSemesterGpaImpl(
  semester: Pick<SemesterEntry, 'courses'>,
  scale: GradeScale = DEFAULT.grades,
): number | null {
  let points = 0;
  let credits = 0;

  for (const course of semester.courses) {
    const gp = gradePointFor(course.grade, scale);
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

function gpaCoreUsesBestGradePolicyImpl(options: RetakePolicyOptions = {}): boolean {
  const policy = options.retake ?? DEFAULT.retake;
  if (policy.kind === 'best') return true;
  if (policy.kind === 'latest') return false;

  // 'best-before': the student's START term decides, not the retake's. The
  // defaults below are what the pre-tenancy implementation assumed when a start
  // term was missing, and they must stay — an unknown start term resolved to
  // Fall 2024, which is on the 'latest' side of BRACU's own cutoff.
  const season = options.startSeason || 'Fall';
  const year =
    typeof options.startYear === 'number'
      ? options.startYear
      : Number.parseInt(options.startYear || '2024', 10);

  if (!season || Number.isNaN(year)) return false;

  if (year < policy.cutoff.year) return true;
  if (year > policy.cutoff.year) return false;

  // Same year as the cutoff: compare seasons. An unrecognised season is not
  // ordered against the cutoff at all, and falls to 'latest' exactly as the
  // original chain of equality checks did.
  const seasonIndex = GPA_SEASON_ORDER.indexOf(season as SemesterSeason);
  const cutoffIndex = GPA_SEASON_ORDER.indexOf(policy.cutoff.season);
  if (seasonIndex < 0 || cutoffIndex < 0) return false;
  return seasonIndex < cutoffIndex;
}

export function getCourseCode(courseName: string): string | null {
  const match = courseName.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
  return match ? match[1] : null;
}

export function getCourseIdentity(courseName: string): string {
  const code = getCourseCode(courseName);
  if (code) return code;
  return courseName
    .replace(/\s*\([^)]+\)$/, '')
    .trim()
    .toLowerCase();
}

function gpaCoreGetRetakenKeysImpl(
  semesters: readonly SemesterEntry[],
  options: RetakePolicyOptions = {},
): Set<string> {
  const scale = options.scale ?? DEFAULT.grades;
  const bestGrade =
    typeof options.bestGrade === 'boolean'
      ? options.bestGrade
      : gpaCoreUsesBestGradePolicyImpl(options);

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
      // A withdrawal is not an outcome, so it neither supersedes an earlier
      // attempt nor is superseded by a later one. Leaving it in the group would
      // let the latest-attempt policy below (slice(0, -1)) drop a real grade in
      // favour of a W, which is how a student's passing grade would vanish.
      if (course.grade === 'W') return;
      const gp =
        course.grade && course.grade !== 'F(NT)' ? (gradePointFor(course.grade, scale) ?? -1) : -1;
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
  const scale = options.scale ?? DEFAULT.grades;
  const retakenKeys = gpaCoreGetRetakenKeysImpl(semesters, options);

  let points = 0;
  let attemptedCredits = 0;
  let earnedCredits = 0;
  let cgpaCredits = 0;

  if (includeSummary) {
    const summaryBlock = semesters.find((semester) => semester.summary);
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
      const gp = gradePointFor(course.grade, scale);
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

// Takes the whole profile rather than its creditLoad, deliberately. A campus
// with no confirmed limits has `creditLoad: undefined`, and a default parameter
// fires on undefined — so passing those absent rules directly would silently
// fall back to BRACU's numbers, which is the exact failure this is meant to
// prevent. Passing the profile keeps "no limits published" distinguishable from
// "no profile given".
function gpaCoreGetSemesterCreditWarningImpl(
  semester: Pick<SemesterEntry, 'courses'>,
  profile: UniversityProfile = DEFAULT,
): SemesterCreditWarning | null {
  const rules = profile.creditLoad;
  if (!rules) return null;

  const total = semester.courses.reduce((sum, course) => {
    if (!course.name.trim() || !course.credits) return sum;
    if (course.grade === 'P' || course.grade === 'F(NT)') return sum;
    return sum + course.credits;
  }, 0);

  if (total === 0) return null;
  if (total < rules.min)
    return { type: 'error', msg: `\u26a0 ${total} credits \u2014 below ${rules.min}-credit minimum` };
  if (total > rules.max)
    return { type: 'error', msg: `\u26d4 ${total} credits \u2014 exceeds ${rules.max}-credit maximum` };
  if (total > rules.warnAbove)
    return { type: 'warn', msg: `\u26a0 ${total} credits \u2014 requires chairman's permission` };
  return null;
}

function gpaCoreIsRepeatEligibleImpl(
  grade: string,
  scale: GradeScale = DEFAULT.grades,
  eligibility: RepeatEligibility = DEFAULT.repeat,
): boolean {
  if (grade === 'F' || grade === 'F(NT)') return false;
  if (grade === 'P' || grade === 'I' || !grade) return false;

  const gp = gradePointFor(grade, scale);
  if (gp === undefined || gp === null) return false;
  // BRACU repeats strictly below the threshold; NSU's "B or lower" includes a
  // grade sitting exactly on it.
  return eligibility.inclusive ? gp <= eligibility.threshold : gp < eligibility.threshold;
}

function gpaCoreGetImprovementStrategyImpl(
  grade: string,
  scale: GradeScale = DEFAULT.grades,
  eligibility: RepeatEligibility = DEFAULT.repeat,
): ImprovementStrategy {
  if (grade === 'F' || grade === 'F(NT)') return 'retake';
  if (gpaCoreIsRepeatEligibleImpl(grade, scale, eligibility)) return 'repeat';
  return null;
}

function gpaCoreNormalizeGradePointImpl(raw: string, mode: 'input' | 'blur'): string {
  const trimmed = raw.trim();
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;
  if (trimmed.includes('.')) return trimmed;
  if (/^[0-4]\d$/.test(trimmed)) return `${trimmed[0]}.${trimmed[1]}`;
  if (mode === 'blur' && /^[0-4]$/.test(trimmed)) return `${trimmed}.0`;
  return trimmed;
}

function gpaCoreClampGradePointImpl(
  value: string,
  scale: GradeScale = DEFAULT.grades,
): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return value;
  // toFixed(1) rather than String(): a 4.0 ceiling must render as "4.0", which
  // is what the field showed before the scale became configurable.
  if (n > scale.max) return scale.max.toFixed(1);
  if (n < 0) return '0.0';
  return value;
}

export const gpaCoreCalcSemesterGpa = gpaCoreCalcSemesterGpaImpl;
export const gpaCoreUsesBestGradePolicy = gpaCoreUsesBestGradePolicyImpl;
export const gpaCoreGetRetakenKeys = gpaCoreGetRetakenKeysImpl;
export const gpaCoreGetSemesterCreditWarning = gpaCoreGetSemesterCreditWarningImpl;
export const gpaCoreIsRepeatEligible = gpaCoreIsRepeatEligibleImpl;
export const gpaCoreGetImprovementStrategy = gpaCoreGetImprovementStrategyImpl;
export const gpaCoreNormalizeGradePoint = gpaCoreNormalizeGradePointImpl;
export const gpaCoreClampGradePoint = gpaCoreClampGradePointImpl;

export {
  gpaCoreCalcSemesterGpaImpl as calcSemesterGpa,
  gpaCoreUsesBestGradePolicyImpl as usesBestGradePolicy,
  gpaCoreGetRetakenKeysImpl as getRetakenKeys,
  gpaCoreGetSemesterCreditWarningImpl as getSemesterCreditWarning,
  gpaCoreIsRepeatEligibleImpl as isRepeatEligible,
  gpaCoreGetImprovementStrategyImpl as getImprovementStrategy,
  gpaCoreNormalizeGradePointImpl as normalizeGradePoint,
  gpaCoreClampGradePointImpl as clampGradePoint,
};
