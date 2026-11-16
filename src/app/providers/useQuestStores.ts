// src/app/providers/useQuestStores.ts
//
// Where Shohoj Quest keeps a signed-in student's progress and unfinished code
// (#981): on their device, and for progress, in Firestore as well.
//
// The cloud is resolved the way the seat-alert sync resolves it: an e2e seam on
// window, else a repo built from the runtime config, else nothing. With nothing,
// the game still saves to the device. The Firebase SDK is not loaded here; the
// repo loads it on its first sync, so opening the route costs no Firestore code
// until the game has something to say to it.

import { useEffect, useMemo } from 'react';

import { useAuth } from './AuthProvider';
import { useRuntimeConfig } from './RuntimeConfigProvider';
import {
  createQuestProgressRepo,
  type QuestProgressRepo,
} from '../../features/quest/progress/cloudProgress';
import {
  createLocalDraftStore,
  memoryDraftStore,
  type DraftStore,
} from '../../features/quest/progress/localProgress';
import { memoryProgressStore, type ProgressStore } from '../../features/quest/progress/progress';
import { createSyncedProgressStore } from '../../features/quest/progress/syncedProgress';
import { MemoryKeyValueStore, type KeyValueStore } from '../../services/storage/keyValueStore';

declare global {
  interface Window {
    /** e2e seam: a stand-in for the cloud's copy of quest progress. */
    __shohojQuestProgressRepo?: QuestProgressRepo;
  }
}

export interface QuestStores {
  readonly store: ProgressStore;
  readonly drafts: DraftStore;
}

/** The browser's storage, or a stand-in when it is switched off. */
function deviceStorage(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return new MemoryKeyValueStore();
  }
}

export function useQuestStores(): QuestStores {
  const config = useRuntimeConfig();
  const { uid } = useAuth();

  const built = useMemo(() => {
    // The route is behind sign-in, so there is a uid. Without one, nothing is
    // kept past the visit: there is nobody to keep it for.
    if (!uid) return { store: memoryProgressStore(), drafts: memoryDraftStore(), synced: null };

    const repo: QuestProgressRepo | null = window.__shohojQuestProgressRepo
      ? window.__shohojQuestProgressRepo
      : config
        ? createQuestProgressRepo(async () => {
            const { createQuestProgressBackend } =
              await import('../../platform/firebase/questProgressRepo');
            return createQuestProgressBackend({
              config: config.firebase,
              ...(config.recaptchaV3SiteKey
                ? { recaptchaV3SiteKey: config.recaptchaV3SiteKey }
                : {}),
            });
          })
        : null;

    const storage = deviceStorage();
    const store = createSyncedProgressStore({ uid, storage, repo });
    const drafts = createLocalDraftStore({ uid, storage });
    return { store, drafts, synced: store };
  }, [uid, config]);

  // Started and stopped by an effect, not by creation: in development React
  // runs every effect twice, and a store stopped for good by the first
  // clean-up would be dead for the visit.
  useEffect(() => {
    const { synced, drafts } = built;
    if (!synced) return undefined;
    synced.start();
    return () => {
      drafts.flush();
      synced.stop();
    };
  }, [built]);

  return built;
}
