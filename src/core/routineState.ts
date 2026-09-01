/**
 * Routine Builder state — pure helpers for picking which section the student
 * has chosen for each course, computing the resulting selected-sections list,
 * and marking pairwise class clashes among them.
 *
 * The state is intentionally a plain object so it serializes for localStorage
 * and survives a page refresh. Mutators return new objects rather than
 * mutating in place, so React/UI rerenders can compare by identity.
 */

import {
  detectClashes,
  hasClassClash,
  hasExamClash,
  type NormalizedSection,
  type SectionIndex,
} from './connectFeed';

export interface RoutineState {
  /** Map of courseCode → sectionId. `null` means "I want this course but haven't picked a section yet". */
  picks: Record<string, number | null>;
}

export interface ClashMark {
  classClash: boolean;
  examClash: boolean;
  clashesWith: number[];
}

export type ClashMap = Map<number, ClashMark>;

export function emptyRoutineState(): RoutineState {
  return { picks: {} };
}

function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase();
}

export function pickCourse(state: RoutineState, courseCode: string): RoutineState {
  const code = normalizeCourseCode(courseCode);
  if (code === '') return state;
  if (Object.prototype.hasOwnProperty.call(state.picks, code)) return state;
  return { picks: { ...state.picks, [code]: null } };
}

export function pickSection(
  state: RoutineState,
  courseCode: string,
  sectionId: number | null,
): RoutineState {
  const code = normalizeCourseCode(courseCode);
  if (code === '') return state;
  const prev = state.picks[code] ?? null;
  if (prev === sectionId) return state;
  return { picks: { ...state.picks, [code]: sectionId } };
}

export function unpickCourse(state: RoutineState, courseCode: string): RoutineState {
  const code = normalizeCourseCode(courseCode);
  if (!Object.prototype.hasOwnProperty.call(state.picks, code)) return state;
  const next: Record<string, number | null> = { ...state.picks };
  delete next[code];
  return { picks: next };
}

export function clearRoutine(state: RoutineState): RoutineState {
  if (Object.keys(state.picks).length === 0) return state;
  return { picks: {} };
}

export function pickedCourseCodes(state: RoutineState): string[] {
  return Object.keys(state.picks).sort();
}

/** Cap on courses decoded from a shared link — guards against abusive payloads. */
export const MAX_SHARE_COURSES = 15;
const SHARE_CODE_RE = /^[A-Z]{2,6}\d{2,4}$/;

/**
 * Encode picks into a compact, URL-safe string: `CODE` or `CODE-sectionId`
 * pairs joined by `~` (all chars are RFC-3986 unreserved). Sorted for a stable
 * link. A `null` pick (course added, no section yet) encodes as just the code.
 */
export function encodeRoutinePicks(state: RoutineState): string {
  const parts: string[] = [];
  for (const code of pickedCourseCodes(state)) {
    const sid = state.picks[code];
    parts.push(sid == null ? code : `${code}-${sid}`);
  }
  return parts.join('~');
}

/**
 * Inverse of {@link encodeRoutinePicks}. Lenient by design: malformed or
 * out-of-shape entries are skipped rather than throwing. The result is still
 * re-validated against the live feed by the caller before anything is picked.
 */
export function decodeRoutinePicks(encoded: string): RoutineState {
  const picks: Record<string, number | null> = {};
  if (typeof encoded !== 'string' || encoded === '') return { picks };
  for (const part of encoded.split('~').slice(0, MAX_SHARE_COURSES)) {
    if (!part) continue;
    const dash = part.indexOf('-');
    const code = normalizeCourseCode(dash === -1 ? part : part.slice(0, dash));
    if (!SHARE_CODE_RE.test(code)) continue;
    let sid: number | null = null;
    if (dash !== -1) {
      const n = Number.parseInt(part.slice(dash + 1), 10);
      sid = Number.isFinite(n) && n > 0 ? n : null;
    }
    picks[code] = sid;
  }
  return { picks };
}

/**
 * Resolve picked sections via the course index. Courses with `null` (no section
 * picked yet) and section ids that no longer exist in the feed are silently
 * skipped — the UI can surface "pick a section" prompts separately.
 */
export function selectedSections(state: RoutineState, index: SectionIndex): NormalizedSection[] {
  const out: NormalizedSection[] = [];
  for (const [code, sectionId] of Object.entries(state.picks)) {
    if (sectionId === null) continue;
    const list = index.get(code);
    if (!list) continue;
    const match = list.find((s) => s.sectionId === sectionId);
    if (match) out.push(match);
  }
  return out;
}

/**
 * For every selected section, mark whether it clashes with any other selected
 * section (class slots or exam dates) and list the offenders. Returns an empty
 * map for empty / single-section routines.
 */
