// src/features/quest/runner/createEngine.ts
//
// The one place a real Java worker is created (#981). Kept apart from
// javaEngine.ts because `new URL(..., import.meta.url)` is the bundler's cue to
// emit the worker as its own file, and that syntax means nothing to Node, where
// the engine's unit tests run.
//
// The worker is a classic one, not a module: CheerpJ is loaded with
// `importScripts`, which module workers do not have.

import { JavaEngine, type WorkerLike } from './javaEngine.ts';

/** A Java engine backed by a real worker. Nothing is downloaded until it is asked to load. */
export function createJavaEngine(): JavaEngine {
  return new JavaEngine({
    spawn: () =>
      new Worker(new URL('./javaWorker.ts', import.meta.url), {
        type: 'classic',
        name: 'shohoj-quest-java',
      }) as unknown as WorkerLike,
  });
}
