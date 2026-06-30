// src/features/calculator/courseSelection.ts
//
// Phase 5C: the pure course-identity invariants for catalogue selection, lifted
// out of the CalculatorSemesters JSX so they are one tested place instead of
// scattered UI conditionals. Each function returns a Partial<CourseEntry> patch
// the caller hands to `updateCourse` — it never touches React/DOM/state.
//
// Invariants (mirrors the legacy onCourseBlur in js/ui/suggestions.js):
//   • A recognised catalogue selection sets the canonical name + official credits.
//   • When course IDENTITY changes, grade + gradePoint are cleared — they belonged
//     to the previous course and must not carry over.
//   • When identity is UNCHANGED (re-picking the same course), valid grade data is
//     preserved.
//   • Unknown / cleared free text never inherits the previous course's credits
//     (credits reset to 0), and clearing identity also clears the grade.

import type { CourseEntry } from '../../core/types.ts';
import type { CourseSuggestion } from './courseSearch.ts';

/** Grade/grade-point fields wiped when a course's identity changes. */
const CLEARED_ON_IDENTITY_CHANGE: Pick<CourseEntry, 'grade' | 'gradePoint'> = {
  grade: '',
  gradePoint: '',
};

/**
 * Patch for picking a suggestion from the autocomplete. Always a new identity
 * (the canonical full name + official credits), so grade data is always cleared.
 */
export function coursePickPatch(course: CourseSuggestion): Partial<CourseEntry> {
  return {
    name: course.full,
    credits: course.credits,
    ...CLEARED_ON_IDENTITY_CHANGE,
  };
}

/**
 * Patch for resolving the field on blur. `course` is the catalogue match (or null
 * for free text); `text` is the raw typed value. Resolves to canonical name +
 * official credits for a match, else the trimmed free text with zero credits
 * (never the previous course's credits). Grade data is cleared only when the
 * resulting identity differs from `prevName`.
 */
export function courseResolvePatch(
  prevName: string,
  course: CourseSuggestion | null,
  text: string,
): Partial<CourseEntry> {
  const name = course ? course.full : text.trim();
  const credits = course ? course.credits : 0;
  const identityChanged = (prevName ?? '') !== name;
  return {
    name,
    credits,
    ...(identityChanged ? CLEARED_ON_IDENTITY_CHANGE : {}),
  };
}
