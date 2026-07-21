import { GRADES } from './grades';
import { getCourseCode } from './gpa';
import type {
  CourseCatalog,
  CourseCatalogEntry,
  CourseCode,
  PlannedCourse,
  PlanValidation,
  PrerequisiteMap,
  SemesterEntry,
} from './types';

export type PlannerFilterMode = 'all' | 'unlocked' | 'locked';

export interface PlannerEngineInput {
  semesters: readonly SemesterEntry[];
  allCourses: readonly CourseCatalogEntry[];
  courseCatalog: CourseCatalog;
  prerequisites: PrerequisiteMap;
  planCourses: readonly CourseCode[];
  currentDept?: string;
  retakenKeys?: ReadonlySet<string>;
}

export interface AvailableCourseOptions {
  searchQuery?: string;
  filterMode?: PlannerFilterMode;
  limit?: number;
}

export interface PrereqCheck {
  canTake: boolean;
  missingHp: CourseCode[];
  missingSp: CourseCode[];
  hasData: boolean;
}

export interface PrereqTreeNode {
  code: CourseCode;
  name: string;
  completed: boolean;
  isSoft?: boolean;
  children: PrereqTreeNode[];
}

export interface CgpaProjection {
  current: number | null;
  projected: number | null;
  delta: number | null;
}

const DEPT_PREFIXES: Record<string, readonly string[]> = {
  CSE: ['CSE'],
  CS: ['CSE'],
  EEE: ['EEE'],
  ECE: ['ECE'],
  BBA: ['ACT', 'BUS', 'FIN', 'MGT', 'MKT', 'MSC', 'MIS'],
  ECO: ['ECO'],
  ENG: ['ENG'],
  ANT: ['ANT', 'SOC'],
  PHY: ['PHY'],
  APE: ['APE', 'PHY'],
  MAT: ['MAT'],
  MIC: ['MIC', 'BCH', 'BIO'],
  BIO: ['BTE', 'BIO', 'BCH', 'MIC'],
  ARC: ['ARC'],
  PHR: ['PHB', 'PHR'],
  LAW: ['LAW'],
};

const COMMON_PREFIXES = [
  'MAT',
  'PHY',
  'ENG',
  'BNG',
  'EMB',
  'HUM',
  'STA',
  'ECO',
  'CST',
  'DEV',
  'ENV',
  'HST',
  'POL',
  'PSY',
  'SOC',
  'GEO',
] as const;

function plannerCoreGetCompletedCodesImpl(
  semesters: readonly SemesterEntry[],
  retakenKeys: ReadonlySet<string> = new Set(),
): Set<CourseCode> {
  const completed = new Set<CourseCode>();

  for (const semester of semesters) {
    if (semester.summary) continue;

    semester.courses.forEach((course, index) => {
      if (!course.name.trim() || !course.grade) return;
      if (course.grade === 'F' || course.grade === 'F(NT)' || course.grade === 'I') return;
      if (retakenKeys.has(`${semester.id}-${index}`)) return;

      const code = getCourseCode(course.name);
      if (code) completed.add(code);
    });
  }

  return completed;
}

function plannerCoreGetInProgressCodesImpl(semesters: readonly SemesterEntry[]): Set<CourseCode> {
  const codes = new Set<CourseCode>();

  for (const semester of semesters) {
    if (!semester.running) continue;

    for (const course of semester.courses) {
      if (!course.name.trim()) continue;
      const code = getCourseCode(course.name);
      if (code) codes.add(code);
    }
  }

  return codes;
}

function plannerCoreGetScheduledCodesImpl(semesters: readonly SemesterEntry[]): Set<CourseCode> {
  const codes = new Set<CourseCode>();

  for (const semester of semesters) {
    if (semester.summary || semester.running) continue;

    for (const course of semester.courses) {
      if (!course.name.trim() || course.grade) continue;
      const code = getCourseCode(course.name);
      if (code) codes.add(code);
    }
  }

  return codes;
}

function plannerCoreCheckPrereqsImpl(
  code: CourseCode,
  completed: ReadonlySet<CourseCode>,
  prerequisites: PrerequisiteMap,
): PrereqCheck {
  const prereq = prerequisites[code];
  if (!prereq) return { canTake: true, missingHp: [], missingSp: [], hasData: false };

  const missingHp = (prereq.hp ?? []).filter((item) => !completed.has(item));
  const missingSp = (prereq.sp ?? []).filter((item) => !completed.has(item));

  return {
    canTake: missingHp.length === 0,
    missingHp,
    missingSp,
    hasData: true,
  };
}

