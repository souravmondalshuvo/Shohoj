// src/features/quest/runner/javaWorker.ts
//
// The Web Worker that hosts the Java engine for Shohoj Quest (#981).
//
// Student code runs here and nowhere else. A worker is the isolation that makes
// an infinite loop survivable: the page ends it with `worker.terminate()` and
// the game, on the main thread, never notices. A same-origin iframe would share
// that thread and freeze with the loop.
//
// This file is deliberately dumb. It loads CheerpJ, writes files, runs a main
// class and forwards what Java prints. Everything that decides anything (what
// to compile, when time is up, what a result means) lives on the page in
// javaEngine.ts, where it can be unit-tested without a JVM.
//
// What this worker is, for security review:
//   * It loads and runs third-party code from CheerpJ's CDN. There is no SRI:
//     the loader fetches its runtime dynamically, and the Community licence
//     requires the CDN, so the runtime cannot be pinned or self-hosted.
//   * The page's <meta> CSP does not apply inside a worker loaded from a URL;
//     a worker takes its policy from its own response headers, and GitHub
//     Pages sends none. So the page's CSP needed no edit, and nothing governs
//     what runs here or where it connects.
//   * It is given source text and returns text. The page never sends it an
//     auth token, and nothing it returns is trusted: grading is self-study
//     feedback. That protects the page from student code.
//   * It does NOT sandbox the engine. This worker has the site's origin. It
//     has no DOM and no localStorage, but it can open the origin's IndexedDB,
//     where Firebase Auth keeps the signed-in session. A compromised CheerpJ
//     CDN is therefore a compromised account for any student who runs code.
//     Isolating it needs a second origin; an opaque-origin sandboxed iframe
//     does not work, because CheerpJ needs IndexedDB to compile. See
//     docs/SECURITY.md, "Shohoj Quest".
//
// It must stay a classic worker with no imports. `importScripts`, which is how
// CheerpJ is loaded, does not exist in a module worker, and a file with imports
// cannot be served as a classic worker in development. Hence the one enclosing
// function and the message shapes repeated from javaEngine.ts.

(() => {
  interface Request {
    readonly id: number;
    readonly cmd: 'init' | 'write' | 'main' | 'resources';
    readonly loaderUrl?: string;
    readonly options?: Record<string, unknown>;
    readonly files?: readonly { readonly path: string; readonly content: string }[];
    readonly className?: string;
    readonly classPath?: string;
    readonly args?: readonly string[];
  }

  interface Scope {
    onmessage: ((event: { data: Request }) => void) | null;
    postMessage(message: unknown): void;
    importScripts(...urls: string[]): void;
    cheerpjInit(options: Record<string, unknown>): Promise<void>;
    cheerpjRunMain(className: string, classPath: string, ...args: string[]): Promise<number>;
    cheerpOSAddStringFile(path: string, content: string): void;
    cjGetRuntimeResources(): string;
  }

  const scope = self as unknown as Scope;

  // CheerpJ writes Java's standard output and error through the console when
  // there is no page to draw on. Forward all of it; the page sorts protocol
  // lines from noise.
  const forward = (...parts: unknown[]) => {
    scope.postMessage({ type: 'out', text: parts.map(String).join(' ') });
  };
  console.log = forward;
  console.info = forward;
  console.warn = forward;
  console.error = forward;

  async function handle(request: Request): Promise<unknown> {
    switch (request.cmd) {
      case 'init': {
        scope.importScripts(request.loaderUrl ?? '');
        const options: Record<string, unknown> = { ...request.options };
        if (options['preloadResources']) {
          options['preloadProgress'] = (done: number, total: number) => {
            scope.postMessage({ type: 'progress', done, total });
          };
        }
        await scope.cheerpjInit(options);
        return null;
      }
      case 'write':
        for (const file of request.files ?? [])
          scope.cheerpOSAddStringFile(file.path, file.content);
        return null;
      case 'main':
        return scope.cheerpjRunMain(
          request.className ?? '',
          request.classPath ?? '',
          ...(request.args ?? []),
        );
      case 'resources':
        return scope.cjGetRuntimeResources();
      default:
        throw new Error('unknown command');
    }
  }

  scope.onmessage = (event) => {
    const request = event.data;
    handle(request).then(
      (value) => scope.postMessage({ type: 'reply', id: request.id, ok: true, value }),
      (error: unknown) =>
        scope.postMessage({
          type: 'reply',
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
  };
})();
