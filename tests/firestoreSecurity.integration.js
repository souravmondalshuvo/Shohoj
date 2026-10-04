// Run only inside `firebase emulators:exec`. Validates the actual REST contract
// so a merge-only mock cannot hide a replacement/precondition regression.
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createFirestoreAtomicStore } from '../worker/firestoreAtomic.js';
import { createCalendarFeed, deleteCalendarFeed } from '../worker/calendarFeedHandlers.js';
import { resolveCalendarFeedOwner } from '../worker/calendarFeed.js';
import { reserveAiAdmission, settleAiAdmission } from '../worker/aiAdmission.js';
import { deliverLostFoundClaim } from '../worker/lostFoundDelivery.js';
import { toFields, fromFields } from '../worker/test/helpers/firestoreRest.js';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('A local Firestore emulator is required');
const env = await initializeTestEnvironment({ projectId: 'shohoj-test', firestore: { host: host.split(':')[0], port: Number(host.split(':')[1]) } });
const store = createFirestoreAtomicStore({
  baseUrl: 'https://firestore.googleapis.com/v1/projects/shohoj-test/databases/(default)/documents',
  token: 'owner', toFields, fromFields,
  fetchImpl: (url, init) => fetch(url.replace('https://firestore.googleapis.com', 'http://' + host), init),
});
try {
  await env.clearFirestore();
  await store.commitWrites([{ path: 'shohojUsers/atomic_student', fields: { studentId: 'preserve-this' }, exists: false }]);
  const deps = { ...store, getDoc: async path => (await store.getDocSnapshot(path))?.fields ?? null };
  const ctx = { deps, firebaseUid: 'atomic_student', feedOrigin: 'https://example.invalid', now: () => new Date(), randomHex: () => crypto.randomUUID().replaceAll('-', '') };
  const minted = await Promise.all([createCalendarFeed(ctx), createCalendarFeed(ctx)]);
  assert.equal((await deps.getDoc('shohojUsers/atomic_student')).studentId, 'preserve-this');
  await deleteCalendarFeed(ctx);
  for (const result of minted) {
    const token = new URL(result.body.feed.url).pathname.split('/').at(-1).replace('.ics', '');
    assert.equal(await resolveCalendarFeedOwner(deps, token), null);
  }
  console.log('✓ Real Firestore REST: concurrent calendar rotation/revoke and masked profile preservation');
  await store.commitWrites([{ path: 'assistantDailyQuota/atomic_student_2026-09-26', fields: { count: 39 }, exists: false }]);
  const args = { uid: 'atomic_student', day: '2026-09-26', month: '2026-09', quotaLimit: 40, budgetUsd: 5, heldUsd: 0.5 };
  const attempts = await Promise.all(Array.from({ length: 5 }, () => reserveAiAdmission(store, args)));
  const admitted = attempts.filter(a => !a.denied);
  assert.equal(admitted.length, 1);
  assert.equal(attempts.filter(a => a.denied === 'quota').length, 4);
  await settleAiAdmission(store, admitted[0], { costUsd: 0.1, answered: true });
  await settleAiAdmission(store, admitted[0], { costUsd: 0.1, answered: true });
  const budget = await deps.getDoc('assistantBudget/2026-09');
  assert.equal(budget.spentUsd, 0.1);
  assert.equal(budget.reservedUsd, 0);
  assert.equal((await deps.getDoc('assistantDailyQuota/atomic_student_2026-09-26')).count, 40);
  console.log('✓ Real Firestore REST: concurrent quota reservation and idempotent settlement');
  let sends = 0;
  const delivery = { store, id: 'post_claimant', payloadHash: 'synthetic-hash', send: async () => { sends++; return true; }, now: () => 1000 };
  await Promise.all([deliverLostFoundClaim(delivery), deliverLostFoundClaim(delivery)]);
  assert.equal(sends, 1);
  assert.equal((await deps.getDoc('lostFoundDeliveries/post_claimant')).status, 'delivered');
  assert.equal(await deliverLostFoundClaim({ ...delivery, now: () => 365 * 24 * 60 * 60 * 1000 }), 'delivered');
  assert.equal(sends, 1);
  console.log('✓ Real Firestore REST: concurrent claim admission and durable delivery replay prevention');
} finally { await env.cleanup(); }
