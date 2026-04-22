// ── js/core/faculty.js ────────────────────────────────────────────────────────
// Faculty directory + rating cache. Profiles are seeded server-side in the
// `facultyProfiles` Firestore collection and loaded on demand. Until then this
// module just normalizes initials and answers "do we know this faculty yet?"
// questions with whatever cache we have.

// Runtime cache of faculty profiles. Keyed by normalized initials.
// Shape: { initials, name, email, dept, courses:[], ratings:{teaching,marking,behavior,difficulty,workload}, reviewCount }
const _profiles = new Map();

const SEEDED_FACULTY_PROFILES = [
  {
    initials: 'SDL',
    name: 'Shadmin Sultana',
    email: 'shadmin.sultana@bracu.ac.bd',
    dept: 'CSE',
    courses: ['CSE250'],
  },
  {
    initials: 'MSI',
    name: 'Md. Saiful Islam',
    email: 'md.saiful.islam@bracu.ac.bd',
    dept: 'CSE',
    courses: ['CSE110'],
  },
];

export function normalizeInitials(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
}

export function isValidInitials(raw) {
  const norm = normalizeInitials(raw);
  return norm.length >= 2 && norm.length <= 6;
}

export function getFacultyProfile(initials) {
  return _profiles.get(normalizeInitials(initials)) || null;
}

export function hasFacultyProfile(initials) {
  return _profiles.has(normalizeInitials(initials));
}

export function listKnownFaculty() {
  return Array.from(_profiles.values());
}

// Merge a profile into the cache. Called by reviews.js after fetching
// from Firestore, or whenever a new review is submitted locally.
export function upsertFacultyProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  const initials = normalizeInitials(profile.initials);
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

SEEDED_FACULTY_PROFILES.forEach(upsertFacultyProfile);
