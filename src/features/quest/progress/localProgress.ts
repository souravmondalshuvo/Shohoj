// src/features/quest/progress/localProgress.ts
//
// Shohoj Quest's copy of a student's progress on their own device (#981), and
// the code they have typed but not finished.
//
// The device copy is what the game opens from. It is read at once, with no
// network, so the game resumes on a phone with a poor connection, and it is the
// only copy at all when the cloud cannot be reached.
//
// Both keys hold one student's data, so both are on the sign-out wipe lists
// (src/services/storage/personalData.ts and js/core/personalData.js). Each
// value also records whose it is. A copy left by someone else on a shared
// computer is ignored rather than shown to the next person.
//
// Storage can refuse: private browsing, a full disk, a disabled setting. Every
// read and write here survives that, and the game carries on in memory.

import type { KeyValueStore } from '../../../services/storage/keyValueStore.ts';
import { parseProgress, toStored, type Progress } from './progress.ts';

export const QUEST_PROGRESS_KEY = 'shohoj_quest_progress_v1';
export const QUEST_DRAFTS_KEY = 'shohoj_quest_drafts_v1';

function readJson(storage: KeyValueStore, key: string): Record<string, unknown> | null {
  try {
    const text = storage.getItem(key);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStore, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused. The game keeps what it has in memory.
  }
}

/** This student's progress on this device, or `null` if there is none to read. */
export function readLocalProgress(storage: KeyValueStore, uid: string): Progress | null {
  const saved = readJson(storage, QUEST_PROGRESS_KEY);
  if (!saved || saved['uid'] !== uid) return null;
  return parseProgress(saved['progress']);
}

export function writeLocalProgress(storage: KeyValueStore, uid: string, progress: Progress): void {
  writeJson(storage, QUEST_PROGRESS_KEY, { uid, progress: toStored(progress) });
}

// ── Unfinished code ─────────────────────────────────────────────────────────

/** What a student has typed for each quest, so a reload does not lose it. */
export interface DraftStore {
  get(questId: string): string | undefined;
  set(questId: string, text: string): void;
  /** Write anything still waiting, now. */
  flush(): void;
}

/** Keeps drafts for as long as the page is open. */
export function memoryDraftStore(): DraftStore {
  const drafts = new Map<string, string>();
  return {
    get: (questId) => drafts.get(questId),
    set: (questId, text) => {
      drafts.set(questId, text);
    },
    flush: () => undefined,
  };
}

/** A draft longer than this is not kept: no quest's answer comes near it. */
export const MAX_DRAFT_CHARS = 20_000;
/** How many quests' drafts are kept. The least recently edited go first. */
export const MAX_DRAFTS = 40;
/** How long after the last keystroke a draft is written. */
export const DRAFT_DELAY_MS = 600;

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface LocalDraftOptions {
  readonly storage: KeyValueStore;
  readonly uid: string;
  readonly timers?: Timers;
}

/**
 * Drafts kept on the device. They stay on the device: unfinished code is not
 * sent to the cloud, and it does not come back after a sign-out.
 */
export function createLocalDraftStore(options: LocalDraftOptions): DraftStore {
  const { storage, uid } = options;
  const timers = options.timers ?? realTimers;
  const drafts = new Map<string, string>();
  let pending: unknown = null;

  const saved = readJson(storage, QUEST_DRAFTS_KEY);
  const held = saved && saved['uid'] === uid ? saved['drafts'] : null;
  if (typeof held === 'object' && held !== null && !Array.isArray(held)) {
    for (const [questId, text] of Object.entries(held)) {
      if (typeof text === 'string' && text.length <= MAX_DRAFT_CHARS) drafts.set(questId, text);
    }
  }

  const write = () => {
    pending = null;
    writeJson(storage, QUEST_DRAFTS_KEY, { uid, drafts: Object.fromEntries(drafts) });
  };

  return {
    get: (questId) => drafts.get(questId),
    set(questId, text) {
      // Re-inserting moves the quest to the end: the map's order is the order
      // of last edit, which is what the cap below drops from the front of.
      drafts.delete(questId);
      if (text.length <= MAX_DRAFT_CHARS) drafts.set(questId, text);
      while (drafts.size > MAX_DRAFTS) {
        const oldest = drafts.keys().next().value;
        if (oldest === undefined) break;
        drafts.delete(oldest);
      }
      if (pending !== null) timers.clear(pending);
      pending = timers.set(write, DRAFT_DELAY_MS);
    },
    flush() {
      if (pending === null) return;
      timers.clear(pending);
      write();
    },
  };
}
