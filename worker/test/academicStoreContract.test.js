// worker/test/academicStoreContract.test.js
//
// One suite, two backends (#908, ADR 0003). Every behaviour the handlers rely
// on is asserted against the Firestore store (over in-memory Firestore
// primitives) and the D1 store (over real SQLite running the real migrations).
// A store that passes here can stand in for the other; one that does not is
// what the backfill would have to paper over.
//
// Records are made by the domain builders rather than written by hand, so a
// field added to a builder without a column to hold it fails here.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAcademicStore, deleteSemesterCascade } from '../academicRepo.js';
import { createD1AcademicStore } from '../academicStoreD1.js';
import { buildEnrollmentRecord, buildSemesterRecord } from '../academic.js';
import { buildAssessmentRecord } from '../assessments.js';
import { buildReminderRecord } from '../reminders.js';
import { buildTaskRecord } from '../tasks.js';
import { createFakeD1 } from './helpers/fakeD1.js';

const NOW = '2026-11-07T08:00:00.000Z';
const LATER = '2026-11-08T09:30:00.000Z';
const DOCS_PREFIX = 'projects/shohoj/databases/(default)/documents/';

// ── Backends ────────────────────────────────────────────────────────────────

/**
 * Firestore's REST primitives over a Map keyed by document path: full-replace
 * `patchDoc`, masked `mergeDoc`, precondition-checked `commitWrites`, and the
 * collection-group `runQuery` the reminder cron issues.
 */
function memoryFirestore() {
  const docs = new Map();
  const versions = new Map();
  const bump = (path) => versions.set(path, (versions.get(path) ?? 0) + 1);
  const copy = (fields) => structuredClone(fields);

  return {
    getDoc: async (path) => (docs.has(path) ? copy(docs.get(path)) : null),
    patchDoc: async (path, fields) => {
      docs.set(path, copy(fields));
      bump(path);
    },
    mergeDoc: async (path, fields) => {
      docs.set(path, { ...(docs.get(path) ?? {}), ...copy(fields) });
      bump(path);
    },
    deleteDoc: async (path) => {
      docs.delete(path);
    },
    listDocs: async (collection) =>
      [...docs.keys()]
        .filter((path) => path.startsWith(`${collection}/`))
        .filter((path) => !path.slice(collection.length + 1).includes('/'))
        .sort()
        .map((path) => copy(docs.get(path))),
    getDocSnapshot: async (path) =>
      docs.has(path)
        ? { fields: copy(docs.get(path)), updateTime: String(versions.get(path)) }
        : null,
    commitWrites: async (writes) => {
      for (const write of writes) {
        if (
          (write.exists === false && docs.has(write.path)) ||
          (write.updateTime && write.updateTime !== String(versions.get(write.path)))
        ) {
          throw Object.assign(new Error('Firestore precondition failed'), { conflict: true });
        }
      }
      for (const write of writes) {
        if (write.delete) docs.delete(write.path);
        else docs.set(write.path, { ...(docs.get(write.path) ?? {}), ...copy(write.fields) });
        bump(write.path);
      }
    },
    runQuery: async (query) => {
      assert.deepEqual(query.from, [{ collectionId: 'reminders', allDescendants: true }]);
      const wanted = query.where.fieldFilter.value.stringValue;
      return [...docs.keys()]
        .filter((path) => /\/reminders\/[^/]+$/.test(path) && docs.get(path).status === wanted)
        .sort()
        .slice(0, query.limit)
        .map((path) => ({ name: `${DOCS_PREFIX}${path}`, fields: copy(docs.get(path)) }));
    },
  };
}

const BACKENDS = [
  { name: 'firestore', make: () => createAcademicStore(memoryFirestore()) },
  { name: 'd1', make: () => createD1AcademicStore(createFakeD1()) },
];

