// src/features/calculator/courseSearch.ts
//
// Phase 5C: pure, typed, deterministic course-autocomplete search. Ports and
// extends the t1–t4 matching in js/ui/suggestions.js. Pure over the catalog
// list (no React/DOM/window/storage): the React CourseNameInput renders the
// results; blur uses resolveExactCourse to snap a typed value to a real catalog
// course, exactly like the legacy onCourseBlur.
//
// Two layers:
//   • prepareCatalog → an immutable, deduplicated "searchable" view that
//     pre-lowercases each code/title ONCE, so a keystroke search never
//     re-normalises the whole catalogue (the catalogue is ~850 courses).
//   • searchCoursesRanked → ranks a prepared view against a query with a fixed,
//     locale-independent ordering. searchCourses is the thin, backward-compatible
//     wrapper (prepare + search → bare suggestions) used by simple callers/tests.

export interface CourseSuggestion {
  readonly code: string;
  readonly name: string;
  /** Display name shown in the input once picked (legacy `full`). */
  readonly full: string;
  readonly credits: number;
}

/** How a course matched the query, in descending priority (lower rank = better). */
export type CourseMatchKind =
  | 'exact-code'
  | 'code-prefix'
  | 'code-substring'
  | 'exact-title'
  | 'title-prefix'
  | 'title-substring';

const MATCH_RANK: Readonly<Record<CourseMatchKind, number>> = {
  'exact-code': 0,
  'code-prefix': 1,
  'code-substring': 2,
  'exact-title': 3,
  'title-prefix': 4,
  'title-substring': 5,
};

/** A ranked match: the canonical course plus why and how strongly it matched. */
export interface CourseSearchResult {
  readonly course: CourseSuggestion;
  readonly matchKind: CourseMatchKind;
  readonly rank: number;
}

const DEFAULT_LIMIT = 8;

/**
 * One catalogue course with its lowercased code/title precomputed. Building this
 * once (prepareCatalog) keeps per-keystroke search from re-lowercasing the whole
 * catalogue. `codeLower` has no spaces (codes never do); `titleLower` is
 * whitespace-collapsed so repeated/leading spaces don't change matching.
 */
export interface PreparedCourse {
  readonly course: CourseSuggestion;
  readonly codeLower: string;
  readonly titleLower: string;
}

export type PreparedCatalog = readonly PreparedCourse[];

/** Trim, collapse internal whitespace runs to one space, lowercase. */
function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Build the immutable searchable view: lowercases code/title once and drops
 * blank-coded or duplicate-coded records (first wins), so the same course can
 * never appear twice in results. Does not mutate the input array or its records.
 */
export function prepareCatalog(courses: readonly CourseSuggestion[]): PreparedCatalog {
  const seen = new Set<string>();
  const prepared: PreparedCourse[] = [];
  for (const course of courses) {
    const codeLower = String(course.code ?? '')
      .trim()
      .toLowerCase();
    if (!codeLower || seen.has(codeLower)) continue;
    seen.add(codeLower);
    prepared.push({
      course,
      codeLower,
      titleLower: normalizeQuery(String(course.name ?? '')),
    });
  }
  return prepared;
}

/** Best (lowest-rank) match kind for one prepared course, or null if no match. */
function classify(p: PreparedCourse, q: string, qNoSpace: string): CourseMatchKind | null {
  const { codeLower, titleLower } = p;
  if (qNoSpace && codeLower === qNoSpace) return 'exact-code';
  if (qNoSpace && codeLower.startsWith(qNoSpace)) return 'code-prefix';
  if (qNoSpace && codeLower.includes(qNoSpace)) return 'code-substring';
  if (titleLower === q) return 'exact-title';
  if (titleLower.startsWith(q)) return 'title-prefix';
  if (titleLower.includes(q)) return 'title-substring';
  return null;
}

/**
 * Stable, locale-independent ordering within the result set:
 *   1. match rank (exact-code → … → title-substring)
 *   2. shorter, more-direct match first (code length for code tiers, title
 *      length for title tiers)
 *   3. canonical course code, codepoint order — the final deterministic tie-break
 */
function compareResults(a: CourseSearchResult, b: CourseSearchResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const codeTier = a.rank <= MATCH_RANK['code-substring'];
  const aLen = codeTier ? a.course.code.length : a.course.name.length;
  const bLen = codeTier ? b.course.code.length : b.course.name.length;
  if (aLen !== bLen) return aLen - bLen;
  if (a.course.code === b.course.code) return 0;
  return a.course.code < b.course.code ? -1 : 1;
}

/**
 * Ranked matches for a query against a prepared catalogue. Empty/whitespace-only
 * query → no matches. Each course appears at most once (best tier). Capped at
 * `options.limit` (default 8). Pure and deterministic.
 */
export function searchCoursesRanked(
  prepared: PreparedCatalog,
  query: string,
  options?: { readonly limit?: number },
): readonly CourseSearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const qNoSpace = q.replace(/ /g, '');

  const results: CourseSearchResult[] = [];
  for (const p of prepared) {
    const kind = classify(p, q, qNoSpace);
    if (kind) results.push({ course: p.course, matchKind: kind, rank: MATCH_RANK[kind] });
  }
  results.sort(compareResults);

  const limit = options?.limit ?? DEFAULT_LIMIT;
  return limit >= 0 ? results.slice(0, limit) : results;
}

/**
 * Backward-compatible convenience: ranked suggestion list for a query over a raw
 * catalogue (prepares on the fly). Hot paths (per-keystroke) should prepare once
 * with prepareCatalog and call searchCoursesRanked instead. Empty query → [].
 */
export function searchCourses(
  query: string,
  courses: readonly CourseSuggestion[],
): CourseSuggestion[] {
  return searchCoursesRanked(prepareCatalog(courses), query).map((r) => r.course);
}

/**
 * Resolve a typed-in value to a catalog course on blur: an exact code match
 * (case- and inner-space-insensitive), or an exact full-name / name match
 * (case-insensitive, whitespace-collapsed). Null when nothing matches — the
 * caller then keeps the free-text name with zero credits. Mirrors onCourseBlur.
 */
export function resolveExactCourse(
  value: string,
  courses: readonly CourseSuggestion[],
): CourseSuggestion | null {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;
  const upper = collapsed.toUpperCase();
  const upperNoSpace = upper.replace(/ /g, '');
  const byCode = courses.find(
    (c) => c.code.toUpperCase() === upper || c.code.toUpperCase() === upperNoSpace,
  );
  if (byCode) return byCode;
  const lower = collapsed.toLowerCase();
  return (
    courses.find(
      (c) =>
        c.full.trim().replace(/\s+/g, ' ').toLowerCase() === lower ||
        c.name.trim().replace(/\s+/g, ' ').toLowerCase() === lower,
    ) ?? null
  );
}
