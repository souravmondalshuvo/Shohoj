// tests/firebaseAuthSource.test.js — unit tests for the Firebase-backed
// AuthSource (#331) over a fake backend: snapshot transitions, the legacy
// BRACU enforcement matrix, sign-in error semantics, and event emission.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFirebaseAuthSource,
  evaluateCampusAccess,
  REJECTED_MESSAGE,
  SIGN_IN_FAILED_MESSAGE,
} from '../src/platform/auth/firebaseAuthSource.ts';

const CONFIG = {
  apiKey: 'k',
  authDomain: 'a',
  projectId: 'p',
  storageBucket: 'b',
  messagingSenderId: 'm',
  appId: 'i',
};

const GOOGLE_CLAIMS = { email_verified: true, firebase: { sign_in_provider: 'google.com' } };

function fakeUser({
  uid = 'u1',
  email,
  verified = true,
  claims = GOOGLE_CLAIMS,
  tokenFails = false,
  idToken = 'jwt-123',
  idTokenFails = false,
} = {}) {
  return {
    uid,
    email,
    emailVerified: verified,
    getIdTokenResult: async () => {
      if (tokenFails) throw new Error('network');
      return { claims };
    },
    getIdToken: async () => {
      if (idTokenFails) throw new Error('token network error');
      return idToken;
    },
  };
}

function fakeBackend() {
  const calls = { signOut: 0, popup: 0 };
  let authListener = null;
  const backend = {
    onAuthStateChanged(next) {
      authListener = next;
      return () => {};
    },
    async signInWithGooglePopup() {
      calls.popup += 1;
      if (backend.popupError) throw backend.popupError;
    },
    async signOut() {
      calls.signOut += 1;
    },
    popupError: null,
    fire: (user) => authListener?.(user),
  };
  return { backend, calls };
}

async function sourceWithBackend() {
  const { backend, calls } = fakeBackend();
  const source = createFirebaseAuthSource({ config: CONFIG, loadBackend: async () => backend });
  const events = [];
  source.onEvent((e) => events.push(e));
  const changes = [];
  source.subscribe(() => changes.push(source.get()));
  await Promise.resolve(); // let the backend load settle
  await Promise.resolve();
  return { source, backend, calls, events, changes };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('evaluateCampusAccess: the enforcement matrix, now registry-driven', () => {
  const ok = { email: 'x@g.bracu.ac.bd', emailVerified: true };
  assert.deepEqual(evaluateCampusAccess(ok, GOOGLE_CLAIMS), {
    allowed: true,
    isAdmin: false,
    university: 'bracu',
  });
  // A domain no registered campus claims → rejected.
  assert.equal(evaluateCampusAccess({ email: 'x@gmail.com', emailVerified: true }, GOOGLE_CLAIMS).allowed, false);
  // Unverified (both signals false) → rejected.
  assert.equal(
    evaluateCampusAccess({ email: 'x@g.bracu.ac.bd', emailVerified: false }, { firebase: { sign_in_provider: 'google.com' } }).allowed,
    false,
  );
  // Claim-side verification alone suffices (legacy ||).
  assert.equal(
    evaluateCampusAccess({ email: 'x@g.bracu.ac.bd', emailVerified: false }, GOOGLE_CLAIMS).allowed,
    true,
  );
  // Non-Google provider → rejected.
  assert.equal(
    evaluateCampusAccess(ok, { email_verified: true, firebase: { sign_in_provider: 'password' } }).allowed,
    false,
  );
  // The admin claim overrides everything and maps isAdmin.
  assert.deepEqual(
    evaluateCampusAccess({ email: 'x@gmail.com', emailVerified: false }, { admin: true }),
    // Admitted on the claim, but no campus is invented for an address that
    // belongs to none.
    { allowed: true, isAdmin: true, university: null },
  );
  // No claims at all (failed token read) → rejected without the admin override.
  assert.equal(evaluateCampusAccess(ok, null).allowed, false);
});

test('evaluateCampusAccess: a second campus is admitted and told apart', () => {
    const nsu = { email: 'x@northsouth.edu', emailVerified: true };
    assert.deepEqual(evaluateCampusAccess(nsu, GOOGLE_CLAIMS), {
        allowed: true,
        isAdmin: false,
        university: 'nsu',
    });
    // The same three conditions still apply to every campus, not just the first.
    assert.equal(
        evaluateCampusAccess(nsu, { email_verified: true, firebase: { sign_in_provider: 'password' } }).allowed,
        false,
        'non-Google provider is rejected at NSU too',
    );
    // A lookalike domain must not inherit a real campus's access.
    assert.equal(
        evaluateCampusAccess({ email: 'x@northsouth.edu.attacker.com', emailVerified: true }, GOOGLE_CLAIMS).allowed,
        false,
    );
});

test('an NSU student authenticates and carries their own campus', async () => {
    const { source, backend } = await sourceWithBackend();
    backend.fire(fakeUser({ email: 'student@northsouth.edu' }));
    await settle();
    assert.deepEqual(source.get(), {
        status: 'authenticated',
        uid: 'u1',
        email: 'student@northsouth.edu',
        isAdmin: false,
        university: 'nsu',
    });
});

test('starts LOADING, settles ANONYMOUS on a null user', async () => {
  const { source, backend } = await sourceWithBackend();
  assert.equal(source.get().status, 'loading');
  backend.fire(null);
  await settle();
  assert.equal(source.get().status, 'anonymous');
});

test('an allowed BRACU user authenticates with uid/email/isAdmin', async () => {
  const { source, backend } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'student@g.bracu.ac.bd' }));
  await settle();
  assert.deepEqual(source.get(), {
    status: 'authenticated',
    uid: 'u1',
    email: 'student@g.bracu.ac.bd',
    isAdmin: false,
    university: 'bracu',
  });
});

