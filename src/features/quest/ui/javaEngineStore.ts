// src/features/quest/ui/javaEngineStore.ts
//
// The page's one Java engine (#981), and when it is allowed to start.
//
// The engine is about 14 MB of download the first time. So nothing here runs
// until a code quest asks for it: walking the zone, talking to the quest-giver
// and "predict the output" quests never touch it. Once asked, it loads in the
// background while the student reads the task or carries on playing, and every
// screen that cares follows the same status.
//
// Even the small module that creates the worker is imported on demand, so the
// route's own chunk carries none of it.

import { useSyncExternalStore } from 'react';

import type { QuestRunner } from '../runner/attempt.ts';
import type { EngineStatus, JavaEngine } from '../runner/javaEngine.ts';

const IDLE: EngineStatus = { phase: 'idle' };

/** The engine's status, and whether it has been ready before on this page. */
export interface EngineView {
  readonly status: EngineStatus;
  /**
   * True once the engine has loaded. A later "loading" is then a restart, after
   * a runaway program was stopped: quick, from the browser's cache, and not the
   * first download over again.
   */
  readonly warm: boolean;
}

let view: EngineView = { status: IDLE, warm: false };
let engine: JavaEngine | null = null;
let creating: Promise<JavaEngine> | null = null;
const listeners = new Set<() => void>();

function publish(next: EngineStatus): void {
  view = { status: next, warm: view.warm || next.phase === 'ready' };
  for (const listener of listeners) listener();
}

function create(): Promise<JavaEngine> {
  if (creating) return creating;
  publish({ phase: 'loading', step: 'starting', done: 0, total: 0 });
  const attempt = import('../runner/createEngine.ts').then(({ createJavaEngine }) => {
    const created = createJavaEngine();
    engine = created;
    created.subscribe(publish);
    return created;
  });
  creating = attempt;
  attempt.catch(() => {
    // The chunk did not arrive. Forget the attempt so "Try again" can make one.
    if (creating === attempt) creating = null;
    publish({
      phase: 'failed',
      message: 'The Java engine could not be downloaded. Check your connection and try again.',
    });
  });
  return attempt;
}

/** Begin loading the engine, if it is not loaded or loading already. */
export function startJavaEngine(): void {
  create().then(
    // A failed load is reported through the status, which every screen shows.
    (created) => void created.load().catch(() => undefined),
    () => undefined,
  );
}

/** Stop the engine and free its memory. The next code quest starts it again. */
export function stopJavaEngine(): void {
  engine?.dispose();
}

/** Runs a quest's plan on the shared engine, loading it first if need be. */
export const javaRunner: QuestRunner = {
  run: async (plan, hooks) => {
    let created: JavaEngine;
    try {
      created = await create();
    } catch {
      return {
        kind: 'engineError',
        message: 'The Java engine could not be downloaded. Check your connection and try again.',
      };
    }
    return created.run(plan, hooks);
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useEngine(): EngineView {
  return useSyncExternalStore(subscribe, () => view);
}

/**
 * Whether the student has asked their browser to save data. If so the engine
 * waits for a tap instead of starting on its own: 14 MB is not ours to spend.
 */
export function prefersSmallDownloads(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}
