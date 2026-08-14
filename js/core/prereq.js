// Twin of src/core/prereq.ts — hand-maintained, not generated.
// src/core/prereq.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Prerequisite expressions from the CONNECT feed (#478), and the unlock map
// built from them. Two rules run through the module: an unparseable expression
// fails OPEN and is counted (a parser bug must never tell a student they are
// ineligible), and the missing set follows the cheapest satisfying branch.

import { GRADES } from './grades.js';

/**
 * Whether a grade counts as having completed the course, for prerequisite
 * purposes. Any letter carrying points (A+ … D-) satisfies, as does P; F,
 * F(NT), W, I and a blank do not. Program-specific minimum-grade rules are
 * deliberately not modelled — see the typed twin for the full rationale.
 */
export function gradeSatisfiesPrereq(grade) {
  const letter = String(grade ?? '').trim();
  if (letter === 'P') return true;
  if (letter === 'F' || letter === 'F(NT)' || letter === 'W' || letter === 'I') return false;
  const points = GRADES[letter];
  return typeof points === 'number' && points > 0;
}

const CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;

/** Normalize a code for comparison — the feed and transcripts differ in case. */
export function normalizePrereqCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

function tokenize(raw) {
  const tokens = [];
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
      else return null;
    }
  }
  return tokens;
}

/**
 * Recursive descent over:
 *   expr := term ('OR' term)* / term := factor ('AND' factor)* / factor := CODE | '(' expr ')'
 */
