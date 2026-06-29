// tests/browserKeyValueStore.test.js
//
// Covers the localStorage-backed KeyValueStore adapter
// (src/services/storage/browserKeyValueStore.ts): it must use a working
// localStorage, degrade to an in-memory fallback when storage is unavailable or
// throws, and never let storage errors propagate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserStore } from '../src/services/storage/browserKeyValueStore.ts';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('uses a working localStorage when present', () => {
  globalThis.localStorage = fakeStorage();
  try {
    const store = createBrowserStore();
    store.setItem('k', 'v');
    assert.equal(store.getItem('k'), 'v');
    store.removeItem('k');
    assert.equal(store.getItem('k'), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('falls back to memory when localStorage is absent', () => {
  delete globalThis.localStorage;
  const store = createBrowserStore();
  store.setItem('a', '1');
  assert.equal(store.getItem('a'), '1'); // memory fallback works
});

test('falls back to memory when localStorage access throws on probe', () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('access denied');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    const store = createBrowserStore();
    // Should not throw and should behave (memory fallback).
    store.setItem('x', 'y');
    assert.equal(store.getItem('x'), 'y');
  } finally {
    delete globalThis.localStorage;
  }
});

test('write errors on a flaky localStorage are swallowed (no throw)', () => {
  let getThrows = false;
  globalThis.localStorage = {
    getItem: () => {
      if (getThrows) throw new Error('boom');
      return null;
    },
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
    removeItem: () => {},
  };
  try {
    const store = createBrowserStore(); // probe passes (getItem returns null)
    getThrows = true;
    assert.doesNotThrow(() => store.setItem('k', 'v'));
    assert.equal(store.getItem('k'), null); // read error → null, no throw
  } finally {
    delete globalThis.localStorage;
  }
});

console.log('browser key-value store tests passed');
