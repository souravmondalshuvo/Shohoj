// tests/plannerTotals.test.js — unit tests for the planner impact-preview
// totals (#327), the pure port of getCurrentTotals (js/ui/playground.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { getPlannerTotals } from '../src/features/calculator/plannerTotals.ts';

const course = (name, credits, grade) => ({ name, credits, grade });
const inputs = (semesters) => ({ semesters, startSeason: 'Fall', startYear: '2024' });

test('summary points ride in; running graded courses count (unlike the export base)', () => {
  const totals = getPlannerTotals(
    inputs([
      { id: 0, name: 'Past', summary: true, summaryCGPA: 3.5, summaryCredits: 30, courses: [], running: false },
      { id: 1, name: 'Summer 2026', running: true, courses: [course('Algo (CSE221)', 3, 'A')] },
    ]),
  );
  assert.equal(totals.pts, 3.5 * 30 + 4 * 3);
  assert.equal(totals.cr, 33);
  assert.ok(Math.abs(totals.cgpa - (3.5 * 30 + 12) / 33) < 1e-9);
});

test('F(NT), P, I and ungraded courses are skipped entirely', () => {
  const totals = getPlannerTotals(
    inputs([
      {
        id: 1,
        name: 'Fall 2024',
        running: false,
        courses: [
          course('A (CSE110)', 3, 'A'),
          course('T (CSE101)', 3, 'F(NT)'), // skipped — not 0-point credits
          course('L (CSE110L)', 1, 'P'),
          course('I (CSE230)', 3, 'I'),
          course('U (CSE250)', 3, ''),
        ],
      },
    ]),
  );
  assert.equal(totals.pts, 12);
  assert.equal(totals.cr, 3);
});

test('a superseded attempt is excluded via the retake keys', () => {
  const totals = getPlannerTotals(
    inputs([
      { id: 1, name: 'Fall 2024', running: false, courses: [course('DS (CSE220)', 3, 'F')] },
      { id: 2, name: 'Spring 2025', running: false, courses: [course('DS (CSE220)', 3, 'A')] },
    ]),
  );
  assert.equal(totals.pts, 12); // only the A attempt
  assert.equal(totals.cr, 3);
});

test('no graded data yields a null CGPA', () => {
  const totals = getPlannerTotals(inputs([]));
  assert.deepEqual(totals, { pts: 0, cr: 0, cgpa: null });
});
