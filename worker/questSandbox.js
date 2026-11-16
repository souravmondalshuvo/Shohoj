// worker/questSandbox.js
//
// The page Shohoj Quest's Java engine runs in (#981), served from this Worker's
// origin so that it is NOT the site's origin.
//
// Why it exists. The engine is CheerpJ: third-party code from its own CDN,
// which cannot carry an integrity hash. A Web Worker on the site's own origin
// keeps student code off the page, but it does not contain the engine: such a
// worker can open the site's IndexedDB, where Firebase keeps the signed-in
// session, and no Content-Security-Policy governs it. A compromised CheerpJ
// CDN would have been a compromised account.
//
// So the engine runs here instead, in a frame the game embeds:
//
//   the game (github.io)  →  <iframe> this page (workers.dev)  →  its Worker
//
// and three things hold it:
//
//   * A different origin. Storage here is this origin's, and holds nothing:
//     this Worker authenticates with bearer tokens the client sends, never
//     cookies, so code running on this origin has no authority of its own.
//   * A policy on the engine's worker, sent as a header with its script. It
//     may load script from CheerpJ's CDN and connect to CheerpJ's CDN, and
//     nothing else. Not this Worker's own API, not anywhere to send data to.
//   * The frame's sandbox attribute, set by the game: scripts and its own
//     origin, and no navigation of the top window, popups or forms.
//
// An opaque-origin sandbox would be simpler and needs no second origin, and it
// does not work: CheerpJ needs IndexedDB for the class files javac writes.
//
// Nothing a student types is sent to this Worker. It serves three small static
// files; the code travels from the game to the frame inside the browser.
//
// The two scripts are written as ordinary functions and sent as their own
// source text, so they are linted, and the unit tests call them directly with
// a stand-in for the browser. That is also why each is self-contained: a
// function turned into text takes nothing from the file around it.

export const QUEST_SANDBOX_PATH = '/quest-sandbox/';

/** Where the engine is allowed to load script from, and to connect to. */
export const CHEERPJ_ORIGIN = 'https://cjrtnc.leaningtech.com';

/**
 * The engine's worker. Speaks the protocol in
 * src/features/quest/runner/javaEngine.ts (WorkerRequest, WorkerMessage) over
 * a MessagePort the frame hands it, so the game talks to it directly.
 */
