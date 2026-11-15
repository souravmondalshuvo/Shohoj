// tests/questEngine.test.js — the Shohoj Quest Java engine (#981), driven by a
// scripted fake worker: loading, compiling, the per-test time limit and the
// kill that follows it. No JVM runs here; `npm run quest:check` is the test
// against the real one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { findQuest, loadWorld } from '../src/features/quest/content/world.ts';
import { SOLUTIONS } from '../src/features/quest/content/solutions.ts';
import { TAG_PREFIX, planRun } from '../src/features/quest/grader/harness.ts';
import { attemptQuest, newNonce } from '../src/features/quest/runner/attempt.ts';
import { CHEERPJ_LOADER_URL, JAVA_VERSION, PRELOAD_RESOURCES } from '../src/features/quest/runner/cheerpj.ts';
import { COMPILE_LIMIT_MS, JavaEngine, START_GRACE_MS } from '../src/features/quest/runner/javaEngine.ts';

const world = loadWorld();
const rope = findQuest(world, 'bridge-rope-counter');
const planks = findQuest(world, 'bridge-count-the-planks');
const span = findQuest(world, 'bridge-first-span');
const ropePlan = () => planRun(rope, SOLUTIONS[rope.id], 'n1');

const TAG = `${TAG_PREFIX}n1`;
const b64 = (text) => (text ? Buffer.from(text, 'utf8').toString('base64') : '-');
const begin = (i) => `${TAG} BEGIN ${i}\n`;
const end = (i, out) => `${TAG} END ${i} OK ${b64(out)} - -\n`;
const ROPE_OUTPUTS = ['15\n', '1\n', '5050\n', '0\n'];

// Let every queued microtask and reply run.
const settle = () => new Promise((resolve) => setImmediate(resolve));

const isJavac = (message) => message.cmd === 'main' && message.className === 'com.sun.tools.javac.Main';
const isWarmUp = (message) => isJavac(message) && message.args.some((arg) => arg.endsWith('QuestWarmUp.java'));
const isHarness = (message) => message.cmd === 'main' && message.className === 'QuestHarness';

/**
 * A worker that answers from a script. By default the engine loads, every
 * compile succeeds, and the harness passes every Rope Counter test. `on`
 * overrides one kind of request: return `true` from a handler to say it dealt
 * with the request itself.
 */
function fakeWorkers(on = {}) {
  const workers = [];
  const spawn = () => {
    const worker = {
      requests: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      send(data) {
        if (!worker.terminated) worker.onmessage?.({ data });
      },
      reply(id, value) {
        worker.send({ type: 'reply', id, ok: true, value });
      },
      out(text) {
        worker.send({ type: 'out', text });
      },
      terminate() {
        worker.terminated = true;
      },
      postMessage(message) {
        worker.requests.push(message);
        queueMicrotask(() => {
          if (worker.terminated) return;
          if (message.cmd === 'init') {
            if (on.init?.(worker, message)) return;
            worker.send({ type: 'progress', done: 1, total: 2 });
            worker.send({ type: 'progress', done: 2, total: 2 });
            worker.reply(message.id, null);
          } else if (message.cmd === 'write') {
            worker.reply(message.id, null);
          } else if (isWarmUp(message)) {
            if (on.warmUp?.(worker, message)) return;
            worker.reply(message.id, 0);
          } else if (isJavac(message)) {
            if (on.javac?.(worker, message)) return;
            worker.reply(message.id, 0);
          } else if (isHarness(message)) {
            if (on.harness?.(worker, message)) return;
            ROPE_OUTPUTS.forEach((out, i) => worker.out(begin(i) + end(i, out)));
            worker.out(`${TAG} DONE\n`);
            worker.reply(message.id, 0);
          } else if (message.cmd === 'resources') {
            worker.reply(message.id, '{"/lt/x":[0]}');
          }
        });
      },
    };
    workers.push(worker);
    return worker;
  };
  return { workers, spawn };
}

const engineWith = (on, options = {}) => {
  const fake = fakeWorkers(on);
  const engine = new JavaEngine({ spawn: fake.spawn, ...options });
  const statuses = [];
  engine.subscribe((status) => statuses.push(status));
  return { engine, statuses, workers: fake.workers };
};

const phases = (statuses) => statuses.map((s) => (s.phase === 'loading' ? `${s.step}:${s.done}/${s.total}` : s.phase));

// ── Loading ─────────────────────────────────────────────────────────────────

