import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_RETRY_WINDOW_MS,
  LOST_FOUND_DELIVERIES,
  deliverLostFoundClaim,
  eligibleLostFoundClaim,
} from '../lostFoundDelivery.js';
import { createFirestoreAtomicStore } from '../firestoreAtomic.js';
import { firestoreRest, fromFields, toFields } from './helpers/firestoreRest.js';

const id = 'post1_student1';
const payloadHash = 'synthetic-payload-hash';
const started = Date.UTC(2026, 8, 27, 12);
const path = `${LOST_FOUND_DELIVERIES}/${id}`;
const claim = { postId: 'post1', fromUid: 'student1', fromEmail: 'student@g.bracu.ac.bd' };
const post = { status: 'open', creatorUid: 'owner1', university: 'bracu' };
const contact = { uid: 'owner1', email: 'owner@g.bracu.ac.bd' };

function harness() {
  const db = firestoreRest();
  const store = createFirestoreAtomicStore({
    baseUrl:
      'https://firestore.googleapis.com/v1/projects/delivery-test/databases/(default)/documents',
    token: 'local-test-only',
    toFields,
    fromFields,
    fetchImpl: db.fetch,
  });
  let current = started;
  return {
    db,
    store,
    setNow(value) {
      current = value;
    },
    seed(fields = {}) {
      db.seed(path, { status: 'pending', payloadHash, firstAttemptAt: started, ...fields });
    },
    deliver(send, overrides = {}) {
      return deliverLostFoundClaim({
        store,
        id,
        payloadHash,
        send,
        now: () => current,
        ...overrides,
      });
    },
  };
}

function idempotentProvider() {
  let attempts = 0;
  const accepted = new Set();
  return {
    send: async () => {
      attempts++;
      // The cron adapter uses one stable Resend idempotency key for this claim.
      // Duplicate requests are accepted but create only one delivery.
      accepted.add(id);
      await Promise.resolve();
      return true;
    },
    attempts: () => attempts,
    deliveries: () => accepted.size,
  };
}

const conflict = () => Object.assign(new Error('Concurrent write'), { conflict: true });

test('only matching open same-campus claims with the creator contact are eligible', () => {
  assert.equal(eligibleLostFoundClaim(id, claim, post, contact), true);
  assert.equal(
    eligibleLostFoundClaim(id, claim, { ...post, university: undefined }, contact),
    true,
  );
  assert.equal(
    eligibleLostFoundClaim(
      id,
      { ...claim, fromEmail: 'student@northsouth.edu' },
      { ...post, university: 'nsu' },
      { ...contact, email: 'owner@northsouth.edu' },
    ),
    true,
  );
  const denied = [
    [id, { ...claim, fromEmail: 'student@northsouth.edu' }, post, contact],
    [id, claim, { ...post, university: 'nsu' }, contact],
    [id, claim, { ...post, university: 'unknown' }, contact],
    [id, claim, { ...post, status: 'resolved' }, contact],
    [id, claim, { ...post, status: undefined }, contact],
    [id, claim, post, { ...contact, uid: 'different-owner' }],
    [id, claim, post, { ...contact, email: 'owner@northsouth.edu' }],
    [id, { ...claim, fromEmail: 'student@g.bracu.ac.bd.attacker.invalid' }, post, contact],
    ['different-claim', claim, post, contact],
    [id, { ...claim, postId: '../post1' }, post, contact],
    [id, { ...claim, fromUid: '../student1' }, post, contact],
    [id, null, post, contact],
    [id, claim, null, contact],
    [id, claim, post, null],
  ];
  for (const input of denied) assert.equal(eligibleLostFoundClaim(...input), false);
});

test('a delivered receipt prevents replay even after the provider idempotency window expires', async () => {
  const h = harness();
  const provider = idempotentProvider();
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.deepEqual(h.db.read(path), {
    status: 'delivered',
    payloadHash,
    firstAttemptAt: started,
    deliveredAt: started,
  });
  h.setNow(started + 25 * 60 * 60 * 1000);
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(await h.deliver(provider.send, { payloadHash: 'changed' }), 'delivered');
  assert.equal(provider.attempts(), 1);
  assert.equal(provider.deliveries(), 1);
});

test('concurrent first attempts admit one creation and one provider call', async () => {
  const h = harness();
  const provider = idempotentProvider();
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => h.deliver(provider.send)));
  assert.equal(outcomes.filter((outcome) => outcome === 'delivered').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome === 'pending').length, 11);
  assert.equal(provider.attempts(), 1);
  assert.equal(provider.deliveries(), 1);
  assert.equal(h.db.read(path).status, 'delivered');
});

test('overlapping pending retries rely on the same provider key and settle one receipt', async () => {
  const h = harness();
  h.seed();
  const provider = idempotentProvider();
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => h.deliver(provider.send)));
  assert.ok(outcomes.every((outcome) => outcome === 'delivered'));
  assert.ok(provider.attempts() > 1, 'test must exercise overlapping provider attempts');
  assert.equal(provider.deliveries(), 1);
  assert.equal(h.db.read(path).status, 'delivered');
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(provider.deliveries(), 1);
});

test('a rejected send remains pending and can retry within the original window', async () => {
  const h = harness();
  let attempts = 0;
  const send = async () => ++attempts > 1;
  assert.equal(await h.deliver(send), 'pending');
  assert.equal(h.db.read(path).firstAttemptAt, started);
  h.setNow(started + 60 * 1000);
  assert.equal(await h.deliver(send), 'delivered');
  assert.equal(attempts, 2);
  assert.equal(h.db.read(path).firstAttemptAt, started);
  assert.equal(h.db.read(path).deliveredAt, started + 60 * 1000);
});

