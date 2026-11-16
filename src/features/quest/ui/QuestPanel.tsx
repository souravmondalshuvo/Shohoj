// src/features/quest/ui/QuestPanel.tsx
//
// One quest, open (#981): the task, somewhere to answer it, and what the
// grader said. Every quest type is answered here:
//
//   predict   type what the snippet prints. No Java runs.
//   fill      type the one missing line, in place, in the program.
//   fix       edit a program that has a bug.
//   write     edit a skeleton.
//   hero      write code that drives the hero, then watch what it did.
//
// The panel never decides whether an answer is right. It hands the answer to
// `attemptQuest` and shows the verdict.
//
// A code quest starts the Java engine as it opens, so the 14 MB download runs
// while the student reads the task. Run works at any time: pressed early, it
// waits for the engine and says so. On a connection with data saving turned on
// nothing is downloaded until the student asks.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';

import { BLANK, type Quest } from '../content/schema.ts';
import { attemptQuest, type AttemptResult } from '../runner/attempt.ts';
import type { EngineStatus } from '../runner/javaEngine.ts';
import { HeroBoard } from './HeroBoard.tsx';
import { VerdictView, errorLinesOf } from './VerdictView.tsx';
import {
  javaRunner,
  prefersSmallDownloads,
  startJavaEngine,
  useEngine,
} from './javaEngineStore.ts';

const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

const KIND: Readonly<Record<Quest['type'], string>> = {
  predict: 'Predict the output',
  fill: 'Fill in the missing line',
  fix: 'Fix the bug',
  write: 'Write the code',
  hero: 'Command the hero',
};

/** What the answer box starts with. */
export function startingAnswer(quest: Quest): string {
  return quest.type === 'write' || quest.type === 'fix' || quest.type === 'hero'
    ? quest.starter
    : '';
}

function EngineLine({
  status,
  warm,
  running,
  testNumber,
  testCount,
  held,
  onStart,
}: {
  readonly status: EngineStatus;
  /** The engine has loaded before: a load now is a restart, not the download. */
  readonly warm: boolean;
  readonly running: boolean;
  readonly testNumber: number | null;
  readonly testCount: number;
  /** The download is waiting for the student to ask for it. */
  readonly held: boolean;
  readonly onStart: () => void;
}) {
  if (held && status.phase === 'idle') {
    return (
      <p className="quest-engine">
        Running Java needs a one-time download of about 14 MB.{' '}
        <button type="button" className="quest-link" onClick={onStart}>
          Download it now
        </button>
      </p>
    );
  }
  if (status.phase === 'failed') {
    return (
      <p className="quest-engine quest-engine--failed" role="status">
        {status.message}{' '}
        <button type="button" className="quest-link" onClick={onStart}>
          Try again
        </button>
      </p>
    );
  }
  if (status.phase === 'loading' && warm) {
    return (
      <p className="quest-engine" role="status">
        Restarting the Java engine. This takes a few seconds.
      </p>
    );
  }
  if (status.phase === 'loading') {
    const known = status.step === 'downloading' && status.total > 0;
    const percent = known ? Math.round((status.done / status.total) * 100) : null;
    return (
      <div className="quest-engine" role="status">
        <p>
          {status.step === 'warming'
            ? 'Almost ready: starting the Java compiler…'
            : percent === null
              ? 'Getting the Java engine (about 14 MB, once)…'
              : `Getting the Java engine (about 14 MB, once): ${percent}%`}
          {running
            ? ' Your code runs as soon as it is ready.'
            : ' You can keep reading, or go back and explore.'}
        </p>
        <progress
          className="quest-progress"
          aria-label="Java engine download"
          {...(percent === null ? {} : { value: percent, max: 100 })}
        />
      </div>
    );
  }
  if (running) {
    return (
      <p className="quest-engine" role="status">
        {testNumber === null
          ? 'Compiling your code…'
          : `Running test ${testNumber} of ${testCount}…`}
      </p>
    );
  }
  return null;
}

export interface QuestPanelProps {
  readonly quest: Quest;
  /** The student solved this before this visit to the panel. */
  readonly alreadySolved: boolean;
  /** What the student had typed the last time this quest was open. */
  readonly draft: string | undefined;
  readonly onDraft: (text: string) => void;
  /** Called once, when an attempt passes. */
  readonly onSolved: () => void;
  readonly onClose: () => void;
}

