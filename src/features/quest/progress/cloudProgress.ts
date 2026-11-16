// src/features/quest/progress/cloudProgress.ts
//
// Keeping a student's Shohoj Quest progress in the cloud (#981), so that it
// follows them from a phone to a laptop and comes back after a sign-out wipes
// the device.
//
// One operation does everything: read the cloud's copy, put it together with
// this device's, and write the result back if it adds anything, all inside one
// transaction. Two devices syncing at the same moment therefore cannot lose
// each other's solved quests, and there is never a moment when a stale copy is
// written over a newer one.
//
// A copy this build cannot read is left exactly as it is. It may have been
// written by a newer version of the game, and overwriting it with what an older
// one understands would destroy it.
//
// Pure apart from the backend it is handed, so the unit tests run it against a
// fake with no Firebase.

import type { QuestProgressBackend } from '../../../platform/firebase/questProgressRepo.ts';
import {
  cloudNeedsWrite,
  mergeProgress,
  parseProgress,
  toStored,
  type Progress,
} from './progress.ts';

export type SyncOutcome =
  /** Done. `progress` is what the cloud holds now, or `null` if it holds nothing. */
  | { readonly kind: 'ok'; readonly progress: Progress | null }
  /** The cloud has a copy this build cannot read. Nothing was written. */
  | { readonly kind: 'unreadable' };

export interface QuestProgressRepo {
  /**
   * Bring the cloud's copy and this device's together. `local` is `null` when
   * the device has nothing yet. Rejects if the cloud cannot be reached.
   */
  sync(uid: string, local: Progress | null): Promise<SyncOutcome>;
}

export function createQuestProgressRepo(
  loadBackend: () => Promise<QuestProgressBackend>,
): QuestProgressRepo {
  let backend: Promise<QuestProgressBackend> | null = null;
  return {
    async sync(uid, local) {
      // A failed load must not be remembered, or the next sync could not retry.
      backend ??= loadBackend().catch((error: unknown) => {
        backend = null;
        throw error;
      });
      let outcome: SyncOutcome = { kind: 'ok', progress: null };
      await (
        await backend
      ).transact(uid, (existing) => {
        if (existing === undefined) {
          const write = local !== null && cloudNeedsWrite(null, local);
          outcome = { kind: 'ok', progress: write ? local : null };
          return write ? { ...toStored(local) } : null;
        }
        const cloud = parseProgress(existing);
        if (!cloud) {
          outcome = { kind: 'unreadable' };
          return null;
        }
        const merged = local ? mergeProgress(local, cloud) : cloud;
        const write = cloudNeedsWrite(cloud, merged);
        outcome = { kind: 'ok', progress: write ? merged : cloud };
        return write ? { ...toStored(merged) } : null;
      });
      return outcome;
    },
  };
}
