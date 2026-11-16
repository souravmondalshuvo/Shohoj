// tests/questSandbox.test.js — where Shohoj Quest's Java engine runs (#981).
//
// The engine is third-party code that cannot be integrity-checked, so it must
// not share an origin with a student's signed-in session. It runs in a frame
// served by the Worker, on the Worker's origin. Two halves, both tested here
// without a browser:
//
//   worker/questSandbox.js                       what the Worker serves, and
//                                                the policy it serves it with
//   src/features/quest/runner/sandboxWorker.ts   how the game reaches the frame
//
// The same thing in a real browser, under the real CSP, is
// e2e-shell/quest-sandbox.spec.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { QUEST_SANDBOX_URL } from '../e2e-support/questSandbox.js';
import { CHEERPJ_LOADER_URL } from '../src/features/quest/runner/cheerpj.ts';
import {
  SANDBOX_PERMISSIONS,
  SANDBOX_START_LIMIT_MS,
  createSandboxWorker,
} from '../src/features/quest/runner/sandboxWorker.ts';
import {
  CHEERPJ_ORIGIN,
  QUEST_SANDBOX_PATH,
  questSandboxResponse,
  sandboxAncestors,
  sandboxFrameMain,
  sandboxPolicy,
  sandboxWorkerMain,
} from '../worker/questSandbox.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = 'https://souravmondalshuvo.github.io';
const ENV = { ALLOWED_ORIGINS: `${SITE},http://localhost:5173` };

const get = (pathname, { method = 'GET', env = ENV } = {}) => {
  const url = new URL(`https://worker.example${pathname}`);
  return questSandboxResponse(new Request(url, { method }), env, url);
};

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

// ── What the Worker serves ──────────────────────────────────────────────────

test('the sandbox is three files, and nothing else under its path', async () => {
  assert.equal(get(QUEST_SANDBOX_PATH).status, 200);
  assert.equal(get(`${QUEST_SANDBOX_PATH}frame.js`).status, 200);
  assert.equal(get(`${QUEST_SANDBOX_PATH}worker.js`).status, 200);
  assert.equal(get(`${QUEST_SANDBOX_PATH}other.js`).status, 404);
  assert.equal(get(`${QUEST_SANDBOX_PATH}constructor`).status, 404);
  // A path that climbs out is not the sandbox's: URLs are normalised first.
  assert.equal(get(`${QUEST_SANDBOX_PATH}../health`), null);
  assert.equal(get('/health'), null, 'other paths are left to the Worker');
  assert.equal(get('/quest-sandboxes'), null);
  assert.match(await get(QUEST_SANDBOX_PATH).text(), /<script src="frame\.js"><\/script>/);
});

test('the page is reached with its slash, because its script paths are relative', () => {
  const redirect = get('/quest-sandbox');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), QUEST_SANDBOX_PATH);
});

