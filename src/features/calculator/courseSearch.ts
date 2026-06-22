// src/features/calculator/courseSearch.ts
//
// Phase 5B: typed port of the course-autocomplete matching in js/ui/suggestions.js.
// Pure over the catalog list (which stays in vanilla JS and is handed to the
// island via window._shohoj_courseCatalog). The React CourseNameInput renders
// the results; blur uses resolveExactCourse to snap a typed-in value to a real
// catalog course, exactly like the legacy onCourseBlur.

export interface CourseSuggestion {
  readonly code: string;
  readonly name: string;
  /** Display name shown in the input once picked (legacy `full`). */
  readonly full: string;
  readonly credits: number;
}

const MAX_SUGGESTIONS = 8;

/**
 * Ranked matches for a query, mirroring the t1–t4 tiers in suggestions.js:
 * exact code, then code-prefix, then code-substring, then name-substring —
 * de-duplicated across tiers and capped at 8. Empty query → no matches.
 */
export function searchCourses(
  query: string,
  courses: readonly CourseSuggestion[],
): CourseSuggestion[] {
  const raw = query.trim();
  const val = raw.toLowerCase();
  if (!val) return [];

  const exact = courses.find((c) => c.code.toUpperCase() === raw.toUpperCase());
  const t1 = exact ? [exact] : [];
  const t2 = courses.filter((c) => c !== exact && c.code.toLowerCase().startsWith(val));
  const t3 = courses.filter(
    (c) => c !== exact && !t2.includes(c) && c.code.toLowerCase().includes(val),
  );
  const t4 = courses.filter(
    (c) =>
      c !== exact &&
      !t2.includes(c) &&
      !t3.includes(c) &&
      c.name.toLowerCase().includes(val),
  );

  return [...t1, ...t2, ...t3, ...t4].slice(0, MAX_SUGGESTIONS);
}

/**
 * Resolve a typed-in value to a catalog course on blur: an exact code match, or
 * a full-name / name match (case-insensitive). Null when nothing matches (the
 * caller then keeps the free-text name with zero credits). Mirrors onCourseBlur.
 */
export function resolveExactCourse(
  value: string,
  courses: readonly CourseSuggestion[],
): CourseSuggestion | null {
  const val = value.trim();
  if (!val) return null;
  const byCode = courses.find((c) => c.code.toUpperCase() === val.toUpperCase());
  if (byCode) return byCode;
  const lower = val.toLowerCase();
  return (
    courses.find((c) => c.full.toLowerCase() === lower || c.name.toLowerCase() === lower) ?? null
  );
}
