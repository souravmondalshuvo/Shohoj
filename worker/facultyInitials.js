// worker/facultyInitials.js
//
// The shape of faculty initials, per campus — one definition for /reviews, a
// paper's faculty list and the Assistant's lookup.
//
// NSU tells lecturers apart with a closing number: MMS1, MMS3 and MMS4 are
// three people (#819). There, and only there, initials may end in one digit.
// Everywhere else a digit is a typo. Case is never identity and is folded.
//
// Which campuses those are is the registry's `numberedInitials`
// (js/core/university.js), the same field the page reads, so the Worker and
// the page cannot disagree. tests/facultyInitials.test.js holds the rule to
// the section data in data/campuses.

import { getUniversity } from '../js/core/university.js';

const LETTERS_RE = /^[A-Z]{2,6}$/;
const NUMBERED_RE = /^[A-Z]{2,6}$|^[A-Z]{2,5}[0-9]$/;

const numbersItsFaculty = (campus) => getUniversity(campus)?.numberedInitials === true;

/** The shape well-formed faculty initials take on a campus. */
export function facultyInitialsRe(campus) {
  return numbersItsFaculty(campus) ? NUMBERED_RE : LETTERS_RE;
}

/**
 * Initials as they are stored, out of whatever was typed or said ("sue's
 * section", "mms 4"): uppercase, stripped to what the campus's initials can
 * contain. Null when what is left is not initials.
 */
export function normalizeFacultyInitials(raw, campus) {
  const junk = numbersItsFaculty(campus) ? /[^A-Z0-9]/g : /[^A-Z]/g;
  const initials = String(raw || '')
    .toUpperCase()
    .replace(junk, '')
    .slice(0, 6);
  return facultyInitialsRe(campus).test(initials) ? initials : null;
}
