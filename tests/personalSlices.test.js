// tests/personalSlices.test.js
//
// The slices that ride along in the cloud snapshot (#627): routine, seat
// watchlist + alert preference, the review receipt, the profile snapshot.
//
// Two rules carry most of the risk. A slice the snapshot does not carry means
// "written by a client that predates this field", not "this student has
// nothing" — reading it the other way would let an old device wipe a new one.
// And the review receipt is a uid-keyed map on a browser that several students
// may share, so only the signed-in student's own slice may enter their doc.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPersonalSlices, collectPersonalSlices } from '../js/core/personalData.js';

function install(initial = {}) {
  const map = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

const uninstall = () => {
  delete globalThis.localStorage;
};

const json = (v) => JSON.stringify(v);
const read = (map, key) => JSON.parse(map.get(key));

test('collects everything this device holds beyond the calculator', () => {
  install({
    shohoj_routine_v1: json({ picks: { CSE110: 1, MAT110: null } }),
    shohoj_my_reviews_v1: json({ u_me: [{ facultyInitials: 'ABC' }], u_other: [{ x: 1 }] }),
    shohoj_seat_watch_v1: json([{ sectionId: 1, courseCode: 'CSE110' }]),
    shohoj_seat_alerts_enabled: '1',
    shohoj_connect_profile_v1: json({ studentId: '20101234' }),
  });
  try {
    const slices = collectPersonalSlices('u_me');
    assert.deepEqual(slices.routine, { picks: { CSE110: 1, MAT110: null } });
    assert.deepEqual(slices.myReviews, [{ facultyInitials: 'ABC' }]); // not u_other's
    assert.deepEqual(slices.seatWatches, [{ sectionId: 1, courseCode: 'CSE110' }]);
    assert.equal(slices.seatAlertsEnabled, true);
    assert.deepEqual(slices.profileSnapshot, { studentId: '20101234' });
  } finally {
    uninstall();
  }
});

test('another student on the same browser never enters this account', () => {
  install({ shohoj_my_reviews_v1: json({ u_other: [{ facultyInitials: 'XYZ' }] }) });
  try {
    assert.equal('myReviews' in collectPersonalSlices('u_me'), false);
    // And signed out there is no slice to take at all.
    assert.equal('myReviews' in collectPersonalSlices(null), false);
  } finally {
    uninstall();
  }
});

test('a device with nothing carries no slices, rather than empty ones', () => {
  install();
  try {
    assert.deepEqual(collectPersonalSlices('u_me'), {});
  } finally {
    uninstall();
  }
});

test('an emptied routine IS carried — that is a real edit', () => {
  install({ shohoj_routine_v1: json({ picks: {} }) });
  try {
    assert.deepEqual(collectPersonalSlices('u_me').routine, { picks: {} });
  } finally {
    uninstall();
  }
});

test('applying a snapshot fans it out to the keys each module reads', () => {
  const map = install();
  try {
    applyPersonalSlices(
      {
        routine: { picks: { cse110: 3 } },
        myReviews: [{ facultyInitials: 'ABC' }],
        seatWatches: [{ sectionId: 7 }],
        seatAlertsEnabled: false,
        profileSnapshot: { studentId: '20101234' },
      },
      'u_me',
    );
    // Both routine keys: one student who uses the shell and legacy has one routine.
    assert.deepEqual(read(map, 'shohoj_routine_v1'), { picks: { CSE110: 3 } });
    assert.deepEqual(read(map, 'shohoj_routine_picks_v1'), { picks: { CSE110: 3 } });
    assert.deepEqual(read(map, 'shohoj_my_reviews_v1'), { u_me: [{ facultyInitials: 'ABC' }] });
    assert.deepEqual(read(map, 'shohoj_seat_watch_v1'), [{ sectionId: 7 }]);
    assert.equal(map.get('shohoj_seat_alerts_enabled'), '0');
    assert.deepEqual(read(map, 'shohoj_connect_profile_v1'), { studentId: '20101234' });
  } finally {
    uninstall();
  }
});

test('a snapshot without these fields leaves the device alone', () => {
  // Written by a client that predates them: not a student with no routine.
  const map = install({
    shohoj_routine_v1: json({ picks: { CSE110: 1 } }),
    shohoj_seat_watch_v1: json([{ sectionId: 1 }]),
  });
  try {
    applyPersonalSlices({ semesters: [], currentDept: 'CSE' }, 'u_me');
    assert.deepEqual(read(map, 'shohoj_routine_v1'), { picks: { CSE110: 1 } });
    assert.deepEqual(read(map, 'shohoj_seat_watch_v1'), [{ sectionId: 1 }]);
  } finally {
    uninstall();
  }
});

test('applying keeps another student\'s receipt on the same browser', () => {
  const map = install({ shohoj_my_reviews_v1: json({ u_other: [{ facultyInitials: 'XYZ' }] }) });
  try {
    applyPersonalSlices({ myReviews: [{ facultyInitials: 'ABC' }] }, 'u_me');
    assert.deepEqual(read(map, 'shohoj_my_reviews_v1'), {
      u_other: [{ facultyInitials: 'XYZ' }],
      u_me: [{ facultyInitials: 'ABC' }],
    });
  } finally {
    uninstall();
  }
});

test('a tampered doc cannot smuggle junk or an unbounded list back in', () => {
  const map = install();
  try {
    applyPersonalSlices(
      {
        routine: { picks: { CSE110: 'not-a-section', MAT110: 2 } },
        seatWatches: [...Array(80)].map((_, i) => ({ sectionId: i })),
        myReviews: ['not-an-object', { facultyInitials: 'ABC' }],
      },
      'u_me',
    );
    assert.deepEqual(read(map, 'shohoj_routine_v1'), { picks: { MAT110: 2 } });
    assert.equal(read(map, 'shohoj_seat_watch_v1').length, 50);
    assert.deepEqual(read(map, 'shohoj_my_reviews_v1').u_me, [{ facultyInitials: 'ABC' }]);
  } finally {
    uninstall();
  }
});

test('round-trips: what one device collects, another applies', () => {
  const deviceA = install({
    shohoj_routine_v1: json({ picks: { CSE110: 1 } }),
    shohoj_seat_watch_v1: json([{ sectionId: 4 }]),
    shohoj_seat_alerts_enabled: '0',
    shohoj_connect_profile_v1: json({ name: 'A Student' }),
    shohoj_my_reviews_v1: json({ u_me: [{ facultyInitials: 'ABC' }] }),
  });
  const slices = collectPersonalSlices('u_me');
  assert.ok(deviceA.size > 0);
  uninstall();

  const deviceB = install();
  try {
    applyPersonalSlices(slices, 'u_me');
    assert.deepEqual(read(deviceB, 'shohoj_routine_v1'), { picks: { CSE110: 1 } });
    assert.deepEqual(read(deviceB, 'shohoj_seat_watch_v1'), [{ sectionId: 4 }]);
    assert.equal(deviceB.get('shohoj_seat_alerts_enabled'), '0');
    assert.deepEqual(read(deviceB, 'shohoj_connect_profile_v1'), { name: 'A Student' });
    assert.deepEqual(read(deviceB, 'shohoj_my_reviews_v1').u_me, [{ facultyInitials: 'ABC' }]);
  } finally {
    uninstall();
  }
});
