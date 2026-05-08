/**
 * tests/firestore.rules.test.js
 * Emulator-driven tests for firestore.rules. Run with:
 *   npm run test:rules
 * which boots the Firestore emulator (port 8080) and executes this file.
 *
 * What the suite verifies:
 *   1.  BRACU user can read/write own /users/{uid} doc
 *   2.  BRACU user cannot read/write another user's doc
 *   3.  Non-BRACU user (no admin claim) cannot touch /users/{uid}
 *   4.  Valid faculty review create succeeds
 *   5.  Invalid review payload (missing field) is rejected
 *   6.  facultyReviews update is denied
 *   7.  facultyReviews delete is denied
 *   8.  Non-admin cannot read /reviewReports
 *   9.  Admin can read /reviewReports
 *  10. Paper upload must start with approved:false
 *  11. Unknown collection root is denied
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(here, '..', 'firestore.rules');

const PROJECT = 'shohoj-test';
const BRACU_UID = 'bracu_user';
const BRACU_EMAIL = 'student@g.bracu.ac.bd';
const OTHER_BRACU_UID = 'bracu_other';
const OTHER_BRACU_EMAIL = 'other@g.bracu.ac.bd';
const OUTSIDE_UID = 'random_user';
const OUTSIDE_EMAIL = 'someone@example.com';
const ADMIN_UID = 'admin_user';
const ADMIN_EMAIL = 'admin@g.bracu.ac.bd';

let testEnv;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await testEnv.clearFirestore();
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message?.split('\n')[0] || err}`);
    failed++;
  }
}

function bracuCtx(uid = BRACU_UID, email = BRACU_EMAIL) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true });
}
function adminCtx() {
  return testEnv.authenticatedContext(ADMIN_UID, {
    email: ADMIN_EMAIL,
    email_verified: true,
    admin: true,
  });
}
function outsiderCtx() {
  return testEnv.authenticatedContext(OUTSIDE_UID, {
    email: OUTSIDE_EMAIL,
    email_verified: true,
  });
}

function reviewId(initials, course, hash) {
  return `${initials}_${course}_${hash}`;
}

function validReviewDoc(extra = {}) {
  return {
    facultyInitials: 'AAA',
    courseCode: 'CSE110',
    semester: 'Spring 2026',
    ratings: {
      teaching: 4,
      marking: 4,
      behavior: 5,
      difficulty: 3,
      workload: 3,
    },
    text: 'Solid lectures.',
    createdAt: serverTimestamp(),
    ...extra,
  };
}

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: readFileSync(rulesPath, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  console.log('firestore.rules');

  await test('BRACU user can write and read own /users/{uid}', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'users', BRACU_UID), { semesters: [] }));
    await assertSucceeds(getDoc(doc(db, 'users', BRACU_UID)));
  });

  await test('BRACU user cannot read another user\'s /users/{uid}', async () => {
    const owner = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(owner, 'users', BRACU_UID), { semesters: [] }));
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(getDoc(doc(other, 'users', BRACU_UID)));
  });

  await test('Non-BRACU, non-admin user cannot touch /users/{uid}', async () => {
    const db = outsiderCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', OUTSIDE_UID), { semesters: [] }));
  });

  await test('Valid faculty review create succeeds', async () => {
    const db = bracuCtx().firestore();
    const hash = 'a'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertSucceeds(setDoc(doc(db, 'facultyReviews', id), validReviewDoc()));
  });

  await test('Review missing required field is rejected', async () => {
    const db = bracuCtx().firestore();
    const hash = 'b'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    const bad = validReviewDoc();
    delete bad.ratings;
    await assertFails(setDoc(doc(db, 'facultyReviews', id), bad));
  });

  await test('facultyReviews update is denied', async () => {
    const db = bracuCtx().firestore();
    const hash = 'c'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertSucceeds(setDoc(doc(db, 'facultyReviews', id), validReviewDoc()));
    await assertFails(updateDoc(doc(db, 'facultyReviews', id), { text: 'edited' }));
  });

  await test('facultyReviews delete is denied (even by author)', async () => {
    const db = bracuCtx().firestore();
    const hash = 'd'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertSucceeds(setDoc(doc(db, 'facultyReviews', id), validReviewDoc()));
    await assertFails(deleteDoc(doc(db, 'facultyReviews', id)));
  });

  await test('Non-admin cannot read /reviewReports', async () => {
    const db = bracuCtx().firestore();
    await assertFails(getDoc(doc(db, 'reviewReports', `${BRACU_UID}_AAA_CSE110_${'a'.repeat(64)}`)));
  });

  await test('Admin can read /reviewReports', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'reviewReports', `${ADMIN_UID}_anything`)));
  });

  await test('Paper upload with approved:true is rejected', async () => {
    const db = bracuCtx().firestore();
    const id = 'paper_attempt_1';
    await assertFails(setDoc(doc(db, 'papers', id), {
      courseCode: 'CSE110',
      type: 'final',
      title: 'CSE110 Final 2024',
      storagePath: 'papers/CSE110/final-2024.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploaderUid: BRACU_UID,
      approved: true,
      createdAt: serverTimestamp(),
    }));
  });

  await test('Paper upload with approved:false succeeds', async () => {
    const db = bracuCtx().firestore();
    const id = 'paper_attempt_2';
    await assertSucceeds(setDoc(doc(db, 'papers', id), {
      courseCode: 'CSE110',
      type: 'final',
      title: 'CSE110 Final 2024',
      storagePath: 'papers/CSE110/final-2024.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploaderUid: BRACU_UID,
      approved: false,
      createdAt: serverTimestamp(),
    }));
  });

  await test('Unknown collection at root is denied', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'someUnknownCollection', 'x'), { hello: 'world' }));
  });

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
