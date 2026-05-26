import type { GradeLetter } from './grades';

export type CourseCode = string;
export type DepartmentCode = string;
export type SemesterSeason = 'Spring' | 'Summer' | 'Fall';
export type GradeInput = GradeLetter | '';
export type GradePointInput = number | string | '';

export interface CourseEntry {
  name: string;
  credits: number;
  grade: GradeInput | string;
  gradePoint?: GradePointInput;
  faculty?: string;
}

export interface SemesterEntry {
  id: number;
  name?: string;
  courses: CourseEntry[];
  running?: boolean;
  summary?: boolean;
  summaryCGPA?: number;
  summaryCredits?: number;
  summaryAttempted?: number;
  summarySemesters?: number;
}

export interface CgpaTotals {
  points: number;
  attemptedCredits: number;
  earnedCredits: number;
  cgpaCredits: number;
  cgpa: number | null;
}

export interface CourseCatalogEntry {
  code: CourseCode;
  name: string;
  credits: number;
}

export type CourseCatalog = Record<CourseCode, CourseCatalogEntry | undefined>;

export interface PrerequisiteRule {
  hp?: readonly CourseCode[];
  sp?: readonly CourseCode[];
}

export type PrerequisiteMap = Record<CourseCode, PrerequisiteRule | undefined>;

export interface PlannedCourse extends CourseCatalogEntry {
  canTake: boolean;
  missingHp: CourseCode[];
  missingSp: CourseCode[];
  hasPrereqData: boolean;
  isRelevant: boolean;
  unlockCount: number;
}

export interface PlanValidation {
  totalCredits: number;
  issues: string[];
  warnings: string[];
}

export interface TranscriptCourse {
  name: string;
  credits: number;
  grade: string;
  gradePoint: number | string;
}

export interface TranscriptSemester {
  id: number;
  name: string;
  courses: TranscriptCourse[];
  running: false;
}

export interface TranscriptParseResult {
  semesters: TranscriptSemester[];
  detectedDept: string | null;
}