test('it is read-only: GET and HEAD, nothing else', async () => {
  assert.equal(get(QUEST_SANDBOX_PATH, { method: 'POST' }).status, 405);
  assert.equal(get(`${QUEST_SANDBOX_PATH}worker.js`, { method: 'DELETE' }).status, 405);
  const head = get(QUEST_SANDBOX_PATH, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('the page may be embedded only by the sites allowed to use the Worker', () => {
  const policy = get(QUEST_SANDBOX_PATH).headers.get('content-security-policy');
  assert.match(policy, /frame-ancestors https:\/\/souravmondalshuvo\.github\.io http:\/\/localhost:5173$/);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /worker-src 'self'/);
  // No inline script anywhere: the page's policy would refuse it.
  assert.doesNotMatch(policy, /unsafe-inline/);
});

test('with no allowed sites configured, nobody may embed it', () => {
  assert.equal(sandboxAncestors({}), "'none'");
  assert.equal(sandboxAncestors(undefined), "'none'");
  assert.match(sandboxPolicy('', { ALLOWED_ORIGINS: ' , ' }), /frame-ancestors 'none'$/);
});

test('a malformed allowed-origins value cannot smuggle a directive into the policy', () => {
  const ancestors = sandboxAncestors({
    ALLOWED_ORIGINS: "https://ok.example, https://evil.example; script-src *, 'unsafe-inline', javascript:alert(1)",
  });
  assert.equal(ancestors, 'https://ok.example');
});

test("the engine's worker may load and reach CheerpJ's CDN, and nothing else", () => {
  const policy = get(`${QUEST_SANDBOX_PATH}worker.js`).headers.get('content-security-policy');
  assert.equal(
    policy,
    `default-src 'none'; script-src 'self' ${CHEERPJ_ORIGIN} 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${CHEERPJ_ORIGIN}`,
  );
  // connect-src has no 'self': the engine cannot call this Worker's API either.
  assert.doesNotMatch(policy.split('connect-src')[1], /'self'|\*/);
  // The loader the game asks for is on that origin.
  assert.equal(new URL(CHEERPJ_LOADER_URL).origin, CHEERPJ_ORIGIN);
});

test('every file is served typed, unsniffable and briefly cached', () => {
  for (const name of ['', 'frame.js', 'worker.js']) {
    const headers = get(QUEST_SANDBOX_PATH + name).headers;
    assert.equal(headers.get('x-content-type-options'), 'nosniff', name);
    assert.equal(headers.get('referrer-policy'), 'no-referrer', name);
    assert.match(headers.get('cache-control'), /max-age=300/, name);
    assert.match(headers.get('content-type'), name === '' ? /^text\/html/ : /^text\/javascript/, name);
    assert.equal(headers.get('access-control-allow-origin'), null, 'no cross-origin reads');
  }
});

test('the served scripts stand on their own: nothing from the bundle around them is needed', async () => {
  // Each is a function's own text. A bundler may have wrapped inner functions
  // in a helper; the script carries its own, so it must run in a bare context.
  const posted = [];
  const frameScope = {
    parent: { postMessage: (message, target, transfer) => posted.push({ message, target, transfer }) },
    Worker: class {
      postMessage() {}
    },
    MessageChannel: class {
      port1 = { name: 'one' };
      port2 = { name: 'two' };
    },
  };
  vm.runInNewContext(await get(`${QUEST_SANDBOX_PATH}frame.js`).text(), { self: frameScope });
  assert.equal(posted.length, 1);

  const workerScope = { console: {}, indexedDB: {}, onmessage: null };
  vm.runInNewContext(await get(`${QUEST_SANDBOX_PATH}worker.js`).text(), { self: workerScope });
  assert.equal(typeof workerScope.onmessage, 'function');
  assert.equal(typeof workerScope.console.log, 'function');
});

// ── The frame's page script ─────────────────────────────────────────────────

function frameScope({ failToStart = false } = {}) {
  const posted = [];
  const workers = [];
  const scope = {
    parent: { postMessage: (message, target, transfer) => posted.push({ message, target, transfer }) },
    Worker: class {
      constructor(url, options) {
        if (failToStart) throw new Error('blocked');
        this.url = url;
        this.options = options;
        this.sent = [];
        this.onerror = null;
        workers.push(this);
      }
      postMessage(message, transfer) {
        this.sent.push({ message, transfer });
      }
    },
    MessageChannel: class {
      port1 = { end: 'worker' };
      port2 = { end: 'game' };
    },
  };
  return { scope, posted, workers };
}

test('the frame starts the worker and hands the game the other end of a channel to it', () => {
  const { scope, posted, workers } = frameScope();
  sandboxFrameMain(scope);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].url, 'worker.js');
  // One end to the worker...
  assert.deepEqual(workers[0].sent[0].message, { port: { end: 'worker' } });
  assert.deepEqual(workers[0].sent[0].transfer, [{ end: 'worker' }]);
  // ...the other to the game, with the word that it is ready.
  assert.deepEqual(posted, [
    { message: { shohojQuestSandbox: 'ready' }, target: '*', transfer: [{ end: 'game' }] },
  ]);
});

test('the frame reports a worker that cannot start, or that fails', () => {
  const broken = frameScope({ failToStart: true });
  sandboxFrameMain(broken.scope);
  assert.deepEqual(broken.posted.map((p) => p.message), [
    { shohojQuestSandbox: 'error', message: 'The Java engine could not be started.' },
  ]);

  const { scope, posted, workers } = frameScope();
  sandboxFrameMain(scope);
  workers[0].onerror({ message: 'Script error.' });
  workers[0].onerror({});
  assert.deepEqual(posted.slice(1).map((p) => p.message), [
    { shohojQuestSandbox: 'error', message: 'The Java engine failed: Script error.' },
    { shohojQuestSandbox: 'error', message: 'The Java engine failed.' },
  ]);
});

test('opened on its own, not embedded, the frame does nothing', () => {
  const { scope, workers } = frameScope();
  scope.parent = scope;
  sandboxFrameMain(scope);
  assert.equal(workers.length, 0);
});

