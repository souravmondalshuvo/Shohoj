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

import { GRADES, POINTS_TO_GRADE, type GradeLetter, type GradePoint } from './grades.ts';
import type { SemesterSeason } from './types.ts';

/** Every campus Shohoj can serve. */
export type UniversityId = 'bracu' | 'nsu';

/**
 * A campus grading scale.
 *
 * `points` is partial because the letter union spans every campus: BRACU awards
 * `A+` and `D-`, another university may not, and a missing key reads as
 * `undefined` — "this campus does not award that grade" — which callers already
 * treat the same way they treat an unrecognised grade today.
 */
/**
 * One band of an absolute mark → letter scale. `min` is inclusive: on BRACU's
 * table a mark of exactly 85.0 is an A-, not a B+.
 */
export interface MarkTier {
  readonly letter: GradeLetter;
  readonly min: number;
}

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
  /**
   * Absolute mark → letter cutoffs, highest first, used by the course-marks
   * model to answer "what do I need on the final for an A-".
   *
   * These diverge far more between campuses than the grade points do, and in
   * the direction that hurts: BRACU awards an A- from 85 while NSU needs 90,
   * and BRACU passes a D at 52 where NSU needs 60. Applying one campus's
   * cutoffs to the other's marks overstates a letter by a full grade in
   * places, which is exactly the kind of quiet wrongness that makes a student
   * plan the wrong final.
   */
  readonly marks: readonly MarkTier[];
}

/** A start term, as coarse as the retake rules need it to be. */
export interface Term {
  readonly season: SemesterSeason;
  readonly year: number;
}

/**
 * How a campus counts a course that was taken more than once.
 *
 * `best` keeps the highest attempt, `latest` keeps the most recent one. BRACU
 * switched from one to the other partway through, and which rule applies to a
 * given student depends on when they *started* — not on when they retook — so
 * `best-before` carries the cutoff term rather than a plain boolean.
 */
export type RetakePolicy =
  | { readonly kind: 'best' }
  | { readonly kind: 'latest' }
  /** `best` for students who started strictly before `cutoff`, `latest` after. */
  | { readonly kind: 'best-before'; readonly cutoff: Term };

/**
 * Per-semester credit load limits, used to warn a student that a registration
 * is under- or over-loaded.
 *
 * Optional on purpose: a campus whose limits we have not confirmed shows no
 * warning at all, which is strictly better than showing another campus's.
 */
export interface CreditLoadRules {
  /** Below this, the student is under the full-time minimum. */
  readonly min: number;
  /** Above this, registration is not permitted at all. */
  readonly max: number;
  /** Above this but within `max`, registration needs departmental approval. */
  readonly warnAbove: number;
}

/**
 * Which grades a student may repeat to improve them.
 *
 * `inclusive` is not a detail: BRACU allows a repeat strictly below 3.0, while
 * NSU's published rule is "B or lower" — and a B is exactly 3.0. The same
 * threshold with the wrong boundary tells a whole cohort of B students the
 * wrong thing about whether they can retake.
 */
export interface RepeatEligibility {
  readonly threshold: number;
  readonly inclusive: boolean;
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
  readonly retake: RetakePolicy;
  /**
   * How many times a course may be retaken, if the campus caps it. `undefined`
   * means no published cap — not "unlimited proven", just "not our claim to
   * make", so callers should not surface a limit that was never stated.
   */
  readonly maxRetakes?: number;
  readonly repeat: RepeatEligibility;
  /** Omitted where the campus's limits are not confirmed — see CreditLoadRules. */
  readonly creditLoad?: CreditLoadRules;
  /** Features this campus has the data to support. Everything else stays hidden. */
  readonly features: readonly FeatureId[];
}

// ── BRACU ───────────────────────────────────────────────────────────────────
// The scale is taken straight from the existing constants rather than retyped,
// so introducing this registry cannot drift from what the calculator does
// today. Once every call site reads through a profile, ./grades.ts keeps the
// letter types and the BRACU numbers move inline here.
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ VERIFY BEFORE RELYING ON THIS. These cutoffs are the commonly published    │
// │ BRACU scale, but they are not sourced from a document in this repo and the │
// │ university has revised grading policy before. Confirm against the current  │
// │ official Grading Policy and correct here — this is the single definition.  │
// │                                                                            │
// │ Note the inversion worth fixing: NSU's cutoffs below ARE sourced from the  │
// │ registrar's published table, so the campus we support best is the one we   │
// │ just added.                                                                │
// └───────────────────────────────────────────────────────────────────────────┘
const BRACU_MARKS: readonly MarkTier[] = [
  { letter: 'A+', min: 97 },
  { letter: 'A', min: 90 },
  { letter: 'A-', min: 85 },
  { letter: 'B+', min: 80 },
  { letter: 'B', min: 75 },
  { letter: 'B-', min: 70 },
  { letter: 'C+', min: 65 },
  { letter: 'C', min: 60 },
  { letter: 'C-', min: 57 },
  { letter: 'D+', min: 55 },
  { letter: 'D', min: 52 },
  { letter: 'D-', min: 50 },
  { letter: 'F', min: 0 },
];