function plannerCoreBuildUnlockCountMapImpl(
  prerequisites: PrerequisiteMap,
): Record<CourseCode, number> {
  const counts: Record<CourseCode, number> = Object.create(null);

  for (const code of Object.keys(prerequisites)) {
    const prereq = prerequisites[code] ?? {};
    for (const requirement of [...(prereq.hp ?? []), ...(prereq.sp ?? [])]) {
      counts[requirement] = (counts[requirement] ?? 0) + 1;
    }
  }

  return counts;
}

function plannerCoreIsRelevantToDeptImpl(code: CourseCode, deptCode?: string): boolean {
  if (!deptCode) return true;

  const prefix = code.replace(/\d.*/, '');
  const relevantPrefixes = DEPT_PREFIXES[deptCode] ?? [];

  if (relevantPrefixes.includes(prefix)) return true;
  if ((COMMON_PREFIXES as readonly string[]).includes(prefix)) return true;

  return false;
}

function plannerCoreGetAvailableCoursesImpl(
  input: PlannerEngineInput,
  options: AvailableCourseOptions = {},
): PlannedCourse[] {
  const completed = plannerCoreGetCompletedCodesImpl(input.semesters, input.retakenKeys);
  const inProgress = plannerCoreGetInProgressCodesImpl(input.semesters);
  const scheduled = plannerCoreGetScheduledCodesImpl(input.semesters);
  const unlockCounts = plannerCoreBuildUnlockCountMapImpl(input.prerequisites);
  const planSet = new Set(input.planCourses);

  let results: PlannedCourse[] = [];

  for (const course of input.allCourses) {
    if (completed.has(course.code)) continue;
    if (inProgress.has(course.code)) continue;
    if (scheduled.has(course.code)) continue;
    if (planSet.has(course.code)) continue;
    if (course.credits === 0) continue;

    const check = plannerCoreCheckPrereqsImpl(course.code, completed, input.prerequisites);

    results.push({
      ...course,
      canTake: check.canTake,
      missingHp: check.missingHp,
      missingSp: check.missingSp,
      hasPrereqData: check.hasData,
      isRelevant: plannerCoreIsRelevantToDeptImpl(course.code, input.currentDept),
      unlockCount: unlockCounts[course.code] ?? 0,
    });
  }

  results.sort((a, b) => {
    if (a.isRelevant !== b.isRelevant) return a.isRelevant ? -1 : 1;
    if (a.canTake !== b.canTake) return a.canTake ? -1 : 1;
    if (a.unlockCount !== b.unlockCount) return b.unlockCount - a.unlockCount;

    const aNumber = Number.parseInt(a.code.replace(/^[A-Z]+/, ''), 10);
    const bNumber = Number.parseInt(b.code.replace(/^[A-Z]+/, ''), 10);
    return aNumber - bNumber;
  });

  const query = options.searchQuery?.trim().toLowerCase();
  if (query) {
    results = results.filter(
      (course) =>
        course.code.toLowerCase().includes(query) || course.name.toLowerCase().includes(query),
    );
  }

  if (options.filterMode === 'unlocked') {
    results = results.filter((course) => course.canTake);
  } else if (options.filterMode === 'locked') {
    results = results.filter((course) => !course.canTake);
  }

  return typeof options.limit === 'number' ? results.slice(0, options.limit) : results;
}

