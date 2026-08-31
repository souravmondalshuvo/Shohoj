// Twin of src/core/routineState.ts — hand-maintained, not generated.
// src/core/routineState.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Pure state helpers for the Routine Builder tab. Picks live as
// { [courseCode]: sectionId | null } so the state serializes cleanly for
// localStorage and survives a page refresh. Mutators return new state objects.

import { detectClashes, hasClassClash, hasExamClash } from './connectFeed.js';

export function emptyRoutineState() {
    return { picks: {} };
}

function normalizeCourseCode(code) {
    return String(code || '').trim().toUpperCase();
}

export function pickCourse(state, courseCode) {
    const code = normalizeCourseCode(courseCode);
    if (code === '') return state;
    if (Object.prototype.hasOwnProperty.call(state.picks, code)) return state;
    return { picks: { ...state.picks, [code]: null } };
}

export function pickSection(state, courseCode, sectionId) {
    const code = normalizeCourseCode(courseCode);
    if (code === '') return state;
    const prev = state.picks[code] ?? null;
    if (prev === sectionId) return state;
    return { picks: { ...state.picks, [code]: sectionId } };
}

export function unpickCourse(state, courseCode) {
    const code = normalizeCourseCode(courseCode);
    if (!Object.prototype.hasOwnProperty.call(state.picks, code)) return state;
    const next = { ...state.picks };
    delete next[code];
    return { picks: next };
}

export function clearRoutine(state) {
    if (Object.keys(state.picks).length === 0) return state;
    return { picks: {} };
}

export function pickedCourseCodes(state) {
    return Object.keys(state.picks).sort();
}

// Cap on courses decoded from a shared link — guards against abusive payloads.
export const MAX_SHARE_COURSES = 15;
const SHARE_CODE_RE = /^[A-Z]{2,6}\d{2,4}$/;

// Encode picks into a compact, URL-safe string: `CODE` or `CODE-sectionId`
// pairs joined by `~`. Sorted for a stable link; a null pick encodes as the
// bare code.
export function encodeRoutinePicks(state) {
    const parts = [];
    for (const code of pickedCourseCodes(state)) {
        const sid = state.picks[code];
        parts.push(sid == null ? code : `${code}-${sid}`);
    }
    return parts.join('~');
}

// Inverse of encodeRoutinePicks. Lenient: malformed entries are skipped, not
// thrown. The caller still re-validates against the live feed before picking.
export function decodeRoutinePicks(encoded) {
    const picks = {};
    if (typeof encoded !== 'string' || encoded === '') return { picks };
    for (const part of encoded.split('~').slice(0, MAX_SHARE_COURSES)) {
        if (!part) continue;
        const dash = part.indexOf('-');
        const code = normalizeCourseCode(dash === -1 ? part : part.slice(0, dash));
        if (!SHARE_CODE_RE.test(code)) continue;
        let sid = null;
        if (dash !== -1) {
            const n = Number.parseInt(part.slice(dash + 1), 10);
            sid = Number.isFinite(n) && n > 0 ? n : null;
        }
        picks[code] = sid;
    }
    return { picks };
}

export function selectedSections(state, index) {
    const out = [];
    for (const [code, sectionId] of Object.entries(state.picks)) {
        if (sectionId === null) continue;
        const list = index.get(code);
        if (!list) continue;
        const match = list.find(s => s.sectionId === sectionId);
        if (match) out.push(match);
    }
    return out;
}

export function buildClashMap(routine) {
    const out = new Map();
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
            const ma = out.get(a.sectionId);
            const mb = out.get(b.sectionId);
            if (classClash) { ma.classClash = true; mb.classClash = true; }
            if (examClash)  { ma.examClash  = true; mb.examClash  = true; }
            if (!ma.clashesWith.includes(b.sectionId)) ma.clashesWith.push(b.sectionId);
            if (!mb.clashesWith.includes(a.sectionId)) mb.clashesWith.push(a.sectionId);
        }
    }
    return out;
}

export function summarizeRoutine(state, index) {
    const picked = pickedCourseCodes(state);
    const unresolvedCourses = [];
    for (const code of picked) {
        const sectionId = state.picks[code];
        if (sectionId === null) { unresolvedCourses.push(code); continue; }
        const list = index.get(code);
        if (!list || !list.find(s => s.sectionId === sectionId)) {
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

export function emptyRoutineBook() {
    return { live: emptyRoutineState(), bySession: {} };
}

/** Normalize one persisted `{picks}` object. Junk keys and values are dropped. */
function readPicks(raw) {
    const source = raw;
    if (!source || typeof source !== 'object') return emptyRoutineState();
    const picks = source.picks;
    if (!picks || typeof picks !== 'object') return emptyRoutineState();
    const out = {};
    for (const [code, sectionId] of Object.entries(picks)) {
        if (typeof code !== 'string') continue;
        if (sectionId === null || typeof sectionId === 'number') {
            out[code.toUpperCase()] = sectionId;
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
export function readRoutineBook(raw) {
    const book = emptyRoutineBook();
    if (!raw || typeof raw !== 'object') return book;
    book.live = readPicks(raw);
    const bySession = raw.bySession;
    if (bySession && typeof bySession === 'object') {
        for (const [key, value] of Object.entries(bySession)) {
            if (!/^\d{4,6}$/.test(key)) continue;
            book.bySession[key] = readPicks(value);
        }
    }
    return book;
}

/** The routine for a semester. `null` means the live feed. */
export function routineForSession(book, sessionId) {
    if (sessionId === null) return book.live;
    return book.bySession[String(sessionId)] ?? emptyRoutineState();
}

/** Replace one semester's routine, leaving every other semester untouched. */
export function withRoutineForSession(book, sessionId, state) {
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
export function serializeRoutineBook(book) {
    return { picks: book.live.picks, bySession: book.bySession };
}
