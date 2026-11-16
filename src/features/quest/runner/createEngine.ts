// src/features/quest/runner/createEngine.ts
//
// The one place a real Java engine is made (#981).
//
// Its worker is not created here. It runs in a frame served from another
// origin (the sandbox, worker/questSandbox.js), because the engine is
// third-party code that must not share an origin with a student's signed-in
// session. sandboxWorker.ts explains what that frame is and is not trusted
// with; javaEngine.ts drives it and does not know the difference.

import { JavaEngine } from './javaEngine.ts';
import { createSandboxWorker } from './sandboxWorker.ts';

/**
 * A Java engine whose worker lives at `sandboxUrl`. Nothing is downloaded, and
 * no frame is added to the page, until the engine is asked to load.
 */
export function createJavaEngine(sandboxUrl: string): JavaEngine {
  return new JavaEngine({ spawn: () => createSandboxWorker(sandboxUrl) });
}