test('nothing is spawned or downloaded until the engine is asked to load', () => {
  const { engine, workers } = engineWith();
  assert.equal(workers.length, 0);
  assert.deepEqual(engine.getStatus(), { phase: 'idle' });
});

test('loading reports its steps, with real counts while downloading', async () => {
  const { engine, statuses, workers } = engineWith();
  await engine.load();
  assert.deepEqual(phases(statuses), ['starting:0/0', 'downloading:1/2', 'downloading:2/2', 'warming:0/0', 'ready']);

  const init = workers[0].requests[0];
  assert.equal(init.cmd, 'init');
  assert.equal(init.loaderUrl, CHEERPJ_LOADER_URL);
  assert.deepEqual(init.options, { version: JAVA_VERSION, status: 'none', preloadResources: PRELOAD_RESOURCES });
  // The compiler is warmed up under the progress bar, not on the first Run.
  assert.ok(workers[0].requests.some(isWarmUp));
});

test('loading twice, or while already loading, uses one worker', async () => {
  const { engine, workers } = engineWith();
  await Promise.all([engine.load(), engine.load()]);
  await engine.load();
  assert.equal(workers.length, 1);
});

test('a failed load is reported, and the next load starts again from nothing', async () => {
  let fail = true;
  const { engine, statuses, workers } = engineWith({
    init(worker, message) {
      if (!fail) return false;
      worker.send({ type: 'reply', id: message.id, ok: false, error: 'NetworkError when fetching the loader' });
      return true;
    },
  });
  await assert.rejects(engine.load(), /NetworkError/);
  assert.deepEqual(engine.getStatus(), { phase: 'failed', message: 'NetworkError when fetching the loader' });
  assert.equal(workers[0].terminated, true);

  // A run while it cannot load is an engine error, not a verdict on the code.
  const outcome = await engine.run(ropePlan());
  assert.equal(outcome.kind, 'engineError');

  fail = false;
  await engine.load();
  assert.equal(engine.getStatus().phase, 'ready');
  assert.ok(statuses.some((s) => s.phase === 'failed'));
});

test('a worker that errors while loading fails the load', async () => {
  const { engine } = engineWith({
    init(worker) {
      worker.onerror?.({ message: 'Script error.' });
      return true;
    },
  });
  await assert.rejects(engine.load(), /The Java engine failed: Script error\./);
  assert.equal(engine.getStatus().phase, 'idle');
});

// ── Running ─────────────────────────────────────────────────────────────────

test('a run writes the sources, compiles, runs the harness and returns every result', async () => {
  const { engine, statuses, workers } = engineWith();
  const begun = [];
  const outcome = await engine.run(ropePlan(), { onTestBegin: (index) => begun.push(index) });

  assert.equal(outcome.kind, 'ran');
  assert.deepEqual(outcome.ending, { kind: 'done' });
  assert.equal(outcome.tracked, true);
  assert.deepEqual(outcome.results.map((r) => [r.index, r.status, r.out]), ROPE_OUTPUTS.map((out, i) => [i, 'OK', out]));
  assert.deepEqual(begun, [0, 1, 2, 3]);

  // The first run loads the engine itself.
  assert.deepEqual(phases(statuses).slice(-3), ['warming:0/0', 'running', 'ready']);

  const written = workers[0].requests.filter((m) => m.cmd === 'write').at(-1);
  assert.deepEqual(written.files.map((file) => file.path), ['/str/Main.java', '/str/QuestHarness.java']);
  assert.ok(written.files[0].content.includes('QuestHarness.at('));
  const harness = workers[0].requests.find(isHarness);
  assert.equal(harness.classPath, '/files/quest/');
});

test('output arriving in pieces, and lines that are not the harness\'s, are handled', async () => {
  const { engine } = engineWith({
    harness(worker, message) {
      worker.out('Picked up JAVA_TOOL_OPTIONS\n');
      const stream = ROPE_OUTPUTS.map((out, i) => begin(i) + end(i, out)).join('') + `${TAG} DONE`;
      for (const ch of stream) worker.out(ch);
      worker.reply(message.id, 0);
      return true;
    },
  });
  const outcome = await engine.run(ropePlan());
  assert.equal(outcome.results.length, 4);
  // The last line had no newline; it is read when the JVM exits.
  assert.deepEqual(outcome.ending, { kind: 'done' });
  assert.deepEqual(outcome.noise, ['Picked up JAVA_TOOL_OPTIONS']);
});

