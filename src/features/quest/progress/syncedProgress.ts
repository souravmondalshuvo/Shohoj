// src/features/quest/progress/syncedProgress.ts
//
// The progress store the game uses when a student is signed in (#981): the
// device's copy, kept in step with the cloud's.
//
// The device comes first. `load` answers from the device without waiting, so
// the game opens at once on a slow connection, and every save is written to the
// device immediately. The cloud is caught up in the background:
//
//   on load          one sync, which also brings back quests solved elsewhere
//   a quest solved   a sync shortly after
//   the hero moved   a sync much later, since where the hero stands is cheap
//                    to lose and not worth a write per step
//   the page hiding  whatever is waiting, now
//
// The cloud failing never stops the game. A sync that cannot reach it, or that
// the rules refuse, leaves the device copy as the truth and is tried again the
// next time there is something to save.
//
// No React or Firebase here. Timers are passed in, so the unit tests decide
// when time passes.

import type { KeyValueStore } from '../../../services/storage/keyValueStore.ts';
import type { QuestProgressRepo } from './cloudProgress.ts';
import { readLocalProgress, realTimers, writeLocalProgress, type Timers } from './localProgress.ts';
import {
  cloudNeedsWrite,
  mergeProgress,
  sameProgress,
  sameSolved,
  type Progress,
  type ProgressStore,
} from './progress.ts';

/** How long after a quest is solved its sync starts. Long enough to batch a burst. */
export const SOLVED_DELAY_MS = 800;
/** How long after the hero moves a sync starts, if nothing sooner is waiting. */
export const MOVED_DELAY_MS = 30_000;

export interface SyncedProgressOptions {
  readonly uid: string;
  readonly storage: KeyValueStore;
  /** `null` when there is no cloud to reach: the device copy is all there is. */
  readonly repo: QuestProgressRepo | null;
  readonly timers?: Timers;
  /** The time in milliseconds. Only differences are used. */
  readonly now?: () => number;
}

export interface SyncedProgressStore extends Required<ProgressStore> {
  /**
   * Send what is waiting, then go quiet: nothing more is saved or written to
   * the device, and an answer still on its way from the cloud is dropped. Used
   * when the game closes or the student changes, so that a late answer cannot
   * put one student's progress back on a device that has just been wiped.
   */
  stop(): void;
  /** Undo `stop`. A store starts out started. */
  start(): void;
}

export function createSyncedProgressStore(options: SyncedProgressOptions): SyncedProgressStore {
  const { uid, storage, repo } = options;
  const timers = options.timers ?? realTimers;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(progress: Progress) => void>();

  let current: Progress | null = null;
  /** What the cloud is known to hold. `undefined` until a sync has succeeded. */
  let cloud: Progress | null | undefined;
  /** The cloud's copy could not be read. It is never written over. */
  let unreadable = false;
  let stopped = false;
  let running = false;
  let waiting: { readonly handle: unknown; readonly due: number } | null = null;

  const outOfStep = () => {
    if (!repo || unreadable || stopped) return false;
    // Nothing is known about the cloud yet: ask.
    if (cloud === undefined) return true;
    if (!current) return false;
    return cloudNeedsWrite(cloud, cloud ? mergeProgress(current, cloud) : current);
  };

  const sync = async () => {
    if (!repo || running || !outOfStep()) return;
    running = true;
    try {
      const outcome = await repo.sync(uid, current);
      if (stopped) return;
      if (outcome.kind === 'unreadable') {
        unreadable = true;
        return;
      }
      cloud = outcome.progress;
      if (cloud) {
        // The student may have solved something while this was in flight, so
        // the answer is merged into what is held now, not put in its place.
        const merged = current ? mergeProgress(current, cloud) : cloud;
        if (!sameProgress(merged, current)) {
          current = merged;
          writeLocalProgress(storage, uid, merged);
          for (const listener of listeners) listener(merged);
        }
      }
    } catch {
      // Offline, or refused. The device copy stands; the next save tries again.
    } finally {
      running = false;
    }
    // Something was saved while the sync ran, and it did not go with it.
    if (outOfStep() && cloud !== undefined) schedule(SOLVED_DELAY_MS);
  };

  function schedule(delay: number): void {
    if (!repo || unreadable || stopped) return;
    const due = now() + delay;
    // Keep whichever is sooner: a solve must not wait behind a step.
    if (waiting && waiting.due <= due) return;
    if (waiting) timers.clear(waiting.handle);
    const handle = timers.set(() => {
      waiting = null;
      void sync();
    }, delay);
    waiting = { handle, due };
  }

  const flush = () => {
    if (!waiting) return;
    timers.clear(waiting.handle);
    waiting = null;
    void sync();
  };

  return {
    load() {
      current = readLocalProgress(storage, uid);
      void sync();
      return Promise.resolve(current);
    },
    save(progress) {
      if (stopped) return;
      // A save is added to what is held, never put in its place. The caller
      // may be a moment behind: its copy can lack a quest that arrived from
      // the cloud after it last looked, and a solved quest is never dropped.
      const next = current ? mergeProgress(progress, current) : progress;
      if (sameProgress(next, current)) return;
      const solved = !sameSolved(next, current);
      current = next;
      writeLocalProgress(storage, uid, next);
      if (next !== progress) for (const listener of listeners) listener(next);
      if (outOfStep()) schedule(solved ? SOLVED_DELAY_MS : MOVED_DELAY_MS);
    },
    onRemote(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush,
    stop() {
      // The sync this starts has read `current` by the time `stopped` is set,
      // so what was waiting still reaches the cloud.
      flush();
      stopped = true;
    },
    start() {
      stopped = false;
      // Catch up on anything that could not go while stopped.
      void sync();
    },
  };
}
