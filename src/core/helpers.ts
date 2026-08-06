// src/core/helpers.ts
//
// Typed port of the pure helpers in js/core/helpers.js. Only the browser-free
// logic lives here — the DOM-bound helpers (confirmDestructive, getStartSeason,
// getStartYear) stay in the vanilla JS module per docs/REACT_VITE_MIGRATION.md,
// which keeps the typed core free of DOM and Firebase imports. Behavior parity
// with the JS version is guarded by tests/typedCoreParity.test.js.

import type { CourseMarkComponent, SemesterSeason } from './types';

export const SEASON_ORDER: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];

/**
 * HTML-escape a string for safe insertion into innerHTML.
 */
export function escHtml(s: unknown): string {
  if (typeof s !== 'string') return String(s ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(s: unknown): string {
  return escHtml(s);
}

export function ordinalSup(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suffix}`;
}

export function sanitizeSemName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/<sup>(.*?)<\/sup>/gi, '$1');
}

// Strip HTML tags for plain-text contexts (PDF text, labels). Applied
// repeatedly until stable so a single removal can't re-form a tag
// (e.g. "<<b>b>" -> "<b>" -> ""), which a one-pass replace would leave behind.
export function stripTags(s: unknown): string {
  if (typeof s !== 'string') return '';
  let prev: string;
  let out = s;
  do {
    prev = out;
    out = out.replace(/<[^>]+>/g, '');
  } while (out !== prev);
  return out;
}

function sanitizeGradePointValue(value: unknown): string | number {
  if (value === undefined || value === null) return '';
  if (value === 'NT') return 'NT';

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 4 ? value : '';
  }

  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.toUpperCase() === 'NT') return 'NT';
  if (!/^(?:\d+(?:\.\d+)?)$/.test(trimmed)) return '';

  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 4 ? trimmed : '';
}

/**
 * Upper bound on tracked components per course (#500).
 *
 * Not a syllabus judgement — a bound on what restore will accept, so a
 * corrupted or hostile document cannot grow the cloud doc without limit. A real
 * course does not have twenty separately-weighted graded components.
 */
export const MAX_MARK_COMPONENTS = 20;

/**
 * Validate persisted mark components. Returns undefined rather than an empty
 * array when there is nothing usable, so a course that never tracked marks
 * stays byte-identical through a save/restore cycle.
 */
export function sanitizeMarkComponents(value: unknown): CourseMarkComponent[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const out: CourseMarkComponent[] = [];
  for (const raw of value) {
    if (out.length >= MAX_MARK_COMPONENTS) break;
    if (!raw || typeof raw !== 'object') continue;

    const c = raw as Record<string, unknown>;
    const weight = typeof c.weight === 'number' && Number.isFinite(c.weight) ? c.weight : NaN;
    const outOf = typeof c.outOf === 'number' && Number.isFinite(c.outOf) ? c.outOf : NaN;
    // A component with no weight or no denominator cannot contribute to any
    // answer, so it is dropped rather than stored as a broken row.
    if (!(weight > 0) || !(outOf > 0)) continue;

    const score =
      typeof c.score === 'number' && Number.isFinite(c.score) ? Math.max(0, c.score) : null;

    out.push({
      name: typeof c.name === 'string' ? stripTags(c.name).slice(0, 40) : '',
      weight: Math.min(100, weight),
      score,
      outOf,
    });
  }

  return out.length ? out : undefined;
}

interface RestoredState {
  currentDept?: string;
  semesters: any[];
  semesterCounter?: number;
  planCourses?: unknown;
  [key: string]: unknown;
}

export function sanitizeRestoredState(saved: unknown): RestoredState | null {
  if (!saved || typeof saved !== 'object') return null;
  const state = saved as RestoredState;
  if (!Array.isArray(state.semesters)) return null;

  if (state.currentDept && typeof state.currentDept === 'string') {
    if (!/^[A-Z]{2,4}$/.test(state.currentDept)) state.currentDept = '';
  }

  state.semesters = state.semesters.filter((sem) => {
    if (!sem || typeof sem !== 'object') return false;
    if (typeof sem.id !== 'number') return false;

    // ── Summary blocks pass through as-is after basic validation ──────────
    if (sem.summary === true) {
      const cgpa = parseFloat(sem.summaryCGPA);
      const cr = parseFloat(sem.summaryCredits);
      if (isNaN(cgpa) || cgpa < 0 || cgpa > 4.0) return false;
      if (isNaN(cr) || cr < 0) return false;
      // Normalize attempted credits — default to earned if missing
      const att = parseFloat(sem.summaryAttempted);
      sem.summaryAttempted = !isNaN(att) && att >= 0 ? att : cr;
      // normalise optional semesters count
      sem.summarySemesters = typeof sem.summarySemesters === 'number' ? sem.summarySemesters : 0;
      sem.courses = []; // always empty
      sem.running = false;
      return true;
    }

    sem.name = sanitizeSemName(sem.name || '');
    if (!Array.isArray(sem.courses)) {
      sem.courses = [];
      return true;
    }
    sem.courses = sem.courses
      .filter((c: unknown) => c && typeof c === 'object')
      // This map is an allowlist: a field absent here is dropped on restore.
      .map((c: any) => {
        const marks = sanitizeMarkComponents(c.marks);
        return {
          name: typeof c.name === 'string' ? c.name : '',
          credits: typeof c.credits === 'number' && isFinite(c.credits) ? c.credits : 0,
          grade: typeof c.grade === 'string' ? c.grade : '',
          gradePoint: sanitizeGradePointValue(c.gradePoint),
          faculty: typeof c.faculty === 'string' ? c.faculty.toUpperCase().slice(0, 6) : '',
          ...(marks ? { marks } : {}),
        };
      });
    return true;
  });

  state.semesterCounter =
    typeof state.semesterCounter === 'number' ? state.semesterCounter : state.semesters.length;

  state.planCourses = Array.isArray(state.planCourses)
    ? state.planCourses.filter(
        (c: unknown) => typeof c === 'string' && /^[A-Z]{2,4}\d{3}[A-Z]?$/.test(c),
      )
    : [];

  return state;
}

export function getCurrentSeason(): SemesterSeason {
  const m = new Date().getMonth() + 1;
  if (m <= 4) return 'Spring';
  if (m <= 8) return 'Summer';
  return 'Fall';
}

export function getLastCompletedSemester(seasons?: readonly string[]): {
  season: string;
  year: number;
} {
  const order: readonly string[] = seasons || SEASON_ORDER;
  const curSeason = getCurrentSeason();
  const curYear = new Date().getFullYear();
  const curGlobalIdx = SEASON_ORDER.indexOf(curSeason);

  const offeredBeforeCurrent = order.filter(
    (season) => (SEASON_ORDER as readonly string[]).indexOf(season) < curGlobalIdx,
  );

  if (offeredBeforeCurrent.length > 0) {
    return { season: offeredBeforeCurrent[offeredBeforeCurrent.length - 1], year: curYear };
  }

  return { season: order[order.length - 1], year: curYear - 1 };
}

export function countSemesters(
  startSeason: string,
  startYear: string | number,
  endSeason: string,
  endYear: string | number,
  seasons?: readonly string[],
): number {
  const order: readonly string[] = seasons || SEASON_ORDER;
  let si = order.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = parseInt(String(startYear));
  let count = 0;
  while (true) {
    count++;
    if (order[si] === endSeason && yr === parseInt(String(endYear))) break;
    si++;
    if (si >= order.length) {
      si = 0;
      yr++;
    }
    if (yr > parseInt(String(endYear)) + 1) break;
  }
  return count;
}

export function generateSemesterNames(
  startSeason: string,
  startYear: string | number,
  count: number,
  seasons?: readonly string[],
): string[] {
  const order: readonly string[] = seasons || SEASON_ORDER;
  const names: string[] = [];
  let si = order.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = parseInt(String(startYear));
  for (let i = 0; i < count; i++) {
    names.push(`${order[si]} ${yr} (${ordinalSup(i + 1)} Semester)`);
    si++;
    if (si >= order.length) {
      si = 0;
      yr++;
    }
  }
  return names;
}