test('when the marked source does not compile but the plain source does, the plain source is run', async () => {
  let compiles = 0;
  const { engine, workers } = engineWith({
    javac(worker, message) {
      compiles += 1;
      if (compiles === 1) {
        worker.out('/str/Main.java:5: error: not a statement\n');
        worker.reply(message.id, 1);
        return true;
      }
      return false;
    },
  });
  const outcome = await engine.run(ropePlan());
  assert.equal(outcome.kind, 'ran');
  assert.equal(outcome.tracked, false);
  assert.equal(compiles, 2);
  const lastWrite = workers[0].requests.filter((m) => m.cmd === 'write').at(-1);
  assert.equal(lastWrite.files[0].content, SOLUTIONS[rope.id]);
});

test('a compile error is reported from the plain source, never from the marked one', async () => {
  let compiles = 0;
  const { engine, workers } = engineWith({
    javac(worker, message) {
      compiles += 1;
      worker.out(compiles === 1 ? 'MARKED: QuestHarness.at(6); int n\n' : "/str/Main.java:6: error: ';' expected\n1 error\n");
      worker.reply(message.id, 1);
      return true;
    },
  });
  const outcome = await engine.run(ropePlan());
  assert.deepEqual(outcome, { kind: 'compileError', output: "/str/Main.java:6: error: ';' expected\n1 error\n" });
  assert.equal(workers[0].requests.some(isHarness), false);
  assert.equal(engine.getStatus().phase, 'ready');
});

test('a JVM that exits before the harness finishes is an early exit', async () => {
  const { engine } = engineWith({
    harness(worker, message) {
      worker.out(begin(0));
      worker.reply(message.id, 0); // System.exit(0) inside the first test
      return true;
    },
  });
  const outcome = await engine.run(ropePlan());
  assert.deepEqual(outcome.ending, { kind: 'exited' });
  assert.deepEqual(outcome.results, []);
});

test('a second run while one is in progress is refused', async () => {
  const { engine } = engineWith();
  const first = engine.run(ropePlan());
  const second = await engine.run(ropePlan());
  assert.deepEqual(second, { kind: 'engineError', message: 'A run is already in progress.' });
  assert.equal((await first).kind, 'ran');
});

// ── The time limit ──────────────────────────────────────────────────────────

test('a test that runs past the limit gets the worker killed, and keeps the results before it', async (t) => {
  const { engine, statuses, workers } = engineWith({
    harness(worker) {
      if (workers.length > 1) return false;
      // Test 0 finishes; test 1 is the infinite loop and never reports back.
      worker.out(begin(0) + end(0, '15\n') + begin(1));
      return true;
    },
  });
  await engine.load();
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const running = engine.run(ropePlan());
  await settle();
  await settle();
  assert.equal(workers[0].terminated, false);

  t.mock.timers.tick(rope.timeLimitMs - 1);
  await settle();
  assert.equal(workers[0].terminated, false, 'killed before the limit');

  t.mock.timers.tick(1);
  const outcome = await running;
  assert.equal(workers[0].terminated, true);
  assert.equal(outcome.kind, 'ran');
  assert.deepEqual(outcome.ending, { kind: 'timeout', index: 1 });
  assert.deepEqual(outcome.results.map((r) => r.index), [0]);

  // A replacement starts loading at once, and the next run uses it.
  await settle();
  await settle();
  assert.equal(workers.length, 2);
  assert.equal(engine.getStatus().phase, 'ready');
  const seen = phases(statuses);
  assert.deepEqual(seen.slice(seen.lastIndexOf('idle')), [
    'idle',
    'starting:0/0',
    'downloading:1/2',
    'downloading:2/2',
    'warming:0/0',
    'ready',
  ]);
  const again = await engine.run(ropePlan());
  assert.deepEqual(again.ending, { kind: 'done' });
  assert.equal(workers.length, 2);
});

test('the limit is per test: each test that begins restarts the clock', async (t) => {
  let worker0;
  const { engine } = engineWith({
    harness(worker, message) {
      worker0 = { worker, message };
      worker.out(begin(0));
      return true;
    },
  });
  await engine.load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const running = engine.run(ropePlan());
  await settle();
  await settle();

  // Four tests of 2 s each: 8 s in all, well past one test's 3 s limit.
  for (let i = 0; i < 4; i += 1) {
    t.mock.timers.tick(2000);
    worker0.worker.out(end(i, ROPE_OUTPUTS[i]) + (i < 3 ? begin(i + 1) : `${TAG} DONE\n`));
  }
  worker0.worker.reply(worker0.message.id, 0);
  const outcome = await running;
  assert.deepEqual(outcome.ending, { kind: 'done' });
  assert.equal(outcome.results.length, 4);
});

