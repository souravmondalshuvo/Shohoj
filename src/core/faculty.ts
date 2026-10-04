// src/core/faculty.ts
//
// Typed, browser-independent core for the faculty directory + rating cache
// (Phase 3). Pure logic plus an in-memory profile cache — no DOM, no Firebase.
// Profiles are seeded server-side in the `facultyProfiles` Firestore collection
// and loaded on demand; until then this module just normalizes initials and
// answers "do we know this faculty yet?" questions with whatever cache we have.
// The runtime js/core/faculty.js keeps the same behavior; parity is guarded by
// tests/typedCoreParity.test.js.

import type { InitialsCampus, RatingKey } from './reviews';

export type FacultyRatings = Record<RatingKey, number>;

export interface FacultyProfile {
  initials: string;
  name?: string;
  email?: string;
  dept?: string;
  courses: string[];
  ratings: FacultyRatings | null;
  reviewCount: number;
  // Profiles seeded from Firestore may carry extra fields; preserve them.
  [key: string]: unknown;
}

// Runtime cache of faculty profiles. Keyed by normalized initials.
const _profiles = new Map<string, FacultyProfile>();

// Injected by build3.py (and the Vite seed-injection plugin) at bundle time.
const SEEDED_FACULTY_PROFILES: FacultyProfile[] = [];

/** Letters only — BRACU's shape, and the default wherever no campus is given. */
const LETTERS_ONLY: InitialsCampus = {};

/**
 * Faculty initials as they are stored and compared: uppercase, at most six
 * characters. Where the campus numbers its faculty (`numberedInitials` in the
 * registry — NSU's MMS1, MMS3 and MMS4 are three lecturers) the closing number
 * is kept; elsewhere a digit is a typo and is dropped. Case is folded on every
 * campus. Mirrors js/core/faculty.js, which defaults to the active campus.
 */
export function normalizeInitials(raw: unknown, campus: InitialsCampus = LETTERS_ONLY): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(campus.numberedInitials ? /[^A-Z0-9]/g : /[^A-Z]/g, '')
    .slice(0, 6);
}

export function isValidInitials(raw: unknown, campus: InitialsCampus = LETTERS_ONLY): boolean {
  // Letters, then at most one number at the end (which only a campus that
  // numbers its faculty can still have by this point).
  return /^[A-Z]{2,6}$|^[A-Z]{2,5}[0-9]$/.test(normalizeInitials(raw, campus));
}

export function getFacultyProfile(
  initials: unknown,
  campus: InitialsCampus = LETTERS_ONLY,
): FacultyProfile | null {
  return _profiles.get(normalizeInitials(initials, campus)) || null;
}

export function hasFacultyProfile(
  initials: unknown,
  campus: InitialsCampus = LETTERS_ONLY,
): boolean {
  return _profiles.has(normalizeInitials(initials, campus));
}

export function listKnownFaculty(): FacultyProfile[] {
  return Array.from(_profiles.values());
}

// Merge a profile into the cache. Called by reviews after fetching from
// Firestore, or whenever a new review is submitted locally.
export function upsertFacultyProfile(
  profile: unknown,
  campus: InitialsCampus = LETTERS_ONLY,
): void {
  if (!profile || typeof profile !== 'object') return;
  const input = profile as Partial<FacultyProfile>;
  const initials = normalizeInitials(input.initials, campus);
  if (!initials) return;
  const existing: FacultyProfile = _profiles.get(initials) || {
    initials,
    courses: [],
    ratings: null,
    reviewCount: 0,
  };
  _profiles.set(initials, { ...existing, ...input, initials });
}

export function clearFacultyCache(): void {
  _profiles.clear();
}

// Suggest faculty as the user types. Matches prefix on initials or name.
export function suggestFaculty(query: unknown, limit = 6): FacultyProfile[] {
  const q = String(query || '')
    .trim()
    .toUpperCase();
  if (!q) return [];
  const out: FacultyProfile[] = [];
  for (const p of _profiles.values()) {
    if (p.initials.startsWith(q) || (p.name && p.name.toUpperCase().includes(q))) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

SEEDED_FACULTY_PROFILES.forEach((profile) => upsertFacultyProfile(profile));
