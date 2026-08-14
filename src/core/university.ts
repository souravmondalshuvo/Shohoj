// src/core/university.ts
//
// The university registry — the seam that turns "Shohoj is a BRACU app" from an
// ambient assumption into a piece of configuration.
//
// Every rule that varies between campuses lives on a UniversityProfile: the
// grading scale, the email domains that identify a student, and which features
// the campus actually has data for. Code that used to reach for the module-level
// `GRADES` constant takes a scale from the active profile instead, so a second
// university is a new entry here rather than a fork of the calculator.
//
// This module is deliberately I/O-free and framework-free: it is pure data plus
// lookup helpers. Resolving *which* profile is active (from the signed-in user's
// email domain, or the `university` custom claim) is the auth layer's job.
//
// Adding a university:
//   1. Add its id to UniversityId.
//   2. Add any grade letters it uses that BRACU doesn't to GradeLetter in
//      ./grades.ts — GradeLetter is the union across ALL campuses, and each
//      profile's `points` covers only its own subset.
//   3. Add the profile below and list it in UNIVERSITIES.
//
// Grade points must come from the registrar or the official student handbook.
// They drive CGPA, which drives probation, scholarship and graduation
// decisions — a guessed value here is a wrong number on a real student's
// transcript, so no profile ships on a best guess.

import {
  GRADES,
  POINTS_TO_GRADE,
  type GradeLetter,
  type GradePoint,
} from './grades.ts';

/** Every campus Shohoj can serve. */
export type UniversityId = 'bracu';

/**
 * A campus grading scale.
 *
 * `points` is partial because the letter union spans every campus: BRACU awards
 * `A+` and `D-`, another university may not, and a missing key reads as
 * `undefined` — "this campus does not award that grade" — which callers already
 * treat the same way they treat an unrecognised grade today.
 */
export interface GradeScale {
  /** Letter → grade point. `null` means the grade carries no point (P/I/W). */
  readonly points: Readonly<Partial<Record<GradeLetter, GradePoint>>>;
  /**
   * Point → letter, ordered high to low, for mapping a numeric grade back to a
   * letter. Only letters that carry a point appear here.
   */
  readonly pointsToGrade: readonly (readonly [number, GradeLetter])[];
  /** Highest attainable grade point — the CGPA ceiling for this campus. */
  readonly max: number;
}

/** Feature slices a campus can switch on, keyed to the shell's routes. */
export type FeatureId =
  | 'bus'
  | 'cafeteria'
  | 'calculator'
  | 'campus'
  | 'degree'
  | 'difficulty'
  | 'feedback'
  | 'groups'
  | 'lostFound'
  | 'papers'
  | 'planner'
  | 'profile'
  | 'reviews'
  | 'rooms'
  | 'routine'
  | 'seats'
  | 'transcript';

export interface UniversityProfile {
  readonly id: UniversityId;
  /** Full legal name, for prose and page titles. */
  readonly name: string;
  /** What students actually call it, for chips and dense UI. */
  readonly shortName: string;
  /**
   * Email domains that identify a student of this campus. Matched as an exact
   * host suffix after the `@`, never as a substring — `bracu.ac.bd` must not
   * match `notbracu.ac.bd`, and a subdomain is a different domain unless it is
   * listed here in its own right.
   */
  readonly emailDomains: readonly string[];
  readonly grades: GradeScale;
  /** Features this campus has the data to support. Everything else stays hidden. */
  readonly features: readonly FeatureId[];
}

// ── BRACU ───────────────────────────────────────────────────────────────────
// The scale is taken straight from the existing constants rather than retyped,
// so introducing this registry cannot drift from what the calculator does
// today. Once every call site reads through a profile, ./grades.ts keeps the
// letter types and the BRACU numbers move inline here.
const BRACU_SCALE: GradeScale = {
  points: GRADES,
  pointsToGrade: POINTS_TO_GRADE,
  max: 4.0,
};

const BRACU: UniversityProfile = {
  id: 'bracu',
  name: 'BRAC University',
  shortName: 'BRACU',
  // Students only. Faculty/staff on the bare `bracu.ac.bd` domain are not
  // admitted today (js/auth/firebase.js) and widening that is a separate,
  // deliberate decision — not a side effect of this refactor.
  emailDomains: ['g.bracu.ac.bd'],
  grades: BRACU_SCALE,
  features: [
    'bus',
    'cafeteria',
    'calculator',
    'campus',
    'degree',
    'difficulty',
    'feedback',
    'groups',
    'lostFound',
    'papers',
    'planner',
    'profile',
    'reviews',
    'rooms',
    'routine',
    'seats',
    'transcript',
  ],
};

/** Every registered campus, keyed by id. */
export const UNIVERSITIES: Readonly<Record<UniversityId, UniversityProfile>> = {
  bracu: BRACU,
};

/**
 * The campus assumed when nothing else identifies one — the fallback for
 * pre-tenancy stored state, which is all BRACU by definition.
 */
export const DEFAULT_UNIVERSITY_ID: UniversityId = 'bracu';

export function isUniversityId(value: unknown): value is UniversityId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(UNIVERSITIES, value);
}

/** Look up a profile by id, or `null` if the id is not registered. */
export function getUniversity(id: unknown): UniversityProfile | null {
  return isUniversityId(id) ? UNIVERSITIES[id] : null;
}

/**
 * Resolve a profile from an email address, or `null` when no campus claims the
 * domain — the caller decides what to do with an unrecognised account.
 *
 * Matching is on the exact host after the `@`, lowercased. An address with
 * anything other than exactly one `@` is unrecognised rather than guessed at:
 * this feeds an auth decision, so an ambiguous address must fail closed rather
 * than resolve to whichever half looks more like a campus.
 */
export function universityForEmail(email: unknown): UniversityProfile | null {
  if (typeof email !== 'string') return null;

  const parts = email.split('@');
  if (parts.length !== 2) return null;
  if (!parts[0]) return null;

  const host = parts[1].trim().toLowerCase();
  if (!host) return null;

  for (const profile of Object.values(UNIVERSITIES)) {
    if (profile.emailDomains.includes(host)) return profile;
  }
  return null;
}

/** Every domain across every campus — useful for building sign-in hints. */
export function allUniversityDomains(): string[] {
  return Object.values(UNIVERSITIES).flatMap((p) => [...p.emailDomains]);
}

/** Whether a campus has a feature switched on. */
export function hasFeature(
  profile: UniversityProfile | null,
  feature: FeatureId,
): boolean {
  return profile != null && profile.features.includes(feature);
}

/**
 * Grade point for a letter on a given campus.
 *
 * Returns `undefined` when the campus does not award the letter at all, which
 * callers must distinguish from `null` — a grade that exists but carries no
 * point (P/I/W) and therefore participates in credit accounting differently.
 */
export function gradePointOn(
  scale: GradeScale,
  letter: string,
): GradePoint | undefined {
  return Object.prototype.hasOwnProperty.call(scale.points, letter)
    ? scale.points[letter as GradeLetter]
    : undefined;
}