export function sandboxWorkerMain(scope) {
  const CDN = 'https://cjrtnc.leaningtech.com/';
  const STORAGE_BLOCKED =
    'This browser is blocking storage for embedded pages, which the Java engine needs. ' +
    'Allow third-party cookies for this site, or use a normal window instead of a private one.';
  let port = null;

  // CheerpJ writes Java's standard output and error through the console when
  // there is no page to draw on. Forward all of it; the game sorts protocol
  // lines from noise.
  const forward = (...parts) => {
    if (port) port.postMessage({ type: 'out', text: parts.map(String).join(' ') });
  };
  scope.console.log = forward;
  scope.console.info = forward;
  scope.console.warn = forward;
  scope.console.error = forward;

  // CheerpJ keeps the files javac writes in IndexedDB. Where a browser denies
  // storage to embedded pages the compile would hang for ever, so look first
  // and say so in words instead.
  const storageWorks = () =>
    new Promise((resolve) => {
      try {
        const request = scope.indexedDB.open('shohoj-quest-probe', 1);
        request.onsuccess = () => {
          request.result.close();
          resolve(true);
        };
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(true);
      } catch {
        resolve(false);
      }
    });

  async function handle(request) {
    switch (request.cmd) {
      case 'init': {
        // Whatever page embeds this, the only thing loaded is CheerpJ.
        const loader = String(request.loaderUrl || '');
        if (!loader.startsWith(CDN)) throw new Error('The Java engine can only be loaded from its own CDN.');
        if (!(await storageWorks())) throw new Error(STORAGE_BLOCKED);
        scope.importScripts(loader);
        const options = { ...request.options };
        if (options.preloadResources) {
          options.preloadProgress = (done, total) => {
            port.postMessage({ type: 'progress', done, total });
          };
        }
        await scope.cheerpjInit(options);
        return null;
      }
      case 'write':
        for (const file of request.files || []) scope.cheerpOSAddStringFile(file.path, file.content);
        return null;
      case 'main':
        return scope.cheerpjRunMain(
          request.className || '',
          request.classPath || '',
          ...(request.args || []),
        );
      case 'resources':
        return scope.cjGetRuntimeResources();
      default:
        throw new Error('unknown command');
    }
  }

  const answer = (request) => {
    handle(request).then(
      (value) => port.postMessage({ type: 'reply', id: request.id, ok: true, value }),
      (error) =>
        port.postMessage({
          type: 'reply',
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
  };

  // The first message is the frame handing over the port. Everything after
  // that arrives on the port, from the game.
  scope.onmessage = (event) => {
    if (port || !event.data || !event.data.port) return;
    port = event.data.port;
    port.onmessage = (message) => answer(message.data);
  };
}

/**
 * The frame's page script. It starts the worker and hands the game one end of
 * a channel to it, then has nothing more to do: it never sees a student's code.
 */
export function sandboxFrameMain(scope) {
  // Opened on its own, not embedded: there is nobody to talk to.
  if (scope.parent === scope) return;
  // '*' because the page cannot know which allowed site embedded it. What it
  // hands over is only the ability to run Java here, and the frame-ancestors
  // header already decides who may embed it at all.
  const tell = (message, transfer) => scope.parent.postMessage(message, '*', transfer || []);
  let worker;
  try {
    worker = new scope.Worker('worker.js', { name: 'shohoj-quest-java' });
  } catch {
    tell({ shohojQuestSandbox: 'error', message: 'The Java engine could not be started.' });
    return;
  }
  worker.onerror = (event) =>
    tell({
      shohojQuestSandbox: 'error',
      message: event && event.message ? `The Java engine failed: ${event.message}` : 'The Java engine failed.',
    });
  const channel = new scope.MessageChannel();
  worker.postMessage({ port: channel.port1 }, [channel.port1]);
  tell({ shohojQuestSandbox: 'ready' }, [channel.port2]);
}

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Shohoj Quest: Java engine</title>
  </head>
  <body>
    <script src="frame.js"></script>
  </body>
</html>
`;

// A function's text is whatever the bundler left of it. Wrangler keeps function
// names by wrapping them in a helper called __name, which lives in the bundle
// and not in the text sent to the browser, so each script carries its own.
const asScript = (main) =>
  `"use strict";\nconst __name = (value) => value;\n(${main.toString()})(self);\n`;

const FILES = {
  '': { type: 'text/html; charset=utf-8', body: PAGE },
  'frame.js': { type: 'text/javascript; charset=utf-8', body: asScript(sandboxFrameMain) },
  'worker.js': { type: 'text/javascript; charset=utf-8', body: asScript(sandboxWorkerMain) },
};

/** The sites allowed to embed the sandbox: the ones allowed to call this Worker. */
export function sandboxAncestors(env) {
  const origins = String((env && env.ALLOWED_ORIGINS) || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[^\s;,'"]+$/.test(origin));
  return origins.length > 0 ? origins.join(' ') : "'none'";
}

/** The policy each file is served with. The worker's is what holds the engine. */
export function sandboxPolicy(file, env) {
  if (file === 'worker.js') {
    // The engine turns Java into JavaScript and WebAssembly as it runs, hence
    // the two eval sources. They are granted to this worker only, on this
    // origin only.
    return `default-src 'none'; script-src 'self' ${CHEERPJ_ORIGIN} 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${CHEERPJ_ORIGIN}`;
  }
  if (file === '') {
    return `default-src 'none'; script-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${sandboxAncestors(env)}`;
  }
  return "default-src 'none'";
}

/**
 * Answer a request for one of the sandbox's files, or `null` if the request is
 * for something else. Public and unauthenticated: three static files that are
 * the same for everyone.
 */
export function questSandboxResponse(request, env, url) {
  const base = QUEST_SANDBOX_PATH.slice(0, -1);
  if (url.pathname !== base && !url.pathname.startsWith(QUEST_SANDBOX_PATH)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  // The page's script paths are relative, so it has to be reached with the slash.
  if (url.pathname === base) {
    return new Response(null, { status: 308, headers: { Location: QUEST_SANDBOX_PATH } });
  }
  const name = url.pathname.slice(QUEST_SANDBOX_PATH.length);
  const file = Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : null;
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : file.body, {
    status: 200,
    headers: {
      'Content-Type': file.type,
      'Content-Security-Policy': sandboxPolicy(name, env),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Short, so a fix to the sandbox reaches students within minutes.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