// ── The engine's worker ─────────────────────────────────────────────────────

/** A worker's global scope with a fake CheerpJ, and the game's end of the port. */
function workerScope({ storage = 'ok' } = {}) {
  const calls = [];
  const received = [];
  const port = { postMessage: (message) => received.push(message), onmessage: null };
  const scope = {
    console: {},
    onmessage: null,
    indexedDB: {
      open() {
        if (storage === 'throws') throw new Error('SecurityError');
        const request = { result: { close: () => calls.push('probe closed') } };
        queueMicrotask(() => (storage === 'ok' ? request.onsuccess() : request.onerror()));
        return request;
      },
    },
    importScripts: (url) => calls.push(['importScripts', url]),
    cheerpjInit: async (options) => {
      calls.push(['init', Object.keys(options).sort()]);
      options.preloadProgress?.(3, 9);
    },
    cheerpOSAddStringFile: (file, content) => calls.push(['write', file, content]),
    cheerpjRunMain: async (...args) => {
      calls.push(['main', ...args]);
      scope.console.log('printed', 'by Java');
      return 7;
    },
    cjGetRuntimeResources: () => '{"a":[0]}',
  };
  sandboxWorkerMain(scope);
  scope.onmessage({ data: { port } });
  const ask = async (request) => {
    port.onmessage({ data: request });
    await settle();
  };
  return { scope, calls, received, ask, port };
}

test('the worker speaks the engine\'s protocol over the port it is handed', async () => {
  const { calls, received, ask } = workerScope();
  await ask({ id: 1, cmd: 'init', loaderUrl: CHEERPJ_LOADER_URL, options: { version: 17, preloadResources: {} } });
  await ask({ id: 2, cmd: 'write', files: [{ path: '/str/Main.java', content: 'class Main {}' }] });
  await ask({ id: 3, cmd: 'main', className: 'Main', classPath: '/files/quest/', args: ['a', 'b'] });
  await ask({ id: 4, cmd: 'resources' });

  assert.deepEqual(calls, [
    'probe closed',
    ['importScripts', CHEERPJ_LOADER_URL],
    ['init', ['preloadProgress', 'preloadResources', 'version']],
    ['write', '/str/Main.java', 'class Main {}'],
    ['main', 'Main', '/files/quest/', 'a', 'b'],
  ]);
  assert.deepEqual(received, [
    { type: 'progress', done: 3, total: 9 },
    { type: 'reply', id: 1, ok: true, value: null },
    { type: 'reply', id: 2, ok: true, value: null },
    { type: 'out', text: 'printed by Java' },
    { type: 'reply', id: 3, ok: true, value: 7 },
    { type: 'reply', id: 4, ok: true, value: '{"a":[0]}' },
  ]);
});

test('only CheerpJ is ever loaded, whatever the embedding page asks for', async () => {
  for (const loaderUrl of [
    'https://evil.example/loader.js',
    'https://cjrtnc.leaningtech.com.evil.example/loader.js',
    'http://cjrtnc.leaningtech.com/5.0/loader.js',
    '',
    undefined,
  ]) {
    const { calls, received, ask } = workerScope();
    await ask({ id: 1, cmd: 'init', loaderUrl, options: {} });
    assert.deepEqual(calls, [], String(loaderUrl));
    assert.equal(received[0].ok, false);
    assert.match(received[0].error, /only be loaded from its own CDN/);
  }
});

test('where the browser denies storage to embedded pages, the worker says so instead of hanging', async () => {
  for (const storage of ['denied', 'throws']) {
    const { calls, received, ask } = workerScope({ storage });
    await ask({ id: 1, cmd: 'init', loaderUrl: CHEERPJ_LOADER_URL, options: {} });
    assert.equal(calls.some((call) => call[0] === 'importScripts'), false, 'the engine is not even fetched');
    assert.equal(received[0].ok, false);
    assert.match(received[0].error, /blocking storage for embedded pages/);
    assert.match(received[0].error, /third-party cookies/);
  }
});

test('an unknown command and a failing one are answered, not dropped', async () => {
  const { scope, received, ask } = workerScope();
  await ask({ id: 9, cmd: 'format-disk' });
  scope.cheerpjRunMain = async () => {
    throw new Error('the JVM fell over');
  };
  await ask({ id: 10, cmd: 'main', className: 'Main', classPath: '', args: [] });
  assert.deepEqual(received, [
    { type: 'reply', id: 9, ok: false, error: 'unknown command' },
    { type: 'reply', id: 10, ok: false, error: 'the JVM fell over' },
  ]);
});

