// Twin of src/core/semesterBriefing.ts — hand-maintained, not generated.
// src/core/semesterBriefing.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Semester briefing — turns a student's own routine picks into the three things
// no single tab can answer, because each needs the picks joined against the
// live feed: exam crunch, week measurements, and gap-room suggestions.
// Pure and UI-agnostic: no DOM, no fetch.

import { busyOnDay, listAllRooms, CAMPUS_START_MIN, CAMPUS_END_MIN } from './freeRooms.js';

/** Canonical BRACU week order (Friday is the off day, kept last). */
export const BRIEFING_WEEK_ORDER = [
    'SATURDAY',
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
];

/**
 * Idle stretch below this is a transition between rooms, not a usable gap —
 * BRACU's standard break between consecutive slots is 10 minutes.
 */
export const MIN_GAP_MINUTES = 45;

/** A back-to-back pair this tight, in a different room, is worth warning about. */
export const TIGHT_HOP_MINUTES = 15;

/** Floors apart before a tight transition counts as a real climb. */
export const NOTABLE_FLOOR_DELTA = 2;

/**
 * Floor number from a room code. Post-move codes lead with a two-digit floor
 * (`09A-01C` → 9, `12B-20L` → 12). Anything else is unparseable rather than
 * guessed — a wrong floor is worse than no floor.
 */
export function parseRoomFloor(room) {
    if (typeof room !== 'string') return null;
    const match = /^(\d{2})[A-Z]/.exec(room.trim().toUpperCase());
    if (!match) return null;
    const floor = Number.parseInt(match[1], 10);
    return Number.isFinite(floor) ? floor : null;
}

/**
 * A slot's real room. The runtime feed tags each slot with its own room so a
 * section's lab isn't mis-attributed to its theory classroom; sections parsed
 * before that landed fall back to the section room.
 */
function sbSlotRoom(slot, section) {
    const own = typeof slot.room === 'string' ? slot.room.trim() : '';
    return own !== '' ? own : section.roomName;
}

/** Flatten picked sections into per-day slots, sorted by day then start time. */
export function collectRoutineSlots(sections) {
    const out = [];
    for (const section of sections) {
        for (const slot of section.classSlots) {
            out.push({
                day: slot.day,
                startMin: slot.startMin,
                endMin: slot.endMin,
                kind: slot.kind,
                room: sbSlotRoom(slot, section),
                courseCode: section.courseCode,
                sectionName: section.sectionName,
                facultyInitials: section.facultyInitials,
            });
        }
    }
    out.sort((a, b) => BRIEFING_WEEK_ORDER.indexOf(a.day) - BRIEFING_WEEK_ORDER.indexOf(b.day)
        || a.startMin - b.startMin
        || a.courseCode.localeCompare(b.courseCode));
    return out;
}

/**
 * Measure the student's week: time in class, time waiting, and the transitions
 * that are too tight for the distance. Overlapping slots (a clashing routine)
 * contribute their own duration to contact time but never a negative gap.
 */
export function buildWeekSummary(sections, options = {}) {
    const minGap = options.minGapMinutes ?? MIN_GAP_MINUTES;
    const tightHop = options.tightHopMinutes ?? TIGHT_HOP_MINUTES;

    const slots = collectRoutineSlots(sections);
    const byDay = new Map();
    for (const slot of slots) {
        const list = byDay.get(slot.day);
        if (list) list.push(slot);
        else byDay.set(slot.day, [slot]);
    }

    let contactMinutes = 0;
    let deadGapMinutes = 0;
    let longestDayMinutes = 0;
    let longestDay = null;
    let earliestStartMin = null;
    const gaps = [];
    const hops = [];

    for (const day of BRIEFING_WEEK_ORDER) {
        const list = byDay.get(day);
        if (!list || list.length === 0) continue;

        const dayStart = list[0].startMin;
        const dayEnd = list.reduce((max, s) => Math.max(max, s.endMin), 0);
        if (earliestStartMin === null || dayStart < earliestStartMin) earliestStartMin = dayStart;
        if (dayEnd - dayStart > longestDayMinutes) {
            longestDayMinutes = dayEnd - dayStart;
            longestDay = day;
        }
        for (const slot of list) contactMinutes += Math.max(0, slot.endMin - slot.startMin);

        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const next = list[i];
            const idle = next.startMin - prev.endMin;
            if (idle >= minGap) {
                deadGapMinutes += idle;
                gaps.push({
                    day,
                    startMin: prev.endMin,
                    endMin: next.startMin,
                    minutes: idle,
                    afterCourse: prev.courseCode,
                    beforeCourse: next.courseCode,
                    nextRoom: next.room,
                    nextFloor: parseRoomFloor(next.room),
                });
            } else if (idle >= 0 && idle <= tightHop && prev.room !== next.room) {
                const fromFloor = parseRoomFloor(prev.room);
                const toFloor = parseRoomFloor(next.room);
                hops.push({
                    day,
                    minutes: idle,
                    fromCourse: prev.courseCode,
                    toCourse: next.courseCode,
                    fromRoom: prev.room,
                    toRoom: next.room,
                    floorDelta: fromFloor !== null && toFloor !== null ? toFloor - fromFloor : null,
                });
            }
        }
    }

    return {
        slots,
        byDay,
        contactMinutes,
        deadGapMinutes,
        campusDays: byDay.size,
        earliestStartMin,
        longestDayMinutes,
        longestDay,
        gaps,
        hops,
    };
}