/** Register one test per backend. */
function contract(title, body) {
  for (const backend of BACKENDS) {
    test(`${backend.name}: ${title}`, () => body(backend.make()));
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function userRecord(firebaseUid, overrides = {}) {
  return {
    schemaVersion: 1,
    id: `usr_${firebaseUid.replace(/[^a-z0-9]/gi, '').padEnd(8, '0')}`,
    firebaseUid,
    email: `${firebaseUid}@g.bracu.ac.bd`,
    displayName: 'A Student',
    university: 'bracu',
    studentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A student with one semester, enrolment, task, assessment and reminder. */
async function seedStudent(store, firebaseUid, { taskOverrides = {} } = {}) {
  const user = userRecord(firebaseUid);
  await store.users.merge(firebaseUid, user);
  const repo = store.repoFor(firebaseUid);

  const semester = buildSemesterRecord({
    university: 'bracu',
    userId: user.id,
    input: {
      year: 2026,
      season: 'Fall',
      sessionId: null,
      status: 'ACTIVE',
      startDate: '2026-09-01',
      endDate: null,
    },
    nowIso: NOW,
  });
  await repo.putSemester(semester);

  const enrollment = buildEnrollmentRecord({
    id: 'enr_cse110',
    userId: user.id,
    input: {
      semesterId: semester.id,
      courseCode: 'CSE110',
      section: '13',
      facultyInitials: null,
      status: 'ENROLLED',
      source: 'MANUAL',
    },
    nowIso: NOW,
  });
  await repo.putEnrollment(enrollment);

  const task = buildTaskRecord({
    id: 'tsk_quiz1',
    userId: user.id,
    input: {
      enrollmentId: enrollment.id,
      title: 'Quiz 1',
      description: null,
      type: 'QUIZ',
      status: 'TODO',
      priority: 'HIGH',
      dueAt: '2026-11-10T04:00:00.000Z',
      startAt: null,
      estimatedMinutes: 90,
      source: 'MANUAL',
      sourceReference: null,
      ...taskOverrides,
    },
    nowIso: NOW,
  });
  await repo.putTask(task);

  const assessment = buildAssessmentRecord({
    taskId: task.id,
    userId: user.id,
    input: {
      totalMarks: 20,
      earnedMarks: 17.5,
      weightPercent: 7.5,
      syllabus: 'Loops',
      location: null,
      notes: null,
    },
    nowIso: NOW,
  });
  await repo.putAssessment(assessment);

  const reminder = buildReminderRecord({
    id: 'rem_1day',
    taskId: task.id,
    userId: user.id,
    input: { offsetMinutes: 1440, channel: 'EMAIL' },
    task,
    nowIso: NOW,
  });
  await repo.putReminder(reminder);

  return { user, repo, semester, enrollment, task, assessment, reminder };
}

// ── Users ───────────────────────────────────────────────────────────────────

contract('an unknown user reads as null', async (store) => {
  assert.equal(await store.users.get('uid_nobody'), null);
});

contract('a user record round-trips exactly', async (store) => {
  const user = userRecord('uid_alice');
  await store.users.merge('uid_alice', user);
  assert.deepEqual(await store.users.get('uid_alice'), user);
});

contract('a merge leaves fields it does not name alone', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice', { studentId: '22101234' }));
  await store.users.merge('uid_alice', { displayName: 'Renamed', updatedAt: LATER });

  assert.deepEqual(
    await store.users.get('uid_alice'),
    userRecord('uid_alice', { studentId: '22101234', displayName: 'Renamed', updatedAt: LATER }),
  );
});

// ── Records ─────────────────────────────────────────────────────────────────

contract('every record type round-trips field for field', async (store) => {
  const { repo, semester, enrollment, task, assessment, reminder } = await seedStudent(
    store,
    'uid_alice',
  );

  assert.deepEqual(await repo.getSemester(semester.id), semester);
  assert.deepEqual(await repo.getEnrollment(enrollment.id), enrollment);
  assert.deepEqual(await repo.getTask(task.id), task);
  assert.deepEqual(await repo.getAssessment(task.id), assessment);
  assert.deepEqual(await repo.getReminder(reminder.id), reminder);

  assert.deepEqual(await repo.listSemesters(), [semester]);
  assert.deepEqual(await repo.listEnrollments(), [enrollment]);
  assert.deepEqual(await repo.listTasks(), [task]);
  assert.deepEqual(await repo.listAssessments(), [assessment]);
  assert.deepEqual(await repo.listReminders(), [reminder]);
});

contract('a missing record reads as null, and deleting one is not an error', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  const repo = store.repoFor('uid_alice');

  assert.equal(await repo.getSemester('sem_none'), null);
  assert.equal(await repo.getEnrollment('enr_none'), null);
  assert.equal(await repo.getTask('tsk_none'), null);
  assert.equal(await repo.getAssessment('tsk_none'), null);
  assert.equal(await repo.getReminder('rem_none'), null);
  await repo.deleteTask('tsk_none');
  assert.deepEqual(await repo.listTasks(), []);
});

contract('a put replaces the stored record', async (store) => {
  const { repo, task } = await seedStudent(store, 'uid_alice');
  const done = { ...task, status: 'COMPLETED', completedAt: LATER, updatedAt: LATER, dueAt: null };

  await repo.putTask(done);
  assert.deepEqual(await repo.getTask(task.id), done);
  assert.equal((await repo.listTasks()).length, 1);
});

contract('lists come back in id order', async (store) => {
  const { repo, task } = await seedStudent(store, 'uid_alice');
  for (const id of ['tsk_c', 'tsk_a', 'tsk_b']) await repo.putTask({ ...task, id });

  assert.deepEqual(
    (await repo.listTasks()).map((record) => record.id),
    ['tsk_a', 'tsk_b', 'tsk_c', 'tsk_quiz1'],
  );
});

contract('a task need not belong to a course', async (store) => {
  const { repo, task } = await seedStudent(store, 'uid_alice');
  const loose = { ...task, id: 'tsk_loose', enrollmentId: null };
  await repo.putTask(loose);
  assert.deepEqual(await repo.getTask('tsk_loose'), loose);
});

contract('the cascades remove a semester and everything under it', async (store) => {
  const { repo, semester } = await seedStudent(store, 'uid_alice');

  assert.deepEqual(await deleteSemesterCascade(repo, semester.id), {
    removedEnrollments: 1,
    removedTasks: 1,
  });
  assert.deepEqual(await repo.listSemesters(), []);
  assert.deepEqual(await repo.listEnrollments(), []);
  assert.deepEqual(await repo.listTasks(), []);
  assert.deepEqual(await repo.listAssessments(), []);
  assert.deepEqual(await repo.listReminders(), []);
});

// ── Ownership ───────────────────────────────────────────────────────────────

contract("one student's repository cannot see or touch another's records", async (store) => {
  const alice = await seedStudent(store, 'uid_alice');
  await store.users.merge('uid_bob', userRecord('uid_bob'));
  const bob = store.repoFor('uid_bob');

  assert.deepEqual(await bob.listTasks(), []);
  assert.equal(await bob.getTask(alice.task.id), null);
  assert.equal(await bob.getSemester(alice.semester.id), null);

  await bob.deleteReminder(alice.reminder.id);
  await bob.deleteAssessment(alice.task.id);
  assert.deepEqual(await alice.repo.getReminder(alice.reminder.id), alice.reminder);
  assert.deepEqual(await alice.repo.getAssessment(alice.task.id), alice.assessment);
});

// ── Calendar feeds ──────────────────────────────────────────────────────────

/** A mint that hands out the given tokens in order. */
function mintFrom(...hexes) {
  const queue = [...hexes];
  return () => ({ token: `cft_${queue.shift()}`, createdAt: NOW });
}

const HEX_A = 'a'.repeat(32);
const HEX_B = 'b'.repeat(32);
const HEX_C = 'c'.repeat(32);

contract('a student starts with no feed', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  assert.equal(await store.feedsFor('uid_alice').current(), null);
});

contract('a minted feed is current and resolves to its owner', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  const feeds = store.feedsFor('uid_alice');

  assert.deepEqual(await feeds.rotate(mintFrom(HEX_A)), { token: `cft_${HEX_A}`, createdAt: NOW });
  assert.deepEqual(await feeds.current(), { token: `cft_${HEX_A}`, createdAt: NOW });
  assert.equal(await store.feedOwner(`cft_${HEX_A}`), 'uid_alice');
});