export function buildClashMap(routine: readonly NormalizedSection[]): ClashMap {
  const out: ClashMap = new Map();
  for (const s of routine) {
    out.set(s.sectionId, { classClash: false, examClash: false, clashesWith: [] });
  }
  for (let i = 0; i < routine.length; i++) {
    for (let j = i + 1; j < routine.length; j++) {
      const a = routine[i];
      const b = routine[j];
      const classClash = hasClassClash(a, b);
      const examClash = hasExamClash(a, b);
      if (!classClash && !examClash) continue;
      const ma = out.get(a.sectionId)!;
      const mb = out.get(b.sectionId)!;
      if (classClash) {
        ma.classClash = true;
        mb.classClash = true;
      }
      if (examClash) {
        ma.examClash = true;
        mb.examClash = true;
      }
      if (!ma.clashesWith.includes(b.sectionId)) ma.clashesWith.push(b.sectionId);
      if (!mb.clashesWith.includes(a.sectionId)) mb.clashesWith.push(a.sectionId);
    }
  }
  return out;
}

export interface RoutineSummary {
  pickedCount: number;
  resolvedCount: number;
  unresolvedCourses: string[];
  classClashPairs: number;
  examClashPairs: number;
}

export function summarizeRoutine(state: RoutineState, index: SectionIndex): RoutineSummary {
  const picked = pickedCourseCodes(state);
  const unresolvedCourses: string[] = [];
  for (const code of picked) {
    const sectionId = state.picks[code];
    if (sectionId === null) {
      unresolvedCourses.push(code);
      continue;
    }
    const list = index.get(code);
    if (!list || !list.find((s) => s.sectionId === sectionId)) {
      unresolvedCourses.push(code);
    }
  }
  const resolved = selectedSections(state, index);
  const report = detectClashes(resolved);
  return {
    pickedCount: picked.length,
    resolvedCount: resolved.length,
    unresolvedCourses,
    classClashPairs: report.classClashes.length,
    examClashPairs: report.examClashes.length,
  };
}

// ── Per-semester scoping (#633) ─────────────────────────────────────────────
//
// A routine is picks against ONE semester's sections. Once the tab could switch
// semesters, a single flat `{picks}` became wrong in a way that looks right:
// the codes carry across (CSE221 exists in both Summer and Fall) but the section
// ids do not, so switching showed four courses the student is not taking above
// an empty grid.
//
// The stored shape stays backwards-compatible on purpose. `picks` remains the
// live semester's routine at the top level, because six other modules read it
// there — the Assistant, the Profile hub on both shells, and the cloud snapshot
// — and "my routine" means the live one in every one of them. Archived
// semesters live beside it under `bySession`.

export interface RoutineBook {
  /** The live feed's routine — what every other reader means by "my routine". */
  live: RoutineState;
  /** Archived semesters, keyed by session id as a string. */
  bySession: Record<string, RoutineState>;
}

export function emptyRoutineBook(): RoutineBook {
  return { live: emptyRoutineState(), bySession: {} };
}

/** Normalize one persisted `{picks}` object. Junk keys and values are dropped. */
function readPicks(raw: unknown): RoutineState {
  const source = raw as { picks?: unknown } | null;
  if (!source || typeof source !== 'object') return emptyRoutineState();
  const picks = source.picks;
  if (!picks || typeof picks !== 'object') return emptyRoutineState();
  const out: Record<string, number | null> = {};
  for (const [code, sectionId] of Object.entries(picks as Record<string, unknown>)) {
    if (typeof code !== 'string') continue;
    if (sectionId === null || typeof sectionId === 'number') {
      out[code.toUpperCase()] = sectionId as number | null;
    }
  }
  return { picks: out };
}

/**
 * Read the stored object, whatever version wrote it.
 *
 * A pre-#633 value is a bare `{picks}` and becomes the live routine, which is
 * what it always was — nobody's saved routine is lost or reassigned.
 */
export function readRoutineBook(raw: unknown): RoutineBook {
  const book = emptyRoutineBook();
  if (!raw || typeof raw !== 'object') return book;
  book.live = readPicks(raw);
  const bySession = (raw as { bySession?: unknown }).bySession;
  if (bySession && typeof bySession === 'object') {
    for (const [key, value] of Object.entries(bySession as Record<string, unknown>)) {
      // `imported` alongside the session ids: a pasted CONNECT schedule is a
      // routine like any other, but it belongs to no semester the feed knows
      // about — it may well be one we never archived (#633).
      if (!/^(\d{4,6}|imported)$/.test(key)) continue;
      book.bySession[key] = readPicks(value);
    }
  }
  return book;
}

/** The routine for a semester. `null` means the live feed. */
export function routineForSession(book: RoutineBook, sessionId: number | null): RoutineState {
  if (sessionId === null) return book.live;
  return book.bySession[String(sessionId)] ?? emptyRoutineState();
}

/** Replace one semester's routine, leaving every other semester untouched. */
export function withRoutineForSession(
  book: RoutineBook,
  sessionId: number | null,
  state: RoutineState,
): RoutineBook {
  if (sessionId === null) return { live: state, bySession: { ...book.bySession } };
  return {
    live: book.live,
    bySession: { ...book.bySession, [String(sessionId)]: state },
  };
}

/**
 * The object to persist.
 *
 * The live routine is written as a top-level `picks` so every existing reader
 * keeps working against the same shape it always read.
 */
export function serializeRoutineBook(book: RoutineBook): {
  picks: Record<string, number | null>;
  bySession: Record<string, RoutineState>;
} {
  return { picks: book.live.picks, bySession: book.bySession };
}