/**
 * Campus runs on Asia/Dhaka — UTC+6 all year, no DST. Exam dates arrive as a
 * bare `YYYY-MM-DD` plus a minute-of-day and are placed on the UTC line below,
 * so a wall clock has to be shifted into that same frame before the two can be
 * compared. Read the viewer's clock as UTC instead and an exam would flip to
 * "done" hours early or late for anyone outside Bangladesh.
 */
export const CAMPUS_UTC_OFFSET_MIN = 6 * 60;

/** A wall-clock instant in the same absolute-minute frame as the exam dates. */
export function campusMinutesAt(now) {
    return Math.floor(now / 60000) + CAMPUS_UTC_OFFSET_MIN;
}

/** Absolute minutes since epoch for an ISO date + minute-of-day. UTC, so DST-free. */
function sbAbsoluteMinutes(date, minuteOfDay) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const ms = Date.UTC(year, month - 1, day);
    if (!Number.isFinite(ms)) return null;
    return Math.round(ms / 60000) + minuteOfDay;
}

/**
 * Crunch measurements over `run`, which must be consecutive exams in date
 * order. Links into whatever preceded the run are ignored: for a slice of the
 * exams still ahead, the gap back to an exam already sat is history, not
 * something the student still has to recover from.
 */
function sbCrunchOver(run) {
    let tightestGapHours = null;
    let sameDayCount = 0;
    for (let i = 1; i < run.length; i++) {
        if (run[i].sameDayAsPrev) sameDayCount++;
        const gapHours = run[i].gapHoursFromPrev;
        if (gapHours !== null && (tightestGapHours === null || gapHours < tightestGapHours)) {
            tightestGapHours = gapHours;
        }
    }
    const last = run.reduce((max, e) => (e.absEnd > max.absEnd ? e : max), run[0]);
    return {
        count: run.length,
        spanHours: (last.absEnd - run[0].absStart) / 60,
        tightestGapHours,
        sameDayCount,
    };
}

/**
 * Order the student's exams for one kind and measure the recovery time between
 * them. Sections without a date for that kind are reported in `missing` rather
 * than silently dropped — a half-known exam season is worth flagging.
 * Returns null when no picked section carries a date at all.
 *
 * `now` splits the period into sat and pending: an exam counts as past once it
 * has *finished*, so one in progress still reads as the exam at hand.
 */