contract('rotating kills the old URL', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  const feeds = store.feedsFor('uid_alice');
  await feeds.rotate(mintFrom(HEX_A));
  await feeds.rotate(mintFrom(HEX_B));

  assert.equal(await store.feedOwner(`cft_${HEX_A}`), null);
  assert.equal(await store.feedOwner(`cft_${HEX_B}`), 'uid_alice');
  assert.equal((await feeds.current()).token, `cft_${HEX_B}`);
});

contract('revoking kills the URL, and revoking twice is fine', async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  const feeds = store.feedsFor('uid_alice');
  await feeds.rotate(mintFrom(HEX_A));

  await feeds.revoke();
  await feeds.revoke();
  assert.equal(await feeds.current(), null);
  assert.equal(await store.feedOwner(`cft_${HEX_A}`), null);
});

contract('a feed never brings an account into existence', async (store) => {
  await assert.rejects(
    store.feedsFor('uid_ghost').rotate(mintFrom(HEX_A)),
    /Calendar feed owner is unavailable/,
  );
  assert.equal(await store.feedOwner(`cft_${HEX_A}`), null);
});

contract("a token collision retries instead of taking another student's feed", async (store) => {
  await store.users.merge('uid_alice', userRecord('uid_alice'));
  await store.users.merge('uid_bob', userRecord('uid_bob'));
  await store.feedsFor('uid_bob').rotate(mintFrom(HEX_A));

  const minted = await store.feedsFor('uid_alice').rotate(mintFrom(HEX_A, HEX_C));
  assert.equal(minted.token, `cft_${HEX_C}`);
  assert.equal(await store.feedOwner(`cft_${HEX_A}`), 'uid_bob');
  assert.equal(await store.feedOwner(`cft_${HEX_C}`), 'uid_alice');
});

