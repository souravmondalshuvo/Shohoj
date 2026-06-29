// src/services/storage/browserKeyValueStore.ts
//
// localStorage-backed KeyValueStore for the live persistence path (Phase 4).
// localStorage can throw (private mode, quota, storage disabled) or be absent
// (SSR/Worker), so every call is guarded — reads degrade to null and writes
// degrade to no-ops rather than crashing the calculator. This mirrors the legacy
// `try { localStorage... } catch {}` defensiveness, now in one typed place.

import { MemoryKeyValueStore, type KeyValueStore } from './keyValueStore.ts';

class BrowserKeyValueStore implements KeyValueStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  getItem(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      /* storage full/disabled — drop the write rather than crash */
    }
  }

  removeItem(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Best-effort browser store. Returns a guarded localStorage adapter when
 * available, otherwise an in-memory fallback so callers never have to branch on
 * storage availability. Probing happens once here, defensively.
 */
export function createBrowserStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      // Touch it to surface "access denied" early (some browsers throw on read).
      localStorage.getItem('__shohoj_probe__');
      return new BrowserKeyValueStore(localStorage);
    }
  } catch {
    /* fall through to memory */
  }
  return new MemoryKeyValueStore();
}
