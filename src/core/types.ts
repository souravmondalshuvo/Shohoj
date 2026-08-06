import type { GradeLetter } from './grades.ts';

export type CourseCode = string;
export type DepartmentCode = string;
export type SemesterSeason = 'Spring' | 'Summer' | 'Fall';
export type GradeInput = GradeLetter | '';
export type GradePointInput = number | string | '';

/**
 * One graded component of a running course — a midterm, a quiz set (#500).
 *
 * The persisted shape lives in core rather than beside the marks model: core
 * owns what goes on disk and into the cloud document, and a feature module
 * owning the storage contract would invert the layering.
 *
 * `weight` is the component's share of the final course mark, in percent.
 * `score`/`outOf` are raw marks as received ("18 out of 25"). A null `score`
 * means not graded yet, which is not the same as zero.
 */
export interface CourseMarkComponent {
  name: string;
  weight: number;
  score: number | null;
  outOf: number;
}

export interface CourseEntry {
  name: string;
  credits: number;
  grade: GradeInput | string;
  gradePoint?: GradePointInput;
  faculty?: string;
  /** Only on running-semester courses the student is tracking (#500). */
  marks?: CourseMarkComponent[];
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

/**
 * Student identity scraped from a BRACU grade sheet's header (Student ID + Name).
 * Both are best-effort: a layout the regexes don't recognise yields null rather
 * than a wrong guess. Sourced only from the student's own user-initiated import.
 */
export interface StudentIdentity {
  studentId: string | null;
  studentName: string | null;
}
