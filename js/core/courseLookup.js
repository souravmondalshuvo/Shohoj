// ── COURSE LOOKUP (legacy bundle) ────────────────────────────────────────────
//
// "Is this a real course, and what is it?" for the data layers — reviews,
// papers, study groups — that validate a course code before writing it.
//
// Those modules ship in more than one bundle. On the calculator page main.js
// points this at the active campus's catalogue (activeCatalog.js), so an NSU
// student's codes are checked against NSU's courses. The admin page carries no
// campus catalogue and leaves it alone, which keeps it on BRACU's — what it
// has always validated against.

import { COURSE_DB } from './catalog.js';

let _courseLookup = code => COURSE_DB[code];

/** The catalogue entry for a course code, or undefined if there is none. */
export function findCourse(code) {
  return _courseLookup(code);
}

/** Answer findCourse from another catalogue. `lookup` maps a code to its entry. */
export function setCourseLookup(lookup) {
  _courseLookup = lookup;
}
