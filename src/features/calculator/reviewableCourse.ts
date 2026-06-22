// src/features/calculator/reviewableCourse.ts
//
// Phase 5B: typed port of getReviewableCourseCode from js/ui/render.js. A course
// can be reviewed only if its name yields a catalog course code. The code
// *parse* is pure and lives here; catalog membership is injected as a predicate
// because the bulk catalog DATA stays in vanilla JS (see src/core/catalog.ts).

/**
 * Extract a candidate course code from a course name — "(CSE220)" suffix, a
 * bare "CSE220", or a leading "CSE220 …" — uppercased. Empty string if none.
 * Pure; does not check the catalog. Mirrors the regex chain in render.js.
 */
export function parseReviewableCode(courseName: string | null | undefined): string {
  const raw = String(courseName ?? '').trim();
  if (!raw) return '';
  const match =
    raw.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/i) ||
    raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)$/i) ||
    raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : '';
}

/**
 * The reviewable code for a course name, or '' if the parsed code is not a known
 * catalog course. `isKnownCode` is the catalog membership check (data lives in
 * the vanilla JS catalog, passed in by the caller).
 */
export function getReviewableCourseCode(
  courseName: string | null | undefined,
  isKnownCode: (code: string) => boolean,
): string {
  const code = parseReviewableCode(courseName);
  return code && isKnownCode(code) ? code : '';
}
