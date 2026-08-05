// Twin of src/core/seatWatch.ts — hand-maintained, not generated.
// src/core/seatWatch.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Seat-watch core — pure helpers behind "alert me when a full section opens".
// Owns the watchlist shape, its localStorage (de)serialization, and the
// edge-triggered transition detector that decides when a watched section has
// just gone from "no seat" to "has a seat". I/O-free on purpose: polling, the
// Notification API, and storage access live in js/ui/seatsTab.js. Seat math is
// delegated to seatStatus so the watcher and the Seats tab agree on "open".

import { seatInfo } from './seatStatus.js';

// Hard cap on watched sections — keeps the panel and the poll cost bounded.
export const MAX_WATCHES = 50;

// localStorage key for the persisted watchlist. Prefixed (not a bare
// STORAGE_KEY) because build3.py flattens every module into one scope, where a
// second top-level STORAGE_KEY would collide with state.js and kill the bundle.
export const SEAT_WATCH_STORAGE_KEY = 'shohoj_seat_watch_v1';

// True when a section currently has at least one seat left.
export function hasSeat(section) {
    return seatInfo(section).left > 0;
}

// Build a watch entry for `section`. `hadSeat` is seeded from the section's
// current state so watching an already-open section doesn't immediately alert —
// only a later full→open transition does.
export function makeWatch(section, now = Date.now()) {
    return {
        sectionId: section.sectionId,
        courseCode: section.courseCode,
        sectionName: section.sectionName,
        addedAt: now,
        hadSeat: hasSeat(section),
    };
}

export function isWatched(list, sectionId) {
    return list.some(w => w.sectionId === sectionId);
}

// A new list with `section` watched. No-op (returns a copy) if it's already
// watched or the list is at MAX_WATCHES. Never mutates the input.
export function addWatch(list, section, now = Date.now()) {
    if (isWatched(list, section.sectionId)) return list.slice();
    if (list.length >= MAX_WATCHES) return list.slice();
    return [...list, makeWatch(section, now)];
}

// A new list with `sectionId` removed. Never mutates the input.
export function removeWatch(list, sectionId) {
    return list.filter(w => w.sectionId !== sectionId);
}

// Index sections by `sectionId` for O(1) lookup during evaluation.
export function indexBySectionId(sections) {
    const out = new Map();
    for (const s of sections) out.set(s.sectionId, s);
    return out;
}

// Evaluate every watch against the current feed (a `sectionId → section` map,
// see indexBySectionId). Returns an updated watchlist plus the sections that
// just opened up. Edge-triggered: a drop is reported only when a section's seat
// state flips from false to true. A watched section missing from the feed is
// left untouched (state preserved) — it may be a transient gap, not a close.
export function evaluateWatches(list, sectionById) {
    const watches = [];
    const drops = [];
    for (const entry of list) {
        const section = sectionById.get(entry.sectionId);
        if (!section) {
            watches.push(entry);
            continue;
        }
        const open = hasSeat(section);
        if (open && !entry.hadSeat) {
            drops.push({ entry, section, seatsLeft: seatInfo(section).left });
        }
        watches.push(open === entry.hadSeat ? entry : { ...entry, hadSeat: open });
    }
    return { watches, drops };
}

// ── Persistence (tolerant round-trip — the runtime owns the actual storage) ──

export function serializeWatches(list) {
    return JSON.stringify(list);
}

function normalizeEntry(value) {
    if (!value || typeof value !== 'object') return null;
    const o = value;
    if (typeof o.sectionId !== 'number' || !Number.isFinite(o.sectionId)) return null;
    if (typeof o.courseCode !== 'string' || o.courseCode === '') return null;
    return {
        sectionId: o.sectionId,
        courseCode: o.courseCode,
        sectionName: typeof o.sectionName === 'string' ? o.sectionName : '',
        addedAt: typeof o.addedAt === 'number' && Number.isFinite(o.addedAt) ? o.addedAt : 0,
        hadSeat: o.hadSeat === true,
    };
}

// Parse a persisted watchlist, dropping anything malformed and de-duping by
// sectionId (first wins). Returns [] for null/garbage. Caps at MAX_WATCHES.
export function parseWatches(raw) {
    if (typeof raw !== 'string' || raw === '') return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
        const entry = normalizeEntry(item);
        if (!entry || seen.has(entry.sectionId)) continue;
        seen.add(entry.sectionId);
        out.push(entry);
        if (out.length >= MAX_WATCHES) break;
    }
    return out;
}
