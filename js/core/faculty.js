// ── js/core/faculty.js ────────────────────────────────────────────────────────
// Faculty directory + rating cache. Profiles are seeded server-side in the
// `facultyProfiles` Firestore collection and loaded on demand. Until then this
// module just normalizes initials and answers "do we know this faculty yet?"
// questions with whatever cache we have.

import { getActiveCampus } from './activeCampus.js';

// Runtime cache of faculty profiles. Keyed by normalized initials.
// Shape: { initials, name, email, dept, courses:[], ratings:{teaching,marking,behavior,difficulty,workload}, reviewCount }
const _profiles = new Map();

const SEEDED_FACULTY_PROFILES = []; // injected by build3.py

/**
 * A faculty member's initials as Shohoj stores and compares them, on `campus`
 * (the active campus when not given). Uppercase, at most six characters.
 *
 * Where a campus numbers its faculty (`numberedInitials` in the registry —
 * NSU's MMS1, MMS3 and MMS4 are three lecturers) the closing number is kept.
 * Everywhere else a digit in the box is a typo and is dropped, as it always
 * was. Case is never identity — one NSU lecturer appears as ABq1, Abq1 and
 * abq1 in a single term's list — so it is folded on every campus.
 * tests/facultyInitials.test.js holds both halves to data/campuses.
 */
export function normalizeInitials(raw, campus = getActiveCampus()) {
  if (typeof raw !== 'string') return '';
  const junk = campus?.numberedInitials ? /[^A-Z0-9]/g : /[^A-Z]/g;
  return raw.trim().toUpperCase().replace(junk, '').slice(0, 6);
}

export function isValidInitials(raw, campus = getActiveCampus()) {
  const norm = normalizeInitials(raw, campus);
  // Letters, then at most one number at the end (which only a numbered-initials
  // campus can still have by this point).
  return /^[A-Z]{2,6}$|^[A-Z]{2,5}[0-9]$/.test(norm);
}

export function getFacultyProfile(initials, campus) {
  return _profiles.get(normalizeInitials(initials, campus)) || null;
}

export function hasFacultyProfile(initials, campus) {
  return _profiles.has(normalizeInitials(initials, campus));
}

export function listKnownFaculty() {
  return Array.from(_profiles.values());
}

// Merge a profile into the cache. Called by reviews.js after fetching
// from Firestore, or whenever a new review is submitted locally.
export function upsertFacultyProfile(profile, campus) {
  if (!profile || typeof profile !== 'object') return;
  const initials = normalizeInitials(profile.initials, campus);
  if (!initials) return;
  const existing = _profiles.get(initials) || { initials, courses: [], ratings: null, reviewCount: 0 };
  _profiles.set(initials, { ...existing, ...profile, initials });
}

export function clearFacultyCache() {
  _profiles.clear();
}

// Suggest faculty as the user types. Matches prefix on initials or name.
export function suggestFaculty(query, limit = 6) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const out = [];
  for (const p of _profiles.values()) {
    if (p.initials.startsWith(q) || (p.name && p.name.toUpperCase().includes(q))) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

SEEDED_FACULTY_PROFILES.forEach(profile => upsertFacultyProfile(profile));
