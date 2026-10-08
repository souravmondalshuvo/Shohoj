/**
 * tests/termCalendar.test.js
 * Whether a weekly timetable describes a date, asked of NSU's Fall 2026
 * calendar as it is generated into the snapshot metadata: holidays, day
 * patterns that end before the term does, and the exam window after it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CAMPUS_FEED_SNAPSHOTS } from '../js/core/campusFeeds.generated.js';
import {
  termDayNote,
  termDayStatus,
  termExamNote,
  termLastClassDate,
  termNoClassDates,
  termWeekdayOf,
} from '../js/core/termCalendar.js';

const term = CAMPUS_FEED_SNAPSHOTS.nsu;
const status = (date) => termDayStatus(date, term);
const note = (date) => termDayNote(status(date), term);

test('the snapshot carries what the calendar says beyond the first and last class', () => {
  assert.deepEqual(
    term.noClassDays.map((d) => d.date),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-11-07', '2026-12-06', '2026-12-16'],
  );
  assert.deepEqual(term.lastClassDays, [
    { date: '2026-12-15', days: ['SUNDAY', 'TUESDAY'] },
    { date: '2026-12-19', days: ['THURSDAY', 'SATURDAY'] },
    { date: '2026-12-20', days: ['MONDAY', 'WEDNESDAY'] },
  ]);
  assert.equal(term.examStartDate, '2026-12-22');
  assert.equal(term.examEndDate, '2026-12-28');
  // Christmas Day is a holiday on the calendar, but after the last class.
  assert.ok(term.noClassDays.every((d) => d.date <= term.classEndDate));
});

test('weekdays are read off the date, not the clock’s timezone', () => {
  assert.equal(termWeekdayOf('2026-09-20'), 'SUNDAY');
  assert.equal(termWeekdayOf('2026-12-16'), 'WEDNESDAY');
});

test('an ordinary day in the term is described by the timetable', () => {
  assert.equal(status('2026-09-20').phase, 'classes');
  assert.equal(status('2026-10-07').phase, 'classes');
  assert.equal(note('2026-10-07'), '');
});

test('before the first class and after the last, it is not', () => {
  assert.equal(status('2026-09-19').phase, 'before');
  assert.equal(note('2026-09-19'), 'Term 263 classes start on 2026-09-20.');
  assert.equal(status('2026-12-21').phase, 'after');
});

test('after the last class the exam window is named until it closes', () => {
  assert.equal(
    note('2026-12-21'),
    'Term 263 classes ended on 2026-12-20. Final exams run from 2026-12-22 to 2026-12-28.',
  );
  assert.equal(status('2026-12-28').examsUntil, '2026-12-28');
  assert.equal(note('2026-12-29'), 'Term 263 classes ended on 2026-12-20.');
  assert.equal(termExamNote(term), 'Final exams run from 2026-12-22 to 2026-12-28.');
  assert.equal(termExamNote({ ...term, examStartDate: null, examEndDate: null }), '');
});

test('a holiday inside the term has no classes, and says which holiday', () => {
  assert.equal(status('2026-10-20').phase, 'off');
  assert.equal(note('2026-10-20'), 'No classes today: Holiday- Durga Puja.');
  // The days either side are "No Classes" with no reason given.
  assert.equal(status('2026-10-19').phase, 'off');
  assert.equal(note('2026-10-19'), 'The academic calendar has no classes today.');
  assert.equal(status('2026-10-23').phase, 'classes');
});

test('a weekday whose pattern has ended has no classes left', () => {
  // ST ends Tuesday 15 Dec; RA runs to Saturday 19 Dec.
  assert.equal(status('2026-12-15').phase, 'classes');
  assert.equal(status('2026-12-17').phase, 'classes');
  assert.equal(status('2026-12-19').phase, 'classes');
  const sunday = status('2026-12-20');
  assert.equal(sunday.phase, 'off');
  assert.equal(sunday.ended.date, '2026-12-15');
});

test('the last MW class falls on a Sunday, which the timetable cannot place', () => {
  assert.deepEqual(status('2026-12-20').makeup, ['MONDAY', 'WEDNESDAY']);
  assert.equal(
    note('2026-12-20'),
    'Sunday and Tuesday classes ended on 2026-12-15. Monday and Wednesday classes hold their last meeting today, which a weekly timetable cannot place.',
  );
  assert.equal(status('2026-12-14').makeup, null);
});

test('each weekday’s classes stop on its own pattern’s last day', () => {
  assert.equal(termLastClassDate(term, 'SUNDAY'), '2026-12-15');
  assert.equal(termLastClassDate(term, 'SATURDAY'), '2026-12-19');
  assert.equal(termLastClassDate(term, 'MONDAY'), '2026-12-20');
  // Friday belongs to no pattern, so it runs to the end of the term.
  assert.equal(termLastClassDate(term, 'FRIDAY'), '2026-12-20');
});

test('the no-class dates are found by weekday', () => {
  assert.deepEqual(termNoClassDates(term, 'MONDAY'), ['2026-10-19']);
  assert.deepEqual(termNoClassDates(term, 'WEDNESDAY'), ['2026-10-21', '2026-12-16']);
  assert.deepEqual(termNoClassDates(term, 'FRIDAY'), []);
});

test('a term with no calendar detail is just its first and last day', () => {
  const bare = { term: '999', classStartDate: '2026-01-10', classEndDate: '2026-04-10' };
  assert.equal(termDayStatus('2026-02-01', bare).phase, 'classes');
  assert.equal(termDayStatus('2026-04-11', bare).examsUntil, null);
  assert.equal(termLastClassDate(bare, 'MONDAY'), '2026-04-10');
  assert.deepEqual(termNoClassDates(bare, 'MONDAY'), []);
});
