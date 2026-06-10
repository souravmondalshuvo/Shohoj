/**
 * tests/calendarExport.test.js
 * Pure tests for the routine → iCalendar (.ics) export: VCALENDAR framing,
 * weekly class VEVENTs with RRULE + VALARM, one-off exam VEVENTs, text
 * escaping, alarm lead time, and the first-occurrence date helper.
 */

import { buildRoutineICS, firstOnOrAfter } from '../js/core/calendarExport.js';
import { parseFeed } from '../js/core/connectFeed.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}
// Weekday index (0=Sun) for a YYYY-MM-DD, computed independently of the module.
function dow(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

function sec(over) {
    return {
        courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
        faculties: 'ABC', roomName: 'R1',
        sectionSchedule: { classSchedules: [] },
        ...over,
    };
}

const NOW = new Date(Date.UTC(2026, 5, 1, 9, 30, 0)); // fixed clock for DTSTAMP

// CSE110 Section 01: Sunday class 14:00–15:20 over a real semester, with mid + final exams.
const CSE110 = parseFeed([
    sec({
        sectionId: 187473, courseCode: 'CSE110', courseName: 'Programming Language I', sectionName: '01',
        roomName: '09H-35C',
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '14:00:00', endTime: '15:20:00' }],
            classStartDate: '2026-06-09', classEndDate: '2026-09-08',
            midExamDate: '2026-08-01', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
            finalExamDate: '2026-09-18', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
        },
    }),
]).sections;

console.log('\nfirstOnOrAfter:');
test('returns a date >= start, same weekday, within 7 days', () => {
    for (const day of ['SUNDAY', 'MONDAY', 'THURSDAY', 'SATURDAY']) {
        const out = firstOnOrAfter('2026-06-09', day);
        assert(out >= '2026-06-09', `${day}: ${out} < start`);
        eq(dow(out), { SUNDAY: 0, MONDAY: 1, THURSDAY: 4, SATURDAY: 6 }[day], `${day} weekday`);
        const days = (Date.parse(out) - Date.parse('2026-06-09')) / 86400000;
        assert(days >= 0 && days < 7, `${day}: ${days} days out of range`);
    }
});
test('returns the start date itself when it already matches', () => {
    const start = '2026-06-14'; // a Sunday
    if (dow(start) === 0) eq(firstOnOrAfter(start, 'SUNDAY'), start);
});

console.log('\nbuildRoutineICS framing:');
test('empty routine yields a valid empty VCALENDAR (no events)', () => {
    const ics = buildRoutineICS([], { now: NOW });
    assert(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'missing header');
    assert(ics.trimEnd().endsWith('END:VCALENDAR'), 'missing footer');
    assert(!ics.includes('BEGIN:VEVENT'), 'should have no events');
});
test('uses CRLF line endings', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW });
    assert(ics.includes('\r\n'), 'no CRLF');
    assert(!/[^\r]\n/.test(ics), 'found a bare LF');
});

console.log('\nclass events:');
test('weekly class VEVENT carries RRULE, correct BYDAY, and bounded UNTIL', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW });
    assert(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260908T235959'), 'RRULE wrong:\n' + ics);
});
test('DTSTART is the first Sunday on/after the semester start, at 14:00', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW });
    const m = ics.match(/DTSTART:(\d{8})T140000/);
    assert(m, 'no 14:00 DTSTART');
    const iso = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    eq(dow(iso), 0, 'DTSTART not a Sunday');
    assert(iso >= '2026-06-09', 'DTSTART before semester start');
});
test('class event includes a VALARM with the default 30-min lead', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW });
    assert(ics.includes('BEGIN:VALARM'), 'no VALARM');
    assert(ics.includes('TRIGGER:-PT30M'), 'default lead wrong');
});
test('alarmMinutes option is honored', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW, alarmMinutes: 60 });
    assert(ics.includes('TRIGGER:-PT60M'), 'custom lead not applied');
});
test('class events are skipped when semester dates are unknown (exams still emitted)', () => {
    const noDates = parseFeed([
        sec({
            sectionId: 9, courseCode: 'MAT110', courseName: 'Calculus', sectionName: '01',
            sectionSchedule: {
                classSchedules: [{ day: 'MONDAY', startTime: '10:00', endTime: '11:20' }],
                midExamDate: '2026-08-02', midExamStartTime: '09:00', midExamEndTime: '11:00',
            },
        }),
    ]).sections;
    const ics = buildRoutineICS(noDates, { now: NOW });
    assert(!ics.includes('RRULE'), 'should not emit a recurring class without dates');
    assert(ics.includes('Mid Exam'), 'exam should still be present');
});

console.log('\nexam events:');
test('mid and final exams become one-off VEVENTs (no RRULE)', () => {
    const ics = buildRoutineICS(CSE110, { now: NOW });
    assert(ics.includes('SUMMARY:CSE110 (Section 01) — Mid Exam'), 'mid summary missing');
    assert(ics.includes('SUMMARY:CSE110 (Section 01) — Final Exam'), 'final summary missing');
    assert(ics.includes('DTSTART:20260801T110000'), 'mid DTSTART wrong');
    assert(ics.includes('DTSTART:20260918T110000'), 'final DTSTART wrong');
    // 3 events total: 1 class + 2 exams.
    eq((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
});

console.log('\nescaping:');
test('commas/semicolons in text are escaped per RFC 5545', () => {
    const tricky = parseFeed([
        sec({
            sectionId: 5, courseCode: 'ENG101', courseName: 'X', sectionName: '01',
            roomName: 'Room 3, Block C',
            sectionSchedule: {
                classSchedules: [{ day: 'TUESDAY', startTime: '08:00', endTime: '09:20' }],
                classStartDate: '2026-06-09', classEndDate: '2026-09-08',
            },
        }),
    ]).sections;
    const ics = buildRoutineICS(tricky, { now: NOW });
    assert(ics.includes('LOCATION:Room 3\\, Block C'), 'comma not escaped:\n' + ics);
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