const BRACU_SCALE: GradeScale = {
  points: GRADES,
  pointsToGrade: POINTS_TO_GRADE,
  max: 4.0,
  marks: BRACU_MARKS,
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
  // Mirrors gpaCoreUsesBestGradePolicyImpl: students who started before Fall
  // 2024 keep the best attempt, everyone from Fall 2024 on keeps the latest.
  retake: { kind: 'best-before', cutoff: { season: 'Fall', year: 2024 } },
  // gpaCoreIsRepeatEligibleImpl: strictly below 3.0, so a B is not repeatable.
  repeat: { threshold: 3.0, inclusive: false },
  // gpaCoreGetSemesterCreditWarningImpl.
  creditLoad: { min: 9, max: 15, warnAbove: 12 },
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

// ── NSU ─────────────────────────────────────────────────────────────────────
// Scale transcribed from the official grading policy
// (northsouth.edu/academic/grading-policy.html) and cross-checked against
// Scholaro's credential registry; the two agree letter for letter.
//
// Two differences from BRACU that the calculator has to get right: NSU awards
// no `A+` (an A is the 4.0 ceiling) and no `D-` (a D at 1.0 is the lowest pass).
// Both are simply absent from `points`, so gradePointOn reports them as
// undefined — "not awarded here" — rather than silently scoring them.
//
// Deliberately unresolved, pending confirmation from the registrar:
//   • whether NSU awards a `P` grade — the policy page lists only I and W;
//   • whether a `W` consumes an attempt for credit accounting, as it does at
//     BRACU;
//   • whether the one-retake cap is university-wide or only the ECE
//     department's, which is why maxRetakes is left unset rather than guessed.
const NSU_SCALE: GradeScale = {
  points: {
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    F: 0.0,
    I: null,
    W: null,
  },
  pointsToGrade: [
    [4.0, 'A'],
    [3.7, 'A-'],
    [3.3, 'B+'],
    [3.0, 'B'],
    [2.7, 'B-'],
    [2.3, 'C+'],
    [2.0, 'C'],
    [1.7, 'C-'],
    [1.3, 'D+'],
    [1.0, 'D'],
    [0.0, 'F'],
  ],
  max: 4.0,
  // Transcribed from the same official grading policy page as the points
  // above, where the letter table and the mark ranges sit side by side. Note
  // how much stricter these are than BRACU's: an A- needs 90 rather than 85,
  // and a passing D needs 60 rather than 52.
  marks: [
    { letter: 'A', min: 93 },
    { letter: 'A-', min: 90 },
    { letter: 'B+', min: 87 },
    { letter: 'B', min: 83 },
    { letter: 'B-', min: 80 },
    { letter: 'C+', min: 77 },
    { letter: 'C', min: 73 },
    { letter: 'C-', min: 70 },
    { letter: 'D+', min: 67 },
    { letter: 'D', min: 60 },
    { letter: 'F', min: 0 },
  ],
};

const NSU: UniversityProfile = {
  id: 'nsu',
  name: 'North South University',
  shortName: 'NSU',
  // NSU runs on Google Workspace, so the existing Google sign-in covers it.
  // Unlike BRACU there is no separate student subdomain, so this domain does
  // not by itself distinguish a student from faculty or staff.
  emailDomains: ['northsouth.edu'],
  grades: NSU_SCALE,
  // "Only the best grade will be used to calculate the CGPA" — unconditional,
  // with no start-term cutoff of the kind BRACU applies.
  retake: { kind: 'best' },
  // "A student may repeat a course in which the grade is 'B' or lower" — a B is
  // exactly 3.0, so unlike BRACU the threshold includes it.
  repeat: { threshold: 3.0, inclusive: true },
  // creditLoad is deliberately absent: NSU's per-semester minimum and maximum
  // were not confirmed, and no warning beats BRACU's warning shown to an NSU
  // student.
  features: [
    // Everything here works from a transcript the student supplies.
    'calculator',
    'degree',
    'feedback',
    'planner',
    'profile',
    'transcript',
    // User-generated: functional from day one, simply empty until students post.
    'groups',
    'papers',
    'reviews',
  ],
  // Deliberately off, and why:
  //   seats/routine/rooms/campus — all derive from BRACU's CONNECT feed. NSU's
  //     portal is RDS (rds3.northsouth.edu) and no equivalent public feed is
  //     known, so these would render empty shells rather than a working tab.
  //   bus/cafeteria — hand-collected Merul Badda campus data.
  //   lostFound — keyed to BRACU's `FFZ-NNK` tower room codes.
  //   difficulty — derived from review volume, meaningless at zero reviews.
};

/** Every registered campus, keyed by id. */
export const UNIVERSITIES: Readonly<Record<UniversityId, UniversityProfile>> = {
  bracu: BRACU,
  nsu: NSU,
};

/**
 * The campus assumed when nothing else identifies one — the fallback for
 * pre-tenancy stored state, which is all BRACU by definition.
 */
export const DEFAULT_UNIVERSITY_ID: UniversityId = 'bracu';

export function isUniversityId(value: unknown): value is UniversityId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNIVERSITIES, value);
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

/**
 * Whether a grade point is low enough that the campus lets the student repeat
 * it for improvement.
 *
 * Defined once, here, on purpose. The same boundary is asked in two places —
 * the GPA core's eligibility check and the simulator's retake shortlist — and
 * BRACU and NSU sit on opposite sides of it for a B at exactly 3.0. Two copies
 * of the comparison is two chances to get the boundary wrong.
 */
export function isRepeatableGrade(gradePoint: number, eligibility: RepeatEligibility): boolean {
  return eligibility.inclusive
    ? gradePoint <= eligibility.threshold
    : gradePoint < eligibility.threshold;
}

/** Whether a campus has a feature switched on. */
export function hasFeature(profile: UniversityProfile | null, feature: FeatureId): boolean {
  return profile != null && profile.features.includes(feature);
}

/**
 * Grade point for a letter on a given campus.
 *
 * Returns `undefined` when the campus does not award the letter at all, which
 * callers must distinguish from `null` — a grade that exists but carries no
 * point (P/I/W) and therefore participates in credit accounting differently.
 */
export function gradePointOn(scale: GradeScale, letter: string): GradePoint | undefined {
  return Object.prototype.hasOwnProperty.call(scale.points, letter)
    ? scale.points[letter as GradeLetter]
    : undefined;
}