export function QuestPanel({
  quest,
  alreadySolved: solvedNow,
  draft,
  onDraft,
  onSolved,
  onClose,
}: QuestPanelProps) {
  // As it was when the panel opened: solving the quest here must still read
  // as a first solve, though the progress behind this prop has just changed.
  const [alreadySolved] = useState(solvedNow);
  const [answer, setAnswer] = useState(() => draft ?? startingAnswer(quest));
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [running, setRunning] = useState(false);
  const [testNumber, setTestNumber] = useState<number | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [held, setHeld] = useState(() => quest.type !== 'predict' && prefersSmallDownloads());
  const { status, warm } = useEngine();
  const verdictRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);

  const needsJava = quest.type !== 'predict';
  useEffect(() => {
    alive.current = true;
    headingRef.current?.focus();
    if (needsJava && !prefersSmallDownloads()) startJavaEngine();
    return () => {
      alive.current = false;
    };
  }, [needsJava]);

  const change = (text: string) => {
    setAnswer(text);
    onDraft(text);
  };

  const testCount =
    quest.type === 'hero' ? 1 : quest.type === 'predict' ? 0 : quest.grading.tests.length;

  const run = async () => {
    if (running) return;
    setRunning(true);
    setHeld(false);
    setTestNumber(null);
    const outcome = await attemptQuest(javaRunner, quest, answer, {
      onTestBegin: (index) => {
        if (alive.current) setTestNumber(index + 1);
      },
    });
    // Counted even if the student went back to explore while it ran.
    if (outcome.passed) onSolved();
    if (!alive.current) return;
    setResult(outcome);
    setRunning(false);
    // The verdict can be below the fold on a phone, behind the keyboard.
    window.setTimeout(() => verdictRef.current?.scrollIntoView({ block: 'nearest' }), 0);
  };

  const errorLines = useMemo(() => errorLinesOf(result), [result]);
  const passed = result?.passed === true;
  const hints = quest.hints;
  const heroRun = result?.kind === 'tests' ? result.hero : null;

  let answerBox;
  if (quest.type === 'predict') {
    answerBox = (
      <>
        <pre className="quest-code" aria-label="The code to trace" tabIndex={0}>
          {quest.snippet}
        </pre>
        <label className="quest-label" htmlFor="quest-predict">
          What it prints
        </label>
        <textarea
          id="quest-predict"
          className="quest-textarea"
          rows={Math.min(10, Math.max(3, quest.answer.split('\n').length))}
          value={answer}
          onChange={(event) => change(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </>
    );
  } else if (quest.type === 'fill') {
    const lines = quest.template.replace(/\n$/, '').split('\n');
    answerBox = (
      <div className="quest-code quest-code--lines" role="group" aria-label="The program">
        {lines.map((line, index) => {
          const number = <span className="quest-code-number">{index + 1}</span>;
          if (line.trim() !== BLANK) {
            return (
              <div className="quest-code-line" key={index}>
                {number}
                <span>{line === '' ? ' ' : line}</span>
              </div>
            );
          }
          return (
            <div className="quest-code-line quest-code-line--blank" key={index}>
              {number}
              <span>{/^\s*/.exec(line)?.[0]}</span>
              <input
                className="quest-fill"
                aria-label={`The missing line, line ${index + 1}`}
                placeholder="write the missing line"
                value={answer}
                onChange={(event) => change(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void run();
                }}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          );
        })}
      </div>
    );
  } else {
    answerBox = (
      <>
        {quest.type === 'hero' ? <HeroBoard level={quest.level} run={heroRun} /> : null}
        <Suspense fallback={<p className="quest-engine">Opening the editor…</p>}>
          <CodeEditor
            value={answer}
            onChange={change}
            errorLines={errorLines}
            label={`Your Java code for ${quest.title}`}
          />
        </Suspense>
      </>
    );
  }

  return (
    <div
      className="quest-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-panel-title"
    >
      <div className="quest-panel-head">
        <div>
          <p className="quest-kind">
            {KIND[quest.type]} · {quest.xp} XP{quest.boss ? ' · Boss' : ''}
          </p>
          <h2 id="quest-panel-title" ref={headingRef} tabIndex={-1}>
            {quest.title}
          </h2>
        </div>
        <button type="button" className="quest-button" onClick={onClose}>
          Back
        </button>
      </div>

      <div className="quest-panel-body">
        <details className="quest-story">
          <summary>The story so far</summary>
          {quest.story.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </details>
        <p className="quest-task">{quest.task}</p>
        {alreadySolved && !passed ? (
          <p className="quest-note">
            You have solved this one. Solve it again for practice: its XP counts once.
          </p>
        ) : null}

        {answerBox}

        {needsJava ? (
          <EngineLine
            status={status}
            warm={warm}
            running={running}
            testNumber={testNumber}
            testCount={testCount}
            held={held}
            onStart={() => {
              setHeld(false);
              startJavaEngine();
            }}
          />
        ) : null}

        <div ref={verdictRef}>
          {result ? <VerdictView result={result} /> : null}
          {passed ? (
            <div className="quest-solved">
              <p className="quest-solved-title">
                {alreadySolved ? 'Solved again.' : `Solved. +${quest.xp} XP`}
              </p>
              {quest.type === 'predict' ? <p>{quest.explanation}</p> : null}
              <button
                type="button"
                className="quest-button quest-button--primary"
                onClick={onClose}
              >
                Back to the zone
              </button>
            </div>
          ) : null}
        </div>

        {hints.length > 0 && !passed ? (
          <div className="quest-hints">
            {hints.slice(0, hintsShown).map((hint, index) => (
              <p className="quest-hint" key={hint}>
                <strong>Hint {index + 1}.</strong> {hint}
              </p>
            ))}
            {hintsShown < hints.length ? (
              <button
                type="button"
                className="quest-link"
                onClick={() => setHintsShown((shown) => shown + 1)}
              >
                {hintsShown === 0 ? 'Show a hint' : 'Show another hint'} ({hintsShown} of{' '}
                {hints.length} shown)
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="quest-panel-foot">
        {quest.type === 'write' || quest.type === 'fix' || quest.type === 'hero' ? (
          <button
            type="button"
            className="quest-button"
            disabled={running || answer === quest.starter}
            onClick={() => {
              if (window.confirm('Put the starting code back? What you typed will be lost.'))
                change(quest.starter);
            }}
          >
            Start again
          </button>
        ) : null}
        <button
          type="button"
          className="quest-button quest-button--primary"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? 'Running…' : quest.type === 'predict' ? 'Check' : 'Run'}
        </button>
      </div>
    </div>
  );
}
