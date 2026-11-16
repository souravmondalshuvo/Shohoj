// src/features/quest/runner/sandboxWorker.ts
//
// The Java engine's worker, reached through a frame on another origin (#981).
//
// The engine is CheerpJ: third-party code that cannot carry an integrity hash.
// A worker on the site's own origin kept student code off the page but did not
// contain the engine, because such a worker can open the site's IndexedDB,
// where the signed-in session is kept. So the worker now lives in a page served
// from a different origin (worker/questSandbox.js), embedded here in a hidden,
// sandboxed frame. From there it can reach nothing of the site's.
//
// To the engine (javaEngine.ts) nothing has changed. This is still something
// with `postMessage`, `terminate`, `onmessage` and `onerror`:
//
//   postMessage   goes straight to the engine's worker, over a MessagePort the
//                 frame hands over when it is ready. Anything sent sooner waits.
//   terminate     removes the frame. The browser destroys the page and its
//                 worker with it, which the code inside cannot refuse: this is
//                 how an endless loop is stopped.
//
// The frame is trusted with nothing. It is given source text and returns text,
// and only two messages are ever accepted from it, both checked for where they
// came from: "ready", with the port, and "error".
//
// The browser is passed in rather than reached for, so the unit tests run this
// in Node against a stand-in.

import type { WorkerLike, WorkerMessage, WorkerRequest } from './javaEngine.ts';

/** How long the frame has to say it is ready before the engine is judged unreachable. */
export const SANDBOX_START_LIMIT_MS = 20_000;

/** What the frame is allowed to do: run script, and keep its own (other) origin. */
export const SANDBOX_PERMISSIONS = 'allow-scripts allow-same-origin';

export interface SandboxPort {
  postMessage(message: WorkerRequest): void;
  close(): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

export interface SandboxMessage {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
  readonly ports: readonly SandboxPort[];
}

/** The parts of the browser this needs. */
export interface SandboxBrowser {
  /** Add the hidden frame to the page. `window` is what its messages come from. */
  addFrame(url: string): { readonly window: unknown; remove(): void };
  /** Listen for messages to this page. Returns the function that stops listening. */
  listen(listener: (message: SandboxMessage) => void): () => void;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

function realBrowser(): SandboxBrowser {
  return {
    addFrame(url) {
      const frame = document.createElement('iframe');
      // No allow-top-navigation, popups or forms: whatever runs inside cannot
      // send the student anywhere. allow-same-origin lets the frame keep its
      // OWN origin, which is the other one; it grants nothing of this page's.
      frame.setAttribute('sandbox', SANDBOX_PERMISSIONS);
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('allow', '');
      frame.tabIndex = -1;
      frame.title = 'Java engine';
      frame.hidden = true;
      frame.style.display = 'none';
      frame.src = url;
      document.body.append(frame);
      return {
        get window() {
          return frame.contentWindow;
        },
        remove: () => frame.remove(),
      };
    },
    listen(listener) {
      const onMessage = (event: MessageEvent) =>
        listener({
          source: event.source,
          origin: event.origin,
          data: event.data,
          ports: event.ports as unknown as readonly SandboxPort[],
        });
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    },
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
  };
}

const NOT_ANSWERING = 'The Java engine could not be reached. Check your connection and try again.';

/**
 * Start the engine's worker in a sandboxed frame at `url`, which must be on an
 * origin other than this page's. Returns at once; messages posted before the
 * frame is ready are sent when it is.
 */
export function createSandboxWorker(
  url: string,
  browser: SandboxBrowser = realBrowser(),
): WorkerLike {
  const origin = new URL(url).origin;
  let port: SandboxPort | null = null;
  let over = false;
  const waiting: WorkerRequest[] = [];

  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (over) return;
      if (port) port.postMessage(message);
      else waiting.push(message);
    },
    terminate() {
      if (over) return;
      over = true;
      browser.clearTimer(timer);
      stopListening();
      port?.close();
      frame.remove();
    },
  };

  const fail = (message: string) => {
    if (!over) worker.onerror?.({ message });
  };

  const frame = browser.addFrame(url);
  const timer = browser.setTimer(() => {
    if (!port) fail(NOT_ANSWERING);
  }, SANDBOX_START_LIMIT_MS);

  const stopListening = browser.listen((message) => {
    // Only this frame, and only while it is still on the origin it was given.
    if (over || message.source !== frame.window || message.origin !== origin) return;
    const data = message.data as {
      readonly shohojQuestSandbox?: unknown;
      readonly message?: unknown;
    };
    if (typeof data !== 'object' || data === null) return;

    if (data.shohojQuestSandbox === 'ready') {
      const handed = message.ports[0];
      if (port || !handed) return;
      port = handed;
      browser.clearTimer(timer);
      port.onmessage = (event) => worker.onmessage?.({ data: event.data as WorkerMessage });
      for (const queued of waiting.splice(0)) port.postMessage(queued);
    } else if (data.shohojQuestSandbox === 'error') {
      fail(typeof data.message === 'string' ? data.message : 'The Java engine failed.');
    }
  });

  return worker;
}
