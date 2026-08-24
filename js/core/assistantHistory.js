// js/core/assistantHistory.js
//
// Local, device-bound persistence for the Assistant transcript (#543).
//
// v1 kept the chat in sessionStorage, so it survived a tab switch and died with
// the tab: a student who closed the drawer and came back the next day
// re-explained context they had already given.
//
// THE PRIVACY DECISION, recorded because it constrains everything below.
// v1's promise is that chats never leave the browser. Storing them under
// users/{uid} would sync them across devices and make them recoverable — and it
// would break that promise, turning a local convenience into a server-side
// record of what a student asked about their own grades. So the transcript
// stays LOCAL: IndexedDB on this device, no network, no server copy, and a
// visible control that deletes it. A student on two devices gets two separate
// histories, which is the cost of the promise being kept.
//
// The uid stamp is not decoration either. Campus machines are shared: without
// it, a student who chats and signs out leaves their questions — and the
// model's answers about their grades — for whoever signs in next, and those
// turns would be replayed to the Worker as the next student's context. A record
// only ever reads back for the uid that wrote it.
//
// Every function here is null-safe and never throws: IndexedDB is unavailable
// in private mode and in some embedded browsers, and a chat that does not
// persist is a far better outcome than a drawer that will not open.

import { clampTranscript } from './assistantClient.js';

export const ASSISTANT_HISTORY_DB = 'shohoj_assistant';
export const ASSISTANT_HISTORY_STORE = 'transcripts';
export const ASSISTANT_HISTORY_RECORD = 'current';

/** The environment's IndexedDB, or null when there isn't one. */
function defaultFactory() {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDb(factory) {
  const idb = factory || defaultFactory();
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try {
      request = idb.open(ASSISTANT_HISTORY_DB, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSISTANT_HISTORY_STORE)) {
        db.createObjectStore(ASSISTANT_HISTORY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function runTransaction(db, mode, work) {
  return new Promise((resolve) => {
    let store;
    try {
      store = db.transaction(ASSISTANT_HISTORY_STORE, mode).objectStore(ASSISTANT_HISTORY_STORE);
    } catch {
      resolve(null);
      return;
    }
    let request;
    try {
      request = work(store);
    } catch {
      resolve(null);
      return;
    }
    if (!request) {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

/**
 * The transcript stored for `owner`, clamped to the Worker's contract.
 *
 * Returns [] when nothing is stored, when the record belongs to a different
 * uid, or when IndexedDB is unreachable. An unstamped record predates uid
 * scoping and has no provable owner, so nobody may read it.
 *
 * @param {string|null|undefined} owner
 * @param {IDBFactory|null} [factory]  Injectable for tests.
 */
export async function loadStoredHistory(owner, factory) {
  if (!owner) return [];
  const db = await openDb(factory);
  if (!db) return [];
  const record = await runTransaction(db, 'readonly', (store) =>
    store.get(ASSISTANT_HISTORY_RECORD),
  );
  try {
    db.close();
  } catch {
    /* already closing */
  }
  if (!record || typeof record !== 'object') return [];
  if (!record.owner || record.owner !== owner) return [];
  return clampTranscript(record.messages);
}

/**
 * Persist `transcript` for `owner` on this device. An empty transcript, or no
 * owner, deletes the record rather than storing an empty one.
 */
export async function saveStoredHistory(owner, transcript, factory) {
  const clamped = clampTranscript(transcript);
  if (!owner || clamped.length === 0) return clearStoredHistory(factory);
  const db = await openDb(factory);
  if (!db) return false;
  const ok = await runTransaction(db, 'readwrite', (store) =>
    store.put({ owner, messages: clamped, updatedAt: Date.now() }, ASSISTANT_HISTORY_RECORD),
  );
  try {
    db.close();
  } catch {
    /* already closing */
  }
  return ok !== null;
}

/** Delete the stored transcript, whoever owns it. Backs the drawer's control. */
export async function clearStoredHistory(factory) {
  const db = await openDb(factory);
  if (!db) return false;
  await runTransaction(db, 'readwrite', (store) => store.delete(ASSISTANT_HISTORY_RECORD));
  try {
    db.close();
  } catch {
    /* already closing */
  }
  return true;
}
