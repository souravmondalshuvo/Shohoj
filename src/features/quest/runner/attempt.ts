// src/features/quest/runner/attempt.ts
//
// One attempt at one quest, start to verdict (#981). This is the single call
// the game makes when a student presses Run: it picks the path for the quest
// type, runs the Java when there is Java to run, and returns something the
// result panel can draw.
//
// It takes the engine as an argument, and only the one method it uses. The
// game passes the real engine; the end-to-end test that gates deploys passes a
// stub, so that gate never depends on a third-party CDN being reachable.

import type { Quest } from '../content/schema.ts';
import { parseJavac } from '../grader/diagnostics.ts';
import {
  compileVerdict,
  gradePredict,
  gradeRun,
  rulesVerdict,
  type Verdict,
} from '../grader/grade.ts';
import { planRun, type RunPlan } from '../grader/harness.ts';
import type { RunHooks, RunOutcome } from './javaEngine.ts';

/** What an attempt needs from an engine. `JavaEngine` is one. */
export interface QuestRunner {
  run(plan: RunPlan, hooks?: RunHooks): Promise<RunOutcome>;
}

export type AttemptResult =
  | Verdict
  /** The engine failed. Nothing is known about the student's answer; let them retry. */
  | { readonly kind: 'engine'; readonly passed: false; readonly message: string };

/** Letters and digits, new for every run: it tags the harness's output lines. */
export function newNonce(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Grade `answer` for `quest`. For a `fill` quest the answer is the missing
 * line; for a `predict` quest, what the student thinks is printed; otherwise
 * the editor's contents.
 */
export async function attemptQuest(
  runner: QuestRunner,
  quest: Quest,
  answer: string,
  hooks: RunHooks = {},
): Promise<AttemptResult> {
  // No Java involved, so no engine is loaded for it.
  if (quest.type === 'predict') return gradePredict(quest, answer);

  const plan = planRun(quest, answer, newNonce());
  if (plan.kind === 'rules') return rulesVerdict(plan.failures);

  const outcome = await runner.run(plan, hooks);
  if (outcome.kind === 'engineError')
    return { kind: 'engine', passed: false, message: outcome.message };
  if (outcome.kind === 'compileError') {
    return compileVerdict(parseJavac(outcome.output, plan.studentFile), outcome.output);
  }
  return gradeRun(quest, plan, outcome.results, outcome.ending);
}
