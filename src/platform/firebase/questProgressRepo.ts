// src/platform/firebase/questProgressRepo.ts
//
// The Firestore side of Shohoj Quest's progress (#981): one document per
// student, `questProgress/{uid}`, read and written in a single transaction.
//
// Its own collection rather than a slice of `users/{uid}.data`, so that a game
// save never passes through the calculator's cloud-sync engine and its conflict
// handling. firestore.rules lets a student read and write only their own
// document, and checks its shape.
//
// This file knows Firestore and nothing about quests. What to write is decided
// by the caller (src/features/quest/progress/cloudProgress.ts), which is pure
// and tested without Firebase. Like seatAlertRepo, the SDK is loaded on demand,
// so a student who never opens the game never pays for this.
//
// The document is self-study data. Nothing may read it as proof of anything.

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';

export const QUEST_PROGRESS_COLLECTION = 'questProgress';

export interface QuestProgressBackend {
  /**
   * Read the student's document and, in the same transaction, replace it with
   * what `decide` returns. `decide` is given the document's data, or
   * `undefined` when there is none, and returns `null` to leave it as it is.
   *
   * It can be called more than once if the transaction retries, so it must not
   * do anything but compute. The server's time is added as `updatedAt`.
   */
  transact(
    uid: string,
    decide: (existing: unknown) => Record<string, unknown> | null,
  ): Promise<void>;
}

export interface QuestProgressBackendOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
}

export async function createQuestProgressBackend(
  options: QuestProgressBackendOptions,
): Promise<QuestProgressBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(options.config, options.recaptchaV3SiteKey);
  const { getFirestore, doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore(app);
  return {
    async transact(uid, decide) {
      const ref = doc(db, QUEST_PROGRESS_COLLECTION, uid);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const next = decide(snapshot.exists() ? snapshot.data() : undefined);
        if (next) transaction.set(ref, { ...next, updatedAt: serverTimestamp() });
      });
    },
  };
}
