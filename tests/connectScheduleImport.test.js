/**
 * tests/connectScheduleImport.test.js
 * Reading a pasted CONNECT "Class and Exam Schedule" (#633).
 *
 * Why this exists: the public feed is a catalog of every section on offer and
 * carries no student identity, so archiving semesters can never tell us which
 * sections are *yours*. The reported case made that concrete — the archived
 * Summer catalog held four of the student's six rows and was missing both lab
 * components entirely, while the CONNECT page in front of them had all six.
 *
 * The fixture below is that exact schedule.
 */

import { parseConnectSchedule, picksFromImport, importedSectionId } from '../js/core/connectScheduleImport.js';
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

// A real Summer 2026 schedule, as an HTML table copy: tab-separated, trailing
// empty cells for the days with no class.
const PASTE = [
    'TIME/DAY\tSUNDAY\tMONDAY\tTUESDAY\tWEDNESDAY\tTHURSDAY\tFRIDAY\tSATURDAY',
    '8:00 AM - 9:20 AM\t\tMAT215 -13 -MZK-12A-08C\t\tMAT215 -13 -MZK-12A-08C\t\t\t',
    '9:30 AM - 10:50 AM\tCSE220 -04 -MAHR-10B-15C\t\tCSE220 -04 -MAHR-10B-15C\t\t\t\t',
    '11:00 AM - 1:50 PM\t\tCSE220L -04 -TBA-09B-08L\tCSE251L -09B -TBA-FT10-02L\t\t\t\t',
    '2:00 PM - 3:20 PM\tMAT111 -01 -EMNH-12A-09C\t\tMAT111 -01 -EMNH-12A-09C\t\t\t\t',
    '3:30 PM - 4:50 PM\t\tCSE251 -09B -HMH-07H-27C\t\tCSE251 -09B -HMH-07H-27C\t\t\t',
    '',
    'DAY\tTIME\tEXAM\tCOURSE',
    'SATURDAY (2026-07-25)\t4:30 PM -6:30 PM\tMID\tCSE251',
].join('\n');

const byCode = (result) => Object.fromEntries(result.sections.map(s => [s.courseCode, s]));

// ---- The real schedule -----------------------------------------------------
test('every row of the real schedule comes back', () => {
    const r = parseConnectSchedule(PASTE);
    eq(r.sections.map(s => s.courseCode).sort(),
       ['CSE220', 'CSE220L', 'CSE251', 'CSE251L', 'MAT111', 'MAT215']);
    eq(r.warnings, []);
});

test('the lab components survive, which is what the catalog could not do', () => {
    // CSE220L and CSE251L are absent from the archived Summer catalog entirely.
    // The paste is the only place they exist, and it is the reason this parser
    // reads the page rather than resolving codes against the feed.
    const s = byCode(parseConnectSchedule(PASTE));
    eq(s.CSE220L.sectionName, '04');
    eq(s.CSE220L.roomName, '09B-08L');
    eq(s.CSE251L.roomName, 'FT10-02L');
    // A room with its own hyphens must not be mistaken for the faculty field.
    eq(s.CSE251L.faculties, 'TBA');
});

test('faculty initials come across, where the snapshot said TBA', () => {
    const s = byCode(parseConnectSchedule(PASTE));
    eq(s.MAT215.faculties, 'MZK');
    eq(s.CSE251.faculties, 'HMH');
    eq(s.MAT111.faculties, 'EMNH');
});

test('a twice-weekly class gets both days, in 24-hour time', () => {
    const s = byCode(parseConnectSchedule(PASTE));
    eq(s.MAT215.sectionSchedule.classSchedules, [
        { day: 'MONDAY', startTime: '08:00:00', endTime: '09:20:00' },
        { day: 'WEDNESDAY', startTime: '08:00:00', endTime: '09:20:00' },
    ]);
});

test('an afternoon end time crosses noon correctly', () => {
    // 11:00 AM - 1:50 PM is the lab slot. Reading the PM as 01:50 would make it
    // a negative-length class and the grid would drop it silently.
    const s = byCode(parseConnectSchedule(PASTE));
    eq(s.CSE220L.sectionSchedule.classSchedules,
       [{ day: 'MONDAY', startTime: '11:00:00', endTime: '13:50:00' }]);
});

