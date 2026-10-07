// ── js/core/faculty.js ────────────────────────────────────────────────────────
// Faculty directory + rating cache. Profiles are seeded server-side in the
// `facultyProfiles` Firestore collection and loaded on demand. Until then this
// module just normalizes initials and answers "do we know this faculty yet?"
// questions with whatever cache we have.

import { getActiveCampus } from './activeCampus.js';
import { DEFAULT_UNIVERSITY_ID, UNIVERSITIES } from './university.js';

// Runtime cache of faculty profiles, one per campus. Keyed by campus id, then
// by normalized initials.
// Shape: { initials, name, email, dept, courses:[], ratings:{teaching,marking,behavior,difficulty,workload}, reviewCount }
//
// Per campus because initials are only a name inside one university: BRACU's
// MAK and NSU's MAK are two lecturers, and a single cache would hand either
// campus the other's name, email and course list — in the Reviews search, on a
// faculty page, and in a course's "no reviews yet" list.
const _profilesByCampus = new Map();

const SEEDED_FACULTY_PROFILES = []; // injected by build3.py

// The seed is BRACU's (data/faculty_profiles.jsonl), like the review seed in
// reviews.js, so it is poured into BRACU's cache and no other.
function _profilesFor(campus = getActiveCampus()) {
  const id = campus?.id ?? DEFAULT_UNIVERSITY_ID;
  let profiles = _profilesByCampus.get(id);
  if (!profiles) {
    profiles = new Map();
    _profilesByCampus.set(id, profiles);
    if (id === DEFAULT_UNIVERSITY_ID) {
      SEEDED_FACULTY_PROFILES.forEach(profile => upsertFacultyProfile(profile, UNIVERSITIES[id]));
    }
  }
  return profiles;
}

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
  return _profilesFor(campus).get(normalizeInitials(initials, campus)) || null;
}

export function hasFacultyProfile(initials, campus) {
  return _profilesFor(campus).has(normalizeInitials(initials, campus));
}

export function listKnownFaculty(campus) {
  return Array.from(_profilesFor(campus).values());
}

// Merge a profile into the cache. Called by reviews.js after fetching
// from Firestore, or whenever a new review is submitted locally.
export function upsertFacultyProfile(profile, campus) {
  if (!profile || typeof profile !== 'object') return;
  const initials = normalizeInitials(profile.initials, campus);
  if (!initials) return;
  const profiles = _profilesFor(campus);
  const existing = profiles.get(initials) || { initials, courses: [], ratings: null, reviewCount: 0 };
  profiles.set(initials, { ...existing, ...profile, initials });
}

export function clearFacultyCache() {
  _profilesByCampus.clear();
}

// Suggest faculty as the user types. Matches prefix on initials or name.
export function suggestFaculty(query, limit = 6, campus) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const out = [];
  for (const p of _profilesFor(campus).values()) {
    if (p.initials.startsWith(q) || (p.name && p.name.toUpperCase().includes(q))) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}
