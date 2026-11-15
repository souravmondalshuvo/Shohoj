// src/features/quest/ui/VerdictView.tsx
//
// What the grader said about an attempt (#981), in words for a first-semester
// student: what went wrong, on which line, and what usually causes it.
//
// Nothing is decided here. The grader has already chosen what a hidden test may
// reveal and written every message; this lays them out.

import type { Diagnostic } from '../grader/diagnostics.ts';
import { showSpaces } from '../grader/compare.ts';
import type { TestVerdict } from '../grader/grade.ts';
import type { AttemptResult } from '../runner/attempt.ts';

const MARK: Readonly<Record<TestVerdict['outcome'], string>> = {
  pass: '✓',
  fail: '✗',
  error: '✗',
  timeout: '⏱',
  notRun: '·',
};

const OUTCOME: Readonly<Record<TestVerdict['outcome'], string>> = {
  pass: 'passed',
  fail: 'wrong answer',
  error: 'stopped with an error',
  timeout: 'ran out of time',
  notRun: 'not run',
};

function Block({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <div className="quest-io">
      <span className="quest-io-label">{label}</span>
      <pre className="quest-io-text">{text === '' ? '(nothing)' : text}</pre>
    </div>
  );
}

/** One line of output. `null` is a line that is not there at all. */
function Line({ text }: { readonly text: string | null }) {
  return text === null ? <em>no line</em> : <code>{showSpaces(text)}</code>;
}

function CompileProblem({ diagnostic }: { readonly diagnostic: Diagnostic }) {
  return (
    <li className="quest-problem">
      <p className="quest-problem-where">
        {diagnostic.inStudentFile ? `Line ${diagnostic.line}` : 'In the code around yours'}
      </p>
      <p className="quest-problem-hint">{diagnostic.hint}</p>
      <pre className="quest-problem-raw">
        {[diagnostic.message, ...diagnostic.details].join('\n')}
      </pre>
    </li>
  );
}

function Test({
  test,
  bare = false,
}: {
  readonly test: TestVerdict;
  /** The heading above already says what happened: show only what adds to it. */
  readonly bare?: boolean;
}) {
  const failed = test.outcome !== 'pass' && test.outcome !== 'notRun';
  return (
    <li className={`quest-test quest-test--${test.outcome}`}>
      {bare ? null : (
        <p className="quest-test-head">
          <span className="quest-test-mark" aria-hidden="true">
            {MARK[test.outcome]}
          </span>
          <span className="quest-test-name">{test.name}</span>
          <span className="quest-test-outcome">{OUTCOME[test.outcome]}</span>
        </p>
      )}
      {failed && test.message && !bare ? (
        <p className="quest-test-message">{test.message}</p>
      ) : null}
      {failed && test.problem ? (
        <p className="quest-problem-hint">
          {test.problem.line === null ? '' : `Line ${test.problem.line}: `}
          {test.problem.hint}
        </p>
      ) : null}
      {failed && test.hint ? <p className="quest-test-hint">Hint: {test.hint}</p> : null}
      {failed && !test.hidden ? (
        <div className="quest-io-grid">
          {test.input !== null && test.input !== '' ? (
            <Block label="Input" text={test.input} />
          ) : null}
          {test.expected !== null ? <Block label="Expected" text={test.expected} /> : null}
          {test.actual !== null ? <Block label="Your program" text={test.actual} /> : null}
          {test.diff ? (
            <p className="quest-test-diff">
              First difference on line {test.diff.line}. Expected <Line text={test.diff.expected} />
              , got <Line text={test.diff.actual} />. A <code>·</code> is a space.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function VerdictView({ result }: { readonly result: AttemptResult }) {
  if (result.kind === 'engine') {
    return (
      <div className="quest-verdict quest-verdict--engine" role="status">
        <p className="quest-verdict-title">The Java engine had a problem</p>
        <p>{result.message}</p>
        <p>Your code was not judged. Run it again.</p>
      </div>
    );
  }

  if (result.kind === 'rules') {
    return (
      <div className="quest-verdict quest-verdict--fail" role="status">
        <p className="quest-verdict-title">Not yet: the quest asks for something else</p>
        <ul className="quest-plain-list">
          {result.failures.map((failure) => (
            <li key={failure}>{failure}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (result.kind === 'compile') {
    const count = result.diagnostics.filter((d) => d.severity === 'error').length;
    return (
      <div className="quest-verdict quest-verdict--fail" role="status">
        <p className="quest-verdict-title">
          {count === 1 ? 'Java found 1 problem' : `Java found ${count || 'some'} problems`} before
          it could run your code
        </p>
        {result.diagnostics.length > 0 ? (
          <>
            <p>Fix the first one first: one mistake often causes the rest.</p>
            <ul className="quest-plain-list">
              {result.diagnostics.map((diagnostic, index) => (
                <CompileProblem key={`${diagnostic.line}-${index}`} diagnostic={diagnostic} />
              ))}
            </ul>
          </>
        ) : (
          <pre className="quest-problem-raw">{result.raw}</pre>
        )}
      </div>
    );
  }

  if (result.kind === 'predict') {
    return (
      <div
        className={`quest-verdict ${result.passed ? 'quest-verdict--pass' : 'quest-verdict--fail'}`}
        role="status"
      >
        <p className="quest-verdict-title">
          {result.passed
            ? 'That is exactly what it prints.'
            : result.wrongLine === null
              ? 'Not quite. Trace it again, one pass of the loop at a time.'
              : `Not quite. Line ${result.wrongLine} of your answer is not what the program prints there.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`quest-verdict ${result.passed ? 'quest-verdict--pass' : 'quest-verdict--fail'}`}
      role="status"
    >
      <p className="quest-verdict-title">{result.summary}</p>
      <ul className="quest-plain-list">
        {result.tests.map((test) => (
          // A hero quest is one run, and its message is the heading.
          <Test key={test.index} test={test} bare={result.hero !== null} />
        ))}
      </ul>
    </div>
  );
}

/** The lines of the student's file an attempt pointed at, for the editor to tint. */
export function errorLinesOf(result: AttemptResult | null): readonly number[] {
  if (!result) return [];
  if (result.kind === 'compile') {
    return result.diagnostics.filter((d) => d.inStudentFile).map((d) => d.line);
  }
  if (result.kind === 'tests') {
    return result.tests.flatMap((test) =>
      test.problem && test.problem.line !== null ? [test.problem.line] : [],
    );
  }
  return [];
}
