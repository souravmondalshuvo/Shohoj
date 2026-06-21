// src/services/storage/keyValueStore.ts
//
// Minimal storage abstraction so the data layer can be unit-tested with an
// in-memory fake instead of a real `localStorage`. The browser `Storage`
// interface is structurally compatible, so `localStorage` / `sessionStorage`
// satisfy this directly.

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A simple in-memory KeyValueStore (used by tests and as a safe fallback). */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}
