/**
 * tests/routineSectionList.test.js
 *
 * The ordering and filtering rules a student actually feels: a section they
 * cannot take never sits at the top of the list, a filter never quietly drops
 * a section it has nothing to judge, and every sort is stable on section
 * number so the list does not reshuffle arbitrarily.
 *
 * Twin parity with src/core/routineSectionList.ts is covered separately, in
 * tests/twinParity.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_EARLY_MIN,
  FILTER_EVENING_MIN,
  earliestStart,
  seatsLeft,
  sectionNumber,
  sectionPassesFilters,
  sortRoutineSections,
} from '../js/core/routineSectionList.js';

const section = (over = {}) => ({
  sectionId: 1,
  courseCode: 'CSE220',
  sectionName: '01',
  facultyInitials: 'ABC',
  capacity: 30,
  consumedSeat: 10,
  isFull: false,
  classSlots: [{ day: 'SUNDAY', startMin: 10 * 60, endMin: 11 * 60 + 20 }],
  ...over,
});

const ids = (list) => list.map((s) => s.sectionId);

test('seats left never goes negative on an over-enrolled section', () => {
  assert.equal(seatsLeft(section({ capacity: 30, consumedSeat: 12 })), 18);
  assert.equal(seatsLeft(section({ capacity: 30, consumedSeat: 33 })), 0);
});

test('a section with no classes has no earliest start to compare', () => {
  assert.equal(earliestStart(section()), 600);
  assert.equal(earliestStart(section({ classSlots: [] })), Number.MAX_SAFE_INTEGER);
});

test('unnumbered sections sort last rather than first', () => {
  assert.equal(sectionNumber('07'), 7);
  assert.equal(sectionNumber('TBA'), Number.MAX_SAFE_INTEGER);
  assert.equal(sectionNumber(null), Number.MAX_SAFE_INTEGER);
});

test('no filters set: everything passes without inspecting slots', () => {
  assert.equal(sectionPassesFilters(section(), {}), true);
  assert.equal(sectionPassesFilters(section({ classSlots: [] }), {}), true);
});

test('"no early" is judged on the boundary, not near it', () => {
  const at9 = section({ classSlots: [{ day: 'SUNDAY', startMin: FILTER_EARLY_MIN, endMin: 620 }] });
  const before9 = section({
    classSlots: [{ day: 'SUNDAY', startMin: FILTER_EARLY_MIN - 1, endMin: 620 }],
  });
  assert.equal(sectionPassesFilters(at9, { noEarly: true }), true);
  assert.equal(sectionPassesFilters(before9, { noEarly: true }), false);
});

test('"no evening" is judged on the boundary, not near it', () => {
  const to5 = section({ classSlots: [{ day: 'SUNDAY', startMin: 900, endMin: FILTER_EVENING_MIN }] });
  const past5 = section({
    classSlots: [{ day: 'SUNDAY', startMin: 900, endMin: FILTER_EVENING_MIN + 1 }],
  });
  assert.equal(sectionPassesFilters(to5, { noEvening: true }), true);
  assert.equal(sectionPassesFilters(past5, { noEvening: true }), false);
});

test('one bad slot fails the section, even when its other days are fine', () => {
  const twoDays = section({
    classSlots: [
      { day: 'SUNDAY', startMin: 600, endMin: 680 },
      { day: 'FRIDAY', startMin: 600, endMin: 680 },
    ],
  });
  assert.equal(sectionPassesFilters(twoDays, { avoidDays: ['FRIDAY'] }), false);
  assert.equal(sectionPassesFilters(twoDays, { avoidDays: ['THURSDAY'] }), true);
});

test('a section with no timetable is not filtered out by day or time', () => {
  // Nothing is known about when it meets, so a filter has no grounds to hide
  // it — and hiding it would make the course look like it had no sections.
  const noSlots = section({ classSlots: [] });
  assert.equal(sectionPassesFilters(noSlots, { noEarly: true, avoidDays: ['SUNDAY'] }), true);
});

test('full sections sink to the bottom whatever the sort', () => {
  const list = [
    section({ sectionId: 1, sectionName: '01', isFull: true, consumedSeat: 30 }),
    section({ sectionId: 2, sectionName: '02' }),
    section({ sectionId: 3, sectionName: '03' }),
  ];
  for (const mode of ['section', 'seats', 'time', 'faculty']) {
    assert.equal(sortRoutineSections(list, mode).at(-1).sectionId, 1, `mode ${mode}`);
  }
});

test('section number is the tie-break, so equal rows keep a stable order', () => {
  const list = [
    section({ sectionId: 3, sectionName: '03' }),
    section({ sectionId: 1, sectionName: '01' }),
    section({ sectionId: 2, sectionName: '02' }),
  ];
  // Every row has the same seats and the same start time.
  assert.deepEqual(ids(sortRoutineSections(list, 'seats')), [1, 2, 3]);
  assert.deepEqual(ids(sortRoutineSections(list, 'time')), [1, 2, 3]);
});

test('seats sort puts the emptiest section first', () => {
  const list = [
    section({ sectionId: 1, sectionName: '01', consumedSeat: 29 }),
    section({ sectionId: 2, sectionName: '02', consumedSeat: 5 }),
  ];
  assert.deepEqual(ids(sortRoutineSections(list, 'seats')), [2, 1]);
});

test('time sort puts the earliest class first', () => {
  const list = [
    section({ sectionId: 1, sectionName: '01', classSlots: [{ day: 'SUNDAY', startMin: 800, endMin: 880 }] }),
    section({ sectionId: 2, sectionName: '02', classSlots: [{ day: 'SUNDAY', startMin: 480, endMin: 560 }] }),
  ];
  assert.deepEqual(ids(sortRoutineSections(list, 'time')), [2, 1]);
});

test('faculty sort ranks by the accessor, and unrated sections fall behind', () => {
  const list = [
    section({ sectionId: 1, sectionName: '01', facultyInitials: 'AAA' }),
    section({ sectionId: 2, sectionName: '02', facultyInitials: 'BBB' }),
    section({ sectionId: 3, sectionName: '03', facultyInitials: 'CCC' }),
  ];
  const rating = (s) => ({ AAA: 3.2, BBB: 4.8 })[s.facultyInitials] ?? -1;
  assert.deepEqual(ids(sortRoutineSections(list, 'faculty', rating)), [2, 1, 3]);
});

test('with no rating accessor, faculty sort degrades to section order', () => {
  const list = [
    section({ sectionId: 2, sectionName: '02' }),
    section({ sectionId: 1, sectionName: '01' }),
  ];
  assert.deepEqual(ids(sortRoutineSections(list, 'faculty')), [1, 2]);
});

test('sorting returns a new array and leaves the caller\'s alone', () => {
  const list = [section({ sectionId: 2, sectionName: '02' }), section({ sectionId: 1, sectionName: '01' })];
  const sorted = sortRoutineSections(list, 'section');
  assert.notEqual(sorted, list);
  assert.deepEqual(ids(list), [2, 1]);
});