test('a thrown send preserves the pending receipt and original retry deadline', async () => {
  const h = harness();
  await assert.rejects(
    h.deliver(async () => {
      throw new Error('Network outcome unknown');
    }),
    /Network outcome unknown/,
  );
  assert.equal(h.db.read(path).status, 'pending');
  const provider = idempotentProvider();
  h.setNow(started + CLAIM_RETRY_WINDOW_MS - 1);
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(h.db.read(path).firstAttemptAt, started);
});

test('stale, future, malformed, and changed pending receipts fail closed without sending', async () => {
  for (const [fields, now] of [
    [{}, started + CLAIM_RETRY_WINDOW_MS],
    [{}, started + 25 * 60 * 60 * 1000],
    [{ firstAttemptAt: started + 1 }, started],
    [{ firstAttemptAt: 'invalid' }, started],
    [{ firstAttemptAt: null }, started],
    [{ status: 'reconcile' }, started],
    [{ payloadHash: 'different-payload' }, started],
  ]) {
    const h = harness();
    h.seed(fields);
    h.setNow(now);
    const provider = idempotentProvider();
    const before = h.db.read(path);
    assert.equal(await h.deliver(provider.send), 'reconcile');
    assert.equal(provider.attempts(), 0);
    assert.deepEqual(h.db.read(path), before);
  }
});

test('a failed send does not reset the admission deadline for later attempts', async () => {
  const h = harness();
  assert.equal(await h.deliver(async () => false), 'pending');
  h.setNow(started + CLAIM_RETRY_WINDOW_MS);
  const provider = idempotentProvider();
  assert.equal(await h.deliver(provider.send), 'reconcile');
  assert.equal(provider.attempts(), 0);
  assert.equal(h.db.read(path).firstAttemptAt, started);
});

test('an ambiguous receipt creation never sends, even if the write actually committed', async () => {
  const h = harness();
  const uncertain = {
    ...h.store,
    async commitWrites(writes) {
      await h.store.commitWrites(writes);
      throw new Error('Connection lost after commit');
    },
  };
  const provider = idempotentProvider();
  await assert.rejects(
    h.deliver(provider.send, { store: uncertain }),
    /Connection lost after commit/,
  );
  assert.equal(provider.attempts(), 0);
  assert.equal(h.db.read(path).status, 'pending');
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(provider.deliveries(), 1);
});

test('a definite creation failure leaves no receipt and cannot send', async () => {
  const h = harness();
  const unavailable = {
    ...h.store,
    commitWrites: async () => {
      throw new Error('Unavailable');
    },
  };
  const provider = idempotentProvider();
  await assert.rejects(h.deliver(provider.send, { store: unavailable }), /Unavailable/);
  assert.equal(provider.attempts(), 0);
  assert.equal(h.db.read(path), null);
});

test('changed or missing receipts during provider acceptance cannot be overwritten by settlement', async () => {
  for (const remove of [false, true]) {
    const h = harness();
    const outcome = await h.deliver(async () => {
      if (remove) h.db.docs.delete(path);
      else h.seed({ payloadHash: 'concurrent-change' });
      return true;
    });
    assert.equal(outcome, 'reconcile');
    assert.equal(h.db.read(path)?.status ?? null, remove ? null : 'pending');
    if (!remove) assert.equal(h.db.read(path).payloadHash, 'concurrent-change');
  }
});

test('settlement conflicts retry at most three times and preserve the pending receipt', async () => {
  const h = harness();
  const provider = idempotentProvider();
  let settlements = 0;
  const contended = {
    ...h.store,
    async commitWrites(writes) {
      if (writes[0].fields.status === 'delivered') {
        settlements++;
        throw conflict();
      }
      return h.store.commitWrites(writes);
    },
  };
  assert.equal(await h.deliver(provider.send, { store: contended }), 'pending');
  assert.equal(settlements, 3);
  assert.equal(h.db.read(path).status, 'pending');
  assert.equal(h.db.read(path).firstAttemptAt, started);
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(provider.attempts(), 2);
  assert.equal(provider.deliveries(), 1);
});

test('a failed settlement retains pending state and uses the same provider key on retry', async () => {
  const h = harness();
  const provider = idempotentProvider();
  let settlements = 0;
  const unavailable = {
    ...h.store,
    async commitWrites(writes) {
      if (writes[0].fields.status === 'delivered') {
        settlements++;
        throw new Error('Unavailable');
      }
      return h.store.commitWrites(writes);
    },
  };
  await assert.rejects(h.deliver(provider.send, { store: unavailable }), /Unavailable/);
  assert.equal(settlements, 1);
  assert.equal(h.db.read(path).status, 'pending');
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(provider.attempts(), 2);
  assert.equal(provider.deliveries(), 1);
});

test('an ambiguous successful settlement prevents a second send on a later run', async () => {
  const h = harness();
  const provider = idempotentProvider();
  const uncertain = {
    ...h.store,
    async commitWrites(writes) {
      await h.store.commitWrites(writes);
      if (writes[0].fields.status === 'delivered') throw new Error('Settlement response lost');
    },
  };
  await assert.rejects(h.deliver(provider.send, { store: uncertain }), /Settlement response lost/);
  assert.equal(h.db.read(path).status, 'delivered');
  h.setNow(started + 48 * 60 * 60 * 1000);
  assert.equal(await h.deliver(provider.send), 'delivered');
  assert.equal(provider.attempts(), 1);
});
