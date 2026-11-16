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
// The engine does not run on this page's origin. It runs in a frame served
// from the sandbox (worker/questSandbox.js), and this module has to be told
// where that is before anything can start. With no sandbox there is no Java:
// the engine is never started on this origin as a fallback, because that is
// the exposure the sandbox exists to remove.
//
// Even the small module that creates the engine is imported on demand, so the
// route's own chunk carries none of it.

import { useSyncExternalStore } from 'react';

import type { QuestRunner } from '../runner/attempt.ts';
import type { EngineStatus, JavaEngine } from '../runner/javaEngine.ts';

declare global {
  interface Window {
    /**
     * e2e seam: something to run a quest's plan in place of the Java engine.
     * With it set, nothing is downloaded from CheerpJ's CDN and no worker is
     * started. Everything around the engine still runs as it ships: the rules
     * check, the harness, the grader and the screen.
     *
     * It is not a security boundary, and does not need to be one. Grading runs
     * in the student's browser either way, which is why progress is self-study
     * data that nothing may trust.
     */
    __shohojQuestRunner?: QuestRunner;
  }
}

const standIn = (): QuestRunner | undefined =>
  typeof window === 'undefined' ? undefined : window.__shohojQuestRunner;

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

const NO_SANDBOX = 'Running Java is not set up on this copy of Shohoj, so code cannot be run here.';
const NOT_DOWNLOADED =
  'The Java engine could not be downloaded. Check your connection and try again.';

let view: EngineView = { status: IDLE, warm: false };
let engine: JavaEngine | null = null;
let creating: Promise<JavaEngine> | null = null;
let sandboxUrl: string | null = null;
const listeners = new Set<() => void>();

/**
 * Say where the engine's sandbox is: a page on an origin other than this one.
 * `null` means there is none, and code quests then say so instead of running.
 */
export function configureJavaEngine(url: string | null): void {
  if (url === sandboxUrl) return;
  // An engine already made for another address is stopped and forgotten.
  engine?.dispose();
  engine = null;
  creating = null;
  sandboxUrl = url;
  view = { status: IDLE, warm: false };
  for (const listener of listeners) listener();
}

function publish(next: EngineStatus): void {
  view = { status: next, warm: view.warm || next.phase === 'ready' };
  for (const listener of listeners) listener();
}

class NoSandbox extends Error {}

function create(): Promise<JavaEngine> {
  if (creating) return creating;
  const url = sandboxUrl;
  if (url === null) {
    publish({ phase: 'failed', message: NO_SANDBOX });
    return Promise.reject(new NoSandbox(NO_SANDBOX));
  }
  publish({ phase: 'loading', step: 'starting', done: 0, total: 0 });
  const attempt = import('../runner/createEngine.ts').then(({ createJavaEngine }) => {
    const created = createJavaEngine(url);
    // The sandbox was changed while the chunk loaded: this engine is not wanted.
    if (creating !== attempt) return created;
    engine = created;
    created.subscribe(publish);
    return created;
  });
  creating = attempt;
  attempt.catch(() => {
    // The chunk did not arrive. Forget the attempt so "Try again" can make one.
    if (creating !== attempt) return;
    creating = null;
    publish({ phase: 'failed', message: NOT_DOWNLOADED });
  });
  return attempt;
}

/** Begin loading the engine, if it is not loaded or loading already. */
export function startJavaEngine(): void {
  if (standIn()) return;
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
    const substitute = standIn();
    if (substitute) return substitute.run(plan, hooks);
    let created: JavaEngine;
    try {
      created = await create();
    } catch (error) {
      return {
        kind: 'engineError',
        message: error instanceof NoSandbox ? NO_SANDBOX : NOT_DOWNLOADED,
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
