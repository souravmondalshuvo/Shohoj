// src/core/faculty.ts
//
// Typed, browser-independent core for the faculty directory + rating cache
// (Phase 3). Pure logic plus an in-memory profile cache — no DOM, no Firebase.
// Profiles are seeded server-side in the `facultyProfiles` Firestore collection
// and loaded on demand; until then this module just normalizes initials and
// answers "do we know this faculty yet?" questions with whatever cache we have.
// The runtime js/core/faculty.js keeps the same behavior; parity is guarded by
// tests/typedCoreParity.test.js.

import type { RatingKey } from './reviews';

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

export function normalizeInitials(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}

export function isValidInitials(raw: unknown): boolean {
  const norm = normalizeInitials(raw);
  return norm.length >= 2 && norm.length <= 6;
}

export function getFacultyProfile(initials: unknown): FacultyProfile | null {
  return _profiles.get(normalizeInitials(initials)) || null;
}

export function hasFacultyProfile(initials: unknown): boolean {
  return _profiles.has(normalizeInitials(initials));
}

export function listKnownFaculty(): FacultyProfile[] {
  return Array.from(_profiles.values());
}

// Merge a profile into the cache. Called by reviews after fetching from
// Firestore, or whenever a new review is submitted locally.
export function upsertFacultyProfile(profile: unknown): void {
  if (!profile || typeof profile !== 'object') return;
  const input = profile as Partial<FacultyProfile>;
  const initials = normalizeInitials(input.initials);
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

SEEDED_FACULTY_PROFILES.forEach(upsertFacultyProfile);
