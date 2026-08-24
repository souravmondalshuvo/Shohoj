// worker/campus.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:campus-map
// Source of truth: src/core/university.ts (UNIVERSITIES)
//
// The domain → campus map the Worker stamps onto every document it writes, and
// the id list the Firestore rules validate that stamp against. Anchored ^…$ and
// dot-escaped: an unanchored match would admit x@g.bracu.ac.bd.attacker.com
// as a bracu student.
// 2 campuses.

export const CAMPUS_EMAIL_RES = [
  ['bracu', /^[^@]+@g\.bracu\.ac\.bd$/],
  ['nsu', /^[^@]+@northsouth\.edu$/],
];

export const VALID_CAMPUS_IDS = new Set(['bracu', 'nsu']);

/** The campus an address belongs to, or '' when no registered campus claims it. */
export function campusOfEmail(email) {
  if (typeof email !== 'string') return '';
  for (const [id, re] of CAMPUS_EMAIL_RES) {
    if (re.test(email)) return id;
  }
  return '';
}

/** True when `value` names a campus in the registry. */
export function isValidCampus(value) {
  return typeof value === 'string' && VALID_CAMPUS_IDS.has(value);
}
