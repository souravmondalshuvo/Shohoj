// tests/assistantHistory.test.js
//
// The Assistant's transcript store (#543). v1 kept the chat in sessionStorage,
// so it died with the tab; it is now a device-local IndexedDB record that
// survives a new tab and a new day.
//
// The guarantees under test are the ones the privacy decision rests on:
//
//   - a record only ever reads back for the uid that wrote it (campus machines
//     are shared, and a transcript is one student's questions plus the model's
//     answers about their grades);
//   - an unstamped record has no provable owner and is unreadable;
//   - clearing really deletes, because the drawer's "Clear chat" is the only
//     control a student has over a record that now outlives the tab;
//   - nothing throws when IndexedDB is missing or hostile — private mode must
//     cost a student their history, not their assistant.
//
// IndexedDB is injected, so this runs in Node with no browser and no polyfill.
// The real store is exercised end to end by e2e/assistant-history.spec.js.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ASSISTANT_MAX_MESSAGES } from '../js/core/assistantClient.js';
import {
  ASSISTANT_HISTORY_RECORD,
  clearStoredHistory,
  loadStoredHistory,
  saveStoredHistory,
} from '../js/core/assistantHistory.js';

const user = (content) => ({ role: 'user', content });
const reply = (content) => ({ role: 'assistant', content });

/** The slice of IndexedDB this module uses: open, get, put, delete. */
function fakeIndexedDB(initial = {}) {
  const data = new Map(Object.entries(initial));
  const settle = (request, work) => {
    queueMicrotask(() => {
      request.result = work();
      request.onsuccess?.();
    });
    return request;
  };
  const store = {
    get: (key) => settle({}, () => (data.has(key) ? data.get(key) : null)),
    put: (value, key) => settle({}, () => data.set(key, value) && key),
    delete: (key) => settle({}, () => (data.delete(key), key)),
  };
  return {
    data,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          close() {},
          transaction: () => ({ objectStore: () => store }),
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test('a saved transcript reads back identically for its owner', async () => {
  const idb = fakeIndexedDB();
  const transcript = [user('what is my cgpa?'), reply('3.42'), user('and next term?')];
  await saveStoredHistory('uid-a', transcript, idb);
  assert.deepEqual(await loadStoredHistory('uid-a', idb), transcript);
});

test('a transcript never reads back for a different uid', async () => {
  const idb = fakeIndexedDB();
  await saveStoredHistory('uid-a', [user('my cgpa?'), reply('3.42')], idb);
  assert.deepEqual(await loadStoredHistory('uid-b', idb), []);
  assert.deepEqual(await loadStoredHistory(null, idb), []);
  assert.deepEqual(await loadStoredHistory(undefined, idb), []);
});

test('an unstamped record is unreadable rather than assumed yours', async () => {
  const idb = fakeIndexedDB({
    [ASSISTANT_HISTORY_RECORD]: { messages: [user('someone else')] },
  });
  assert.deepEqual(await loadStoredHistory('uid-a', idb), []);
});

test('saving nothing, or saving without an owner, deletes the record', async () => {
  const idb = fakeIndexedDB();
  await saveStoredHistory('uid-a', [user('x')], idb);
  await saveStoredHistory('uid-a', [], idb);
  assert.equal(idb.data.has(ASSISTANT_HISTORY_RECORD), false);

  await saveStoredHistory('uid-a', [user('x')], idb);
  await saveStoredHistory(null, [user('x')], idb);
  assert.equal(idb.data.has(ASSISTANT_HISTORY_RECORD), false);
});

test('clearStoredHistory drops the record whoever owns it', async () => {
  const idb = fakeIndexedDB();
  await saveStoredHistory('uid-a', [user('x')], idb);
  await clearStoredHistory(idb);
  assert.equal(idb.data.has(ASSISTANT_HISTORY_RECORD), false);
  assert.deepEqual(await loadStoredHistory('uid-a', idb), []);
});

test('a stored transcript is clamped to the Worker contract on read', async () => {
  const oversize = [];
  for (let i = 0; i < 15; i++) oversize.push(user(`q${i}`), reply(`a${i}`));
  const idb = fakeIndexedDB({
    [ASSISTANT_HISTORY_RECORD]: { owner: 'uid-a', messages: oversize },
  });
  const restored = await loadStoredHistory('uid-a', idb);
  assert.ok(restored.length <= ASSISTANT_MAX_MESSAGES);
  assert.equal(restored[0].role, 'user');
});

test('corrupt or missing records yield an empty transcript', async () => {
  assert.deepEqual(await loadStoredHistory('uid-a', fakeIndexedDB()), []);
  const junk = fakeIndexedDB({ [ASSISTANT_HISTORY_RECORD]: 'not a record' });
  assert.deepEqual(await loadStoredHistory('uid-a', junk), []);
});

// Private mode, an embedded browser, a blocked origin: the chat must degrade to
// "not persisted", never to a drawer that will not open.
test('no IndexedDB, or a hostile one, is survivable', async () => {
  const missing = null;
  assert.deepEqual(await loadStoredHistory('uid-a', missing), []);

  const throwing = {
    open() {
      throw new Error('denied');
    },
  };
  assert.deepEqual(await loadStoredHistory('uid-a', throwing), []);
  assert.equal(await saveStoredHistory('uid-a', [user('hi')], throwing), false);
  assert.equal(await clearStoredHistory(throwing), false);

  const failing = {
    open() {
      const request = {};
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  };
  assert.deepEqual(await loadStoredHistory('uid-a', failing), []);
  assert.equal(await saveStoredHistory('uid-a', [user('hi')], failing), false);
});
