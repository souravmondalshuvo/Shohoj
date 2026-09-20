/**
 * tests/taskDigest.test.js
 *
 * The dashboard's view of Shohoj Tasks (#719) — src/features/tasks/taskDigest.ts.
 *
 * Phase 4's rule is that the dashboard must not reimplement Tasks, so this
 * module is deliberately small: a selection and an ordering over data the API
 * already returns. These tests exist mostly to pin that it STAYS small — every
 * assertion here is about which tasks appear and in what order, and none is
 * about what a deadline means, because that is settled elsewhere.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIGEST_LIMIT,
  buildDigest,
  digestLink,
  groupHeading,
} from '../src/features/tasks/taskDigest.ts';

const task = (id, over = {}) => ({
  id: `tsk_${String(id).padStart(32, '0')}`,
  enrollmentId: null,
  title: `Task ${id}`,
  description: null,
  type: 'ASSIGNMENT',
  status: 'TODO',
  priority: 'MEDIUM',
  priorityScore: null,
  dueAt: '2026-10-09T17:00:00.000Z',
  startAt: null,
  estimatedMinutes: null,
  source: 'MANUAL',
  sourceReference: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
  ...over,
});

const ids = (digest) => digest.entries.map((e) => e.task.title);
const groups = (digest) => digest.entries.map((e) => e.group);

test('overdue sorts above everything, regardless of priority', () => {
  // The one job a dashboard card has. Burying a missed deadline under a
  // CRITICAL task due next week would be a failure of the whole feature.
  const digest = buildDigest({
    overdue: [task(1, { title: 'late', priority: 'LOW' })],
    dueToday: [task(2, { title: 'today', priority: 'MEDIUM' })],
    upcoming: [task(3, { title: 'next week', priority: 'CRITICAL' })],
  });
  assert.deepEqual(ids(digest), ['late', 'today', 'next week']);
  assert.deepEqual(groups(digest), ['overdue', 'today', 'upcoming']);
});

test('the server ordering inside each band is kept', () => {
  // Re-sorting here would be a second opinion about a question the API already
  // answered (due date, then priority).
  const digest = buildDigest({
    overdue: [],
    dueToday: [task(1, { title: 'first' }), task(2, { title: 'second' })],
    upcoming: [],
  });
  assert.deepEqual(ids(digest), ['first', 'second']);
});

test('completed and cancelled work is dropped', () => {
  // The /tasks screen keeps completed work — finishing something should leave
  // evidence. A dashboard card is about what is left.
  const digest = buildDigest({
    overdue: [task(1, { title: 'done', status: 'COMPLETED' })],
    dueToday: [
      task(2, { title: 'cancelled', status: 'CANCELLED' }),
      task(3, { title: 'doing', status: 'IN_PROGRESS' }),
    ],
    upcoming: [],
  });
  assert.deepEqual(ids(digest), ['doing']);
  assert.equal(digest.overdueCount, 0, 'a completed overdue task is not a warning');
});

test('the card is capped, and says how many did not fit', () => {
  const digest = buildDigest({
    overdue: [],
    dueToday: Array.from({ length: 8 }, (_, i) => task(i + 1, { title: `t${i + 1}` })),
    upcoming: [],
  });
  assert.equal(digest.entries.length, DIGEST_LIMIT);
  assert.equal(digest.hiddenCount, 3);
});

test('the overdue count covers everything overdue, not just what fits', () => {
  // The count is a warning. Capping it at the visible rows would understate it
  // exactly when it matters most.
  const digest = buildDigest({
    overdue: Array.from({ length: 7 }, (_, i) => task(i + 1, { title: `late${i}` })),
    dueToday: [],
    upcoming: [],
    limit: 2,
  });
  assert.equal(digest.entries.length, 2);
  assert.equal(digest.overdueCount, 7);
});

test('a task appearing in two responses is shown once', () => {
  // The two endpoints are disjoint by construction, but the card is assembled
  // from two responses that can be a moment apart — a task crossing midnight
  // between them would otherwise appear twice.
  const crossing = task(1, { title: 'midnight' });
  const digest = buildDigest({ overdue: [], dueToday: [crossing], upcoming: [crossing] });
  assert.deepEqual(ids(digest), ['midnight']);
  assert.equal(digest.hiddenCount, 0);
});

test('an empty digest reports itself as empty', () => {
  const digest = buildDigest({ overdue: [], dueToday: [], upcoming: [] });
  assert.equal(digest.isEmpty, true);
  assert.deepEqual(digest.entries, []);
});

test('a digest of only completed work is empty, not full', () => {
  const digest = buildDigest({
    overdue: [],
    dueToday: [task(1, { status: 'COMPLETED' })],
    upcoming: [],
  });
  assert.equal(digest.isEmpty, true);
});

test('group headings print once per band', () => {
  assert.equal(groupHeading('overdue', null), 'Overdue');
  assert.equal(groupHeading('overdue', 'overdue'), null, 'not repeated within a band');
  assert.equal(groupHeading('today', 'overdue'), 'Today');
  assert.equal(groupHeading('upcoming', 'today'), 'Coming up');
});

test('the link lands on the view that actually holds the work', () => {
  // Overdue work lives on Today. Sending a student with something late to
  // Upcoming would land them on a view that does not contain it.
  const late = buildDigest({ overdue: [task(1)], dueToday: [], upcoming: [] });
  assert.equal(digestLink(late), '/tasks');

  const ahead = buildDigest({ overdue: [], dueToday: [], upcoming: [task(2)] });
  assert.equal(digestLink(ahead), '/tasks?view=upcoming');
});
