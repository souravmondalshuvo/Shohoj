// tests/semesterCalendar.test.js — unit tests for the pure semester/calendar
// derivation logic extracted from js/ui/render.js (Phase 5B foundation).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOrdinal,
  estimatedSemesterCount,
  getCurrentSemesterForDeptSeasons,
  isFutureSemester,
  nextSemester,
  parseSemesterSeasonYear,
} from '../src/features/calculator/semesterCalendar.ts';

const FULL = ['Spring', 'Summer', 'Fall'];
const NO_SUMMER = ['Spring', 'Fall'];

test('parseSemesterSeasonYear extracts season + year, tolerating suffixes', () => {
  assert.deepEqual(parseSemesterSeasonYear('Fall 2024'), { season: 'Fall', year: 2024 });
  assert.deepEqual(
    parseSemesterSeasonYear('Spring 2023 (2ⁿᵈ Semester)'),
    { season: 'Spring', year: 2023 },
  );
  assert.equal(parseSemesterSeasonYear('Past Semesters'), null);
  assert.equal(parseSemesterSeasonYear(null), null);
});

test('getCurrentSemesterForDeptSeasons maps months to seasons', () => {
  assert.deepEqual(getCurrentSemesterForDeptSeasons(new Date(2025, 0, 15), FULL), { season: 'Spring', year: 2025 }); // Jan
  assert.deepEqual(getCurrentSemesterForDeptSeasons(new Date(2025, 5, 15), FULL), { season: 'Summer', year: 2025 }); // Jun
  assert.deepEqual(getCurrentSemesterForDeptSeasons(new Date(2025, 10, 15), FULL), { season: 'Fall', year: 2025 }); // Nov
});

test('getCurrentSemesterForDeptSeasons advances to the next offered season, wrapping the year', () => {
  // Summer (Jun) not offered → next offered is Fall, same year.
  assert.deepEqual(getCurrentSemesterForDeptSeasons(new Date(2025, 5, 15), NO_SUMMER), { season: 'Fall', year: 2025 });
  // Hypothetical dept offering only Summer: a Fall date wraps into next year's Summer.
  assert.deepEqual(getCurrentSemesterForDeptSeasons(new Date(2025, 10, 15), ['Summer']), { season: 'Summer', year: 2026 });
});

test('nextSemester steps through the calendar and wraps the year', () => {
  assert.deepEqual(nextSemester('Spring', 2024, FULL), { season: 'Summer', year: 2024 });
  assert.deepEqual(nextSemester('Fall', 2024, FULL), { season: 'Spring', year: 2025 });
  assert.deepEqual(nextSemester('Fall', 2024, NO_SUMMER), { season: 'Spring', year: 2025 });
});

test('computeOrdinal counts 1-based from start along the calendar', () => {
  const start = { season: 'Fall', year: 2022 };
  assert.equal(computeOrdinal({ season: 'Fall', year: 2022 }, start, FULL), 1);
  assert.equal(computeOrdinal({ season: 'Spring', year: 2023 }, start, FULL), 2);
  assert.equal(computeOrdinal({ season: 'Spring', year: 2024 }, start, FULL), 5);
  assert.equal(computeOrdinal({ season: 'Fall', year: 2022 }, null, FULL), null);
});

test('estimatedSemesterCount is the gap from start to current (exclusive)', () => {
  const start = { season: 'Fall', year: 2022 };
  assert.equal(estimatedSemesterCount(start, { season: 'Fall', year: 2022 }, FULL), 0);
  assert.equal(estimatedSemesterCount(start, { season: 'Summer', year: 2023 }, FULL), 2);
  assert.equal(estimatedSemesterCount(null, { season: 'Fall', year: 2022 }, FULL), 0);
});

test('isFutureSemester compares against the clock by global season order', () => {
  const now = new Date(2025, 5, 15); // Summer 2025
  assert.equal(isFutureSemester('Fall 2025', now), true);
  assert.equal(isFutureSemester('Spring 2025', now), false);
  assert.equal(isFutureSemester('Summer 2025', now), false); // not strictly future
  assert.equal(isFutureSemester('Spring 2026', now), true);
  assert.equal(isFutureSemester('Past Semesters', now), false);
});
