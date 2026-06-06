// Generated from src/core/routineState.ts for the vanilla JS runtime.
// Update src/core/routineState.ts first, then regenerate this file.
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
