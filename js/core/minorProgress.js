// Twin of src/features/calculator/minorProgress.ts — hand-maintained, not generated.
// src/features/calculator/minorProgress.ts is the source of truth: change it
// there first, then mirror the change here. tests/twinParity.test.js fails if
// the two drift.
//
// Pure minor-progress model (#731, legacy #766): given a student's semesters
// and a minor program, which requirements are discharged, how many elective
// credits are banked, and what is left. A course in a running semester is in
// progress; a course in a completed semester counts only with a passing grade
// that is not P, I or F(NT) — the same rule as the degree tracker.

import { GRADES } from './grades.js';
import { isElectiveCode } from './minors.js';

// BRACU's scale, the typed side's default (UNIVERSITIES.bracu.grades), whose
// points table is this same GRADES.
const _MINOR_DEFAULT_SCALE = { points: GRADES };

// The course code a name carries: "Calculus I (MAT123)", bare "MAT123", or
// "MAT123 Calculus I". Mirrors parseReviewableCode (reviewableCourse.ts),
// which has no legacy copy.
function _minorParseCode(courseName) {
  const raw = String(courseName ?? '').trim();
  if (!raw) return '';
  const match =
    raw.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/i) ||
    raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)$/i) ||
    raw.match(/^([A-Z]{2,4}\d{3}[A-Z]?)\b/i);
  return match?.[1]?.toUpperCase() ?? '';
}

function _minorIsPassingGrade(grade, scale) {
  if (!grade || grade === 'P' || grade === 'I' || grade === 'F(NT)') return false;
  const gp = Object.prototype.hasOwnProperty.call(scale.points, grade)
    ? scale.points[grade]
    : undefined;
  return gp !== undefined && gp !== null && gp > 0;
}

/** "Optimization (CSE402)" → "Optimization"; "" when the name is only a code. */
function _minorStripCodeSuffix(name) {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^[A-Z]{2,4}\d{3}[A-Z]?\b\s*[-–:]?\s*/i, '')
    .trim();
}

/**
 * Flatten the semesters into coded courses. Uncoded lines and summary blocks
 * are skipped: a requirement is stated in codes, and a summary cannot say which
 * courses it contains.
 */
export function collectTakenCourses(semesters, scale) {
  const out = [];
  for (const semester of semesters) {
    if (semester.summary) continue;
    const running = !!semester.running;
    for (const course of semester.courses) {
      const name = String(course.name ?? '').trim();
      if (!name) continue;
      const code = _minorParseCode(name);
      if (!code) continue;
      const grade = String(course.grade ?? '');
      if (!running && !_minorIsPassingGrade(grade, scale)) continue;
      out.push({
        code,
        name,
        title: _minorStripCodeSuffix(name) || name,
        credits: typeof course.credits === 'number' ? course.credits : 0,
        grade,
        running,
      });
    }
  }
  return out;
}

// A completed, passing course beats one in progress; among equals the first
// entered wins.
function _minorMatchRequirement(requirement, taken) {
  const candidates = taken.filter((c) => requirement.codes.includes(c.code));
  const earned = candidates.find((c) => !c.running);
  if (earned) return { requirement, status: 'earned', match: earned };
  const inProgress = candidates.find((c) => c.running);
  if (inProgress) return { requirement, status: 'in-progress', match: inProgress };
  return { requirement, status: 'unmet', match: null };
}

/**
 * Minor progress for one program, or null when no program is selected. Core
 * credits count against the requirement; elective credits are the student's
 * own, capped at the published elective total.
 */
export function computeMinorProgress(semesters, program, scale = _MINOR_DEFAULT_SCALE) {
  if (!program) return null;

  const taken = collectTakenCourses(semesters, scale);
  const core = program.core.map((requirement) => _minorMatchRequirement(requirement, taken));

  // A course spoken for by a core requirement — even one merely in progress —
  // cannot also count as an elective. Keyed by code: a retake is one course.
  const spent = new Set(core.map((r) => r.match?.code).filter((c) => !!c));

  const electiveCandidates = taken.filter(
    (c) => !spent.has(c.code) && isElectiveCode(c.code, program.electives),
  );
  const seenElective = new Set();
  const earnedCourses = [];
  const inProgressCourses = [];
  for (const course of electiveCandidates) {
    if (seenElective.has(course.code)) continue;
    seenElective.add(course.code);
    if (course.running) inProgressCourses.push(course);
    else earnedCourses.push(course);
  }

  const rawElectiveEarned = earnedCourses.reduce((sum, c) => sum + c.credits, 0);
  const electiveEarned = Math.min(rawElectiveEarned, program.electives.credits);
  const electiveInProgress = Math.min(
    inProgressCourses.reduce((sum, c) => sum + c.credits, 0),
    Math.max(0, program.electives.credits - electiveEarned),
  );

  const coreEarnedCredits = core
    .filter((r) => r.status === 'earned')
    .reduce((sum, r) => sum + r.requirement.credits, 0);
  const coreInProgressCredits = core
    .filter((r) => r.status === 'in-progress')
    .reduce((sum, r) => sum + r.requirement.credits, 0);

  const creditsEarned = coreEarnedCredits + electiveEarned;
  const creditsInProgress = coreInProgressCredits + electiveInProgress;

  return {
    program,
    core,
    electives: {
      creditsRequired: program.electives.credits,
      creditsEarned: electiveEarned,
      creditsInProgress: electiveInProgress,
      earnedCourses,
      inProgressCourses,
    },
    totalRequired: program.totalCredits,
    creditsEarned,
    creditsInProgress,
    creditsRemaining: Math.max(0, program.totalCredits - creditsEarned),
    progressPct: Math.min((creditsEarned / program.totalCredits) * 100, 100),
    coreEarned: core.filter((r) => r.status === 'earned').length,
    complete: creditsEarned >= program.totalCredits,
  };
}
