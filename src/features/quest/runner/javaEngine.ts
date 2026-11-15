// src/features/quest/runner/javaEngine.ts
//
// Drives the Java worker (javaWorker.ts) for Shohoj Quest (#981): loads the
// engine, compiles a run plan, runs its tests, and ends a run that goes on too
// long.
//
// The time limit is the reason this file exists. Beginners write infinite
// loops, and Java running in a worker cannot be interrupted from outside: the
// only stop is to terminate the worker, which throws the whole JVM away. So:
//
//   * The harness announces each test as it begins (protocol.ts). A timer is
//     armed per test. When it fires the worker is terminated, the test that was
//     running is the one reported as timed out, and results from the tests
//     before it are kept.
//   * A terminated JVM is gone, so a replacement starts loading at once, in the
//     background. Its files come from the HTTP cache; measured on desktop, a
//     compile and run after a kill took about 4 s against 1 to 2 s on a warm
//     engine. The student is reading the timeout message while it loads.
//
// Loading is lazy and explicit: nothing is downloaded until `load()` or the
// first `run()`. The game calls `load()` when the first code editor opens, and
// reports `status` while it works, so the 14 MB arrives with a progress bar and
// never before it is needed.
//
// The worker is injected (`spawn`), so the unit tests drive all of this with a
// scripted fake and no JVM. Erasable TypeScript only: Node's type stripping
// loads this file in the tests.

import type { RunEnding } from '../grader/grade.ts';
import {
  CLASS_DIR,
  HARNESS_CLASS,
  SOURCE_DIR,
  javacArgs,
  type JavaFile,
  type RunPlan,
} from '../grader/harness.ts';
import { createProtocolReader, type ProtocolEvent, type TestResult } from '../grader/protocol.ts';
import { CHEERPJ_LOADER_URL, JAVA_VERSION, PRELOAD_RESOURCES } from './cheerpj.ts';

// ── Messages (repeated, without types, in javaWorker.ts) ────────────────────

export type WorkerRequest =
  | {
      readonly id: number;
      readonly cmd: 'init';
      readonly loaderUrl: string;
      readonly options: Readonly<Record<string, unknown>>;
    }
  | {
      readonly id: number;
      readonly cmd: 'write';
      readonly files: readonly { readonly path: string; readonly content: string }[];
    }
  | {
      readonly id: number;
      readonly cmd: 'main';
      readonly className: string;
      readonly classPath: string;
      readonly args: readonly string[];
    }
  | { readonly id: number; readonly cmd: 'resources' };

export type WorkerMessage =
  | { readonly type: 'reply'; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly type: 'reply'; readonly id: number; readonly ok: false; readonly error: string }
  | { readonly type: 'out'; readonly text: string }
  | { readonly type: 'progress'; readonly done: number; readonly total: number };

/** The part of a `Worker` the engine uses. A real one fits; so does a test's fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { readonly data: WorkerMessage }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
}

// ── Status and results ──────────────────────────────────────────────────────

export type EngineStatus =
  /** Nothing loaded. Nothing has been downloaded, or the engine was stopped. */
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'loading';
      /** `downloading` reports `done` of `total` runtime files; the others have no count. */
      readonly step: 'starting' | 'downloading' | 'warming';
      readonly done: number;
      readonly total: number;
    }
  | { readonly phase: 'ready' }
  | { readonly phase: 'running' }
  | { readonly phase: 'failed'; readonly message: string };

export type RunOutcome =
  /** The student's code does not compile. `output` is javac's, from the untouched source. */
  | { readonly kind: 'compileError'; readonly output: string }
  | {
      readonly kind: 'ran';
      /** Whatever tests finished. */
      readonly results: readonly TestResult[];
      readonly ending: RunEnding;
      /** Lines the JVM printed that were not the harness's. Capped. */
      readonly noise: readonly string[];
      /** False when line markers broke the compile and the plain source was run. */
      readonly tracked: boolean;
    }
  /** The engine itself failed: could not load, or stopped responding. Not the student's fault. */
  | { readonly kind: 'engineError'; readonly message: string };

export interface RunHooks {
  /** Called as each test starts, for a "running test 3 of 5" display. */
  readonly onTestBegin?: (index: number) => void;
}

