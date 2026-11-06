// worker/test/academicStoreD1.test.js
//
// What the D1 store guarantees that the Firestore one cannot (#908): the
// database itself refuses an orphan, a record filed under the wrong account,
// a value of the wrong type, and a field it has nowhere to keep. The shared
// behaviour lives in academicStoreContract.test.js; this is the rest.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createD1AcademicStore } from '../academicStoreD1.js';
import { createFakeD1 } from './helpers/fakeD1.js';

const NOW = '2026-11-07T08:00:00.000Z';

function user(firebaseUid, id) {
  return {
    schemaVersion: 1,
    id,
    firebaseUid,
    email: null,
    displayName: null,
    university: 'bracu',
    studentId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function semester(userId) {
  return {
    schemaVersion: 1,
    id: 'sem_bracu_20263',
    userId,
    university: 'bracu',
    name: 'Fall 2026',
    year: 2026,
    season: 'Fall',
    sessionId: null,
    status: 'ACTIVE',
    startDate: null,
    endDate: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function task(userId, overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'tsk_1',
    userId,
    enrollmentId: null,
    title: 'Read chapter 3',
    description: null,
    type: 'ASSIGNMENT',
    status: 'TODO',
    priority: 'MEDIUM',
    priorityScore: null,
    dueAt: null,
    startAt: null,
    estimatedMinutes: null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

async function setup() {
  const db = createFakeD1();
  const store = createD1AcademicStore(db);
  await store.users.merge('uid_alice', user('uid_alice', 'usr_alice'));
  await store.users.merge('uid_bob', user('uid_bob', 'usr_bob'));
  return { db, store, alice: store.repoFor('uid_alice') };
}

test('a task cannot point at an enrolment that does not exist', async () => {
  const { alice } = await setup();
  await assert.rejects(
    alice.putTask(task('usr_alice', { enrollmentId: 'enr_missing' })),
    /FOREIGN KEY constraint failed/,
  );
});

test('a reminder or assessment cannot outlive its task', async () => {
  const { alice } = await setup();
  await assert.rejects(
    alice.putReminder({
      schemaVersion: 1,
      id: 'rem_1',
      userId: 'usr_alice',
      taskId: 'tsk_missing',
      offsetMinutes: 60,
      channel: 'EMAIL',
      scheduledFor: null,
      status: 'PENDING',
      sentAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    /FOREIGN KEY constraint failed/,
  );

  await alice.putTask(task('usr_alice'));
  await alice.putAssessment({
    schemaVersion: 1,
    id: 'tsk_1',
    taskId: 'tsk_1',
    userId: 'usr_alice',
    totalMarks: 10,
    earnedMarks: null,
    weightPercent: 5,
    syllabus: null,
    location: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  // The cascade order is the handlers' job; skipping it is refused, not tidied.
  await assert.rejects(alice.deleteTask('tsk_1'), /FOREIGN KEY constraint failed/);
});

test("a record cannot be filed under one account carrying another's Shohoj id", async () => {
  const { alice } = await setup();
  await assert.rejects(alice.putSemester(semester('usr_bob')), /FOREIGN KEY constraint failed/);
  await alice.putSemester(semester('usr_alice'));
});

test('a value of the wrong type is refused, not stored as something else', async () => {
  const { alice } = await setup();
  await assert.rejects(
    alice.putTask(task('usr_alice', { estimatedMinutes: 'ninety' })),
    /cannot store TEXT value in INTEGER column/,
  );
});

test('a field with no column is refused rather than dropped', async () => {
  const { alice, store } = await setup();
  await assert.rejects(
    alice.putTask(task('usr_alice', { colour: 'red' })),
    /tasks has no column for "colour"/,
  );
  await assert.rejects(
    store.users.merge('uid_alice', { calendarFeedToken: 'cft_x' }),
    /users has no column for "calendarFeedToken"/,
  );
});

test('an assessment whose id is not its task id is refused', async () => {
  const { alice } = await setup();
  await alice.putTask(task('usr_alice'));
  await assert.rejects(
    alice.putAssessment({
      schemaVersion: 1,
      id: 'asm_other',
      taskId: 'tsk_1',
      userId: 'usr_alice',
      totalMarks: 10,
      earnedMarks: null,
      weightPercent: 5,
      syllabus: null,
      location: null,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    /an assessment id must equal its taskId/,
  );
});

test('a user record cannot be merged under a different uid', async () => {
  const { store } = await setup();
  await assert.rejects(
    store.users.merge('uid_alice', user('uid_bob', 'usr_alice')),
    /cannot change its firebaseUid/,
  );
});

test('a partial record cannot create a user', async () => {
  const { store } = await setup();
  await assert.rejects(store.users.merge('uid_new', { displayName: 'New' }), /NOT NULL/);
  assert.equal(await store.users.get('uid_new'), null);
});

test('an absent field is stored as NULL, never as an unbindable undefined', async () => {
  const { alice } = await setup();
  const { description, ...withoutDescription } = task('usr_alice');
  assert.equal(description, null);

  await alice.putTask(withoutDescription);
  assert.equal((await alice.getTask('tsk_1')).description, null);
});

test('every statement the store runs binds its values', async () => {
  // The other half of the SQL guard: no statement text the store sends carries
  // a value it was handed. Feed it hostile text and look at the SQL itself.
  const { db, alice, store } = await setup();
  const payload = "zz'; DROP TABLE users;--";
  await alice.putTask(task('usr_alice', { title: payload }));
  await alice.getTask(payload);
  await store.feedOwner(`cft_${payload}`);
  await store.users.get(payload);

  assert.ok(db.statements.length > 0);
  for (const sql of db.statements) assert.ok(!sql.includes('zz'), sql);
  assert.equal(
    db.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'users'").get().n,
    1,
  );
});
