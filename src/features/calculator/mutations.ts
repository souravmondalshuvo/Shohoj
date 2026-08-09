// src/features/calculator/mutations.ts
//
// Phase 5B (React-owned path): pure, immutable transforms on the semester list.
// The container applies one of these, then hands the result to the legacy write
// path (window._shohoj_setSemesters) which persists + recomputes. Each mirrors
// the corresponding legacy mutator in js/ui/render.js but returns a new array
// instead of mutating the shared `state` object, so they are trivially testable.
// Semester *creation* with calendar-aware naming (addSemester) stays separate —
// it needs department data and lives in its own typed helper.

import type { CourseEntry, CourseMarkComponent, SemesterEntry } from '../../core/types';

/** A fresh blank course row, matching the legacy addCourse shape. */
export function blankCourse(): CourseEntry {
  return { name: '', credits: 0, grade: '', faculty: '' };
}

/** Append a blank course to the given semester. */
export function addCourse(semesters: readonly SemesterEntry[], semId: number): SemesterEntry[] {
  return semesters.map((sem) =>
    sem.id === semId ? { ...sem, courses: [...sem.courses, blankCourse()] } : sem,
  );
}

/**
 * Remove a course by index — but never the last one (the legacy UI keeps at
 * least one row per semester). A no-op (returns the same content) otherwise.
 */
export function removeCourse(
  semesters: readonly SemesterEntry[],
  semId: number,
  index: number,
): SemesterEntry[] {
  return semesters.map((sem) => {
    if (sem.id !== semId || sem.courses.length <= 1) return sem;
    return { ...sem, courses: sem.courses.filter((_, i) => i !== index) };
  });
}

/** Patch one course's fields, leaving the rest untouched. */
export function updateCourse(
  semesters: readonly SemesterEntry[],
  semId: number,
  index: number,
  patch: Partial<CourseEntry>,
): SemesterEntry[] {
  return semesters.map((sem) => {
    if (sem.id !== semId) return sem;
    return {
      ...sem,
      courses: sem.courses.map((course, i) => (i === index ? { ...course, ...patch } : course)),
    };
  });
}

/**
 * Set (or clear) a course's tracked mark components (#500).
 *
 * Empty deletes the key rather than storing `[]`: a course nobody tracked must
 * stay byte-identical to what it was before the feature existed, so that
 * clearing the last component leaves no trace in the saved document.
 */
export function setCourseMarks(
  semesters: readonly SemesterEntry[],
  semId: number,
  index: number,
  marks: readonly CourseMarkComponent[],
): SemesterEntry[] {
  return semesters.map((sem) => {
    if (sem.id !== semId) return sem;
    return {
      ...sem,
      courses: sem.courses.map((course, i) => {
        if (i !== index) return course;
        if (marks.length === 0) {
          if (!('marks' in course)) return course;
          const next = { ...course };
          delete next.marks;
          return next;
        }
        return { ...course, marks: marks.map((m) => ({ ...m })) };
      }),
    };
  });
}

/** Remove an entire semester by id. */
export function removeSemester(semesters: readonly SemesterEntry[], id: number): SemesterEntry[] {
  return semesters.filter((sem) => sem.id !== id);
}

/**
 * Move the semester `srcId` to the position of `tgtId`. Mirrors the legacy drag
 * drop: no-op if either is missing, src === tgt, or the target is the summary
 * block (which stays pinned).
 */
export function reorderSemesters(
  semesters: readonly SemesterEntry[],
  srcId: number,
  tgtId: number,
): SemesterEntry[] {
  if (srcId === tgtId) return [...semesters];
  const srcIdx = semesters.findIndex((s) => s.id === srcId);
  const tgtIdx = semesters.findIndex((s) => s.id === tgtId);
  if (srcIdx < 0 || tgtIdx < 0) return [...semesters];
  if (semesters[tgtIdx].summary) return [...semesters];

  const next = [...semesters];
  const [moved] = next.splice(srcIdx, 1);
  next.splice(tgtIdx, 0, moved);
  return next;
}
