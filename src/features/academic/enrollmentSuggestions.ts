// src/features/academic/enrollmentSuggestions.ts
//
// The read-only bridge from Shohoj's existing academic state to Shohoj Tasks
// (#712).
//
// The rule this exists to honour is "do not duplicate academic data between
// Shohoj modules". The calculator owns semesters, courses, grades and CGPA, in
// `shohoj_cgpa_v1` and its Firestore mirror. Tasks needs enrolments. Copying
// the calculator's data into enrolment records would mean two sources of truth
// for the same courses, diverging from the first edit.
//
// So this PROJECTS rather than copies: given the state the calculator already
// holds, it derives *candidate* enrolments for a student to confirm. Nothing
// here writes anything — not to the calculator's state, not to the API. The
// caller decides what to do with the suggestions.
//
// WHY CONFIRMATION, AND NOT AUTOMATIC CREATION
//
// The calculator's semester list is a working document, not a record of fact.
// It holds planned semesters, and its course rows change while a student
// experiments with a CGPA simulation — that is what the simulator is for.
// Materialising enrolments from it silently would attach tasks to semesters
// somebody was only trying out, and the student would have no idea where those
// enrolments came from.
//
// It is the same Detect → Suggest → Confirm → Create rule the Tasks brief sets
// for Gmail, applied to Shohoj's own data, for the same reason: the system
// guessing is fine, the system acting on its guess is not.
//
// Pure — no React, no storage, no network, no clock.

import type { CourseEntry, SemesterEntry } from '../../core/types.ts';
import type { EnrollmentSource } from '../../platform/api/academic.ts';

/** BRACU-style course codes, as the calculator stores them in `CourseEntry.name`. */
const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;

/**
 * One course the student could enrol, with everything known about it.
 *
 * `semesterLabel` is whatever the calculator called the semester — free text,
 * often "Fall 2026" but just as often "Semester 3" or blank. It is carried so
 * the UI can show the student which of their semesters a suggestion came from,
 * NOT so it can be parsed into a term: guessing a term from a label is how a
 * course lands in the wrong semester, and the student picking one is both
 * cheaper and correct.
 */
export interface EnrollmentSuggestion {
  readonly courseCode: string;
  /** Local id of the calculator semester it came from. */
  readonly sourceSemesterId: number;
  readonly semesterLabel: string;
  /** Faculty initials the student already recorded against the course, if any. */
  readonly facultyInitials: string | null;
  /** Section from the routine builder's picks, when one matches. */
  readonly section: string | null;
  /** True when the calculator marks this semester as the one in progress. */
  readonly running: boolean;
  /** Where Shohoj would record this enrolment as having come from. */
  readonly source: EnrollmentSource;
}

/** Faculty initials as reviews and the routine already spell them. */
const INITIALS_RE = /^[A-Z]{2,8}$/;

function cleanCourseCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase().replace(/\s+/g, '');
  return COURSE_CODE_RE.test(code) ? code : null;
}

function cleanInitials(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const initials = value.trim().toUpperCase();
  return INITIALS_RE.test(initials) ? initials : null;
}

/**
 * A course row is worth suggesting when it names a real-looking course.
 *
 * A row with no recognisable code is a placeholder the student has not filled
 * in — the calculator allows those, and they are common in a planned semester.
 * Suggesting one would put an unnamed enrolment in front of somebody to
 * confirm, which is worse than leaving it out.
 */
function suggestionFor(
  course: CourseEntry,
  semester: SemesterEntry,
  sectionPicks: Readonly<Record<string, string | null>>,
): EnrollmentSuggestion | null {
  const courseCode = cleanCourseCode(course.name);
  if (courseCode === null) return null;

  const section = sectionPicks[courseCode] ?? null;
  return {
    courseCode,
    sourceSemesterId: semester.id,
    semesterLabel: typeof semester.name === 'string' ? semester.name : '',
    facultyInitials: cleanInitials(course.faculty),
    section,
    running: semester.running === true,
    // A course that also appears in the routine builder's picks came from the
    // student's own CONNECT schedule, which is a stronger claim than the
    // calculator's free-text row; recording which one it was is what lets a
    // later reconciliation tell a derived enrolment from one they typed.
    source: section === null ? 'CALCULATOR' : 'ROUTINE',
  };
}

export interface SuggestionOptions {
  /**
   * Course code → section, from the routine builder's picks. Optional; without
   * it, suggestions simply carry no section and the student can add one.
   */
  readonly sectionPicks?: Readonly<Record<string, string | null>>;
  /**
   * Course codes already enrolled, which are skipped. Pass the codes for the
   * semester being filled — suggesting a course the student has already added
   * is noise, and confirming it twice would be confusing even though the API
   * is idempotent.
   */
  readonly alreadyEnrolled?: readonly string[];
}

/**
 * Candidate enrolments from the calculator's stored semesters.
 *
 * Summary semesters are skipped: they are a single aggregate row standing in
 * for terms a student did not enter course by course, so they carry no courses
 * to enrol. Duplicates across semesters are kept — the same course in two
 * semesters is a retake, and that is exactly the case the enrolment model
 * exists to represent.
 */
export function suggestEnrollments(
  semesters: readonly SemesterEntry[],
  options: SuggestionOptions = {},
): EnrollmentSuggestion[] {
  const picks = options.sectionPicks ?? {};
  const skip = new Set((options.alreadyEnrolled ?? []).map((code) => code.toUpperCase()));

  const out: EnrollmentSuggestion[] = [];
  for (const semester of semesters) {
    if (semester.summary === true) continue;
    if (!Array.isArray(semester.courses)) continue;
    for (const course of semester.courses) {
      const suggestion = suggestionFor(course, semester, picks);
      if (suggestion === null) continue;
      if (skip.has(suggestion.courseCode)) continue;
      out.push(suggestion);
    }
  }
  return out;
}

/**
 * The suggestions for the semester the calculator says is in progress.
 *
 * The common case by far: a student opening Tasks for the first time wants
 * this term's courses, not every course they have ever taken. Returns an empty
 * list when no semester is marked running, rather than falling back to the most
 * recent — "which semester am I in" is a question the student answers, and a
 * wrong guess here attaches their tasks to a finished term.
 */
export function suggestRunningEnrollments(
  semesters: readonly SemesterEntry[],
  options: SuggestionOptions = {},
): EnrollmentSuggestion[] {
  return suggestEnrollments(semesters, options).filter((suggestion) => suggestion.running);
}
