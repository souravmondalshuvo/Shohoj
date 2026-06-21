// tests/notifications.test.js — unit tests for the notification model + reducer.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DURATIONS,
  createNotification,
  initialNotificationState,
  notificationReducer,
} from '../src/state/notifications.ts';

test('createNotification applies per-kind default duration', () => {
  const n = createNotification({ kind: 'success', message: 'Saved' }, { id: 'a', now: 100 });
  assert.deepEqual(n, {
    id: 'a',
    kind: 'success',
    message: 'Saved',
    durationMs: DEFAULT_DURATIONS.success,
    createdAt: 100,
  });
});

test('createNotification respects an explicit duration override (incl. null)', () => {
  const sticky = createNotification(
    { kind: 'info', message: 'Hold', durationMs: null },
    { id: 'b', now: 1 },
  );
  assert.equal(sticky.durationMs, null);

  const custom = createNotification(
    { kind: 'success', message: 'Quick', durationMs: 500 },
    { id: 'c', now: 1 },
  );
  assert.equal(custom.durationMs, 500);
});

test('errors are sticky by default', () => {
  const e = createNotification({ kind: 'error', message: 'Failed' }, { id: 'e', now: 1 });
  assert.equal(e.durationMs, null);
});

test('push appends; dismiss removes by id; clear empties', () => {
  const a = createNotification({ kind: 'info', message: 'A' }, { id: '1', now: 1 });
  const b = createNotification({ kind: 'info', message: 'B' }, { id: '2', now: 2 });

  let state = notificationReducer(initialNotificationState, { type: 'push', notification: a });
  state = notificationReducer(state, { type: 'push', notification: b });
  assert.deepEqual(state.items.map((n) => n.id), ['1', '2']);

  state = notificationReducer(state, { type: 'dismiss', id: '1' });
  assert.deepEqual(state.items.map((n) => n.id), ['2']);

  state = notificationReducer(state, { type: 'clear' });
  assert.deepEqual(state.items, []);
});

test('push with an existing id replaces rather than duplicating', () => {
  const a1 = createNotification({ kind: 'info', message: 'first' }, { id: 'x', now: 1 });
  const a2 = createNotification({ kind: 'warning', message: 'second' }, { id: 'x', now: 2 });

  let state = notificationReducer(initialNotificationState, { type: 'push', notification: a1 });
  state = notificationReducer(state, { type: 'push', notification: a2 });
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].message, 'second');
  assert.equal(state.items[0].kind, 'warning');
});

test('reducer does not mutate the previous state', () => {
  const a = createNotification({ kind: 'info', message: 'A' }, { id: '1', now: 1 });
  const next = notificationReducer(initialNotificationState, { type: 'push', notification: a });
  assert.notEqual(next, initialNotificationState);
  assert.deepEqual(initialNotificationState.items, []);
});
