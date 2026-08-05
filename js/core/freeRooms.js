// Twin of src/core/freeRooms.ts — hand-maintained, not generated.
// src/core/freeRooms.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Free-room finder — pure helpers that invert the normalized section list into
// room-availability queries (which rooms are busy when), so the UI can answer
// "what's free right now / on day D". UI-agnostic.

export const CAMPUS_START_MIN = 8 * 60;   // 08:00
export const CAMPUS_END_MIN = 22 * 60;    // 22:00

const FR_WEEK_ORDER = [
    'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
];

function isRealRoom(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed === '') return false;
    const upper = trimmed.toUpperCase();
    if (upper === 'TBA') return false;
    // The live feed sometimes stuffs a class schedule into roomName
    // (e.g. "MON 11:00AM: 07A-08C; WED 2:00PM: 09G-31T"); real room codes
    // never contain whitespace or schedule punctuation.
    if (/[\s:;]/.test(trimmed)) return false;
    // UB (old University Building) is gone post campus-move; its "UB0000"
    // placeholder still lingers in the feed.
    if (upper.startsWith('UB')) return false;
    return true;
}

// Map each room to its busy intervals across the week, sorted by day
// (canonical Sat→Fri order) then start time. Blank/TBA rooms contribute nothing.
export function buildRoomBusyIndex(sections) {
    const index = new Map();
    for (const s of sections) {
        for (const slot of s.classSlots) {
            // Each slot carries its own room (theory→roomName, lab→labRoomName),
            // so a lab lands in its real lab, not the section's theory classroom.
            const room = (slot.room || s.roomName || '').trim();
            if (!isRealRoom(room)) continue;
            const interval = {
                day: slot.day,
                startMin: slot.startMin,
                endMin: slot.endMin,
                courseCode: s.courseCode,
                sectionName: s.sectionName,
                kind: slot.kind,
            };
            const list = index.get(room);
            if (list) list.push(interval);
            else index.set(room, [interval]);
        }
    }
    for (const list of index.values()) {
        list.sort((a, b) =>
            (FR_WEEK_ORDER.indexOf(a.day) - FR_WEEK_ORDER.indexOf(b.day)) ||
            (a.startMin - b.startMin) ||
            (a.endMin - b.endMin));
    }
    return index;
}

// Busy intervals for a room on a single day (already sorted by start).
export function busyOnDay(index, room, day) {
    return (index.get(room) ?? []).filter(i => i.day === day);
}

// Every room in the feed, sorted alphabetically.
export function listAllRooms(index) {
    return [...index.keys()].sort((a, b) => a.localeCompare(b));
}

// The class/lab occupying `room` at `minute` on `day`, or null if free. When
// intervals overlap (rare), the one ending latest wins so "busy until" reflects
// when the room actually frees up. Half-open [startMin, endMin).
export function occupantAt(index, room, day, minute) {
    let occupant = null;
    for (const i of index.get(room) ?? []) {
        if (i.day !== day || minute < i.startMin || minute >= i.endMin) continue;
        if (!occupant || i.endMin > occupant.endMin) occupant = i;
    }
    return occupant;
}

// Rooms with no class covering `minute` on `day`, sorted alphabetically. A room
// with no class that day counts as free all day. Classes are half-open
// [startMin, endMin): a room frees up exactly at endMin.
export function freeRoomsAt(index, day, minute) {
    const free = [];
    for (const [room, intervals] of index) {
        const occupied = intervals.some(i =>
            i.day === day && minute >= i.startMin && minute < i.endMin);
        if (!occupied) free.push(room);
    }
    return free.sort((a, b) => a.localeCompare(b));
}

// Free time windows for one room on a given day = complement of its busy
// intervals within [dayStart, dayEnd). Overlaps are merged first.
export function freeWindowsForRoom(index, room, day, dayStart = CAMPUS_START_MIN, dayEnd = CAMPUS_END_MIN) {
    if (dayEnd <= dayStart) return [];
    const busy = busyOnDay(index, room, day)
        .map(i => ({ startMin: Math.max(i.startMin, dayStart), endMin: Math.min(i.endMin, dayEnd) }))
        .filter(i => i.endMin > i.startMin)
        .sort((a, b) => a.startMin - b.startMin);

    const windows = [];
    let cursor = dayStart;
    for (const b of busy) {
        if (b.startMin > cursor) windows.push({ startMin: cursor, endMin: b.startMin });
        if (b.endMin > cursor) cursor = b.endMin;
    }
    if (cursor < dayEnd) windows.push({ startMin: cursor, endMin: dayEnd });
    return windows;
}