export interface EngineOptions {
  /** Creates the worker. Called again after every kill. */
  readonly spawn: () => WorkerLike;
  /** Load a replacement engine straight after a timeout kill. Default true. */
  readonly rewarm?: boolean;
}

/** Longest a compile may take before the engine is judged stuck. */
export const COMPILE_LIMIT_MS = 60_000;
/** Allowed before the first test begins, and between tests: JVM start-up, not student code. */
export const START_GRACE_MS = 15_000;

const JAVAC = 'com.sun.tools.javac.Main';
const MAX_NOISE_LINES = 40;

// Compiled once while loading, so the compiler's own start-up cost (about ten
// seconds cold) is paid under the progress bar and not on the first Run.
const WARM_UP: JavaFile = {
  name: 'QuestWarmUp.java',
  content: `import java.util.Scanner;

public class QuestWarmUp {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int total = 0;
        for (int i = 0; i < 3; i++) {
            total += i;
        }
        System.out.println(total);
    }
}
`,
};

class EngineStopped extends Error {}

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'The Java engine stopped unexpectedly.';

export class JavaEngine {
  private readonly spawn: () => WorkerLike;
  private readonly rewarm: boolean;
  private worker: WorkerLike | null = null;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private nextId = 1;
  private onOut: ((text: string) => void) | null = null;
  private loading: Promise<void> | null = null;
  private busy = false;
  private status: EngineStatus = { phase: 'idle' };
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  constructor(options: EngineOptions) {
    this.spawn = options.spawn;
    this.rewarm = options.rewarm ?? true;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Be told whenever the status changes. Returns the unsubscribe function. */
  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Download and start the engine. Safe to call any number of times: calls
   * while it is loading share one load, and calls once it is ready do nothing.
   */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const attempt = this.boot();
    this.loading = attempt;
    attempt.catch(() => {
      // A failed load must not be remembered as the load, or no retry could run.
      if (this.loading === attempt) this.loading = null;
    });
    return attempt;
  }

  /** Compile a plan and run its tests. Never rejects: every failure is an outcome. */
  async run(plan: RunPlan, hooks: RunHooks = {}): Promise<RunOutcome> {
    if (this.busy) return { kind: 'engineError', message: 'A run is already in progress.' };
    this.busy = true;
    try {
      await this.load();
      this.setStatus({ phase: 'running' });
      return await this.execute(plan, hooks);
    } catch (error) {
      return { kind: 'engineError', message: messageOf(error) };
    } finally {
      this.busy = false;
      if (this.worker && this.status.phase === 'running') this.setStatus({ phase: 'ready' });
    }
  }

  /** The runtime byte ranges used so far, for regenerating the preload list (cheerpj.ts). */
  async runtimeResources(): Promise<string> {
    await this.load();
    return String(await this.request({ cmd: 'resources' }));
  }

