// ── UNIVERSITY DIRECTORY (legacy bundle) ─────────────────────────────────────
// Which universities Shohoj serves and which email domain identifies a student
// at each one. Three things read it:
//   - the sign-in portal, to list the campuses a visitor can sign in from
//   - js/auth/firebase.js, to decide whether an account is admitted at all
//   - js/auth/campus-scope.js, to tag and filter Firestore documents by campus
//
// It is names and domains ONLY. The authoritative registry — grading scales,
// mark tiers, repeat rules, per-campus feature lists — is src/core/university.ts
// with its legacy twin js/core/university.js. This smaller file exists because
// the auth module is inlined into every page as its own script (build3.py), and
// it needs the domain map without carrying the grading policy along.
//
// The domain map is hand-copied in more than one place (here, the registry,
// firestore.rules `campusOfEmail`, worker/index.js CAMPUS). This copy does not
// get to drift silently: tests/universityDirectory.test.js transpiles
// src/core/university.ts and asserts id, name, shortName and emailDomains match
// entry for entry — so a campus added to the registry is admitted here only
// when someone adds it here on purpose.

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
  {
    id: 'diu',
    name: 'Daffodil International University',
    shortName: 'DIU',
    emailDomains: ['diu.edu.bd', 's.diu.edu.bd'],
  },
];

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