test('the worker takes its port once, and nothing printed before then is lost or thrown', () => {
  const scope = { console: {}, indexedDB: {}, onmessage: null };
  sandboxWorkerMain(scope);
  assert.doesNotThrow(() => scope.console.log('too early'));
  const first = { postMessage() {}, onmessage: null };
  const second = { postMessage() {}, onmessage: null };
  scope.onmessage({ data: { port: first } });
  scope.onmessage({ data: { port: second } });
  scope.onmessage({ data: null });
  assert.equal(typeof first.onmessage, 'function');
  assert.equal(second.onmessage, null, 'a second port is ignored');
});

// ── How the game reaches the frame ──────────────────────────────────────────

/** A stand-in for the browser, driven by the test. */
function fakeBrowser() {
  const state = { frames: [], listeners: new Set(), timers: new Map(), nextTimer: 1 };
  const browser = {
    addFrame(url) {
      const frame = { url, window: { id: `window of ${url}` }, removed: false, remove() { frame.removed = true; } }; // prettier-ignore
      state.frames.push(frame);
      return frame;
    },
    listen(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    setTimer(run, ms) {
      const id = state.nextTimer++;
      state.timers.set(id, { run, ms });
      return id;
    },
    clearTimer(id) {
      state.timers.delete(id);
    },
  };
  const deliver = (message) => {
    for (const listener of [...state.listeners]) listener({ ports: [], ...message });
  };
  const port = () => {
    const made = { sent: [], closed: false, onmessage: null, postMessage: (m) => made.sent.push(m), close: () => (made.closed = true) }; // prettier-ignore
    return made;
  };
  return { browser, state, deliver, port };
}

const SANDBOX_ORIGIN = new URL(QUEST_SANDBOX_URL).origin;

function started() {
  const fake = fakeBrowser();
  const worker = createSandboxWorker(QUEST_SANDBOX_URL, fake.browser);
  const errors = [];
  const messages = [];
  worker.onerror = (event) => errors.push(event.message);
  worker.onmessage = (event) => messages.push(event.data);
  const frame = fake.state.frames[0];
  const ready = (thePort = fake.port()) => {
    fake.deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'ready' }, ports: [thePort] }); // prettier-ignore
    return thePort;
  };
  return { ...fake, worker, errors, messages, frame, ready };
}

test('the engine is given a frame at the sandbox, and what is sent early waits for it', () => {
  const { worker, state, frame, ready } = started();
  assert.equal(state.frames.length, 1);
  assert.equal(frame.url, QUEST_SANDBOX_URL);

  worker.postMessage({ id: 1, cmd: 'init', loaderUrl: 'x', options: {} });
  worker.postMessage({ id: 2, cmd: 'resources' });
  const port = ready();
  assert.deepEqual(port.sent.map((m) => m.id), [1, 2], 'sent in order once ready');
  worker.postMessage({ id: 3, cmd: 'resources' });
  assert.deepEqual(port.sent.map((m) => m.id), [1, 2, 3], 'and directly after that');
});

test('what the engine says comes back over the port', () => {
  const { messages, ready } = started();
  const port = ready();
  port.onmessage({ data: { type: 'out', text: 'hello' } });
  assert.deepEqual(messages, [{ type: 'out', text: 'hello' }]);
});

test('a message is believed only from the sandbox frame, on the sandbox origin', () => {
  const { worker, deliver, frame, port, messages, errors } = started();
  const impostor = port();
  // Right origin, wrong window: some other frame on the page.
  deliver({ source: { id: 'another window' }, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'ready' }, ports: [impostor] }); // prettier-ignore
  // Right window, wrong origin: the frame has been navigated somewhere else.
  deliver({ source: frame.window, origin: 'https://evil.example', data: { shohojQuestSandbox: 'ready' }, ports: [impostor] }); // prettier-ignore
  deliver({ source: frame.window, origin: SITE, data: { shohojQuestSandbox: 'error', message: 'lies' } });
  // Right frame, but not a message of ours.
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: 'ready' });
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: null });
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'ready' }, ports: [] });

  worker.postMessage({ id: 1, cmd: 'resources' });
  assert.deepEqual(impostor.sent, [], 'nothing was sent to the impostor');
  assert.equal(impostor.onmessage, null);
  assert.deepEqual(messages, []);
  assert.deepEqual(errors, []);
});