contract('a malformed or unknown token has no owner', async (store) => {
  assert.equal(await store.feedOwner('not-a-token'), null);
  assert.equal(await store.feedOwner(`cft_${HEX_A}`), null);
});

// ── Reminders across every student ──────────────────────────────────────────

contract(
  'the cron sees every PENDING reminder, with its owner, and nothing else',
  async (store) => {
    const alice = await seedStudent(store, 'uid_alice');
    const bob = await seedStudent(store, 'uid_bob');
    await bob.repo.putReminder({ ...bob.reminder, id: 'rem_sent', status: 'SENT', sentAt: NOW });

    assert.deepEqual(await store.pendingReminders(), [
      { ownerUid: 'uid_alice', reminder: alice.reminder },
      { ownerUid: 'uid_bob', reminder: bob.reminder },
    ]);
  },
);

// ── SQL injection: hostile text is data ─────────────────────────────────────
//
// Run against both backends because the guarantee is the store's, not D1's.
// On Firestore these are just strange strings; on D1 they are the payloads the
// security review asked to see refused as SQL.

const PAYLOADS = [
  "' OR 1=1--",
  "x'; DROP TABLE tasks;--",
  "' UNION SELECT * FROM users--",
  'Robert"); DELETE FROM reminders; --',
];

contract('hostile text in a record is stored and returned literally', async (store) => {
  const { repo, task } = await seedStudent(store, 'uid_alice');
  for (const [index, payload] of PAYLOADS.entries()) {
    const record = { ...task, id: `tsk_p${index}`, title: payload, description: payload };
    await repo.putTask(record);
    assert.deepEqual(await repo.getTask(record.id), record);
  }
  // Every table is still there and still holds what it held.
  assert.equal((await repo.listTasks()).length, PAYLOADS.length + 1);
  assert.equal((await repo.listReminders()).length, 1);
  assert.ok((await store.users.get('uid_alice')) !== null);
});

contract('hostile ids and owners match nothing', async (store) => {
  const alice = await seedStudent(store, 'uid_alice');
  for (const payload of PAYLOADS) {
    assert.equal(await alice.repo.getTask(payload), null);
    assert.deepEqual(await store.repoFor(payload).listTasks(), []);
    assert.equal(await store.users.get(payload), null);
    assert.equal(await store.feedOwner(payload), null);
    assert.equal(await store.feedOwner(`cft_${payload}`), null);
    await store.repoFor(payload).deleteTask(alice.task.id);
  }
  assert.deepEqual(await alice.repo.getTask(alice.task.id), alice.task);
});
