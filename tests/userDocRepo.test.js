// tests/userDocRepo.test.js — unit tests for the typed users/{uid} repo
// (#333) over a fake Firestore backend.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createUserDocRepo } from '../src/platform/firebase/userDocRepo.ts';

const CONFIG = { apiKey: 'k', authDomain: 'a', projectId: 'p', storageBucket: 'b', messagingSenderId: 'm', appId: 'i' };

function fakeBackend() {
  const calls = { set: [], deleted: [] };
  let snapshotHandler = null;
  const backend = {
    docs: new Map(),
    async getDocData(uid) {
      if (backend.failReads) throw new Error('offline');
      const data = backend.docs.get(uid);
      return { exists: data !== undefined, data };
    },
    async setDocData(uid, dataJson) {
      calls.set.push([uid, dataJson]);
      backend.docs.set(uid, dataJson);
    },
    onDocSnapshot(uid, next) {
      snapshotHandler = next;
      return () => {
        snapshotHandler = null;
      };
    },
    async deleteDoc(uid) {
      calls.deleted.push(uid);
      backend.docs.delete(uid);
    },
    fire: (snap) => snapshotHandler?.(snap),
    hasListener: () => snapshotHandler !== null,
    failReads: false,
  };
  return { backend, calls };
}

function repoWith(backend) {
  return createUserDocRepo({ config: CONFIG, loadBackend: async () => backend });
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('load: string data, missing doc, non-string field, failed read', async () => {
  const { backend } = fakeBackend();
  const repo = repoWith(backend);
  backend.docs.set('u1', '{"semesters":[]}');
  assert.equal(await repo.load('u1'), '{"semesters":[]}');
  assert.equal(await repo.load('nobody'), null);

  backend.docs.set('u2', 12345); // corrupt/legacy field type
  assert.equal(await repo.load('u2'), null);

  backend.failReads = true;
  assert.equal(await repo.load('u1'), null); // loadFromCloud parity
});

test('save writes through the backend (data string, merge shape owned there)', async () => {
  const { backend, calls } = fakeBackend();
  const repo = repoWith(backend);
  await repo.save('u1', '{"currentDept":"CSE"}');
  assert.deepEqual(calls.set, [['u1', '{"currentDept":"CSE"}']]);
});

test('subscribe emits normalized data and unsubscribes cleanly', async () => {
  const { backend } = fakeBackend();
  const repo = repoWith(backend);
  const seen = [];
  const unsubscribe = repo.subscribe('u1', (data, exists) => seen.push([data, exists]));
  await settle();
  assert.ok(backend.hasListener());

  backend.fire({ exists: true, data: '{"a":1}' });
  backend.fire({ exists: true, data: undefined }); // doc without the field
  backend.fire({ exists: false, data: undefined });
  assert.deepEqual(seen, [
    ['{"a":1}', true],
    [null, true],
    [null, false],
  ]);

  unsubscribe();
  assert.equal(backend.hasListener(), false);
});

test('unsubscribing before the backend loads never attaches a listener', async () => {
  const { backend } = fakeBackend();
  const repo = repoWith(backend);
  const unsubscribe = repo.subscribe('u1', () => {});
  unsubscribe(); // before the async load settles
  await settle();
  assert.equal(backend.hasListener(), false);
});

test('remove deletes the doc', async () => {
  const { backend, calls } = fakeBackend();
  const repo = repoWith(backend);
  backend.docs.set('u1', 'x');
  await repo.remove('u1');
  assert.deepEqual(calls.deleted, ['u1']);
});
