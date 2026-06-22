// src/features/calculator/colors.ts
//
// Phase 5B presentation logic: the GPA-badge and grade-letter color mappings
// currently inlined as nested ternaries in js/ui/render.js, lifted into pure,
// tested functions the React semester-block/course-row islands will consume.
// Values are copied verbatim so the migrated UI matches the legacy palette
// exactly. See docs/FULL_REACT_TYPESCRIPT_MIGRATION.md §5B.

export interface BadgeColors {
  readonly color: string;
  readonly bg: string;
  readonly border: string;
}

/**
 * Color/background/border for a semester (or summary) GPA badge, by the same
 * 4-tier thresholds render.js uses: ≥3.5 bright green, ≥3.0 green, ≥2.5 amber,
 * else red. The summary block uses only `color`; both share these cutoffs.
 */
export function gpaBadgeColors(gpa: number): BadgeColors {
  if (gpa >= 3.5) {
    return { color: '#2ECC71', bg: 'rgba(46,204,113,0.10)', border: 'rgba(46,204,113,0.25)' };
  }
  if (gpa >= 3.0) {
    return { color: '#27ae60', bg: 'rgba(46,204,113,0.07)', border: 'rgba(46,204,113,0.18)' };
  }
  if (gpa >= 2.5) {
    return { color: '#F0A500', bg: 'rgba(240,165,0,0.10)', border: 'rgba(240,165,0,0.25)' };
  }
  return { color: '#e74c3c', bg: 'rgba(231,76,60,0.10)', border: 'rgba(231,76,60,0.25)' };
}

/**
 * Text color for a course's grade letter. Failing/NT is red, Pass and A-range
 * are bright green, then B/C/D step down, and anything unrecognized falls back
 * to the muted token. Mirrors the grade-letter ternary in render.js.
 */
export function gradeLetterColor(grade: string | null | undefined): string {
  const g = grade ?? '';
  if (g === 'F' || g === 'F(NT)') return '#e74c3c';
  if (g === 'P') return '#2ECC71';
  if (g.startsWith('A')) return '#2ECC71';
  if (g.startsWith('B')) return '#27ae60';
  if (g.startsWith('C')) return '#F0A500';
  if (g.startsWith('D')) return '#e67e22';
  return 'var(--text3)';
}
