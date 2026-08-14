/**
 * tests/firestore.rules.test.js
 * Emulator-driven tests for firestore.rules. Run with:
 *   npm run test:rules
 * which boots the Firestore emulator (port 8080) and executes this file.
 *
 * What the suite verifies:
 *   1.  BRACU user can read/write own /users/{uid} doc
 *   2.  BRACU user cannot read/write another user's doc
 *   3.  Non-BRACU / unverified / non-Google users cannot touch /users/{uid}
 *   4.  Valid faculty review create succeeds
 *   5.  Invalid review payload (missing field) is rejected
 *   6.  facultyReviews update is denied
 *   7.  facultyReviews delete is denied for students
 *   8.  Admin can delete /facultyReviews for moderation
 *   9.  Non-admin cannot read /reviewReports
 *  10. Admin can read /reviewReports
 *  11. Paper metadata writes are Worker-mediated only
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
  writeBatch,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(here, '..', 'firestore.rules');

const PROJECT = 'shohoj-test';
const BRACU_UID = 'bracu_user';
const BRACU_EMAIL = 'student@g.bracu.ac.bd';
const OTHER_BRACU_UID = 'bracu_other';
const OTHER_BRACU_EMAIL = 'other@g.bracu.ac.bd';
const NSU_UID = 'nsu_user';
const NSU_EMAIL = 'student@northsouth.edu';
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
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
}
function nsuCtx(uid = NSU_UID, email = NSU_EMAIL) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
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
    firebase: { sign_in_provider: 'google.com' },
  });
}
function unverifiedBracuCtx() {
  return testEnv.authenticatedContext('unverified_bracu', {
    email: 'unverified@g.bracu.ac.bd',
    email_verified: false,
    firebase: { sign_in_provider: 'google.com' },
  });
}
function passwordBracuCtx() {
  return testEnv.authenticatedContext('password_bracu', {
    email: 'password@g.bracu.ac.bd',
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
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
    await assertSucceeds(setDoc(doc(db, 'users', BRACU_UID), {
      data: JSON.stringify({ semesters: [] }),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(doc(db, 'users', BRACU_UID)));
  });

  await test('BRACU user cannot read another user\'s /users/{uid}', async () => {
    const owner = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(owner, 'users', BRACU_UID), {
      data: JSON.stringify({ semesters: [] }),
      updatedAt: serverTimestamp(),
    }));
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(getDoc(doc(other, 'users', BRACU_UID)));
  });

  await test('Non-BRACU, non-admin user cannot touch /users/{uid}', async () => {
    const db = outsiderCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', OUTSIDE_UID), {
      data: JSON.stringify({ semesters: [] }),
      updatedAt: serverTimestamp(),
    }));
  });

  await test('Unverified BRACU email cannot touch /users/{uid}', async () => {
    const db = unverifiedBracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', 'unverified_bracu'), {
      data: JSON.stringify({ semesters: [] }),
      updatedAt: serverTimestamp(),
    }));
  });

  await test('Non-Google BRACU email cannot touch /users/{uid}', async () => {
    const db = passwordBracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', 'password_bracu'), {
      data: JSON.stringify({ semesters: [] }),
      updatedAt: serverTimestamp(),
    }));
  });

  await test('users/{uid} write with extra field is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', BRACU_UID), {
      data: JSON.stringify({}),
      updatedAt: serverTimestamp(),
      extraField: 'nope',
    }));
  });

  await test('users/{uid} write with non-string data is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', BRACU_UID), {
      data: { not: 'a string' },
      updatedAt: serverTimestamp(),
    }));
  });

  await test('users/{uid} write over 500 KB is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'users', BRACU_UID), {
      data: 'x'.repeat(500001),
      updatedAt: serverTimestamp(),
    }));
  });

  await test('Client cannot create facultyReviews (worker-mediated only)', async () => {
    // Server-side path now goes through worker/index.js POST /reviews using a
    // service account. Direct client writes — even with a well-formed payload —
    // must fail so the canonical sha256 doc-id guarantee can't be subverted.
    const db = bracuCtx().firestore();
    const hash = 'a'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertFails(setDoc(doc(db, 'facultyReviews', id), validReviewDoc()));
  });

  await test('Client cannot update facultyReviews', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const hash = 'c'.repeat(64);
      const id = reviewId('AAA', 'CSE110', hash);
      await setDoc(doc(context.firestore(), 'facultyReviews', id), validReviewDoc());
    });
    const db = bracuCtx().firestore();
    const hash = 'c'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertFails(updateDoc(doc(db, 'facultyReviews', id), { text: 'edited' }));
  });

  await test('Client cannot delete facultyReviews (even author)', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const hash = 'd'.repeat(64);
      const id = reviewId('AAA', 'CSE110', hash);
      await setDoc(doc(context.firestore(), 'facultyReviews', id), validReviewDoc());
    });
    const db = bracuCtx().firestore();
    const hash = 'd'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
    await assertFails(deleteDoc(doc(db, 'facultyReviews', id)));
  });

  await test('facultyReviews delete by admin succeeds', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const hash = 'e'.repeat(64);
      const id = reviewId('AAA', 'CSE110', hash);
      await setDoc(doc(context.firestore(), 'facultyReviews', id), validReviewDoc());
    });
    const adminDb = adminCtx().firestore();
    const hash = 'e'.repeat(64);
    const id = reviewId('AAA', 'CSE110', hash);
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

  await test('Client cannot create paper metadata with approved:true', async () => {
    const db = bracuCtx().firestore();
    const id = 'paper_attempt_1';
    await assertFails(setDoc(doc(db, 'papers', id), paperDoc({ approved: true })));
  });

  await test('Client cannot create paper metadata directly (worker-mediated only)', async () => {
    const db = bracuCtx().firestore();
    const id = 'paper_attempt_2';
    await assertFails(setDoc(doc(db, 'papers', id), paperDoc()));
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
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'papers', 'paper_pending_own'), paperDoc());
    });
    const db = bracuCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'papers', 'paper_pending_own')));
  });

  await test('Admin can read unapproved paper', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'papers', 'paper_pending_admin'), paperDoc());
    });
    const db = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'papers', 'paper_pending_admin')));
  });

  await test('Client paper metadata create with SVG MIME is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'papers', 'paper_svg'), paperDoc({
      storagePath: `papers/CSE110/${BRACU_UID}/vector.svg`,
      mimeType: 'image/svg+xml',
    })));
  });

  await test('Client paper metadata create with another user storage path is rejected', async () => {
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
      university: 'bracu',
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

  await test('Anonymous feedback with uid:null succeeds', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'appFeedback', 'fb8'),
      feedbackDoc({ anonymous: true, uid: null })));
  });

  await test('Anonymous feedback carrying a real uid is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'appFeedback', 'fb9'),
      feedbackDoc({ anonymous: true, uid: BRACU_UID })));
  });

  await test('Named feedback without a uid is rejected', async () => {
    const db = bracuCtx().firestore();
    const { uid, ...noUid } = feedbackDoc({ anonymous: false });
    await assertFails(setDoc(doc(db, 'appFeedback', 'fb10'), noUid));
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

  // ── Seat-drop email alerts ──────────────────────────────────────────
  const validWatch = (email = BRACU_EMAIL) => ({
    email,
    enabled: true,
    sections: [{ id: 1, code: 'CSE220', name: '01' }],
    updatedAt: serverTimestamp(),
  });

  await test('BRACU user can write and read own seatAlertWatches/{uid}', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'seatAlertWatches', BRACU_UID), validWatch()));
    await assertSucceeds(getDoc(doc(db, 'seatAlertWatches', BRACU_UID)));
  });

  await test('seatAlertWatches with a foreign email is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'seatAlertWatches', BRACU_UID), validWatch(OTHER_BRACU_EMAIL)));
  });

  await test('seatAlertWatches under another user\'s uid is denied', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'seatAlertWatches', OTHER_BRACU_UID), validWatch()));
  });

  await test('seatAlertWatches with an extra field is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'seatAlertWatches', BRACU_UID), {
      ...validWatch(), evil: true,
    }));
  });

  await test('seatAlertWatches over the 50-section cap is rejected', async () => {
    const db = bracuCtx().firestore();
    const sections = Array.from({ length: 51 }, (_, i) => ({ id: i, code: 'X', name: String(i) }));
    await assertFails(setDoc(doc(db, 'seatAlertWatches', BRACU_UID), {
      ...validWatch(), sections,
    }));
  });

  await test('seatAlertState is closed to clients (read + write denied)', async () => {
    const db = bracuCtx().firestore();
    await assertFails(getDoc(doc(db, 'seatAlertState', BRACU_UID)));
    await assertFails(setDoc(doc(db, 'seatAlertState', BRACU_UID), { seen: {} }));
  });

  // ── Study group finder ───────────────────────────────────────────────
  const groupDoc = (extra = {}) => ({
    courseCode: 'CSE220',
    title: 'Algorithms grind',
    mode: 'in-person',
    contactLink: 'https://m.me/example',
    capacity: 6,
    creatorUid: BRACU_UID,
    university: 'bracu',
    createdAt: serverTimestamp(),
    ...extra,
  });

  const seedGroup = async (id = 'grp1', data = {}) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroups', id), {
        courseCode: 'CSE220', title: 'Seeded', mode: 'online',
        contactLink: 'https://m.me/x', capacity: 6,
        creatorUid: BRACU_UID, university: 'bracu', createdAt: new Date(), ...data,
      });
    });
  };

  const seedMember = async (groupId, uid, email) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroupMembers', `${groupId}_${uid}`), {
        groupId, uid, email, joinedAt: new Date(),
      });
    });
  };

  await test('BRACU user can create and read a valid study group', async () => {
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'studyGroups', 'grp1'), groupDoc()));
    await assertSucceeds(getDoc(doc(db, 'studyGroups', 'grp1')));
  });

  await test('study group with creatorUid != caller is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroups', 'grp1'), groupDoc({ creatorUid: OTHER_BRACU_UID })));
  });

  await test('study group with bad mode / non-https link / bad capacity is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroups', 'g_a'), groupDoc({ mode: 'remote' })));
    await assertFails(setDoc(doc(db, 'studyGroups', 'g_b'), groupDoc({ contactLink: 'http://m.me/x' })));
    await assertFails(setDoc(doc(db, 'studyGroups', 'g_c'), groupDoc({ capacity: 1 })));
    await assertFails(setDoc(doc(db, 'studyGroups', 'g_d'), groupDoc({ capacity: 99 })));
  });

  await test('non-BRACU user cannot create a study group', async () => {
    const db = outsiderCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroups', 'grp1'), groupDoc({ creatorUid: OUTSIDE_UID })));
  });

  await test('study group update is denied (immutable once posted)', async () => {
    await seedGroup('grp1');
    const db = bracuCtx().firestore();
    await assertFails(updateDoc(doc(db, 'studyGroups', 'grp1'), { title: 'edited' }));
  });

  await test('creator can delete own group; a different user cannot', async () => {
    await seedGroup('grp1', { creatorUid: BRACU_UID });
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(deleteDoc(doc(other, 'studyGroups', 'grp1')));
    await assertSucceeds(deleteDoc(doc(bracuCtx().firestore(), 'studyGroups', 'grp1')));
  });

  await test('admin can delete any study group', async () => {
    await seedGroup('grp1');
    await assertSucceeds(deleteDoc(doc(adminCtx().firestore(), 'studyGroups', 'grp1')));
  });

  await test('joining pins own email and uses the {groupId}_{uid} id', async () => {
    await seedGroup('grp1');
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'studyGroupMembers', `grp1_${BRACU_UID}`),
      { groupId: 'grp1', uid: BRACU_UID, email: BRACU_EMAIL, joinedAt: serverTimestamp() }));
  });

  await test('joining with a foreign email is rejected', async () => {
    await seedGroup('grp1');
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroupMembers', `grp1_${BRACU_UID}`),
      { groupId: 'grp1', uid: BRACU_UID, email: OTHER_BRACU_EMAIL, joinedAt: serverTimestamp() }));
  });

  await test('joining a nonexistent group is rejected', async () => {
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroupMembers', `ghost_${BRACU_UID}`),
      { groupId: 'ghost', uid: BRACU_UID, email: BRACU_EMAIL, joinedAt: serverTimestamp() }));
  });

  await test('member doc id must equal {groupId}_{uid}', async () => {
    await seedGroup('grp1');
    const db = bracuCtx().firestore();
    await assertFails(setDoc(doc(db, 'studyGroupMembers', `grp1_${OTHER_BRACU_UID}`),
      { groupId: 'grp1', uid: BRACU_UID, email: BRACU_EMAIL, joinedAt: serverTimestamp() }));
  });

  await test('self + fellow members can read the roster; non-members cannot', async () => {
    await seedGroup('grp1');
    await seedMember('grp1', BRACU_UID, BRACU_EMAIL);
    await seedMember('grp1', OTHER_BRACU_UID, OTHER_BRACU_EMAIL);
    await assertSucceeds(getDoc(doc(bracuCtx().firestore(), 'studyGroupMembers', `grp1_${BRACU_UID}`)));
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(other, 'studyGroupMembers', `grp1_${BRACU_UID}`)));
    const stranger = bracuCtx('third_bracu', 'third@g.bracu.ac.bd').firestore();
    await assertFails(getDoc(doc(stranger, 'studyGroupMembers', `grp1_${BRACU_UID}`)));
  });

  await test('a member can leave (delete own) but not delete another member', async () => {
    await seedGroup('grp1');
    await seedMember('grp1', BRACU_UID, BRACU_EMAIL);
    await seedMember('grp1', OTHER_BRACU_UID, OTHER_BRACU_EMAIL);
    const me = bracuCtx().firestore();
    await assertFails(deleteDoc(doc(me, 'studyGroupMembers', `grp1_${OTHER_BRACU_UID}`)));
    await assertSucceeds(deleteDoc(doc(me, 'studyGroupMembers', `grp1_${BRACU_UID}`)));
  });

  await test('study group report: deterministic id, real group, admin-only read', async () => {
    await seedGroup('grp1');
    const db = bracuCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'studyGroupReports', `${BRACU_UID}_grp1`),
      { groupId: 'grp1', reason: 'spam group', reporterUid: BRACU_UID, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'studyGroupReports', 'weird_grp1'),
      { groupId: 'grp1', reason: 'spam group', reporterUid: BRACU_UID, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'studyGroupReports', `${BRACU_UID}_ghost`),
      { groupId: 'ghost', reason: 'spam group', reporterUid: BRACU_UID, createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db, 'studyGroupReports', `${BRACU_UID}_grp1`)));
    await assertSucceeds(getDoc(doc(adminCtx().firestore(), 'studyGroupReports', `${BRACU_UID}_grp1`)));
  });

  // ── Lost & found board (#371) ─────────────────────────────────────────

  function lostFoundPost(extra = {}) {
    return {
      type: 'lost',
      title: 'Black umbrella',
      status: 'open',
      creatorUid: BRACU_UID,
      university: 'bracu',
      createdAt: serverTimestamp(),
      ...extra,
    };
  }

  // The client's real write shape: post + contact in one batch (getAfter tie).
  async function seedLostFoundPost(id, uid = BRACU_UID, email = BRACU_EMAIL, extra = {}) {
    const db = bracuCtx(uid, email).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'lostFoundPosts', id), lostFoundPost({ creatorUid: uid, ...extra }));
    batch.set(doc(db, 'lostFoundContacts', id), { email, uid, createdAt: serverTimestamp() });
    await batch.commit();
  }

  await test('lost&found: post+contact batch succeeds; BRACU can read posts, outsiders cannot', async () => {
    await assertSucceeds(seedLostFoundPost('lf1'));
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(other, 'lostFoundPosts', 'lf1')));
    await assertFails(getDoc(doc(outsiderCtx().firestore(), 'lostFoundPosts', 'lf1')));
  });

  await test('lost&found: invalid post payloads are rejected', async () => {
    const db = bracuCtx().firestore();
    const put = (id, data) => setDoc(doc(db, 'lostFoundPosts', id), data);
    await assertFails(put('bad1', lostFoundPost({ type: 'stolen' })));
    await assertFails(put('bad2', lostFoundPost({ title: 'ab' })));
    await assertFails(put('bad3', lostFoundPost({ status: 'resolved' })));
    await assertFails(put('bad4', lostFoundPost({ creatorUid: OTHER_BRACU_UID })));
    await assertFails(put('bad5', lostFoundPost({ contact: 'call me' })));
    await assertFails(put('bad6', lostFoundPost({ roomCode: 'UB0000' })));
    await assertSucceeds(put('ok1', lostFoundPost({ roomCode: '09G-31T', locationHint: 'lift lobby' })));
  });

  await test('lost&found: contact cannot attach to another user\'s post or a ghost post', async () => {
    await seedLostFoundPost('lf1');
    // Other user tries to plant a contact on lf1 (post exists, not theirs).
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(setDoc(doc(other, 'lostFoundContacts', 'lf1'),
      { email: OTHER_BRACU_EMAIL, uid: OTHER_BRACU_UID, createdAt: serverTimestamp() }));
    // Contact for a post that doesn't exist anywhere in the batch.
    await assertFails(setDoc(doc(other, 'lostFoundContacts', 'ghost'),
      { email: OTHER_BRACU_EMAIL, uid: OTHER_BRACU_UID, createdAt: serverTimestamp() }));
    // Spoofed email inside an otherwise-valid batch.
    const db = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'lostFoundPosts', 'lf2'), lostFoundPost({ creatorUid: OTHER_BRACU_UID }));
    batch.set(doc(db, 'lostFoundContacts', 'lf2'),
      { email: 'someoneelse@g.bracu.ac.bd', uid: OTHER_BRACU_UID, createdAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  await test('lost&found: contact docs are readable by nobody from the client', async () => {
    await seedLostFoundPost('lf1');
    await assertFails(getDoc(doc(bracuCtx().firestore(), 'lostFoundContacts', 'lf1')));
    await assertFails(getDoc(doc(adminCtx().firestore(), 'lostFoundContacts', 'lf1')));
  });

  await test('lost&found: owner can resolve, nothing else is editable', async () => {
    await seedLostFoundPost('lf1');
    const me = bracuCtx().firestore();
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(updateDoc(doc(other, 'lostFoundPosts', 'lf1'), { status: 'resolved' }));
    await assertFails(updateDoc(doc(me, 'lostFoundPosts', 'lf1'), { title: 'edited' }));
    await assertFails(updateDoc(doc(me, 'lostFoundPosts', 'lf1'), { status: 'open' }));
    await assertSucceeds(updateDoc(doc(me, 'lostFoundPosts', 'lf1'), { status: 'resolved' }));
  });

  await test('lost&found: owner and admin can delete a post, other students cannot', async () => {
    await seedLostFoundPost('lf1');
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertFails(deleteDoc(doc(other, 'lostFoundPosts', 'lf1')));
    await assertSucceeds(deleteDoc(doc(bracuCtx().firestore(), 'lostFoundPosts', 'lf1')));
    await seedLostFoundPost('lf2');
    await assertSucceeds(deleteDoc(doc(adminCtx().firestore(), 'lostFoundPosts', 'lf2')));
  });

  await test('lost&found: claims need a real post, a deterministic id, and a pinned sender', async () => {
    await seedLostFoundPost('lf1');
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    const claim = (extra = {}) => ({
      postId: 'lf1',
      fromUid: OTHER_BRACU_UID,
      fromEmail: OTHER_BRACU_EMAIL,
      createdAt: serverTimestamp(),
      ...extra,
    });
    await assertFails(setDoc(doc(other, 'lostFoundClaims', 'wrong_id'), claim()));
    await assertFails(setDoc(doc(other, 'lostFoundClaims', `ghost_${OTHER_BRACU_UID}`),
      claim({ postId: 'ghost' })));
    await assertFails(setDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`),
      claim({ fromEmail: 'spoof@g.bracu.ac.bd' })));
    await assertFails(setDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`),
      claim({ note: 'n'.repeat(301) })));
    await assertSucceeds(setDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`),
      claim({ note: 'Found it near the cafeteria.' })));
  });

  await test('lost&found: claims are admin-read/delete only', async () => {
    await seedLostFoundPost('lf1');
    const other = bracuCtx(OTHER_BRACU_UID, OTHER_BRACU_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`), {
      postId: 'lf1', fromUid: OTHER_BRACU_UID, fromEmail: OTHER_BRACU_EMAIL,
      createdAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`)));
    await assertFails(deleteDoc(doc(other, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`)));
    const admin = adminCtx().firestore();
    await assertSucceeds(getDoc(doc(admin, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`)));
    await assertSucceeds(deleteDoc(doc(admin, 'lostFoundClaims', `lf1_${OTHER_BRACU_UID}`)));
  });

  // ── Campus isolation ─────────────────────────────────────────────────
  // The point of tenancy: a student at one campus must never see another
  // campus's data. Every one of these would be a data leak if it inverted.

  const seedRaw = async (collection, id, data) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), collection, id), data);
    });
  };

  await test('campus isolation: NSU cannot read BRACU documents', async () => {
    await seedRaw('studyGroups', 'grp_bracu', {
      courseCode: 'CSE220', title: 'BRACU group', mode: 'online',
      contactLink: 'https://m.me/x', capacity: 6,
      creatorUid: BRACU_UID, university: 'bracu', createdAt: new Date(),
    });
    await seedRaw('lostFoundPosts', 'lf_bracu', {
      type: 'lost', title: 'BRACU umbrella', status: 'open',
      creatorUid: BRACU_UID, university: 'bracu', createdAt: new Date(),
    });
    await seedRaw('appFeedback', 'fb_bracu', {
      type: 'bug', text: 'BRACU only', anonymous: true,
      university: 'bracu', createdAt: new Date(),
    });

    const nsu = nsuCtx().firestore();
    await assertFails(getDoc(doc(nsu, 'studyGroups', 'grp_bracu')));
    await assertFails(getDoc(doc(nsu, 'lostFoundPosts', 'lf_bracu')));
    await assertFails(getDoc(doc(nsu, 'appFeedback', 'fb_bracu')));

    // ...and BRACU still can, so the gate is scoping rather than just denying.
    const bracu = bracuCtx().firestore();
    await assertSucceeds(getDoc(doc(bracu, 'studyGroups', 'grp_bracu')));
    await assertSucceeds(getDoc(doc(bracu, 'lostFoundPosts', 'lf_bracu')));
    await assertSucceeds(getDoc(doc(bracu, 'appFeedback', 'fb_bracu')));
  });

  await test('campus isolation: BRACU cannot read NSU documents', async () => {
    await seedRaw('studyGroups', 'grp_nsu', {
      courseCode: 'CSE225', title: 'NSU group', mode: 'online',
      contactLink: 'https://m.me/y', capacity: 6,
      creatorUid: NSU_UID, university: 'nsu', createdAt: new Date(),
    });
    await assertFails(getDoc(doc(bracuCtx().firestore(), 'studyGroups', 'grp_nsu')));
    await assertSucceeds(getDoc(doc(nsuCtx().firestore(), 'studyGroups', 'grp_nsu')));
  });

  await test('campus isolation: a client cannot label a document as another campus', async () => {
    const nsu = nsuCtx().firestore();
    // An NSU student writing a BRACU-labelled group would plant a document
    // inside a campus they do not belong to.
    await assertFails(setDoc(doc(nsu, 'studyGroups', 'planted'), {
      courseCode: 'CSE220', title: 'Planted', mode: 'online',
      contactLink: 'https://m.me/z', capacity: 6,
      creatorUid: NSU_UID, university: 'bracu', createdAt: serverTimestamp(),
    }));
    // Their own campus is fine.
    await assertSucceeds(setDoc(doc(nsu, 'studyGroups', 'legit'), {
      courseCode: 'CSE220', title: 'Legit', mode: 'online',
      contactLink: 'https://m.me/z', capacity: 6,
      creatorUid: NSU_UID, university: 'nsu', createdAt: serverTimestamp(),
    }));
    // An unregistered campus id is not a campus.
    await assertFails(setDoc(doc(nsu, 'studyGroups', 'invented'), {
      courseCode: 'CSE220', title: 'Invented', mode: 'online',
      contactLink: 'https://m.me/z', capacity: 6,
      creatorUid: NSU_UID, university: 'harvard', createdAt: serverTimestamp(),
    }));
  });

  await test('campus isolation: pre-tenancy documents belong to BRACU', async () => {
    // Everything written before tenancy existed has no university field, and
    // all of it is BRACU's — the app served nobody else. BRACU must still read
    // it, and NSU must not inherit it.
    await seedRaw('studyGroups', 'grp_legacy', {
      courseCode: 'CSE220', title: 'Legacy group', mode: 'online',
      contactLink: 'https://m.me/x', capacity: 6,
      creatorUid: BRACU_UID, createdAt: new Date(),
    });
    await assertSucceeds(getDoc(doc(bracuCtx().firestore(), 'studyGroups', 'grp_legacy')));
    await assertFails(getDoc(doc(nsuCtx().firestore(), 'studyGroups', 'grp_legacy')));
  });

  await test('campus isolation: an outsider is still refused everywhere', async () => {
    await seedRaw('studyGroups', 'grp_any', {
      courseCode: 'CSE220', title: 'Any', mode: 'online',
      contactLink: 'https://m.me/x', capacity: 6,
      creatorUid: BRACU_UID, university: 'bracu', createdAt: new Date(),
    });
    const outsider = outsiderCtx().firestore();
    await assertFails(getDoc(doc(outsider, 'studyGroups', 'grp_any')));
    await assertFails(getDoc(doc(outsider, 'appFeedback', 'anything')));
  });

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
