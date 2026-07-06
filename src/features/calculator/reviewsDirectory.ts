// src/features/calculator/reviewsDirectory.ts
//
// Pure model for the Browse Reviews directory (#345, Phase 5G slice d3c-ii).
// The directory itself is aggregateByFaculty over the recent-reviews feed; this
// module adds the search filter — a case-insensitive match on faculty initials,
// the lean first cut of reviewsTab.js's directory search.

import type { FacultyAggregate } from '../../core/reviews.ts';

/** Filter the faculty directory by an initials query (case-insensitive substring). */
export function filterDirectory(
  directory: readonly FacultyAggregate[],
  query: string,
): FacultyAggregate[] {
  const q = query.trim().toUpperCase();
  if (!q) return [...directory];
  return directory.filter((entry) => entry.facultyInitials.includes(q));
}
