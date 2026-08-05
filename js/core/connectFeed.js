// Twin of src/core/connectFeed.ts — hand-maintained, not generated.
// src/core/connectFeed.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Pure helpers for parsing and reasoning about the live BRACU CONNECT section
// data served by `usis-cdn.eniamza.com/connect.json`. I/O-free on purpose —
// fetch/cache live in the runtime client.

const WEEKDAYS = new Set([
    'SATURDAY',
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
]);

export function parseTimeToMinutes(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
}

function normalizeDay(value) {
    if (typeof value !== 'string') return null;
    const upper = value.trim().toUpperCase();
    return WEEKDAYS.has(upper) ? upper : null;
}

function normalizeSlots(raw, kind, room) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const slot of raw) {
        const day = normalizeDay(slot && slot.day);
        const startMin = parseTimeToMinutes(slot && slot.startTime);
        const endMin = parseTimeToMinutes(slot && slot.endTime);
        if (day === null || startMin === null || endMin === null) continue;
        if (endMin <= startMin) continue;
        out.push({ day, startMin, endMin, kind, room });
    }
    return out;
}

function normalizeDateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeExam(date, start, end) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    if (startMin === null || endMin === null || endMin <= startMin) return null;
    return { date, startMin, endMin };
}

export function normalizeSection(raw) {
    if (!raw || typeof raw.sectionId !== 'number') return null;
    if (typeof raw.courseCode !== 'string' || raw.courseCode.trim() === '') return null;

    const capacity = Number.isFinite(raw.capacity) ? Number(raw.capacity) : 0;
    const consumedSeat = Number.isFinite(raw.consumedSeat) ? Number(raw.consumedSeat) : 0;

    const schedule = raw.sectionSchedule || null;
    // The feed rooms theory and lab separately: theory uses roomName, the lab
    // component carries its own labRoomName. Tag each slot with its real room
    // so a section's lab isn't mis-attributed to its theory classroom.
    const roomName = (raw.roomName || raw.roomNumber || '').trim();
    const labRoomName = (raw.labRoomName || '').trim() || roomName;
    const theorySlots = normalizeSlots(schedule && schedule.classSchedules, 'theory', roomName);
    const labSlots = normalizeSlots(raw.labSchedules, 'lab', labRoomName);
    const classSlots = theorySlots.concat(labSlots);

    const midExam = schedule
        ? normalizeExam(schedule.midExamDate, schedule.midExamStartTime, schedule.midExamEndTime)
        : null;
    const finalExam = schedule
        ? normalizeExam(schedule.finalExamDate, schedule.finalExamStartTime, schedule.finalExamEndTime)
        : null;

    return {
        sectionId: raw.sectionId,
        courseCode: raw.courseCode.trim().toUpperCase(),
        courseName: (raw.courseName || '').trim(),
        credits: Number.isFinite(raw.courseCredit) ? Number(raw.courseCredit) : 0,
        sectionName: (raw.sectionName || '').trim(),
        capacity,
        consumedSeat,
        isFull: capacity > 0 && consumedSeat >= capacity,
        facultyInitials: (raw.faculties || '').trim().toUpperCase(),
        roomName,
        semesterSessionId:
            typeof raw.semesterSessionId === 'number' ? raw.semesterSessionId : null,
        classSlots,
        classStartDate: normalizeDateOnly(schedule && schedule.classStartDate),
        classEndDate: normalizeDateOnly(schedule && schedule.classEndDate),
        midExam,
        finalExam,
    };
}

export function parseFeed(payload) {
    if (!Array.isArray(payload)) return { sections: [], dropped: [] };
    const sections = [];
    const dropped = [];
    for (const entry of payload) {
        const normalized = normalizeSection(entry);
        if (normalized) sections.push(normalized);
        else if (entry && typeof entry.sectionId === 'number') {
            dropped.push(entry.sectionId);
        }
    }
    return { sections, dropped };
}

export function indexByCourse(sections) {
    const out = new Map();
    for (const s of sections) {
        const list = out.get(s.courseCode);
        if (list) list.push(s);
        else out.set(s.courseCode, [s]);
    }
    return out;
}

export function listCourseCodes(index) {
    return Array.from(index.keys()).sort();
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

export function hasClassClash(a, b) {
    if (a.sectionId === b.sectionId) return false;
    for (const sa of a.classSlots) {
        for (const sb of b.classSlots) {
            if (sa.day !== sb.day) continue;
            if (rangesOverlap(sa.startMin, sa.endMin, sb.startMin, sb.endMin)) return true;
        }
    }
    return false;
}

export function hasExamClash(a, b) {
    if (a.sectionId === b.sectionId) return false;
    const pairs = [
        [a.midExam, b.midExam],
        [a.midExam, b.finalExam],
        [a.finalExam, b.midExam],
        [a.finalExam, b.finalExam],
    ];
    for (const [x, y] of pairs) {
        if (!x || !y) continue;
        if (x.date !== y.date) continue;
        if (rangesOverlap(x.startMin, x.endMin, y.startMin, y.endMin)) return true;
    }
    return false;
}

export function detectClashes(routine) {
    const classClashes = [];
    const examClashes = [];
    for (let i = 0; i < routine.length; i++) {
        for (let j = i + 1; j < routine.length; j++) {
            const a = routine[i];
            const b = routine[j];
            const pair = a.sectionId < b.sectionId
                ? [a.sectionId, b.sectionId]
                : [b.sectionId, a.sectionId];
            if (hasClassClash(a, b)) classClashes.push(pair);
            if (hasExamClash(a, b)) examClashes.push(pair);
        }
    }
    return { classClashes, examClashes };
}

export function isClashFree(routine) {
    const report = detectClashes(routine);
    return report.classClashes.length === 0 && report.examClashes.length === 0;
}

export function summarizeFeed(sections) {
    const courses = new Set();
    const faculty = new Set();
    const sessions = new Set();
    for (const s of sections) {
        courses.add(s.courseCode);
        if (s.facultyInitials) faculty.add(s.facultyInitials);
        if (s.semesterSessionId !== null) sessions.add(s.semesterSessionId);
    }
    return {
        totalSections: sections.length,
        totalCourses: courses.size,
        totalFaculty: faculty.size,
        semesterSessionIds: Array.from(sessions).sort((a, b) => a - b),
    };
}