export function buildExamBriefing(sections, kind, now = Date.now()) {
    const missing = [];
    const dated = [];

    for (const section of sections) {
        const exam = kind === 'mid' ? section.midExam : section.finalExam;
        if (!exam) {
            missing.push(section.courseCode);
            continue;
        }
        const absStart = sbAbsoluteMinutes(exam.date, exam.startMin);
        const absEnd = sbAbsoluteMinutes(exam.date, exam.endMin);
        if (absStart === null || absEnd === null) {
            missing.push(section.courseCode);
            continue;
        }
        dated.push({
            courseCode: section.courseCode,
            sectionName: section.sectionName,
            facultyInitials: section.facultyInitials,
            date: exam.date,
            startMin: exam.startMin,
            endMin: exam.endMin,
            gapHoursFromPrev: null,
            sameDayAsPrev: false,
            isPast: false,
            absStart,
            absEnd,
        });
    }

    if (dated.length === 0) return null;
    dated.sort((a, b) => a.absStart - b.absStart || a.courseCode.localeCompare(b.courseCode));

    const nowMin = campusMinutesAt(now);
    for (let i = 0; i < dated.length; i++) {
        dated[i].isPast = dated[i].absEnd <= nowMin;
        if (i === 0) continue;
        const prev = dated[i - 1];
        const current = dated[i];
        current.gapHoursFromPrev = (current.absStart - prev.absEnd) / 60;
        current.sameDayAsPrev = current.date === prev.date;
    }

    const whole = sbCrunchOver(dated);
    const firstAhead = dated.findIndex(entry => !entry.isPast);
    const ahead = firstAhead === -1 ? [] : dated.slice(firstAhead);
    const nextExam = ahead.length > 0 ? ahead[0] : null;

    return {
        kind,
        exams: dated.map(entry => ({
            courseCode: entry.courseCode,
            sectionName: entry.sectionName,
            facultyInitials: entry.facultyInitials,
            date: entry.date,
            startMin: entry.startMin,
            endMin: entry.endMin,
            gapHoursFromPrev: entry.gapHoursFromPrev,
            sameDayAsPrev: entry.sameDayAsPrev,
            isPast: entry.isPast,
        })),
        spanHours: whole.spanHours,
        tightestGapHours: whole.tightestGapHours,
        sameDayCount: whole.sameDayCount,
        missing,
        upcoming: ahead.length > 0 ? sbCrunchOver(ahead) : null,
        nextExam: nextExam === null ? null : { ...nextExam },
        hoursUntilNext: nextExam === null ? null : (nextExam.absStart - nowMin) / 60,
        pastCount: dated.length - ahead.length,
    };
}

/**
 * Which exam period the student should be looking at right now.
 *
 * Midterms hold the view while any of them is still ahead; once the last one
 * has been sat, finals are what's left of the semester — even before their
 * dates are published, because "no final dates yet" is the honest answer at
 * that point and the old midterm list is not. With nothing dated either way
 * there is no season to be wrong about, so midterms lead as before.
 *
 * Pure, and only ever a default: the card's toggle still overrides it.
 */
export function pickExamKind(sections, now = Date.now()) {
    const nowMin = campusMinutesAt(now);
    let midDated = false;
    let finalDated = false;
    let midAhead = false;

    for (const section of sections) {
        for (const kind of ['mid', 'final']) {
            const exam = kind === 'mid' ? section.midExam : section.finalExam;
            if (!exam) continue;
            const absEnd = sbAbsoluteMinutes(exam.date, exam.endMin);
            if (absEnd === null) continue;
            if (kind === 'mid') {
                midDated = true;
                if (absEnd > nowMin) midAhead = true;
            } else {
                finalDated = true;
            }
        }
    }

    if (midAhead) return 'mid';
    return midDated || finalDated ? 'final' : 'mid';
}

/**
 * Rooms with no booking overlapping `[startMin, endMin)` on `day` — free for
 * the student's whole wait, not merely free at one instant. Rooms outside
 * campus hours are excluded so we never suggest sitting somewhere at 06:00.
 */
export function roomsFreeThroughout(index, day, startMin, endMin, dayStart = CAMPUS_START_MIN, dayEnd = CAMPUS_END_MIN) {
    if (endMin <= startMin) return [];
    if (startMin < dayStart || endMin > dayEnd) return [];
    const free = [];
    for (const room of listAllRooms(index)) {
        const busy = busyOnDay(index, room, day);
        const clashes = busy.some(interval => interval.startMin < endMin && startMin < interval.endMin);
        if (!clashes) free.push(room);
    }
    return free;
}

/**
 * Where to wait out a gap: rooms free for its whole span, with those on the
 * next class's floor listed first so the student is already there when it
 * starts. `limit` caps each list; `total` always reports the true count.
 */
export function suggestGapRooms(index, gap, options = {}) {
    const limit = options.limit ?? 3;
    const free = roomsFreeThroughout(index, gap.day, gap.startMin, gap.endMin, options.dayStart, options.dayEnd);

    const sameFloor = [];
    const elsewhere = [];
    for (const room of free) {
        if (gap.nextFloor !== null && parseRoomFloor(room) === gap.nextFloor) sameFloor.push(room);
        else elsewhere.push(room);
    }

    return {
        sameFloor: sameFloor.slice(0, limit),
        elsewhere: elsewhere.slice(0, limit),
        total: free.length,
    };
}

/** `545` → `"09:05"`. Minute-of-day to a 24h clock label. */
export function formatClock(minuteOfDay) {
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = Math.round(minuteOfDay % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `280` → `"4h 40m"`, `60` → `"1h"`, `45` → `"45m"`. */
export function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (hours === 0) return `${rest}m`;
    if (rest === 0) return `${hours}h`;
    return `${hours}h ${rest}m`;
}
