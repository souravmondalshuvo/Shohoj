// tests/personalData.test.js
//
// What sign-out and Clear Data actually remove from the browser (#627).
//
// The bug this guards against is silent in both directions: a key missing from
// the personal list keeps a student's data on a shared machine after they sign
// out, and a key wrongly ON it deletes something they expected to keep. So the
// assertions name keys explicitly rather than counting them.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERSONAL_LOCAL_KEYS,
  PERSONAL_SESSION_KEYS,
  PREFERENCE_LOCAL_KEYS,
  SYNC_LOCAL_KEYS,
  clearAllShohojData,
  clearPersonalData,
} from '../js/core/personalData.js';

// Everything a signed-in student can leave behind, plus the caches and flags
// that must survive a sign-out.
const POPULATED = {
  local: {
    shohoj_cgpa_v1: '{"semesters":[{"id":1}]}',
    shohoj_routine_v1: '{"picks":{"CSE110":1}}',
    shohoj_my_reviews_v1: '{"uid-1":[{"facultyInitials":"ABC"}]}',
    shohoj_seat_watch_v1: '[{"id":"CSE110-1"}]',
    shohoj_seat_alerts_enabled: '1',
    shohoj_connect_profile_v1: '{"studentId":"20101234"}',
    shohoj_last_sync: '1756200000000',
    shohoj_session_start: '1756100000000',
    shohoj_theme: 'light',
    shohoj_connect_feed_v1: '{"sections":[]}',
    shohoj_routine_ratings_v1: '{"ABC":4.2}',
  },
  session: {
    shohoj_active_tab: 'routine',
    shohoj_cloud_applied: '1',
    shohoj_skip_first_save: '1',
    shohoj_calc_unlocked: '1',
  },
};

function install({ localThrows = false } = {}) {
  const local = new Map(Object.entries(POPULATED.local));
  const session = new Map(Object.entries(POPULATED.session));
  globalThis.localStorage = {
    removeItem: (k) => {
      if (localThrows) throw new Error('storage disabled');
      local.delete(k);
    },
  };
  globalThis.sessionStorage = { removeItem: (k) => session.delete(k) };
  return { local, session };
}

function uninstall() {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
}

test('sign-out clears every personal key and the sync bookkeeping', () => {
  const { local, session } = install();
  try {
    clearPersonalData();
    for (const key of [...PERSONAL_LOCAL_KEYS, ...SYNC_LOCAL_KEYS]) {
      assert.equal(local.has(key), false, `${key} survived sign-out`);
    }
    for (const key of PERSONAL_SESSION_KEYS) {
      assert.equal(session.has(key), false, `${key} survived sign-out`);
    }
  } finally {
    uninstall();
  }
});

test('sign-out keeps the theme and the public caches', () => {
  const { local } = install();
  try {
    clearPersonalData();
    // The theme is a preference, not a trace of who was here.
    assert.equal(local.get('shohoj_theme'), 'light');
    // Identical bytes for every student — dropping them would only cost a refetch.
    assert.equal(local.has('shohoj_connect_feed_v1'), true);
    assert.equal(local.has('shohoj_routine_ratings_v1'), true);
  } finally {
    uninstall();
  }
});

test('sign-out clears the campus gate unlock, so the next visitor meets the gate', () => {
  const { session } = install();
  try {
    clearPersonalData();
    assert.equal(session.has('shohoj_calc_unlocked'), false);
  } finally {
    uninstall();
  }
});

test('Clear Data also resets the preferences it promises to reset', () => {
  const { local, session } = install();
  try {
    clearAllShohojData();
    for (const key of PREFERENCE_LOCAL_KEYS) {
      assert.equal(local.has(key), false, `${key} survived Clear Data`);
    }
    assert.equal(local.has('shohoj_cgpa_v1'), false);
    assert.equal(session.has('shohoj_active_tab'), false);
  } finally {
    uninstall();
  }
});

test('a storage that refuses does not abort the wipe', () => {
  const { session } = install({ localThrows: true });
  try {
    assert.doesNotThrow(() => clearPersonalData());
    // localStorage threw on every key; sessionStorage was still cleared.
    assert.equal(session.size, 0);
  } finally {
    uninstall();
  }
});

test('the routine is on the personal list — it has no cloud copy to come back from', () => {
  assert.ok(PERSONAL_LOCAL_KEYS.includes('shohoj_routine_v1'));
});
