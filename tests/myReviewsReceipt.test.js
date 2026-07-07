// tests/myReviewsReceipt.test.js — unit tests for the my-reviews receipt (#357)
// over the in-memory store: the pure append/dedupe rule and the record/read
// round-trip, matching legacy _recordMyReview / _myReviews.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryKeyValueStore } from '../src/services/storage/keyValueStore.ts';
import {
  MY_REVIEWS_KEY,
  appendMyReview,
  recordMyReview,
  readMyReviews,
} from '../src/features/calculator/myReviewsReceipt.ts';

const entry = (facultyInitials, courseCode, extra = {}) => ({
  id: `${facultyInitials}_${courseCode}`,
  facultyInitials,
  courseCode,
  semester: 'Summer 2025',
  at: 1000,
  ...extra,
});

test('appendMyReview: adds under a fresh uid without touching the input', () => {
  const all = {};
  const next = appendMyReview(all, 'u1', entry('MRA', 'CSE110'));
  assert.deepEqual(next.u1.map((r) => r.id), ['MRA_CSE110']);
  assert.deepEqual(all, {}, 'input map is untouched');
});

test('appendMyReview: replaces a prior entry for the same faculty+course pair', () => {
  let all = appendMyReview({}, 'u1', entry('MRA', 'CSE110', { at: 1 }));
  all = appendMyReview(all, 'u1', entry('MRA', 'CSE111', { at: 2 }));
  all = appendMyReview(all, 'u1', entry('MRA', 'CSE110', { at: 3, semester: 'Fall 2025' }));

  // CSE110 replaced (moved to the end), CSE111 kept — one entry per pair.
  assert.deepEqual(all.u1.map((r) => `${r.courseCode}@${r.at}`), ['CSE111@2', 'CSE110@3']);
  assert.equal(all.u1.find((r) => r.courseCode === 'CSE110').semester, 'Fall 2025');
});

test('appendMyReview: keeps other uids separate', () => {
  let all = appendMyReview({}, 'u1', entry('MRA', 'CSE110'));
  all = appendMyReview(all, 'u2', entry('ZZZ', 'CSE220'));
  assert.deepEqual(Object.keys(all).sort(), ['u1', 'u2']);
  assert.equal(all.u1.length, 1);
  assert.equal(all.u2.length, 1);
});

test('record + read round-trip through the store', () => {
  const store = new MemoryKeyValueStore();
  recordMyReview(store, 'u1', entry('MRA', 'CSE110'));
  recordMyReview(store, 'u1', entry('ABC', 'CSE220'));

  const list = readMyReviews(store, 'u1');
  assert.deepEqual(list.map((r) => r.courseCode), ['CSE110', 'CSE220']);
  // Persisted under the legacy key + shape.
  assert.deepEqual(Object.keys(JSON.parse(store.getItem(MY_REVIEWS_KEY))), ['u1']);
});

test('recordMyReview is a no-op without a uid; readMyReviews returns empty', () => {
  const store = new MemoryKeyValueStore();
  recordMyReview(store, '', entry('MRA', 'CSE110'));
  assert.equal(store.getItem(MY_REVIEWS_KEY), null, 'nothing written');
  assert.deepEqual(readMyReviews(store, ''), []);
  assert.deepEqual(readMyReviews(store, 'nobody'), []);
});

test('readMyReviews tolerates a corrupt stored value', () => {
  const store = new MemoryKeyValueStore();
  store.setItem(MY_REVIEWS_KEY, '{not json');
  assert.deepEqual(readMyReviews(store, 'u1'), []);
  // A later record still works over the corrupt value.
  recordMyReview(store, 'u1', entry('MRA', 'CSE110'));
  assert.deepEqual(readMyReviews(store, 'u1').map((r) => r.courseCode), ['CSE110']);
});