function plannerCoreValidatePlanImpl(input: PlannerEngineInput): PlanValidation {
  const completed = plannerCoreGetCompletedCodesImpl(input.semesters, input.retakenKeys);
  const scheduled = plannerCoreGetScheduledCodesImpl(input.semesters);
  const inProgress = plannerCoreGetInProgressCodesImpl(input.semesters);

  const totalCredits = input.planCourses.reduce((sum, code) => {
    const course = input.courseCatalog[code];
    return sum + (course ? course.credits : 0);
  }, 0);

  const issues: string[] = [];
  const warnings: string[] = [];

  if (totalCredits > 0 && totalCredits < 9) {
    issues.push(`${totalCredits} credits \u2014 below 9-credit minimum`);
  }
  if (totalCredits > 15) {
    issues.push(`${totalCredits} credits \u2014 exceeds 15-credit maximum`);
  }
  if (totalCredits > 12 && totalCredits <= 15) {
    warnings.push(`${totalCredits} credits \u2014 requires chairman\u2019s permission`);
  }

  for (const code of input.planCourses) {
    const check = plannerCoreCheckPrereqsImpl(code, completed, input.prerequisites);
    if (!check.canTake) {
      issues.push(
        `${code} \u2014 missing prerequisite${check.missingHp.length > 1 ? 's' : ''}: ${check.missingHp.join(', ')}`,
      );
    }
    if (check.missingSp.length > 0) {
      warnings.push(`${code} \u2014 recommended: ${check.missingSp.join(', ')}`);
    }
  }

  for (const code of input.planCourses) {
    if (completed.has(code)) {
      warnings.push(`${code} \u2014 you\u2019ve already passed this course`);
    } else if (inProgress.has(code)) {
      warnings.push(`${code} \u2014 already in your running semester`);
    } else if (scheduled.has(code)) {
      warnings.push(`${code} \u2014 already scheduled in another semester`);
    }
  }

  return { totalCredits, issues, warnings };
}

function plannerCoreGetPrereqChainImpl(
  code: CourseCode,
  completed: ReadonlySet<CourseCode>,
  courseCatalog: CourseCatalog,
  prerequisites: PrerequisiteMap,
  depth = 0,
): PrereqTreeNode | null {
  if (depth > 8) return null;

  const prereq = prerequisites[code];
  const node: PrereqTreeNode = {
    code,
    name: courseCatalog[code]?.name ?? code,
    completed: completed.has(code),
    children: [],
  };

  if (!prereq) return node;

  const allPrereqs = [...(prereq.hp ?? []), ...(prereq.sp ?? [])];
  for (const item of allPrereqs) {
    const child = plannerCoreGetPrereqChainImpl(
      item,
      completed,
      courseCatalog,
      prerequisites,
      depth + 1,
    );
    if (!child) continue;
    child.isSoft = (prereq.sp ?? []).includes(item);
    node.children.push(child);
  }

  return node;
}

function plannerCoreProjectCgpaImpl(
  currentPoints: number,
  currentCredits: number,
  plannedCredits: number,
  assumedGrade: string,
): CgpaProjection {
  const gradePoint = Object.prototype.hasOwnProperty.call(GRADES, assumedGrade)
    ? GRADES[assumedGrade as keyof typeof GRADES]
    : undefined;

  const current = currentCredits > 0 ? currentPoints / currentCredits : null;
  if (gradePoint === undefined || gradePoint === null) {
    return { current, projected: null, delta: null };
  }

  const newPoints = currentPoints + plannedCredits * gradePoint;
  const newCredits = currentCredits + plannedCredits;
  const projected = newCredits > 0 ? newPoints / newCredits : null;

  return {
    current,
    projected,
    delta: current !== null && projected !== null ? projected - current : null,
  };
}

export const plannerCoreGetCompletedCodes = plannerCoreGetCompletedCodesImpl;
export const plannerCoreCheckPrereqs = plannerCoreCheckPrereqsImpl;
export const plannerCoreGetAvailableCourses = plannerCoreGetAvailableCoursesImpl;
export const plannerCoreValidatePlan = plannerCoreValidatePlanImpl;
export const plannerCoreGetPrereqChain = plannerCoreGetPrereqChainImpl;
export const plannerCoreProjectCgpa = plannerCoreProjectCgpaImpl;

export {
  plannerCoreGetCompletedCodesImpl as getCompletedCodes,
  plannerCoreGetInProgressCodesImpl as getInProgressCodes,
  plannerCoreGetScheduledCodesImpl as getScheduledCodes,
  plannerCoreCheckPrereqsImpl as checkPrereqs,
  plannerCoreBuildUnlockCountMapImpl as buildUnlockCountMap,
  plannerCoreIsRelevantToDeptImpl as isRelevantToDept,
  plannerCoreGetAvailableCoursesImpl as getAvailableCourses,
  plannerCoreValidatePlanImpl as validatePlan,
  plannerCoreGetPrereqChainImpl as getPrereqChain,
  plannerCoreProjectCgpaImpl as projectCgpa,
};