test('the port is taken once: a second "ready" cannot replace the engine', () => {
  const { worker, ready, port } = started();
  const real = ready();
  const second = ready(port());
  worker.postMessage({ id: 1, cmd: 'resources' });
  assert.equal(real.sent.length, 1);
  assert.equal(second.sent.length, 0);
});

test('a frame that never answers is reported after the limit, and one that answers is not', () => {
  const silent = started();
  const [timer] = [...silent.state.timers.values()];
  assert.equal(timer.ms, SANDBOX_START_LIMIT_MS);
  timer.run();
  assert.equal(silent.errors.length, 1);
  assert.match(silent.errors[0], /could not be reached/);

  const answering = started();
  answering.ready();
  assert.equal(answering.state.timers.size, 0, 'the limit is lifted once the frame is ready');
  assert.deepEqual(answering.errors, []);
});

test('an error the frame reports reaches the engine', () => {
  const { deliver, frame, errors } = started();
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'error', message: 'The Java engine could not be started.' } }); // prettier-ignore
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'error', message: 42 } });
  assert.deepEqual(errors, ['The Java engine could not be started.', 'The Java engine failed.']);
});

test('terminate removes the frame, which is what stops an endless loop', () => {
  const { worker, state, frame, ready, deliver, messages, errors } = started();
  const port = ready();
  worker.terminate();
  assert.equal(frame.removed, true, 'the frame, and the worker inside it, are gone');
  assert.equal(port.closed, true);
  assert.equal(state.listeners.size, 0);
  assert.equal(state.timers.size, 0);

  // Nothing is sent to it, heard from it, or reported about it afterwards.
  worker.postMessage({ id: 1, cmd: 'resources' });
  port.onmessage?.({ data: { type: 'out', text: 'late' } });
  deliver({ source: frame.window, origin: SANDBOX_ORIGIN, data: { shohojQuestSandbox: 'error', message: 'late' } });
  assert.equal(port.sent.length, 0);
  assert.deepEqual(errors, []);
  assert.doesNotThrow(() => worker.terminate(), 'terminating twice is harmless');
  // A message already on its way when the port closed may still arrive.
  assert.ok(messages.length <= 1);
});

test('terminate before the frame is ready cancels the wait', () => {
  const { worker, state, frame, errors } = started();
  const [timer] = [...state.timers.values()];
  worker.terminate();
  assert.equal(frame.removed, true);
  timer.run();
  assert.deepEqual(errors, [], 'a stopped engine does not then report that it was unreachable');
});

test('the frame is sandboxed to scripts and its own origin, and no more', () => {
  assert.equal(SANDBOX_PERMISSIONS, 'allow-scripts allow-same-origin');
  // Nothing that would let code inside send the student somewhere.
  assert.doesNotMatch(SANDBOX_PERMISSIONS, /top-navigation|popups|forms|modals|downloads/);
});

// ── What must stay true of the site ─────────────────────────────────────────

test("the site's CSP allows the sandbox's origin as a frame, and as nothing more", () => {
  const html = readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
  const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
  const directive = (name) =>
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? '';
  assert.ok(directive('frame-src').split(' ').includes(SANDBOX_ORIGIN), 'frame-src lists the sandbox');
  // Its being a script source would defeat the point: the engine would then be
  // loadable into the page itself.
  assert.equal(directive('script-src').includes(SANDBOX_ORIGIN), false);
  assert.equal(directive('worker-src').includes(SANDBOX_ORIGIN), false);
  // And CheerpJ's CDN appears nowhere in the site's policy: it is only ever
  // loaded inside the sandbox.
  assert.equal(policy.includes('leaningtech'), false);
});

test('the sandbox is on a different origin from the site', () => {
  assert.notEqual(SANDBOX_ORIGIN, SITE);
  assert.equal(new URL(QUEST_SANDBOX_URL).pathname, QUEST_SANDBOX_PATH);
});

test('the game never starts a worker of its own: the engine has one way in', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      // "name 2.ts" is an iCloud conflict copy, not source.
      else if (/\.tsx?$/.test(name) && !/ \d+\.tsx?$/.test(name)) {
        const text = readFileSync(full, 'utf8')
          .split('\n')
          .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
          .join('\n');
        if (/new\s+(Shared)?Worker\s*\(|importScripts\s*\(/.test(text)) offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'src/features/quest'));
  assert.deepEqual(offenders, [], 'a worker on the site\'s origin can reach the signed-in session');
});
