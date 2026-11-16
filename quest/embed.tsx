// quest/embed.tsx
//
// Shohoj Quest (#981) as something the legacy site can mount, built by
// vite.pages.config.js to the stable address quest/embed.js. The legacy page
// imports it on demand when its Quest tab is opened (js/ui/questTab.js), so a
// student plays on the page they are already on, the way the Campus Map tab
// works (campus/embed.tsx). The shell's /app/quest route mounts the same
// screen; this is the same game with the host's session instead of the shell's.
//
// What a host page forces:
//
//   - The host has the session. It says who is signed in, and it reaches
//     Firestore through its own Firebase (the legacy site loads its SDK from
//     gstatic, and a second copy here would be a second sign-in to keep in
//     step). So the host hands in the one operation the cloud copy needs:
//     read questProgress/{uid}, decide, write, in one transaction.
//   - The host says where the Java engine's page is. It must be on another
//     origin (worker/questSandbox.js explains why); the host checks that.
//   - There is no router. The way out of the game is the host's to give.
//
// The screen is loaded lazily, after this module, so that Vite attaches the
// game's stylesheet to it: a module entry's own CSS is not put on any page.

import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import {
  createQuestProgressRepo,
  type QuestProgressRepo,
} from '../src/features/quest/progress/cloudProgress';
import { createLocalDraftStore } from '../src/features/quest/progress/localProgress';
import { createSyncedProgressStore } from '../src/features/quest/progress/syncedProgress';
import type { QuestProgressBackend } from '../src/platform/firebase/questProgressRepo';
import { MemoryKeyValueStore, type KeyValueStore } from '../src/services/storage/keyValueStore';

const QuestScreen = lazy(() =>
  import('../src/features/quest/ui/QuestScreen').then((module) => ({
    default: module.QuestScreen,
  })),
);

export interface QuestMountOptions {
  /** Who is signed in. Progress and drafts on the device are kept under it. */
  readonly uid: string;
  /** The Java engine's page, on an origin other than the host's; `null` if none. */
  readonly javaSandboxUrl?: string | null;
  /**
   * questProgress/{uid} in one transaction, as the host's Firebase does it.
   * Without it, progress is kept on the device only.
   */
  readonly transact?: QuestProgressBackend['transact'] | null;
  /** Close the game. Called when the student presses "← Shohoj". */
  readonly onLeave: () => void;
}

/** The browser's storage, or a stand-in when it is switched off. */
function deviceStorage(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return new MemoryKeyValueStore();
  }
}

/**
 * Mount Shohoj Quest. It draws over the whole page (the screen renders under
 * <body>), so `container` only holds React's root. Returns the function that
 * takes the game down again: unsaved code is written to the device and the
 * cloud sync stops, so nothing arrives for a student who has signed out.
 */
export function mountQuest(container: HTMLElement, options: QuestMountOptions): () => void {
  const { transact } = options;
  const repo: QuestProgressRepo | null = transact
    ? createQuestProgressRepo(async () => ({ transact }))
    : null;
  const storage = deviceStorage();
  const store = createSyncedProgressStore({ uid: options.uid, storage, repo });
  const drafts = createLocalDraftStore({ uid: options.uid, storage });

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Suspense fallback={null}>
        <QuestScreen
          store={store}
          drafts={drafts}
          javaSandboxUrl={options.javaSandboxUrl ?? null}
          onLeave={options.onLeave}
        />
      </Suspense>
    </StrictMode>,
  );
  return () => {
    drafts.flush();
    store.stop();
    root.unmount();
  };
}
