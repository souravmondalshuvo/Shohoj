// tests/authSnapshot.test.js
//
// Covers the pure auth-snapshot normalization (src/platform/auth/authSnapshot.ts)
// that backs the shell's AuthProvider + RequireAdmin guard.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAuthSnapshot,
  anonymousAuthSource,
  ANONYMOUS,
  LOADING,
} from '../src/platform/auth/authSnapshot.ts';

test('not ready → loading', () => {
  assert.deepEqual(normalizeAuthSnapshot({}), LOADING);
  assert.deepEqual(normalizeAuthSnapshot({ authReady: false, uid: 'x' }), LOADING);
});

test('ready with no uid → anonymous', () => {
  assert.deepEqual(normalizeAuthSnapshot({ authReady: true }), ANONYMOUS);
  assert.deepEqual(normalizeAuthSnapshot({ authReady: true, uid: '' }), ANONYMOUS);
});

test('ready with uid → authenticated, with email + admin flags', () => {
  const snap = normalizeAuthSnapshot({
    authReady: true,
    uid: 'u123',
    email: 'a@g.bracu.ac.bd',
    isAdmin: true,
  });
  assert.equal(snap.status, 'authenticated');
  assert.equal(snap.uid, 'u123');
  assert.equal(snap.email, 'a@g.bracu.ac.bd');
  assert.equal(snap.isAdmin, true);
});

test('isAdmin is only true for a strict boolean true (no truthy coercion)', () => {
  for (const v of [1, 'true', 'yes', {}]) {
    assert.equal(normalizeAuthSnapshot({ authReady: true, uid: 'u', isAdmin: v }).isAdmin, false);
  }
  assert.equal(normalizeAuthSnapshot({ authReady: true, uid: 'u', isAdmin: true }).isAdmin, true);
});

test('missing/invalid email normalizes to null', () => {
  assert.equal(normalizeAuthSnapshot({ authReady: true, uid: 'u' }).email, null);
  assert.equal(normalizeAuthSnapshot({ authReady: true, uid: 'u', email: 42 }).email, null);
});

test('anonymous source returns ANONYMOUS and a no-op unsubscribe', () => {
  assert.deepEqual(anonymousAuthSource.get(), ANONYMOUS);
  const unsub = anonymousAuthSource.subscribe(() => {});
  assert.equal(typeof unsub, 'function');
  unsub();
});

test('anonymous source has no ID token', async () => {
  assert.equal(await anonymousAuthSource.getIdToken(), null);
});

console.log('auth snapshot tests passed');

test('the campus comes from the email, not from the untrusted reading', () => {
  const bracu = normalizeAuthSnapshot({
    authReady: true,
    uid: 'u1',
    email: 'student@g.bracu.ac.bd',
  });
  assert.equal(bracu.university, 'bracu');

  const nsu = normalizeAuthSnapshot({
    authReady: true,
    uid: 'u2',
    email: 'student@northsouth.edu',
  });
  assert.equal(nsu.university, 'nsu');

  // These globals are untrusted input. A reading that names a campus its own
  // email contradicts must not win, or a caller could read another campus's
  // data through a UI that believed the claim.
  const spoofed = normalizeAuthSnapshot({
    authReady: true,
    uid: 'u3',
    email: 'student@g.bracu.ac.bd',
    university: 'nsu',
  });
  assert.equal(spoofed.university, 'bracu');

  // An unregistered id is ignored rather than carried through.
  const junk = normalizeAuthSnapshot({
    authReady: true,
    uid: 'u4',
    email: 'someone@gmail.com',
    university: 'harvard',
  });
  assert.equal(junk.university, null);
});
