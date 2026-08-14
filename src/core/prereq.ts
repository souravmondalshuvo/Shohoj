// src/core/prereq.ts
//
// Prerequisite expressions (#478).
//
// The live CONNECT feed has been carrying a `prerequisiteCourses` field all
// along: a boolean expression per course, e.g.
//
//     CSE321  → (CSE221)
//     EEE101  → (PHY111 AND MAT110) OR (MAT105 AND PHY110)
//     CSE420  → (CSE340 AND CSE321 AND CSE331) OR (EEE410 AND CSE321 AND CSE331)
//
// Joined against the courses a student has actually passed, this answers
// "what can I register for next term" exactly rather than approximately —
// today they cross-reference a transcript against a curriculum PDF by hand.
//
// Two rules run through the whole module:
//
//   1. Unparseable fails OPEN. A parser bug must never tell a student they are
//      ineligible for a course they can take; the worst it may do is show one
//      they cannot. Every fail-open is reported so it can be counted, never
//      silently swallowed.
//   2. The missing set follows the CHEAPEST satisfying branch. For an OR, the
//      honest answer to "what do I still need" is the easiest way in, not the
//      union of every alternative.
//
// Pure: no DOM, no fetch, no storage.

import { type GradeLetter } from './grades.ts';
import type { CourseCode } from './types.ts';
import { UNIVERSITIES } from './university.ts';
import type { GradeScale } from './university.ts';

// ---------------------------------------------------------------------------
// Which grades satisfy a prerequisite
// ---------------------------------------------------------------------------

/**
 * Whether a grade counts as having completed the course, for prerequisite
 * purposes.
 *
 * The policy, stated rather than implied:
 *
 *   - Any letter carrying grade points above zero satisfies — down to the
 *     campus's own lowest pass, which is D- at BRACU and D at NSU. Reading the
 *     threshold off the scale rather than naming a letter means a campus that
 *     awards no D- is not quietly held to one.
 *   - `P` satisfies. A pass is a pass; it carries no points by design.
 *   - `F` and `F(NT)` do not. The course was attempted and not passed.
 *   - `W` does not. A withdrawal consumed an attempt but produced no result —
 *     the student has not done the course.
 *   - `I` does not, and neither does a blank grade. Both mean "no result yet",
 *     which is the running semester's normal state.
 *
 * Deliberately NOT modelled: programs that demand a minimum grade above the
 * lowest pass in a specific prerequisite chain. That rule is per-program and
 * not in any data the app holds, and inventing it would block students the
 * honest way round. Erring toward showing the course matches rule 1 at the top
 * of this file.
 */
export function gradeSatisfiesPrereq(
  grade: string | null | undefined,
  scale: GradeScale = UNIVERSITIES.bracu.grades,
): boolean {
  const letter = String(grade ?? '').trim() as GradeLetter;
  if (letter === 'P') return true;
  if (letter === 'F' || letter === 'F(NT)' || letter === 'W' || letter === 'I') return false;
  // A letter the campus does not award reads as undefined, so it satisfies
  // nothing — an A+ on an NSU transcript is a data error, not a pass.
  const points = Object.prototype.hasOwnProperty.call(scale.points, letter)
    ? scale.points[letter]
    : undefined;
  return typeof points === 'number' && points > 0;
}

// ---------------------------------------------------------------------------
// The expression tree
// ---------------------------------------------------------------------------

export type PrereqNode =
  | { readonly kind: 'course'; readonly code: CourseCode }
  | { readonly kind: 'and'; readonly children: readonly PrereqNode[] }
  | { readonly kind: 'or'; readonly children: readonly PrereqNode[] };

export type PrereqParse =
  /** Nothing declared — the course has no prerequisites. */
  | { readonly status: 'none' }
  | { readonly status: 'parsed'; readonly node: PrereqNode }
  /** Could not be read. Callers treat this as open and count it. */
  | { readonly status: 'unparseable'; readonly reason: string };

