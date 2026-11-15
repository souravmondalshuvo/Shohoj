// src/features/quest/grader/grade.ts
//
// The verdict on an attempt (#981): given what the harness reported, which
// tests passed, and what to tell the student about the ones that did not.
//
// This is where hidden tests are kept hidden. A visible test shows its input,
// what was expected and what came out. A hidden test shows that it failed, the
// hint its author wrote for it, and nothing about its data: the point of a
// hidden case is that the program has to be right, not fitted to the examples.
//
// Grading happens in the student's own browser, so none of this is a security
// boundary. A verdict is self-study feedback and is never evidence of anything.

import type { HeroQuest, JavaQuest, PredictQuest } from '../content/schema.ts';
import { compareOutput, type OutputDiff } from './compare.ts';
import {
  explainException,
  explainSetup,
  type Diagnostic,
  type RuntimeProblem,
} from './diagnostics.ts';
import type { RunPlan, TestMeta } from './harness.ts';
import { judgeHero, replayHero, type HeroRun } from './hero.ts';
import { displayActual, displayValue, matchesExpected } from './javaValues.ts';
import type { TestResult } from './protocol.ts';

export type TestOutcome =
  /** Ran and produced the right answer. */
  | 'pass'
  /** Ran to the end and produced the wrong answer. */
  | 'fail'
  /** Stopped by an exception, or could not be started. */
  | 'error'
  /** Killed for running past the time limit. */
  | 'timeout'
  /** Never started, because an earlier test ended the run. */
  | 'notRun';

export interface TestVerdict {
  readonly index: number;
  readonly name: string;
  readonly hidden: boolean;
  readonly outcome: TestOutcome;
  /** One sentence about what happened. `null` for a pass. */
  readonly message: string | null;
  /** What the test fed in, for display. `null` when hidden. */
  readonly input: string | null;
  /** `null` when hidden. */
  readonly expected: string | null;
  /** `null` when hidden, or when there was nothing to show. */
  readonly actual: string | null;
  /** Where the output first differed. `null` when hidden or not an output mismatch. */
  readonly diff: OutputDiff | null;
  /** The exception, with the line in the student's file. Shown for hidden tests too. */
  readonly problem: RuntimeProblem | null;
  /** The author's hint for this test, when it did not pass. */
  readonly hint: string | null;
}

/** How a run ended, as the runner saw it. */
export type RunEnding =
  /** The harness reported every test. */
  | { readonly kind: 'done' }
  /** Killed at the time limit while the test at `index` was running. */
  | { readonly kind: 'timeout'; readonly index: number | null }
  /** The JVM exited before the harness finished: `System.exit`, or a crash. */
  | { readonly kind: 'exited' };

export type Verdict =
  | { readonly kind: 'rules'; readonly passed: false; readonly failures: readonly string[] }
  | {
      readonly kind: 'compile';
      readonly passed: false;
      readonly diagnostics: readonly Diagnostic[];
      /** javac's full output, for when nothing in it could be parsed. */
      readonly raw: string;
    }
  | {
      readonly kind: 'tests';
      readonly passed: boolean;
      readonly tests: readonly TestVerdict[];
      /** A hero quest's run, to replay. `null` for other quests. */
      readonly hero: HeroRun | null;
      readonly summary: string;
    }
  | {
      readonly kind: 'predict';
      readonly passed: boolean;
      /** Where the typed answer first differs. Says which line, never what was expected. */
      readonly wrongLine: number | null;
    };

const blank = (meta: TestMeta, outcome: TestOutcome, message: string | null): TestVerdict => ({
  index: meta.index,
  name: meta.name,
  hidden: meta.hidden,
  outcome,
  message,
  input: null,
  expected: null,
  actual: null,
  diff: null,
  problem: null,
  hint: outcome === 'pass' ? null : meta.hint,
});