function parseTokens(tokens) {
  let pos = 0;

  function parseExpr() {
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

  function parseTerm() {
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

  function parseFactor() {
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
  if (!node || pos !== tokens.length) return null;
  return node;
}

/** Read a feed `prerequisiteCourses` string. Never throws. */
export function parsePrerequisites(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { status: 'none' };

  const tokens = tokenize(raw);
  if (tokens === null) return { status: 'unparseable', reason: 'unrecognized token' };
  if (tokens.length === 0) return { status: 'none' };

  const node = parseTokens(tokens);
  if (node === null) return { status: 'unparseable', reason: 'malformed expression' };
  return { status: 'parsed', node };
}

/** Every course code named anywhere in an expression. */
export function prereqCodes(node) {
  if (node.kind === 'course') return [node.code];
  const out = [];
  for (const child of node.children) {
    for (const code of prereqCodes(child)) if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Missing codes along the cheapest branch. */
function missingFor(node, completed) {
  if (node.kind === 'course') {
    return completed.has(node.code) ? [] : [node.code];
  }

  if (node.kind === 'and') {
    const out = [];
    for (const child of node.children) {
      for (const code of missingFor(child, completed)) if (!out.includes(code)) out.push(code);
    }
    return out;
  }

  let best = null;
  for (const child of node.children) {
    const candidate = missingFor(child, completed);
    if (candidate.length === 0) return [];
    if (best === null || candidate.length < best.length) best = candidate;
  }
  return best ?? [];
}

/**
 * Evaluate a raw feed expression against the codes a student has passed. An
 * unreadable expression yields satisfied:true with failedOpen:true — offered
 * rather than hidden, and countable.
 */
export function evaluatePrerequisites(raw, completed) {
  const parsed = parsePrerequisites(raw);
  if (parsed.status === 'none') return { satisfied: true, missing: [], failedOpen: false };
  if (parsed.status === 'unparseable') return { satisfied: true, missing: [], failedOpen: true };

  const missing = missingFor(parsed.node, completed);
  return { satisfied: missing.length === 0, missing, failedOpen: false };
}

/**
 * The set of course codes a student has passed, from transcript rows.
 * `extractCode` is injected — pulling a code out of "Data Structures (CSE220)"
 * is the transcript layer's job (getCourseCode), not this module's.
 */
export function completedCodes(courses, extractCode) {
  const out = new Set();
  for (const course of courses) {
    if (!gradeSatisfiesPrereq(course.grade ?? '')) continue;
    const code = extractCode(course.name ?? '');
    if (code) out.add(normalizePrereqCode(code));
  }
  return out;
}

/**
 * The subject prefix of a course code — `CSE220` → `CSE`, `MAT110` → `MAT`.
 * Empty when the code doesn't split that way, so an unparseable code can never
 * be silently grouped under some other subject.
 */
export function coursePrefix(code) {
  const match = /^([A-Z]{2,4})\d/.exec(normalizePrereqCode(code));
  return match ? match[1] : '';
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
 * The departments table is injected rather than imported: this module stays a
 * pure prerequisite layer that knows nothing about the catalogue.
 *
 * An unrecognized program label yields an empty set, which callers must read as
 * "no filter" rather than "nothing is relevant": guessing a degree from a label
 * we don't know would be worse than showing everything.
 */
export function programSubjects(programLabel, programs, completed = new Set()) {
  const subjects = new Set();

  const label = String(programLabel ?? '').trim().toLowerCase();
  const entry = label === ''
    ? undefined
    : Object.values(programs ?? {}).find(p => String(p?.label ?? '').trim().toLowerCase() === label);

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
export function filterToSubjects(offered, subjects) {
  if (subjects.size === 0) return [...offered];
  return offered.filter(course => subjects.has(coursePrefix(course.courseCode)));
}

/** Collapse the feed's per-section rows to one entry per course. */
function distinctCourses(offered) {
  const byCode = new Map();
  for (const course of offered) {
    const code = normalizePrereqCode(course.courseCode ?? '');
    if (!code) continue;
    const existing = byCode.get(code);
    // Prefer the row that actually carries a prerequisite string — a blank one
    // would silently widen eligibility.
    if (!existing || (!existing.prerequisiteCourses && course.prerequisiteCourses)) {
      byCode.set(code, course);
    }
  }
  return byCode;
}

/**
 * Join what is on offer against what the student has passed. `unlockCount`
 * counts real doors opened this term, not abstract downstream depth.
 */
export function buildUnlockMap(offered, completed) {
  const byCode = distinctCourses(offered);

  let failedOpenCount = 0;
  let hasPrereqData = false;

  const evaluated = new Map();
  for (const [code, course] of byCode) {
    if (String(course.prerequisiteCourses ?? '').trim() !== '') hasPrereqData = true;
    const evaluation = evaluatePrerequisites(course.prerequisiteCourses, completed);
    if (evaluation.failedOpen) failedOpenCount++;
    evaluated.set(code, evaluation);
  }

  const locked = [...byCode.keys()].filter(code => !evaluated.get(code)?.satisfied);

  const toCandidate = (code, unlockCount) => {
    const course = byCode.get(code);
    return {
      code,
      name: String(course.courseName ?? '').trim(),
      credits: Number.isFinite(course.credits) ? Number(course.credits) : 0,
      missing: evaluated.get(code)?.missing ?? [],
      unlockCount,
    };
  };

  const unlocked = [];
  for (const [code, evaluation] of evaluated) {
    if (!evaluation.satisfied) continue;
    if (completed.has(code)) continue;

    const withCourse = new Set(completed);
    withCourse.add(code);
    let unlockCount = 0;
    for (const other of locked) {
      if (other === code) continue;
      const otherCourse = byCode.get(other);
      if (evaluatePrerequisites(otherCourse.prerequisiteCourses, withCourse).satisfied) {
        unlockCount++;
      }
    }
    unlocked.push(toCandidate(code, unlockCount));
  }

  // "One course away" has to mean one course away in practice: the missing
  // course must itself be takeable now, or the card turns a wall into a
  // different wall.
  const unlockedNow = new Set(
    [...evaluated.entries()].filter(([, e]) => e.satisfied).map(([code]) => code),
  );
  const oneAway = locked
    .filter(code => {
      const missing = evaluated.get(code)?.missing ?? [];
      return missing.length === 1 && unlockedNow.has(missing[0]);
    })
    .map(code => toCandidate(code, 0));

  unlocked.sort((a, b) => b.unlockCount - a.unlockCount || a.code.localeCompare(b.code));
  oneAway.sort((a, b) => a.code.localeCompare(b.code));

  const highestLeverage = unlocked.length > 0 && unlocked[0].unlockCount > 0 ? unlocked[0] : null;

  return { unlocked, oneAway, highestLeverage, failedOpenCount, hasPrereqData };
}
