// Twin of src/core/calendarExport.ts — hand-maintained, not generated.
// src/core/calendarExport.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Calendar export — builds an RFC 5545 iCalendar (.ics) string from a student's
// picked sections so their phone/laptop calendar fires real class/exam
// reminders without Shohoj being open. Classes become weekly-recurring VEVENTs
// bounded by the semester dates; mid/final exams become one-off VEVENTs; every
// event carries a VALARM (default 30 min before). Times are floating local
// date-times (BRACU = Asia/Dhaka, no DST). Pure + UI-agnostic.

const BYDAY = {
    SUNDAY: 'SU', MONDAY: 'MO', TUESDAY: 'TU', WEDNESDAY: 'WE',
    THURSDAY: 'TH', FRIDAY: 'FR', SATURDAY: 'SA',
};

const DOW_INDEX = {
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
    THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}

// Escape a text value per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline).
function escapeText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function hhmmss(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${pad2(h)}${pad2(m)}00`;
}

function compactDate(date) {
    return date.replace(/-/g, '');
}

function floatingDateTime(date, min) {
    return `${compactDate(date)}T${hhmmss(min)}`;
}

function utcStamp(now) {
    return (
        `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
        `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
    );
}

// First YYYY-MM-DD on or after startDate whose weekday is `weekday`. Pure UTC
// date math so a local-timezone shift can't roll the day.
export function firstOnOrAfter(startDate, weekday) {
    const [y, m, d] = startDate.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    const delta = (DOW_INDEX[weekday] - base.getUTCDay() + 7) % 7;
    const out = new Date(base.getTime() + delta * 86_400_000);
    return `${out.getUTCFullYear()}-${pad2(out.getUTCMonth() + 1)}-${pad2(out.getUTCDate())}`;
}

function valarm(summary, alarmMinutes) {
    return [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(summary)}`,
        `TRIGGER:-PT${alarmMinutes}M`,
        'END:VALARM',
    ];
}

function vevent(ev, dtstamp, alarmMinutes) {
    const lines = [
        'BEGIN:VEVENT',
        `UID:${ev.uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${floatingDateTime(ev.startDate, ev.startMin)}`,
        `DTEND:${floatingDateTime(ev.startDate, ev.endMin)}`,
        `SUMMARY:${escapeText(ev.summary)}`,
    ];
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.untilDate && ev.byday) {
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${ev.byday};UNTIL=${compactDate(ev.untilDate)}T235959`);
    }
    lines.push(...valarm(ev.summary, alarmMinutes));
    lines.push('END:VEVENT');
    return lines;
}

// Build a complete VCALENDAR string for the given sections. Sections are
// processed in order; for each, class meetings come before mid/final exams.
// Class events are only emitted when both semester dates are known and an
// occurrence falls within them.
export function buildRoutineICS(sections, options = {}) {
    const alarmMinutes = Math.max(0, Math.round(options.alarmMinutes ?? 30));
    const calName = options.calName ?? 'Shohoj Routine';
    const dtstamp = utcStamp(options.now ?? new Date());

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Shohoj//Routine//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(calName)}`,
    ];

    for (const s of sections) {
        const tag = `${s.courseCode}${s.sectionName ? ` (Section ${s.sectionName})` : ''}`;
        const faculty = s.facultyInitials ? `Faculty: ${s.facultyInitials}` : '';

        if (s.classStartDate && s.classEndDate) {
            for (const slot of s.classSlots) {
                const startDate = firstOnOrAfter(s.classStartDate, slot.day);
                if (startDate > s.classEndDate) continue; // no occurrence in range
                lines.push(...vevent({
                    uid: `shohoj-${s.sectionId}-class-${slot.day}-${slot.startMin}@shohoj.app`,
                    summary: `${tag} class`,
                    location: s.roomName,
                    description: faculty,
                    startDate,
                    startMin: slot.startMin,
                    endMin: slot.endMin,
                    untilDate: s.classEndDate,
                    byday: BYDAY[slot.day],
                }, dtstamp, alarmMinutes));
            }
        }

        if (s.midExam) {
            lines.push(...vevent({
                uid: `shohoj-${s.sectionId}-mid@shohoj.app`,
                summary: `${tag} — Mid Exam`,
                location: '',
                description: faculty,
                startDate: s.midExam.date,
                startMin: s.midExam.startMin,
                endMin: s.midExam.endMin,
                untilDate: null,
                byday: null,
            }, dtstamp, alarmMinutes));
        }

        if (s.finalExam) {
            lines.push(...vevent({
                uid: `shohoj-${s.sectionId}-final@shohoj.app`,
                summary: `${tag} — Final Exam`,
                location: '',
                description: faculty,
                startDate: s.finalExam.date,
                startMin: s.finalExam.startMin,
                endMin: s.finalExam.endMin,
                untilDate: null,
                byday: null,
            }, dtstamp, alarmMinutes));
        }
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}
