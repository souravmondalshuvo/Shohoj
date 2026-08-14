// tests/assistantAuthHooks.test.js
//
// Covers js/auth/assistant-service.js — the two window bridges the Assistant
// launcher needs on the legacy page (#533). The launcher lives in the classic
// main bundle and cannot import firebase.js, so firebase.js installs these; the
// module takes its dependencies and its global by injection, so the whole
// contract is testable in Node with a plain object as the scope.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installAssistantAuthHooks } from '../js/auth/assistant-service.js';

function install(overrides = {}) {
  const scope = {};
  const calls = { saved: [] };
  installAssistantAuthHooks(
    {
      getCurrentUser: () => ({ uid: 'u1' }),
      isCloudSettled: () => true,
      getIdToken: async () => 'id-token',
      saveSnapshot: async snap => {
        calls.saved.push(snap);
        return true;
      },
      readLocalSnapshot: () => ({ semesters: [{ name: 'Spring 2026' }] }),
      ...overrides,
    },
    scope,
  );
  return { scope, calls };
}

test('the token bridge returns a fresh ID token for a signed-in student', async () => {
  const { scope } = install();
  assert.equal(await scope._shohoj_idToken(), 'id-token');
});

test('the token bridge returns null when signed out, without minting a token', async () => {
  const { scope } = install({
    getCurrentUser: () => null,
    getIdToken: async () => {
      throw new Error('must not be called');
    },
  });
  assert.equal(await scope._shohoj_idToken(), null);
});

test('the flush pushes the local snapshot so the Worker reads current data', async () => {
  const { scope, calls } = install();
  assert.equal(await scope._shohoj_flushCloudSave(), true);
  assert.deepEqual(calls.saved, [{ semesters: [{ name: 'Spring 2026' }] }]);
});

test('the flush is a no-op when signed out or with nothing stored locally', async () => {
  const signedOut = install({
    getCurrentUser: () => null,
    saveSnapshot: async () => {
      throw new Error('must not be called');
    },
  });
  assert.equal(await signedOut.scope._shohoj_flushCloudSave(), false);

  const empty = install({
    readLocalSnapshot: () => null,
    saveSnapshot: async () => {
      throw new Error('must not be called');
    },
  });
  assert.equal(await empty.scope._shohoj_flushCloudSave(), false);
});

// The window between shohoj:auth-changed and the local-vs-cloud decision is
// real: auth-changed fires as soon as the user object exists, and the migration
// dialog can sit on screen for as long as the student takes to answer it.
// Writing the local snapshot in that window can overwrite the account's cloud
// copy before the conflict is ever detected.
test('the flush stands down while sign-in reconciliation is still open', async () => {
  const { scope, calls } = install({
    isCloudSettled: () => false,
    saveSnapshot: async () => { throw new Error('must not be called'); },
  });
  assert.equal(await scope._shohoj_flushCloudSave(), false);
  assert.deepEqual(calls.saved, []);
});

test('a failed cloud write resolves false instead of blocking the chat turn', async () => {
  const { scope } = install({
    saveSnapshot: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(await scope._shohoj_flushCloudSave(), false);
});

test('installing without a global scope is a no-op rather than a crash', () => {
  assert.doesNotThrow(() =>
    installAssistantAuthHooks(
      {
        getCurrentUser: () => null,
        isCloudSettled: () => true,
        getIdToken: async () => null,
        saveSnapshot: async () => false,
        readLocalSnapshot: () => null,
      },
      undefined,
    ),
  );
});