  /** Stop the engine and free the JVM's memory. `load()` starts it again. */
  dispose(): void {
    this.stop('The Java engine was stopped.');
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private setStatus(status: EngineStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private async boot(): Promise<void> {
    const worker = this.spawn();
    this.worker = worker;
    worker.onmessage = (event) => {
      if (this.worker === worker) this.receive(event.data);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.stop(
        event.message ? `The Java engine failed: ${event.message}` : 'The Java engine failed.',
      );
    };
    this.setStatus({ phase: 'loading', step: 'starting', done: 0, total: 0 });
    try {
      await this.request({
        cmd: 'init',
        loaderUrl: CHEERPJ_LOADER_URL,
        options: { version: JAVA_VERSION, status: 'none', preloadResources: PRELOAD_RESOURCES },
      });
      this.setStatus({ phase: 'loading', step: 'warming', done: 0, total: 0 });
      // No limit on this compile: on a slow connection it is mostly download.
      const warmed = await this.compile([WARM_UP], null);
      if (warmed.code !== 0) throw new Error('The Java compiler did not start.');
      if (!this.busy) this.setStatus({ phase: 'ready' });
    } catch (error) {
      // Stopped from outside (dispose, or a kill): the stopper set the status.
      if (!(error instanceof EngineStopped)) {
        this.stop(messageOf(error));
        this.setStatus({ phase: 'failed', message: messageOf(error) });
      }
      throw error;
    }
  }

  private receive(message: WorkerMessage): void {
    if (message.type === 'out') {
      this.onOut?.(message.text);
    } else if (message.type === 'progress') {
      if (this.status.phase === 'loading') {
        this.setStatus({
          phase: 'loading',
          step: 'downloading',
          done: message.done,
          total: message.total,
        });
      }
    } else {
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id);
      if (message.ok) waiting.resolve(message.value);
      else waiting.reject(new Error(message.error));
    }
  }

  private request(message: DistributiveOmit<WorkerRequest, 'id'>): Promise<unknown> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new EngineStopped('The Java engine is not running.'));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id } as WorkerRequest);
    });
  }

  /** Terminate the worker. Everything waiting on it is rejected with `reason`. */
  private stop(reason: string): void {
    const worker = this.worker;
    this.worker = null;
    this.loading = null;
    this.onOut = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    const waiting = [...this.pending.values()];
    this.pending.clear();
    this.setStatus({ phase: 'idle' });
    for (const entry of waiting) entry.reject(new EngineStopped(reason));
  }

  private async compile(
    files: readonly JavaFile[],
    limitMs: number | null = COMPILE_LIMIT_MS,
  ): Promise<{ code: number; output: string }> {
    await this.request({
      cmd: 'write',
      files: files.map((file) => ({ path: SOURCE_DIR + file.name, content: file.content })),
    });
    let output = '';
    this.onOut = (text) => {
      output += text;
    };
    const timer =
      limitMs === null
        ? null
        : setTimeout(() => this.stop('The Java compiler stopped responding.'), limitMs);
    try {
      const code = await this.request({
        cmd: 'main',
        className: JAVAC,
        classPath: '',
        args: javacArgs(files),
      });
      return { code: typeof code === 'number' ? code : 1, output };
    } finally {
      if (timer) clearTimeout(timer);
      this.onOut = null;
    }
  }

  private async execute(plan: RunPlan, hooks: RunHooks): Promise<RunOutcome> {
    // The marked source first. If it fails, the plain source decides: an error
    // there is the student's and is reported from there, so no message ever
    // mentions a marker; success there means the markers broke it, and the
    // plain classes are the ones to run.
    let tracked = true;
    let compiled = await this.compile(plan.files);
    if (compiled.code !== 0) {
      tracked = false;
      compiled = await this.compile(plan.plainFiles);
      if (compiled.code !== 0) return { kind: 'compileError', output: compiled.output };
    }
    return this.runTests(plan, hooks, tracked);
  }

  private runTests(plan: RunPlan, hooks: RunHooks, tracked: boolean): Promise<RunOutcome> {
    const reader = createProtocolReader(plan.nonce);
    const results: TestResult[] = [];
    const noise: string[] = [];
    let running: number | null = null;
    let finished = false;

    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const settle = (outcome: RunOutcome) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.onOut = null;
        resolve(outcome);
      };

      const arm = (ms: number) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const index = running;
          settle({ kind: 'ran', results, ending: { kind: 'timeout', index }, noise, tracked });
          this.stop('Stopped at the time limit.');
          if (this.rewarm) void this.load().catch(() => undefined);
        }, ms);
      };

      const take = (events: readonly ProtocolEvent[]) => {
        for (const event of events) {
          if (event.kind === 'begin') {
            running = event.index;
            arm(plan.timeLimitMs);
            hooks.onTestBegin?.(event.index);
          } else if (event.kind === 'end') {
            results.push(event.result);
            running = null;
            arm(START_GRACE_MS);
          } else if (event.kind === 'done') {
            finished = true;
          } else if (noise.length < MAX_NOISE_LINES) {
            noise.push(event.text);
          }
        }
      };

      this.onOut = (text) => take(reader.push(text));
      arm(START_GRACE_MS);
      this.request({ cmd: 'main', className: HARNESS_CLASS, classPath: CLASS_DIR, args: [] }).then(
        () => {
          take(reader.flush());
          settle({
            kind: 'ran',
            results,
            ending: finished ? { kind: 'done' } : { kind: 'exited' },
            noise,
            tracked,
          });
        },
        (error: unknown) => settle({ kind: 'engineError', message: messageOf(error) }),
      );
    });
  }
}

/** `Omit` that keeps a union a union, so each request keeps its own fields. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
