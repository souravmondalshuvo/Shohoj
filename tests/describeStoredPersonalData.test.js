// tests/describeStoredPersonalData.test.js
//
// The sentence the "Saved on this device" notice shows a signed-out student.
//
// It has one job: be true. A student deciding whether to wipe a shared lab
// machine is acting on this text, so a category that is claimed but absent (or
// present but unmentioned) is worse than no notice at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeStoredPersonalData } from '../js/core/personalData.js';

function withStorage(local) {
  globalThis.localStorage = {
    getItem: (k) => (k in local ? local[k] : null),
  };
}

const cleanup = () => {
  delete globalThis.localStorage;
};

test('an empty browser has nothing to disclose', () => {
  withStorage({});
  try {
    assert.deepEqual(describeStoredPersonalData(), []);
  } finally {
    cleanup();
  }
});

test('counts come from the stored shape, and read like the screen does', () => {
  withStorage({
    shohoj_cgpa_v1: JSON.stringify({ semesters: [1, 2, 3, 4, 5, 6] }),
    shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
    shohoj_seat_watch_v1: JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
  });
  try {
    assert.deepEqual(describeStoredPersonalData(), [
      '6 semesters',
      'your routine',
      '7 watched sections',
    ]);
  } finally {
    cleanup();
  }
});

test('singulars are singular — "1 semesters" reads like a bug to a student', () => {
  withStorage({
    shohoj_cgpa_v1: JSON.stringify({ semesters: [1] }),
    shohoj_seat_watch_v1: JSON.stringify([1]),
    shohoj_my_reviews_v1: JSON.stringify({ u1: [{ facultyInitials: 'ABC' }] }),
  });
  try {
    assert.deepEqual(describeStoredPersonalData(), [
      '1 semester',
      '1 watched section',
      '1 review you wrote',
    ]);
  } finally {
    cleanup();
  }
});

test('a key that is present but empty claims nothing', () => {
  // The state a browser lands in after a wipe: the app rewrites an empty
  // snapshot. Telling that student they have "0 semesters" saved would be false.
  withStorage({
    shohoj_cgpa_v1: JSON.stringify({ semesters: [] }),
    shohoj_routine_v1: JSON.stringify({ picks: {} }),
    shohoj_seat_watch_v1: '[]',
    shohoj_my_reviews_v1: JSON.stringify({ u1: [] }),
  });
  try {
    assert.deepEqual(describeStoredPersonalData(), []);
  } finally {
    cleanup();
  }
});

test('a student who used both builds is told about one routine, not two', () => {
  withStorage({
    shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
    shohoj_routine_picks_v1: JSON.stringify({ picks: { CSE221: 12 } }),
  });
  try {
    assert.deepEqual(describeStoredPersonalData(), ['your routine']);
  } finally {
    cleanup();
  }
});

test('the shell-only routine key is disclosed on its own', () => {
  withStorage({ shohoj_routine_picks_v1: JSON.stringify({ picks: { CSE221: 12 } }) });
  try {
    assert.deepEqual(describeStoredPersonalData(), ['your routine']);
  } finally {
    cleanup();
  }
});

test('unreadable storage is silent rather than wrong', () => {
  withStorage({ shohoj_cgpa_v1: '{not json', shohoj_seat_watch_v1: '[1,2]' });
  try {
    assert.deepEqual(describeStoredPersonalData(), ['2 watched sections']);
  } finally {
    cleanup();
  }
});

test('reviews are counted across every uid the browser holds', () => {
  // The receipt is a map keyed by uid; a shared browser can hold more than one.
  withStorage({
    shohoj_my_reviews_v1: JSON.stringify({ u1: [{ a: 1 }, { b: 2 }], u2: [{ c: 3 }] }),
  });
  try {
    assert.deepEqual(describeStoredPersonalData(), ['3 reviews you wrote']);
  } finally {
    cleanup();
  }
});