const seconds = (ms: number) => {
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} second${s === 1 ? '' : 's'}`;
};

function describeProblem(problem: RuntimeProblem): string {
  return problem.line === null ? `${problem.name}.` : `${problem.name} at line ${problem.line}.`;
}

/** What a visible test was given and should produce, in the student's terms. */
function visibleParts(
  quest: JavaQuest | HeroQuest,
  index: number,
): { input: string | null; expected: string | null } {
  if (quest.type === 'hero') return { input: null, expected: null };
  const grading = quest.grading;
  if (grading.mode === 'stdio') {
    const test = grading.tests[index];
    return { input: test?.stdin ?? null, expected: test?.expected ?? null };
  }
  const test = grading.tests[index];
  if (!test) return { input: null, expected: null };
  const { name, params, returns } = grading.method;
  const args = params.map((p, i) => displayValue(p.type, test.args[i] ?? 0)).join(', ');
  const expected =
    returns !== 'void' && test.expected !== undefined
      ? displayValue(returns, test.expected)
      : (test.expectedStdout ?? null);
  return { input: `${name}(${args})`, expected };
}

function judgeOk(
  quest: JavaQuest | HeroQuest,
  meta: TestMeta,
  result: TestResult,
): { verdict: TestVerdict; hero: HeroRun | null } {
  if (quest.type === 'hero') {
    const run = replayHero(quest.level, result.extra);
    if (!run)
      return { verdict: blank(meta, 'error', 'The run left nothing to replay.'), hero: null };
    const outcome = judgeHero(quest, run);
    return {
      verdict: blank(
        meta,
        outcome.passed ? 'pass' : 'fail',
        outcome.passed ? null : outcome.message,
      ),
      hero: run,
    };
  }

  const shown = meta.hidden ? { input: null, expected: null } : visibleParts(quest, meta.index);
  const grading = quest.grading;

  if (grading.mode === 'stdio') {
    const test = grading.tests[meta.index];
    const comparison = compareOutput(test?.expected ?? '', result.out);
    if (comparison.pass) return { verdict: { ...blank(meta, 'pass', null), ...shown }, hero: null };
    return {
      verdict: {
        ...blank(
          meta,
          'fail',
          meta.hidden
            ? 'A hidden test printed the wrong output.'
            : `Line ${comparison.diff.line} of the output is different.`,
        ),
        ...shown,
        actual: meta.hidden ? null : result.out,
        diff: meta.hidden ? null : comparison.diff,
      },
      hero: null,
    };
  }

  const test = grading.tests[meta.index];
  const { returns } = grading.method;
  const valueOk =
    returns === 'void' ||
    test?.expected === undefined ||
    matchesExpected(returns, test.expected, result.extra);
  const printed =
    test?.expectedStdout === undefined
      ? { pass: true as const }
      : compareOutput(test.expectedStdout, result.out);
  if (valueOk && printed.pass)
    return { verdict: { ...blank(meta, 'pass', null), ...shown }, hero: null };

  let message = 'A hidden test got the wrong answer.';
  let actual: string | null = null;
  let diff: OutputDiff | null = null;
  if (!meta.hidden) {
    if (!valueOk) {
      actual = displayActual(returns, result.extra);
      message = `Returned ${actual}, expected ${shown.expected ?? 'something else'}.`;
    } else if (!printed.pass) {
      actual = result.out;
      diff = printed.diff;
      message = `Line ${printed.diff.line} of what it printed is different.`;
    }
  }
  return { verdict: { ...blank(meta, 'fail', message), ...shown, actual, diff }, hero: null };
}

/**
 * Grade a run of a Java or hero quest from the harness's results.
 *
 * `results` holds whatever tests finished, in any order. Tests with no result
 * are explained by how the run ended: the one that was running when the time
 * limit hit is a timeout, and everything after it never ran.
 */
export function gradeRun(
  quest: JavaQuest | HeroQuest,
  plan: RunPlan,
  results: readonly TestResult[],
  ending: RunEnding,
): Verdict {
  const byIndex = new Map(results.map((result) => [result.index, result]));
  let hero: HeroRun | null = null;
  let endingUsed = false;

  const tests = plan.tests.map((meta): TestVerdict => {
    const result = byIndex.get(meta.index);
    if (!result) {
      if (endingUsed || ending.kind === 'done') return blank(meta, 'notRun', 'Not run.');
      endingUsed = true;
      if (ending.kind === 'timeout') {
        return blank(
          meta,
          'timeout',
          `Stopped after ${seconds(plan.timeLimitMs)}. A loop is probably never ending: check that something inside it changes its condition.`,
        );
      }
      return blank(
        meta,
        'error',
        'The program ended before the tests finished. System.exit() stops everything, including the tests.',
      );
    }

    if (result.status === 'SETUP') return blank(meta, 'error', explainSetup(result.detail));
    if (result.status === 'OLE') {
      return blank(
        meta,
        'error',
        'The program printed far more than any answer needs. A loop that prints is probably never ending.',
      );
    }
    if (result.status === 'EXC') {
      const problem = explainException(result.detail);
      // A hero that crashed part-way still walked part-way: keep the replay.
      if (quest.type === 'hero') hero = replayHero(quest.level, result.extra);
      const shown = meta.hidden ? { input: null, expected: null } : visibleParts(quest, meta.index);
      return { ...blank(meta, 'error', describeProblem(problem)), ...shown, problem };
    }

    const judged = judgeOk(quest, meta, result);
    if (judged.hero) hero = judged.hero;
    return judged.verdict;
  });

  const passedCount = tests.filter((test) => test.outcome === 'pass').length;
  const passed = passedCount === tests.length;
  const summary =
    quest.type === 'hero'
      ? (tests[0]?.message ?? 'The hero made it.')
      : passed
        ? `All ${tests.length} tests passed.`
        : `${passedCount} of ${tests.length} tests passed.`;
  return { kind: 'tests', passed, tests, hero, summary };
}

/** Grade a predict-the-output answer. No Java involved: the output is in the quest. */
export function gradePredict(quest: PredictQuest, typed: string): Verdict {
  const comparison = compareOutput(quest.answer, typed);
  return {
    kind: 'predict',
    passed: comparison.pass,
    wrongLine: comparison.pass ? null : comparison.diff.line,
  };
}

/** The verdict for code that broke a quest's source rules and was not run. */
export function rulesVerdict(failures: readonly string[]): Verdict {
  return { kind: 'rules', passed: false, failures };
}

/** The verdict for code that did not compile. */
export function compileVerdict(diagnostics: readonly Diagnostic[], raw: string): Verdict {
  return { kind: 'compile', passed: false, diagnostics, raw };
}