type Token =
  | { kind: 'code'; value: string }
  | { kind: 'and' }
  | { kind: 'or' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

/**
 * A course code as the feed writes them: 2–4 letters, 3 digits, an optional
 * trailing letter (CSE221, EEE101L, MAT110).
 */
const CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;

/**
 * Normalize a code for comparison — the feed and transcripts differ in case.
 *
 * Tolerates null/undefined rather than trusting the signature: every caller is
 * fed by the live CONNECT payload, where a missing field is a real possibility.
 */
export function normalizePrereqCode(code: string | null | undefined): CourseCode {
  return String(code ?? '')
    .trim()
    .toUpperCase();
}

function tokenize(raw: string): Token[] | null {
  const tokens: Token[] = [];
  // Parentheses are their own tokens; everything else splits on whitespace and
  // the commas some feed rows use in place of AND.
  const spaced = raw.replace(/([()])/g, ' $1 ').replace(/,/g, ' AND ');
  for (const piece of spaced.split(/\s+/)) {
    if (piece === '') continue;
    if (piece === '(') tokens.push({ kind: 'lparen' });
    else if (piece === ')') tokens.push({ kind: 'rparen' });
    else {
      const upper = piece.toUpperCase();
      if (upper === 'AND' || upper === '&&') tokens.push({ kind: 'and' });
      else if (upper === 'OR' || upper === '||') tokens.push({ kind: 'or' });
      else if (CODE_RE.test(upper)) tokens.push({ kind: 'code', value: upper });
      // Anything else is not something this grammar knows how to read. Bail
      // rather than guess — a guess here becomes a wrong eligibility answer.
      else return null;
    }
  }
  return tokens;
}

/**
 * Recursive descent over:
 *
 *   expr   := term ('OR' term)*
 *   term   := factor ('AND' factor)*
 *   factor := CODE | '(' expr ')'
 */
function parseTokens(tokens: readonly Token[]): PrereqNode | null {
  let pos = 0;

  function parseExpr(): PrereqNode | null {
    const first = parseTerm();
    if (!first) return null;
    const children = [first];
    while (tokens[pos]?.kind === 'or') {
      pos++;
      const next = parseTerm();
      if (!next) return null;
      children.push(next);
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  }

  function parseTerm(): PrereqNode | null {
    const first = parseFactor();
    if (!first) return null;
    const children = [first];
    while (tokens[pos]?.kind === 'and') {
      pos++;
      const next = parseFactor();
      if (!next) return null;
      children.push(next);
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  }

  function parseFactor(): PrereqNode | null {
    const token = tokens[pos];
    if (!token) return null;
    if (token.kind === 'code') {
      pos++;
      return { kind: 'course', code: token.value };
    }
    if (token.kind === 'lparen') {
      pos++;
      const inner = parseExpr();
      if (!inner) return null;
      if (tokens[pos]?.kind !== 'rparen') return null;
      pos++;
      return inner;
    }
    return null;
  }

  const node = parseExpr();
  // Trailing tokens mean the expression did not consume cleanly — e.g.
  // "CSE221 CSE110" with no operator between them.
  if (!node || pos !== tokens.length) return null;
  return node;
}

/** Read a feed `prerequisiteCourses` string. Never throws. */
export function parsePrerequisites(raw: string | null | undefined): PrereqParse {
  if (typeof raw !== 'string' || raw.trim() === '') return { status: 'none' };

  const tokens = tokenize(raw);
  if (tokens === null) return { status: 'unparseable', reason: 'unrecognized token' };
  if (tokens.length === 0) return { status: 'none' };

  const node = parseTokens(tokens);
  if (node === null) return { status: 'unparseable', reason: 'malformed expression' };
  return { status: 'parsed', node };
}

/** Every course code named anywhere in an expression. */
export function prereqCodes(node: PrereqNode): CourseCode[] {
  if (node.kind === 'course') return [node.code];
  const out: CourseCode[] = [];
  for (const child of node.children) {
    for (const code of prereqCodes(child)) if (!out.includes(code)) out.push(code);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface PrereqEvaluation {
  readonly satisfied: boolean;
  /**
   * What still stands between the student and this course, along the cheapest
   * satisfying branch. Empty when satisfied, and when the expression failed
   * open — in neither case is there anything to name.
   */
  readonly missing: readonly CourseCode[];
  /** The expression could not be read and was treated as no prerequisite. */
  readonly failedOpen: boolean;
}

/** Missing codes along the cheapest branch. */
function missingFor(node: PrereqNode, completed: ReadonlySet<CourseCode>): CourseCode[] {
  if (node.kind === 'course') {
    return completed.has(node.code) ? [] : [node.code];
  }

  if (node.kind === 'and') {
    const out: CourseCode[] = [];
    for (const child of node.children) {
      for (const code of missingFor(child, completed)) if (!out.includes(code)) out.push(code);
    }
    return out;
  }

  // OR: the easiest way in is the answer worth showing. Ties keep the first
  // branch, so the feed's own ordering decides — it tends to list the standard
  // route before the alternatives.
  let best: CourseCode[] | null = null;
  for (const child of node.children) {
    const candidate = missingFor(child, completed);
    if (candidate.length === 0) return [];
    if (best === null || candidate.length < best.length) best = candidate;
  }
  return best ?? [];
}

/**
 * Evaluate a raw feed expression against the codes a student has passed.
 *
 * An unreadable expression yields `satisfied: true` with `failedOpen: true`:
 * the course is offered rather than hidden, and the caller can count how often
 * that happened.
 */
export function evaluatePrerequisites(
  raw: string | null | undefined,
  completed: ReadonlySet<CourseCode>,
): PrereqEvaluation {
  const parsed = parsePrerequisites(raw);
  if (parsed.status === 'none') return { satisfied: true, missing: [], failedOpen: false };
  if (parsed.status === 'unparseable') return { satisfied: true, missing: [], failedOpen: true };

  const missing = missingFor(parsed.node, completed);
  return { satisfied: missing.length === 0, missing, failedOpen: false };
}

// ---------------------------------------------------------------------------
// The student's completed set
// ---------------------------------------------------------------------------

/** A course as the transcript snapshot stores it. */
export interface CompletedCourseInput {
  readonly name: string;
  readonly grade: string;
}

/**
 * The set of course codes a student has passed, from transcript rows.
 *
 * `extractCode` is injected because pulling a code out of "Data Structures
 * (CSE220)" is the transcript layer's job (getCourseCode), not this module's.
 */
export function completedCodes(
  courses: readonly CompletedCourseInput[],
  extractCode: (name: string) => string | null,
): Set<CourseCode> {
  const out = new Set<CourseCode>();
  for (const course of courses) {
    if (!gradeSatisfiesPrereq(course.grade ?? '')) continue;
    const code = extractCode(course.name ?? '');
    if (code) out.add(normalizePrereqCode(code));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The unlock map
// ---------------------------------------------------------------------------

/** One course the feed says is on offer this term. */
export interface OfferedCourse {
  readonly courseCode: string;
  readonly courseName: string;
  readonly credits: number;
  readonly prerequisiteCourses?: string | null;
}

export interface UnlockCandidate {
  readonly code: CourseCode;
  readonly name: string;
  readonly credits: number;
  /** Empty for an unlocked course; exactly one entry for a one-away course. */
  readonly missing: readonly CourseCode[];
  /**
   * How many *other* still-locked courses on offer this term would open up if
   * this one were passed. The number no amount of PDF-reading gives you.
   */
  readonly unlockCount: number;
}

export interface UnlockMap {
  /** Offered, prerequisites satisfied, not already passed. */
  readonly unlocked: readonly UnlockCandidate[];
  /** Blocked by exactly one missing course — a wall turned into a next step. */
  readonly oneAway: readonly UnlockCandidate[];
  /** The unlocked course opening the most doors, or null when none do. */
  readonly highestLeverage: UnlockCandidate | null;
  /** Expressions that could not be read and were treated as open. */
  readonly failedOpenCount: number;
  /** Whether any offered course declared a prerequisite at all. */
  readonly hasPrereqData: boolean;
}

// ---------------------------------------------------------------------------
// Program relevance (#539)
// ---------------------------------------------------------------------------

/**
 * The subject prefix of a course code — `CSE220` → `CSE`, `MAT110` → `MAT`.
 * Empty when the code doesn't split that way, so an unparseable code can never
 * be silently grouped under some other subject.
 */
export function coursePrefix(code: string | null | undefined): string {
  const match = /^([A-Z]{2,4})\d/.exec(normalizePrereqCode(code));
  return match ? match[1] : '';
}

/**
 * Shape of the departments table, injected rather than imported: this module
 * stays a pure prerequisite layer that knows nothing about the catalogue, and
 * the caller supplies whichever table it has (legacy `DEPARTMENTS`, or the
 * typed one at cutover).
 */
export interface ProgramTableEntry {
  readonly label: string;
  readonly presets?: readonly { readonly courses?: readonly { readonly name?: string }[] }[];
}

/**
 * The subjects a student's degree actually draws on.
 *
 * Two sources, unioned, because neither alone is honest:
 *
 *   - the program's model curriculum, which is what the degree is made of;
 *   - the subjects the student has already taken, which catches the electives
 *     the model curriculum omits — a real transcript is evidence no table can
 *     override.
 *
 * An unrecognized program label yields an empty set, which callers must read as
 * "no filter" rather than "nothing is relevant": guessing a degree from a label
 * we don't know would be worse than showing everything.
 */
export function programSubjects(
  programLabel: string | null | undefined,
  programs: Readonly<Record<string, ProgramTableEntry>>,
  completed: ReadonlySet<CourseCode> = new Set(),
): Set<string> {
  const subjects = new Set<string>();

  const label = String(programLabel ?? '')
    .trim()
    .toLowerCase();
  const entry =
    label === ''
      ? undefined
      : Object.values(programs ?? {}).find(
          (p) =>
            String(p?.label ?? '')
              .trim()
              .toLowerCase() === label,
        );

  if (entry) {
    for (const preset of entry.presets ?? []) {
      for (const course of preset.courses ?? []) {
        // Curriculum entries carry the code in parentheses: "Algorithms (CSE221)".
        const code = /\(([A-Za-z]{2,4}\d{3})\)/.exec(String(course?.name ?? ''))?.[1];
        const prefix = coursePrefix(code);
        if (prefix) subjects.add(prefix);
      }
    }
  }

  // Only extend a program we recognized. Without one there is no filter at all,
  // and seeding it from the transcript alone would narrow the map to whatever
  // the student happened to take first.
  if (subjects.size > 0) {
    for (const code of completed) {
      const prefix = coursePrefix(code);
      if (prefix) subjects.add(prefix);
    }
  }

  return subjects;
}

/**
 * Keep only what belongs to the student's degree. An empty subject set means we
 * could not identify the program, and everything passes through unchanged.
 *
 * This runs *before* the unlock map is built, not after it: `unlockCount` is
 * measured across the courses it is given, so filtering the rendered lists
 * alone would still rank a course by doors it opens into another department.
 */
export function filterToSubjects<T extends OfferedCourse>(
  offered: readonly T[],
  subjects: ReadonlySet<string>,
): T[] {
  if (subjects.size === 0) return [...offered];
  return offered.filter((course) => subjects.has(coursePrefix(course.courseCode)));
}

/** Collapse the feed's per-section rows to one entry per course. */
function distinctCourses(offered: readonly OfferedCourse[]): Map<CourseCode, OfferedCourse> {
  const byCode = new Map<CourseCode, OfferedCourse>();
  for (const course of offered) {
    const code = normalizePrereqCode(course.courseCode ?? '');
    if (!code) continue;
    const existing = byCode.get(code);
    // Prefer the row that actually carries a prerequisite string: sections of
    // the same course occasionally differ, and a blank one would silently
    // widen eligibility.
    if (!existing || (!existing.prerequisiteCourses && course.prerequisiteCourses)) {
      byCode.set(code, course);
    }
  }
  return byCode;
}

/**
 * Join what is on offer against what the student has passed.
 *
 * `unlockCount` is measured by asking, for each unlocked course, how many
 * currently-locked courses would flip to satisfied with it added — so it
 * counts real doors opened this term, not abstract downstream depth.
 */
export function buildUnlockMap(
  offered: readonly OfferedCourse[],
  completed: ReadonlySet<CourseCode>,
): UnlockMap {
  const byCode = distinctCourses(offered);

  let failedOpenCount = 0;
  let hasPrereqData = false;

  const evaluated = new Map<CourseCode, PrereqEvaluation>();
  for (const [code, course] of byCode) {
    if ((course.prerequisiteCourses ?? '').trim() !== '') hasPrereqData = true;
    const evaluation = evaluatePrerequisites(course.prerequisiteCourses, completed);
    if (evaluation.failedOpen) failedOpenCount++;
    evaluated.set(code, evaluation);
  }

  const locked = [...byCode.keys()].filter((code) => !evaluated.get(code)?.satisfied);

  const toCandidate = (code: CourseCode, unlockCount: number): UnlockCandidate => {
    const course = byCode.get(code) as OfferedCourse;
    return {
      code,
      name: (course.courseName ?? '').trim(),
      credits: Number.isFinite(course.credits) ? Number(course.credits) : 0,
      missing: evaluated.get(code)?.missing ?? [],
      unlockCount,
    };
  };

  const unlocked: UnlockCandidate[] = [];
  for (const [code, evaluation] of evaluated) {
    if (!evaluation.satisfied) continue;
    // Already passed — not something to register for.
    if (completed.has(code)) continue;

    const withCourse = new Set(completed);
    withCourse.add(code);
    let unlockCount = 0;
    for (const other of locked) {
      if (other === code) continue;
      const otherCourse = byCode.get(other) as OfferedCourse;
      if (evaluatePrerequisites(otherCourse.prerequisiteCourses, withCourse).satisfied) {
        unlockCount++;
      }
    }
    unlocked.push(toCandidate(code, unlockCount));
  }

  // "One course away" has to mean one course away *in practice*. A course whose
  // single missing prerequisite is itself locked is not a next step — CSE321
  // needing only CSE221 is useless advice when CSE221 needs CSE220 first. So the
  // missing course must be on offer this term and takeable right now; otherwise
  // this card would turn a wall into a different wall.
  const unlockedNow = new Set(
    [...evaluated.entries()].filter(([, e]) => e.satisfied).map(([code]) => code),
  );
  const oneAway = locked
    .filter((code) => {
      const missing = evaluated.get(code)?.missing ?? [];
      return missing.length === 1 && unlockedNow.has(missing[0]);
    })
    .map((code) => toCandidate(code, 0));

  // Deterministic ordering: leverage first, then code, so a tie never reshuffles
  // between renders.
  unlocked.sort((a, b) => b.unlockCount - a.unlockCount || a.code.localeCompare(b.code));
  oneAway.sort((a, b) => a.code.localeCompare(b.code));

  const highestLeverage = unlocked.length > 0 && unlocked[0].unlockCount > 0 ? unlocked[0] : null;

  return { unlocked, oneAway, highestLeverage, failedOpenCount, hasPrereqData };
}
