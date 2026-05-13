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
 *   7.  facultyReviews delete is denied for students
 *   8.  Admin can delete /facultyReviews for moderation
 *   9.  Non-admin cannot read /reviewReports
 *  10. Admin can read /reviewReports
 *  11. Paper upload must start with approved:false
 *  12. Pending papers are visible only to uploader/admin
 *  13. Paper storage paths must be owner-scoped and SVG uploads are rejected
 *  14. Feedback upvotes are readable only by owner/admin
 *  15. Unknown collection root is denied
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

function paperDoc(extra = {}) {
  const uploaderUid = extra.uploaderUid || BRACU_UID;
  const courseCode = extra.courseCode || 'CSE110';
  return {
    courseCode,
    type: 'final',
    title: 'CSE110 Final 2024',
    storagePath: `papers/${courseCode}/${uploaderUid}/final-2024.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploaderUid,
    approved: false,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

function upvoteDoc(extra = {}) {
  return {
    feedbackId: 'fb_private',
    uid: BRACU_UID,
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

  await test('facultyReviews delete by admin succeeds', async () => {
    const writerDb = bracuCtx().firestore();
    const hash = 'e'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertSucceeds(setDoc(doc(writerDb, 'facultyReviews', id), validReviewDoc()));
    const adminDb = adminCtx().firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, 'facultyReviews', id)));
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
    await assertFails(setDoc(doc(db, 'papers', id), paperDoc({ approved: true })));
  });

  await test('Paper upload with approved:false succeeds', async () => {
    const db = bracuCtx().firestore();
    const id = 'paper_attempt_2';
    await assertSucceeds(setDoc(doc(db, 'papers', id), paperDoc()));
  });

  await test('BRACU user can read approved paper from another uploader', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'papers', 'paper_approved'), paperDoc({
        uploaderUid: OTHER_BRACU_UID,
        storagePath: `papers/CSE110/${OTHER_BRACU_UID}/final-2024.pdf`,
        approved: true,
      }));
    });
    const db = bracuCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'papers', 'paper_approved')));
  });

  await test('BRACU user cannot read unapproved paper from another uploader', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'papers', 'paper_pending_other'), paperDoc({
        uploaderUid: OTHER_BRACU_UID,
        storagePath: `papers/CSE110/${OTHER_BRACU_UID}/final-2024.pdf`,
      }));
    });
    const db = bracuCtx().firestore();
    await assertFails(getDoc(doc(db, 'papers', 'paper_pending_other')));
  });

  await test('Uploader can read own unapproved paper', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'papers', 'paper_pending_own'), paperDoc()));
    await assertSucceeds(getDoc(doc(db, 'papers', 'paper_pending_own')));
  });

  await test('Admin can read unapproved paper', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'papers', 'paper_pending_admin'), paperDoc());
    });
    const db = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'papers', 'paper_pending_admin')));
  });

  await test('Paper upload with SVG MIME is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'papers', 'paper_svg'), paperDoc({
      storagePath: `papers/CSE110/${BRACU_UID}/vector.svg`,
      mimeType: 'image/svg+xml',
    })));
  });

  await test('Paper upload with another user storage path is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'papers', 'paper_wrong_owner_path'), paperDoc({
      storagePath: `papers/CSE110/${OTHER_BRACU_UID}/final-2024.pdf`,
    })));
  });

  await test('Unknown collection at root is denied', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'someUnknownCollection', 'x'), { hello: 'world' }));
  });

  // ── Admin audit logs ────────────────────────────────────────────────
  function adminLogDoc(extra = {}) {
    return {
      action: 'approve_paper',
      adminUid: ADMIN_UID,
      targetType: 'paper',
      targetId: 'paper_xyz',
      createdAt: serverTimestamp(),
      ...extra,
    };
  }

  await test('Admin can create valid adminLog entry', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'adminLogs', 'log1'), adminLogDoc()));
  });

  await test('Non-admin cannot create adminLog entry', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'adminLogs', 'log2'), adminLogDoc({ adminUid: BRACU_UID })));
  });

  await test('Admin can read adminLogs', async () => {
    const writer = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(writer, 'adminLogs', 'log3'), adminLogDoc()));
    const reader = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(reader, 'adminLogs', 'log3')));
  });

  await test('Non-admin cannot read adminLogs', async () => {
    const writer = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(writer, 'adminLogs', 'log4'), adminLogDoc()));
    const reader = bracuCtx().firestore();
    await assertFails(getDoc(doc(reader, 'adminLogs', 'log4')));
  });

  await test('adminLog with invalid action is rejected', async () => {
    const db = adminCtx().firestore();
    await assertFails(setDoc(doc(db, 'adminLogs', 'log5'), adminLogDoc({ action: 'arbitrary_thing' })));
  });

  await test('adminLog accepts delete_review action', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'adminLogs', 'log_delete_review'), adminLogDoc({
      action: 'delete_review',
      targetType: 'review',
      targetId: reviewId('AAA', 'CSE110', 'f'.repeat(64)),
    })));
  });

  await test('adminLog update is denied', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'adminLogs', 'log6'), adminLogDoc()));
    await assertFails(updateDoc(doc(db, 'adminLogs', 'log6'), { action: 'delete_paper' }));
  });

  await test('adminLog delete is denied (even by admin)', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'adminLogs', 'log7'), adminLogDoc()));
    await assertFails(deleteDoc(doc(db, 'adminLogs', 'log7')));
  });

  await test('adminLog with mismatched adminUid is rejected', async () => {
    const db = adminCtx().firestore();
    await assertFails(setDoc(doc(db, 'adminLogs', 'log8'), adminLogDoc({ adminUid: 'someone_else' })));
  });

  // ── App feedback ────────────────────────────────────────────────────
  function feedbackDoc(extra = {}) {
    return {
      type: 'bug',
      text: 'something is broken',
      anonymous: false,
      uid: BRACU_UID,
      createdAt: serverTimestamp(),
      ...extra,
    };
  }

  await test('Valid feedback create by BRACU user succeeds', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'appFeedback', 'fb1'), feedbackDoc()));
  });

  await test('Feedback with text > 500 chars is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'appFeedback', 'fb2'),
      feedbackDoc({ text: 'x'.repeat(501) })));
  });

  await test('Feedback with invalid type is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'appFeedback', 'fb3'),
      feedbackDoc({ type: 'spam' })));
  });

  await test('Feedback delete by non-admin is denied', async () => {
    const writer = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(writer, 'appFeedback', 'fb4'), feedbackDoc()));
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(deleteDoc(doc(other, 'appFeedback', 'fb4')));
  });

  await test('Feedback delete by admin succeeds', async () => {
    const writer = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(writer, 'appFeedback', 'fb5'), feedbackDoc()));
    const adminDb = adminCtx().firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, 'appFeedback', 'fb5')));
  });

  await test('Feedback with context map of 8 keys is accepted', async () => {
    const db = bracuCtx().firestore();
    const context = {};
    for (let i = 0; i < 8; i++) context[`k${i}`] = `v${i}`;
    await assertSucceeds(setDoc(doc(db, 'appFeedback', 'fb6'),
      feedbackDoc({ context })));
  });

  await test('Feedback with context map of 9 keys is rejected', async () => {
    const db = bracuCtx().firestore();
    const context = {};
    for (let i = 0; i < 9; i++) context[`k${i}`] = `v${i}`;
    await assertFails(setDoc(doc(db, 'appFeedback', 'fb7'),
      feedbackDoc({ context })));
  });

  await test('User can read own feedback upvote', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'appFeedbackUpvotes', `fb_private_${BRACU_UID}`), upvoteDoc()));
    await assertSucceeds(getDoc(doc(db, 'appFeedbackUpvotes', `fb_private_${BRACU_UID}`)));
  });

  await test('Non-admin cannot read another user feedback upvote', async () => {
    const writer = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    const voteId = `fb_private_${OTHER_BRACU_UID}`;
    await assertSucceeds(setDoc(doc(writer, 'appFeedbackUpvotes', voteId), upvoteDoc({
      uid: OTHER_BRACU_UID,
    })));
    const reader = bracuCtx().firestore();
    await assertFails(getDoc(doc(reader, 'appFeedbackUpvotes', voteId)));
  });

  await test('Admin can read another user feedback upvote', async () => {
    const writer = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    const voteId = `fb_private_${OTHER_BRACU_UID}`;
    await assertSucceeds(setDoc(doc(writer, 'appFeedbackUpvotes', voteId), upvoteDoc({
      uid: OTHER_BRACU_UID,
    })));
    const reader = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(reader, 'appFeedbackUpvotes', voteId)));
  });

  // ── Paper reports ───────────────────────────────────────────────────
  await test('Paper report with mismatched reportId format is rejected', async () => {
    const db = bracuCtx().firestore();
    // Rules require reportId == "{uid}_{paperId}"; using a random ID should fail.
    await assertFails(setDoc(doc(db, 'paperReports', 'random_report_id'), {
      paperId: 'some_paper',
      reason: 'bad content',
      reporterUid: BRACU_UID,
      createdAt: serverTimestamp(),
    }));
  });

  // ── Faculty profiles ────────────────────────────────────────────────
  await test('facultyProfiles read by BRACU user is allowed', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'facultyProfiles', 'AAA')));
  });

  await test('facultyProfiles write by admin is denied', async () => {
    const db = adminCtx().firestore();
    await assertFails(setDoc(doc(db, 'facultyProfiles', 'AAA'), {
      name: 'Test',
      department: 'CSE',
    }));
  });

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
