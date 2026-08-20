/**
 * tests/backfillCampus.test.js
 * Emulator-driven tests for scripts/backfill_campus.js. Run with:
 *   npm run test:backfill
 *
 * This migration writes to production data that cannot be un-written, so the
 * cases below are the ones where a mistake would be expensive rather than the
 * ones that are easy to assert:
 *   - a document already stamped for ANOTHER campus must survive untouched;
 *   - a dry run must write nothing at all;
 *   - a second run must find nothing left to do;
 *   - pagination must not skip documents at a page boundary.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  backfillCollection,
  backfillAll,
  CAMPUS_COLLECTIONS,
  LEGACY_CAMPUS,
} from '../scripts/backfill_campus.js';

// emulators:exec sets FIRESTORE_EMULATOR_HOST; fail loudly rather than
// silently reaching for real credentials if this is run bare.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is unset — run via `npm run test:backfill`.');
}

initializeApp({ projectId: 'shohoj-test' });
const db = getFirestore();

async function reset(collection) {
  const docs = await db.collection(collection).get();
  await Promise.all(docs.docs.map((d) => d.ref.delete()));
}

test('stamps only the documents missing the field', async () => {
  await reset('facultyReviews');
  await db.collection('facultyReviews').doc('legacy').set({ rating: 5 });
  await db.collection('facultyReviews').doc('stamped').set({ rating: 4, university: 'bracu' });

  const result = await backfillCollection(db, 'facultyReviews', { apply: true });
  assert.equal(result.scanned, 2);
  assert.equal(result.stamped, 1);
  assert.equal(result.alreadyStamped, 1);

  const legacy = await db.collection('facultyReviews').doc('legacy').get();
  assert.equal(legacy.data().university, LEGACY_CAMPUS);
  // The rest of the document must be intact — this is an update, not a set.
  assert.equal(legacy.data().rating, 5);
});

test("a document belonging to another campus is never overwritten", async () => {
  await reset('studyGroups');
  await db.collection('studyGroups').doc('nsu_group').set({ title: 'NSU', university: 'nsu' });

  await backfillCollection(db, 'studyGroups', { apply: true });

  const doc = await db.collection('studyGroups').doc('nsu_group').get();
  // The whole migration is worthless if it can quietly move a document between
  // campuses — that is a data-isolation breach, not a cosmetic bug.
  assert.equal(doc.data().university, 'nsu');
});

test('an empty-string campus is left alone rather than "corrected"', async () => {
  await reset('appFeedback');
  await db.collection('appFeedback').doc('odd').set({ text: 'hi', university: '' });

  const result = await backfillCollection(db, 'appFeedback', { apply: true });
  assert.equal(result.stamped, 0);
  assert.equal(result.alreadyStamped, 1);

  const doc = await db.collection('appFeedback').doc('odd').get();
  assert.equal(doc.data().university, '');
});

test('a dry run writes nothing', async () => {
  await reset('papers');
  await db.collection('papers').doc('legacy').set({ approved: true });

  const result = await backfillCollection(db, 'papers', { apply: false });
  assert.equal(result.stamped, 1, 'it should still report what it would do');

  const doc = await db.collection('papers').doc('legacy').get();
  assert.equal('university' in doc.data(), false, 'dry run must not write');
});

test('running twice leaves nothing to do the second time', async () => {
  await reset('lostFoundPosts');
  for (let i = 0; i < 5; i += 1) {
    await db.collection('lostFoundPosts').doc(`p${i}`).set({ title: `item ${i}` });
  }

  const first = await backfillCollection(db, 'lostFoundPosts', { apply: true });
  assert.equal(first.stamped, 5);

  const second = await backfillCollection(db, 'lostFoundPosts', { apply: true });
  assert.equal(second.stamped, 0);
  assert.equal(second.alreadyStamped, 5);
});

test('pagination covers every document across page boundaries', async () => {
  await reset('facultyProfiles');
  const total = 25;
  for (let i = 0; i < total; i += 1) {
    // Zero-padded so document-id ordering is stable and a skipped page is
    // detectable rather than masked by lexicographic surprises.
    await db.collection('facultyProfiles').doc(`f${String(i).padStart(3, '0')}`).set({ n: i });
  }

  // A page size that does not divide the total, so the last page is partial.
  const result = await backfillCollection(db, 'facultyProfiles', { apply: true, pageSize: 7 });
  assert.equal(result.scanned, total);
  assert.equal(result.stamped, total);

  const after = await db.collection('facultyProfiles').get();
  const missing = after.docs.filter((d) => !('university' in d.data()));
  assert.deepEqual(missing.map((d) => d.id), [], 'every document should be stamped');
});

test('backfillAll covers exactly the campus-scoped collections', async () => {
  // studyGroupMembers scopes by uid and membership, never by campus. Stamping
  // it would add a field nothing reads, so it must stay out of the list.
  assert.ok(!CAMPUS_COLLECTIONS.includes('studyGroupMembers'));

  for (const name of CAMPUS_COLLECTIONS) await reset(name);
  await db.collection('papers').doc('one').set({ approved: true });

  const report = await backfillAll(db, { apply: true });
  assert.deepEqual(Object.keys(report).sort(), [...CAMPUS_COLLECTIONS].sort());
  assert.equal(report.papers.stamped, 1);
});
