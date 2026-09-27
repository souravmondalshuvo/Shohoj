// Twin of src/core/university.ts — hand-maintained, not generated.
// src/core/university.ts is the source of truth: change a campus there first,
// then mirror it here. tests/twinParity.test.js fails if the two drift, and
// tests/universityData.test.js holds NSU's rules to data/campuses/nsu/profile.json.
//
// The legacy bundle's copy of the university registry: each campus's grading
// scale, retake and repeat rules, credit-load limits and email domains. gpa-core
// takes its rules from a profile here, defaulting to BRACU's, so a campus is a
// new entry rather than a fork of the calculator. Which profile is active is
// the caller's to decide.
import { GRADES, POINTS_TO_GRADE } from './grades.js';
// ── BRACU ───────────────────────────────────────────────────────────────────
// The scale is the existing grade constants rather than a retyped copy, so the
// registry cannot drift from what the calculator already does. The mark
// cutoffs are the commonly published scale, not sourced from a document in
// this repo — see the note in src/core/university.ts.
const BRACU_MARKS = [
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
const BRACU_SCALE = {
    points: GRADES,
    pointsToGrade: POINTS_TO_GRADE,
    max: 4.0,
    marks: BRACU_MARKS,
};
const BRACU = {
    id: 'bracu',
    name: 'BRAC University',
    shortName: 'BRACU',
    emailDomains: ['g.bracu.ac.bd'],
    grades: BRACU_SCALE,
    // Students who started before Fall 2024 keep the best attempt; everyone
    // from Fall 2024 on keeps the latest.
    retake: { kind: 'best-before', cutoff: { season: 'Fall', year: 2024 } },
    // Strictly below 3.0, so a B is not repeatable.
    repeat: { threshold: 3.0, inclusive: false },
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
        'playground',
        'planner',
        'profile',
        'reviews',
        'rooms',
        'routine',
        'seats',
        'tasks',
        'transcript',
    ],
};
// ── NSU ─────────────────────────────────────────────────────────────────────
// From NSU's official grading policy. No `A+` and no `D-`: both are absent from
// `points`, so gradePointOn reports them as undefined — not awarded here —
// rather than scoring them.
const NSU_SCALE = {
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
    // Stricter than BRACU's: an A- needs 90 rather than 85, a pass needs 60.
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
const NSU = {
    id: 'nsu',
    name: 'North South University',
    shortName: 'NSU',
    // Students and staff share this domain, so it alone doesn't identify a student.
    emailDomains: ['northsouth.edu'],
    grades: NSU_SCALE,
    // Best grade counts, with no start-term cutoff.
    retake: { kind: 'best' },
    // "B or lower" — a B is exactly 3.0, so the threshold includes it.
    repeat: { threshold: 3.0, inclusive: true },
    // No creditLoad: NSU publishes no per-semester maximum, and no warning
    // beats BRACU's limits shown to an NSU student.
    features: [
        'calculator',
        'degree',
        'feedback',
        'planner',
        'playground',
        'profile',
        'transcript',
        'groups',
        'papers',
        'reviews',
    ],
};
/** Every registered campus, keyed by id. */
export const UNIVERSITIES = {
    bracu: BRACU,
    nsu: NSU,
};
/** The campus assumed when nothing else identifies one — all pre-tenancy data is BRACU's. */
export const DEFAULT_UNIVERSITY_ID = 'bracu';
export function isUniversityId(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNIVERSITIES, value);
}
/** Look up a profile by id, or `null` if the id is not registered. */
export function getUniversity(id) {
    return isUniversityId(id) ? UNIVERSITIES[id] : null;
}
/**
 * Resolve a profile from an email address, or `null` when no campus claims the
 * domain. Exact host match, lowercased; anything but exactly one `@` fails
 * closed, since this feeds an auth decision.
 */
export function universityForEmail(email) {
    if (typeof email !== 'string')
        return null;
    const parts = email.split('@');
    if (parts.length !== 2)
        return null;
    if (!parts[0])
        return null;
    const host = (parts[1] ?? '').trim().toLowerCase();
    if (!host)
        return null;
    for (const profile of Object.values(UNIVERSITIES)) {
        if (profile.emailDomains.includes(host))
            return profile;
    }
    return null;
}
/** Every domain across every campus. */
export function allUniversityDomains() {
    return Object.values(UNIVERSITIES).flatMap((p) => [...p.emailDomains]);
}
/** Whether a grade point is low enough for the campus to allow a repeat. */
export function isRepeatableGrade(gradePoint, eligibility) {
    return eligibility.inclusive
        ? gradePoint <= eligibility.threshold
        : gradePoint < eligibility.threshold;
}
/** Whether a campus has a feature switched on. */
export function hasFeature(profile, feature) {
    return profile != null && profile.features.includes(feature);
}
/**
 * Grade point for a letter on a given campus: `undefined` when the campus does
 * not award the letter, `null` when it does but it carries no point (P/I/W).
 */
export function gradePointOn(scale, letter) {
    return Object.prototype.hasOwnProperty.call(scale.points, letter)
        ? scale.points[letter]
        : undefined;
}
