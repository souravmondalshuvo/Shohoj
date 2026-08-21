// ── UNIVERSITY DIRECTORY (legacy bundle) ─────────────────────────────────────
// The campus list the sign-in portal shows a signed-out visitor: which
// universities Shohoj serves, which email domain identifies a student at each
// one, and — the part that only matters here — which of them THIS build can
// actually sign in.
//
// This is DISPLAY DATA ONLY. The authoritative registry — grading scales, mark
// tiers, repeat rules, per-campus feature lists — is src/core/university.ts and
// stays there. build3.py concatenates plain JS and cannot pull in a .ts module,
// and the portal only ever needs names and domains, so copying the whole
// profile here would be four hundred lines of grading policy kept in sync by
// hope.
//
// The domain map is already hand-copied in three places (this file,
// firestore.rules `campusOfEmail`, worker/index.js CAMPUS). This is a fourth
// copy, so it does not get to drift silently: tests/universityDirectory.test.js
// transpiles src/core/university.ts and asserts id, name, shortName and
// emailDomains match entry for entry.

/**
 * The one campus the legacy bundle is built for.
 *
 * Not a preference — a fact about this build. bracu-section.json, the course
 * catalog, the seat feed, the routine grid and the campus map are all BRACU,
 * and js/auth/firebase.js turns away any non-BRACU account for exactly that
 * reason: signing an NSU student in to a BRACU app wearing their name is worse
 * than turning them away.
 *
 * Multi-campus lives in the React shell at /app/, which has the registry wired
 * through to the grading scale. So the portal names the other campuses and
 * sends them there rather than pretending this build serves them and letting
 * the domain check reject them after the Google popup.
 *
 * tests/universityDirectory.test.js pins this to the domain literal in
 * js/auth/firebase.js — broaden one and the test makes you update the other.
 */
export const LEGACY_CAMPUS_ID = 'bracu';

export const UNIVERSITY_DIRECTORY = [
  {
    id: 'bracu',
    name: 'BRAC University',
    shortName: 'BRACU',
    emailDomains: ['g.bracu.ac.bd'],
  },
  {
    id: 'nsu',
    name: 'North South University',
    shortName: 'NSU',
    emailDomains: ['northsouth.edu'],
  },
];

/** Can this build sign the campus in, or does it have to hand off to the shell? */
export function servedByThisBuild(campusId) {
  return campusId === LEGACY_CAMPUS_ID;
}

// Which campus an email address belongs to, or null for a domain we do not
// serve at all. Case-insensitive: Google hands back whatever casing the student
// typed, and 'A@G.BRACU.AC.BD' is the same student as the lowercase form.
// Exact-domain match only — a suffix test would let
// 'a@g.bracu.ac.bd.attacker.com' resolve to BRACU. Mirrors campusOfEmail in
// firestore.rules.
export function campusOfEmail(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return null;
  const domain = String(email).slice(at + 1).toLowerCase();
  const match = UNIVERSITY_DIRECTORY.find(u => u.emailDomains.includes(domain));
  return match ? match.id : null;
}
