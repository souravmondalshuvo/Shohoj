// tests/staleSignedOutData.test.js
//
// The one-time cleanup for devices the pre-#627 sign-out left dirty.
//
// This wipe fires without anyone asking for it, so the predicate is the whole
// safety argument: it must catch a device abandoned by the old sign-out, and it
// must never touch a student who simply uses Shohoj signed out — local-first is
// how Shohoj has always worked and that data is not ours to delete. The matrix
// below is that argument, written down.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearStaleSignedOutData,
  hasStaleSignedOutData,
} from '../js/core/personalData.js';

function withStorage(local, { removeThrows = false } = {}) {
  const map = new Map(Object.entries(local));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => {
      if (removeThrows) throw new Error('storage disabled');
      map.delete(k);
    },
  };
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} };
  return map;
}

function cleanup() {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
}

const GRADES = '{"semesters":[{"id":1}]}';

test('a device abandoned by the old sign-out is recognised', () => {
  // Last-sync left behind, session start removed — the old signOutUser's exact
  // footprint (it cleared SESSION_START_KEY and nothing else).
  withStorage({ shohoj_cgpa_v1: GRADES, shohoj_last_sync: '1756200000000' });
  try {
    assert.equal(hasStaleSignedOutData(), true);
  } finally {
    cleanup();
  }
});

test('a student who never signed in is left completely alone', () => {
  // No sync has ever happened, so there is no last-sync. This is the case that
  // must never fire: their grades are the whole product, signed out.
  withStorage({ shohoj_cgpa_v1: GRADES });
  try {
    assert.equal(hasStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('a live session is not residue — session start is still set', () => {
  // What a signed-in student's reload looks like. Both keys present.
  withStorage({
    shohoj_cgpa_v1: GRADES,
    shohoj_last_sync: '1756200000000',
    shohoj_session_start: '1756100000000',
  });
  try {
    assert.equal(hasStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('a device already cleaned by the new sign-out does not match', () => {
  // clearPersonalData takes last-sync with it, which is what makes this
  // self-limiting: nothing is left for the check to find.
  withStorage({ shohoj_theme: 'light' });
  try {
    assert.equal(hasStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('clearing the residue wipes the data and reports success once', () => {
  const map = withStorage({
    shohoj_cgpa_v1: GRADES,
    shohoj_routine_v1: '{"picks":{}}',
    shohoj_last_sync: '1756200000000',
    shohoj_theme: 'light',
  });
  try {
    assert.equal(clearStaleSignedOutData(), true);
    assert.equal(map.has('shohoj_cgpa_v1'), false);
    assert.equal(map.has('shohoj_routine_v1'), false);
    assert.equal(map.has('shohoj_last_sync'), false);
    assert.equal(map.get('shohoj_theme'), 'light'); // a preference, not a trace

    // Self-limiting: the second pass has nothing to find, so the caller's
    // reload fires once and never again.
    assert.equal(clearStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('a storage that refuses removal reports false, so nothing reloads forever', () => {
  // The reload-loop guard. If removeItem is refused the residue survives, the
  // predicate stays true, and an unchecked caller would reload the page for
  // eternity. Reporting false is what makes that impossible.
  withStorage({ shohoj_cgpa_v1: GRADES, shohoj_last_sync: '1756200000000' }, { removeThrows: true });
  try {
    assert.equal(hasStaleSignedOutData(), true);
    assert.equal(clearStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('unreachable storage is not treated as residue', () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('access denied');
    },
    removeItem: () => {},
  };
  try {
    assert.equal(hasStaleSignedOutData(), false);
  } finally {
    cleanup();
  }
});

test('the shell shape — last-sync, never a session start — is why the shell must not boot-clean', () => {
  // Nothing in src/ writes shohoj_session_start, so a SIGNED-IN shell student
  // looks identical to an abandoned device. This test exists to make that fact
  // fail loudly if someone adds the key to the shell later and assumes the
  // predicate changed meaning: it did not, and the shell's boot is still not a
  // safe place to call it from until every existing session carries one.
  withStorage({ shohoj_cgpa_v1: GRADES, shohoj_last_sync: '1756200000000' });
  try {
    assert.equal(
      hasStaleSignedOutData(),
      true,
      'a device with last-sync and no session start still reads as residue',
    );
  } finally {
    cleanup();
  }
});