test('a JVM that never starts the first test is stopped after the start-up grace', async (t) => {
  const { engine, workers } = engineWith({ harness: () => true }, { rewarm: false });
  await engine.load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const running = engine.run(ropePlan());
  await settle();
  await settle();
  t.mock.timers.tick(START_GRACE_MS);
  const outcome = await running;
  assert.deepEqual(outcome.ending, { kind: 'timeout', index: null });
  assert.equal(workers[0].terminated, true);
  // With rewarm off, nothing is loaded until asked.
  await settle();
  assert.equal(workers.length, 1);
  assert.deepEqual(engine.getStatus(), { phase: 'idle' });
});

test('a compiler that stops responding is an engine error, not a verdict', async (t) => {
  const { engine, workers } = engineWith({ javac: () => true });
  await engine.load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const running = engine.run(ropePlan());
  await settle();
  await settle();
  t.mock.timers.tick(COMPILE_LIMIT_MS);
  assert.deepEqual(await running, { kind: 'engineError', message: 'The Java compiler stopped responding.' });
  assert.equal(workers[0].terminated, true);
});

test('disposing stops the worker and ends a run in progress', async () => {
  const { engine, workers } = engineWith({ harness: () => true });
  const running = engine.run(ropePlan());
  await settle();
  await settle();
  await settle();
  engine.dispose();
  assert.deepEqual(await running, { kind: 'engineError', message: 'The Java engine was stopped.' });
  assert.equal(workers[0].terminated, true);
  assert.deepEqual(engine.getStatus(), { phase: 'idle' });
});

test('the runtime resources come back as the text for the preload list', async () => {
  const { engine } = engineWith();
  assert.equal(await engine.runtimeResources(), '{"/lt/x":[0]}');
});

// ── One attempt, start to verdict ───────────────────────────────────────────

const runnerReturning = (outcome) => {
  const calls = [];
  return {
    calls,
    run(plan, hooks) {
      calls.push({ plan, hooks });
      return Promise.resolve(typeof outcome === 'function' ? outcome(plan) : outcome);
    },
  };
};

test('a predict quest is graded without touching the engine', async () => {
  const runner = runnerReturning({ kind: 'engineError', message: 'should not be called' });
  assert.deepEqual(await attemptQuest(runner, planks, '1 4 7 10\nplanks = 4'), {
    kind: 'predict',
    passed: true,
    wrongLine: null,
  });
  assert.equal(runner.calls.length, 0);
});

test('code that breaks a source rule is refused without touching the engine', async () => {
  const runner = runnerReturning({ kind: 'engineError', message: 'should not be called' });
  const result = await attemptQuest(runner, span, span.starter);
  assert.equal(result.kind, 'rules');
  assert.equal(runner.calls.length, 0);
});

test('an attempt turns the engine\'s outcome into a verdict', async () => {
  const passing = runnerReturning((plan) => ({
    kind: 'ran',
    results: ROPE_OUTPUTS.map((out, index) => ({ index, status: 'OK', out, detail: '', extra: '' })),
    ending: { kind: 'done' },
    noise: [],
    tracked: true,
    nonce: plan.nonce,
  }));
  const pass = await attemptQuest(passing, rope, SOLUTIONS[rope.id]);
  assert.equal(pass.kind, 'tests');
  assert.equal(pass.passed, true);
  // Each run gets its own tag for the harness's lines.
  assert.match(passing.calls[0].plan.nonce, /^[0-9a-f]{16}$/);

  const broken = runnerReturning({ kind: 'compileError', output: "/str/Main.java:6: error: ';' expected\n1 error\n" });
  const compile = await attemptQuest(broken, rope, 'whatever');
  assert.equal(compile.kind, 'compile');
  assert.deepEqual([compile.diagnostics[0].line, compile.diagnostics[0].inStudentFile], [6, true]);

  const looping = runnerReturning({ kind: 'ran', results: [], ending: { kind: 'timeout', index: 0 }, noise: [], tracked: true });
  const timedOut = await attemptQuest(looping, rope, rope.starter);
  assert.deepEqual(timedOut.tests.map((t) => t.outcome), ['timeout', 'notRun', 'notRun', 'notRun']);

  const down = runnerReturning({ kind: 'engineError', message: 'offline' });
  assert.deepEqual(await attemptQuest(down, rope, 'x'), { kind: 'engine', passed: false, message: 'offline' });
});

test('nonces are sixteen hex characters and do not repeat', () => {
  const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
  assert.equal(seen.size, 50);
  for (const nonce of seen) assert.match(nonce, /^[0-9a-f]{16}$/);
});