test('a rejected account is signed out with the legacy toast copy', async () => {
  const { source, backend, calls, events } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'outsider@gmail.com' }));
  await settle();
  assert.equal(source.get().status, 'anonymous');
  assert.equal(calls.signOut, 1);
  assert.deepEqual(events, [{ type: 'rejected', message: REJECTED_MESSAGE }]);
});

test('a failed token read falls through to enforcement (rejected, legacy null-claims path)', async () => {
  const { source, backend, events } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'student@g.bracu.ac.bd', tokenFails: true, verified: true }));
  await settle();
  // emailVerified true but provider unknown (null claims) → rejected.
  assert.equal(source.get().status, 'anonymous');
  assert.equal(events[0]?.type, 'rejected');
});

test('the admin claim keeps a non-BRACU account signed in as admin', async () => {
  const { source, backend } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'ops@example.com', claims: { admin: true } }));
  await settle();
  assert.equal(source.get().status, 'authenticated');
  assert.equal(source.get().isAdmin, true);
});

test('signIn: popup-closed is swallowed; other failures emit the legacy copy', async () => {
  const { source, backend, events } = await sourceWithBackend();
  backend.popupError = { code: 'auth/popup-closed-by-user' };
  await source.signIn();
  assert.deepEqual(events, []);

  backend.popupError = new Error('network down');
  await source.signIn();
  assert.deepEqual(events, [{ type: 'sign-in-failed', message: SIGN_IN_FAILED_MESSAGE }]);
});

test('a backend that fails to load settles ANONYMOUS and fails sign-in gracefully', async () => {
  const source = createFirebaseAuthSource({
    config: CONFIG,
    loadBackend: async () => {
      throw new Error('sdk unavailable');
    },
  });
  const events = [];
  source.onEvent((e) => events.push(e));
  source.subscribe(() => {});
  await settle();
  assert.equal(source.get().status, 'anonymous');
  await source.signIn();
  assert.deepEqual(events, [{ type: 'sign-in-failed', message: SIGN_IN_FAILED_MESSAGE }]);
});

test('getIdToken: null before sign-in, the token while signed in', async () => {
  const { source, backend } = await sourceWithBackend();
  assert.equal(await source.getIdToken(), null, 'no user yet → null');

  backend.fire(fakeUser({ email: 'student@g.bracu.ac.bd', idToken: 'jwt-abc' }));
  await settle();
  assert.equal(await source.getIdToken(), 'jwt-abc');
});

test('getIdToken: null after sign-out clears the retained user', async () => {
  const { source, backend } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'student@g.bracu.ac.bd' }));
  await settle();
  assert.equal(await source.getIdToken(), 'jwt-123');

  backend.fire(null);
  await settle();
  assert.equal(await source.getIdToken(), null);
});

test('getIdToken: a rejected account is not retained (null)', async () => {
  const { source, backend } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'outsider@gmail.com' }));
  await settle();
  assert.equal(await source.getIdToken(), null);
});

test('getIdToken: a token-read error degrades to null, never throws', async () => {
  const { source, backend } = await sourceWithBackend();
  backend.fire(fakeUser({ email: 'student@g.bracu.ac.bd', idTokenFails: true }));
  await settle();
  assert.equal(await source.getIdToken(), null);
});