test('the exam table attaches to the right course', () => {
    const s = byCode(parseConnectSchedule(PASTE));
    eq(s.CSE251.sectionSchedule.midExamDate, '2026-07-25');
    eq(s.CSE251.sectionSchedule.midExamStartTime, '16:30:00');
    eq(s.CSE251.sectionSchedule.midExamEndTime, '18:30:00');
    // And only that course.
    assert(!s.MAT215.sectionSchedule.midExamDate, 'exam must not spread to other courses');
});

// ---- The point of the raw-feed shape ---------------------------------------
test('the output feeds parseFeed unchanged', () => {
    // The whole design: an imported routine is an ordinary routine downstream,
    // so the grid, clash detection and calendar export need to know nothing.
    const { sections, dropped } = parseFeed(parseConnectSchedule(PASTE).sections);
    eq(dropped, []);
    eq(sections.length, 6);
    const lab = sections.find(s => s.courseCode === 'CSE220L');
    eq(lab.classSlots, [{ day: 'MONDAY', startMin: 660, endMin: 830, kind: 'theory', room: '09B-08L' }]);
    const exam = sections.find(s => s.courseCode === 'CSE251');
    eq(exam.midExam, { date: '2026-07-25', startMin: 990, endMin: 1110 });
});

test('picks are the shape the builder already stores', () => {
    const r = parseConnectSchedule(PASTE);
    const picks = picksFromImport(r);
    eq(Object.keys(picks).sort(), ['CSE220', 'CSE220L', 'CSE251', 'CSE251L', 'MAT111', 'MAT215']);
    assert(Object.values(picks).every(v => v < 0), 'imported ids must be negative');
});

test('imported ids are stable and never collide with feed ids', () => {
    // Stable so re-pasting updates picks instead of duplicating them; negative
    // so a real section id can never be confused for an imported one.
    eq(importedSectionId('CSE220', '04'), importedSectionId('CSE220', '04'));
    assert(importedSectionId('CSE220', '04') !== importedSectionId('CSE220', '05'));
    assert(importedSectionId('CSE220', '04') !== importedSectionId('CSE220L', '04'));
    assert(importedSectionId('CSE220', '04') < 0);
});

// ---- Clipboards are not tidy ------------------------------------------------
test('space-collapsed cells parse too', () => {
    // Not every browser puts tabs on the clipboard for an HTML table.
    const r = parseConnectSchedule([
        'TIME/DAY   SUNDAY   MONDAY   TUESDAY   WEDNESDAY',
        '8:00 AM - 9:20 AM      MAT215 -13 -MZK-12A-08C      MAT215 -13 -MZK-12A-08C',
    ].join('\n'));
    eq(r.sections.length, 1);
    eq(r.sections[0].sectionSchedule.classSchedules.length, 2);
});

test('a paste without the day header keeps the courses and says what is missing', () => {
    // The failure mode that matters: rather than guessing a day and putting a
    // class on the grid at a time that is wrong, it reports the gap.
    const r = parseConnectSchedule('8:00 AM - 9:20 AM\t\tMAT215 -13 -MZK-12A-08C');
    eq(r.sections.length, 1);
    eq(r.sections[0].sectionSchedule.classSchedules, []);
    assert(/not when they meet/.test(r.warnings[0]), r.warnings[0]);
    assert(/MAT215/.test(r.warnings[0]), r.warnings[0]);
});

test('nothing recognisable is reported, not silently empty', () => {
    eq(parseConnectSchedule('').warnings, ['Nothing was pasted.']);
    eq(parseConnectSchedule('   \n  ').warnings, ['Nothing was pasted.']);
    const junk = parseConnectSchedule('Dear student,\nPlease log in to CONNECT.');
    eq(junk.sections, []);
    assert(/Copy the whole Class Schedule table/.test(junk.warnings[0]), junk.warnings[0]);
});

test('an exam with no class row is reported rather than dropped', () => {
    const r = parseConnectSchedule('SATURDAY (2026-07-25)\t4:30 PM -6:30 PM\tMID\tCSE251');
    assert(r.warnings.some(w => /Mid exam for CSE251/.test(w)), JSON.stringify(r.warnings));
});

test('non-string input does not throw', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
        eq(parseConnectSchedule(bad).sections, [], `expected [] for ${String(bad)}`);
    }
});

test('re-pasting the same schedule is idempotent', () => {
    const a = parseConnectSchedule(PASTE);
    const b = parseConnectSchedule(PASTE + '\n');
    eq(picksFromImport(a), picksFromImport(b));
    eq(a.sections.length, b.sections.length);
});

// ---------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
